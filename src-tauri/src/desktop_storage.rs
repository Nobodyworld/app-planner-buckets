use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    process,
    sync::{atomic::{AtomicBool, Ordering}, Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

const ROUTINE_RETENTION: usize = 30;
const OPERATION_RETENTION: usize = 12;

#[derive(Clone)]
struct DesktopStoragePaths {
    data_dir: PathBuf,
    backup_dir: PathBuf,
    primary: PathBuf,
    previous: PathBuf,
    restore_recovery: PathBuf,
    migration_marker: PathBuf,
}
impl DesktopStoragePaths {
    fn new(root: PathBuf) -> Self {
        let data_dir = root.join("data");
        let backup_dir = root.join("backups");
        Self { primary: data_dir.join("planner-v2.json"), previous: data_dir.join("planner-v2.previous.json"), restore_recovery: backup_dir.join("restore-recovery.json"), migration_marker: root.join("migration-v1.complete"), data_dir, backup_dir }
    }
    fn ensure_directories(&self) -> Result<(), String> {
        fs::create_dir_all(&self.data_dir).map_err(|e| format!("Could not create planner data directory: {e}"))?;
        fs::create_dir_all(&self.backup_dir).map_err(|e| format!("Could not create planner backup directory: {e}"))
    }
}
struct WriterGuard {
    _file: File,
    #[cfg(not(windows))]
    path: PathBuf,
}
#[cfg(not(windows))]
impl Drop for WriterGuard { fn drop(&mut self) { let _ = fs::remove_file(&self.path); } }
fn acquire_writer_guard(paths: &DesktopStoragePaths) -> Result<Option<WriterGuard>, String> {
    let path = paths.data_dir.join("planner-storage.lock");
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // The OS holds this file handle exclusively across sessions/processes and releases
        // it on crash. File existence is NOT ownership; a stale file is harmless.
        options.create(true).truncate(false).share_mode(0);
    }
    #[cfg(not(windows))]
    options.create_new(true);
    match options.open(&path) {
        Ok(file) => Ok(Some(WriterGuard { _file: file, #[cfg(not(windows))] path })),
        Err(e) if e.kind() == ErrorKind::AlreadyExists || matches!(e.raw_os_error(), Some(32 | 33)) => Ok(None),
        Err(e) => Err(format!("Could not acquire the planner writer handle: {e}")),
    }
}
#[derive(Default)]
struct RuntimeState { session: u64, last_committed_sequence: u64 }
impl RuntimeState {
    fn begin_session(&mut self) -> Result<u64, String> {
        self.session = self.session.checked_add(1).filter(|n| *n <= 9_007_199_254_740_991).ok_or("Storage session limit exceeded.")?;
        self.last_committed_sequence = 0;
        Ok(self.session)
    }
    fn verify_session(&self, session: u64) -> Result<(), String> {
        if session > 0 && session == self.session { Ok(()) } else { Err("Stale desktop storage session. Reload before saving.".into()) }
    }
}
pub struct DesktopStorageState {
    paths: DesktopStoragePaths,
    runtime: Mutex<RuntimeState>,
    writer_available: bool,
    _writer_guard: Option<WriterGuard>,
    writer_warning: Option<String>,
    close_guard: AtomicBool,
    allow_close: AtomicBool,
}
impl DesktopStorageState {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        let paths = DesktopStoragePaths::new(root);
        paths.ensure_directories()?;
        let (guard, warning) = match acquire_writer_guard(&paths) {
            Ok(Some(guard)) => (Some(guard), None),
            Ok(None) => (None, Some("Another Planner Buckets process owns this data directory. This instance is read-only.".into())),
            Err(error) => (None, Some(format!("Desktop storage is read-only: {error}"))),
        };
        Ok(Self { paths, runtime: Mutex::new(RuntimeState::default()), writer_available: guard.is_some(), _writer_guard: guard, writer_warning: warning, close_guard: AtomicBool::new(false), allow_close: AtomicBool::new(false) })
    }
    fn lock_runtime(&self) -> Result<MutexGuard<'_, RuntimeState>, String> { self.runtime.lock().map_err(|_| "Desktop storage lock failed.".into()) }
    fn lock_writer(&self, session: u64) -> Result<MutexGuard<'_, RuntimeState>, String> {
        if !self.writer_available { return Err(self.writer_warning.clone().unwrap_or_else(|| "Desktop storage is read-only.".into())); }
        let runtime = self.lock_runtime()?;
        runtime.verify_session(session)?;
        Ok(runtime)
    }
    pub fn close_requires_flush(&self) -> bool { self.close_guard.load(Ordering::SeqCst) && !self.allow_close.load(Ordering::SeqCst) }
}
fn nanos() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default() }
fn modified_millis(path: &Path) -> u128 { fs::metadata(path).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or_default() }
fn path_text(path: &Path) -> String { path.to_string_lossy().into_owned() }
fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) { Ok(value) => Ok(Some(value)), Err(e) if e.kind() == ErrorKind::NotFound => Ok(None), Err(e) => Err(format!("Could not read {}: {e}", path.display())) }
}
fn read_text(path: &Path) -> Result<String, String> { fs::read_to_string(path).map_err(|e| format!("Could not read {}: {e}", path.display())) }
// Deliberately defensive, NOT a replacement for the canonical TypeScript integrity validator.
fn validate_planner_json(serialized: &str) -> Result<(), String> {
    let data: Value = serde_json::from_str(serialized).map_err(|_| "Planner JSON is malformed.")?;
    if data.get("version").and_then(Value::as_u64) != Some(2) || ["projects", "buckets", "tasks", "templates", "templateDefinitions"].iter().any(|key| !data.get(*key).is_some_and(Value::is_array)) {
        return Err("Planner data must contain the complete schema-v2 collections.".into());
    }
    Ok(())
}
fn local_day_is_valid(day: &str) -> bool {
    let b = day.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' || !b.iter().enumerate().all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit()) { return false; }
    let year: u32 = day[..4].parse().unwrap_or(0);
    let month: usize = day[5..7].parse().unwrap_or(0);
    let date: u32 = day[8..].parse().unwrap_or(0);
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    year > 0 && (1..=12).contains(&month) && date > 0 && date <= days[month.saturating_sub(1).min(11)]
}
fn sanitize(value: &str) -> String { value.chars().take(64).map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect() }
fn unique_path(destination: &Path, kind: &str) -> Result<PathBuf, String> {
    let parent = destination.parent().ok_or("Storage destination has no parent.")?;
    let stem = destination.file_stem().and_then(|n| n.to_str()).unwrap_or("planner");
    Ok(parent.join(format!("{stem}.{kind}-{}-{}.json", process::id(), nanos())))
}
fn write_new_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path).map_err(|e| format!("Could not create {}: {e}", path.display()))?;
    file.write_all(bytes).map_err(|e| format!("Could not write recovery data: {e}"))?;
    file.flush().map_err(|e| format!("Could not flush recovery data: {e}"))?;
    file.sync_all().map_err(|e| format!("Could not synchronize recovery data: {e}"))
}
fn remove_if_exists(path: &Path) -> Result<(), String> { match fs::remove_file(path) { Ok(()) => Ok(()), Err(e) if e.kind() == ErrorKind::NotFound => Ok(()), Err(e) => Err(format!("Could not remove {}: {e}", path.display())) } }
#[derive(Clone, Copy, PartialEq, Debug)]
enum ReplaceStep { Write, Sync, Preserve, Promote, Verify, Rollback }
fn replace_with_fault(destination: &Path, previous: &Path, bytes: &[u8], fault: &mut dyn FnMut(ReplaceStep) -> Result<(), String>) -> Result<(), String> {
    let temp = unique_path(destination, "tmp")?;
    fault(ReplaceStep::Write)?;
    write_new_synced(&temp, bytes)?;
    fault(ReplaceStep::Sync)?;
    if fs::read(&temp).map_err(|e| e.to_string())? != bytes { return Err("Temporary file did not verify; existing files were retained.".into()); }
    // Never delete an existing previous file to make room. It may be the only valid
    // candidate recovered after an interrupted promotion or an unreadable primary.
    let rollback = if previous.exists() { unique_path(destination, "rollback")? } else { previous.to_path_buf() };
    let had_destination = destination.exists();
    if had_destination {
        fault(ReplaceStep::Preserve)?;
        fs::rename(destination, &rollback).map_err(|e| format!("Could not preserve the previous file: {e}"))?;
    }
    let promotion = (|| {
        fault(ReplaceStep::Promote)?;
        fs::rename(&temp, destination).map_err(|e| format!("Could not promote temporary file: {e}"))?;
        fault(ReplaceStep::Verify)?;
        if fs::read(destination).map_err(|e| e.to_string())? != bytes { return Err("Promoted file did not verify.".into()); }
        Ok(())
    })();
    if let Err(error) = promotion {
        if had_destination {
            let rollback_result = fault(ReplaceStep::Rollback).and_then(|()| {
                remove_if_exists(destination)?;
                fs::rename(&rollback, destination).map_err(|e| e.to_string())
            });
            if let Err(rollback_error) = rollback_result { return Err(format!("{error} Rollback also failed ({rollback_error}); recovery files were preserved.")); }
        } else { let _ = remove_if_exists(destination); }
        // Preserve the verified temporary file too. In the previous-only recovery case
        // the old previous remains untouched whether promotion or verification failed.
        return Err(error);
    }
    // At this point the new primary has been read back exactly. Cleanup is not part of
    // commit success; leftover rollback files remain discoverable after a cleanup error.
    let _ = remove_if_exists(&rollback);
    if previous != rollback { let _ = remove_if_exists(previous); }
    Ok(())
}
fn replace_bytes(destination: &Path, previous: &Path, bytes: &[u8]) -> Result<(), String> { replace_with_fault(destination, previous, bytes, &mut |_| Ok(())) }
fn write_auxiliary(path: &Path, bytes: &[u8]) -> Result<(), String> { replace_bytes(path, &path.with_extension("previous.json"), bytes) }
fn write_primary(paths: &DesktopStoragePaths, serialized: &str, day: &str, routine: bool) -> Result<bool, String> {
    validate_planner_json(serialized)?;
    if !local_day_is_valid(day) { return Err("Invalid local calendar day.".into()); }
    paths.ensure_directories()?;
    let existing = read_optional(&paths.primary)?;
    if existing.as_deref() == Some(serialized.as_bytes()) { return Ok(false); }
    if routine {
        if let Some(before) = &existing {
            let snapshot = paths.backup_dir.join(format!("routine-{day}.json"));
            if !snapshot.exists() {
                write_new_synced(&snapshot, before)?;
                if fs::read(&snapshot).map_err(|e| e.to_string())? != *before { return Err("Routine snapshot did not verify; primary was not replaced.".into()); }
            }
        }
    }
    replace_bytes(&paths.primary, &paths.previous, serialized.as_bytes())?;
    Ok(true)
}
fn operation_snapshot(paths: &DesktopStoragePaths, serialized: &str, reason: &str, timestamp: &str) -> Result<PathBuf, String> {
    validate_planner_json(serialized)?;
    paths.ensure_directories()?;
    let path = paths.backup_dir.join(format!("operation-{}-{}-{}.json", sanitize(timestamp), sanitize(reason), nanos()));
    write_new_synced(&path, serialized.as_bytes())?;
    if read_text(&path)? != serialized { return Err("Operation snapshot did not verify.".into()); }
    // Retention only runs after a committed primary and full frontend validation.
    Ok(path)
}
fn preserve_corrupt_primary(paths: &DesktopStoragePaths, timestamp: &str) -> Result<Option<PathBuf>, String> {
    let Some(bytes) = read_optional(&paths.primary)? else { return Ok(None); };
    let path = paths.backup_dir.join(format!("corrupt-primary-{}-{}.json", sanitize(timestamp), nanos()));
    write_new_synced(&path, &bytes)?;
    if fs::read(&path).map_err(|e| e.to_string())? != bytes { return Err("Corrupt-source preservation did not verify.".into()); }
    Ok(Some(path))
}
fn candidate_value(path: &Path, kind: &str) -> Result<Option<Value>, String> {
    let Some(bytes) = read_optional(path)? else { return Ok(None); };
    // Invalid UTF-8 is a present but invalid candidate, NOT missing state. Recovery
    // preserves the original bytes; a replacement-character string is never accepted.
    let serialized = String::from_utf8(bytes).unwrap_or_default();
    Ok(Some(json!({ "kind": kind, "name": path.file_name().and_then(|s| s.to_str()).unwrap_or(""), "path": path_text(path), "serialized": serialized, "modifiedAtMs": modified_millis(path).min(u64::MAX as u128) as u64 })))
}
fn list_backup_candidates(paths: &DesktopStoragePaths) -> Result<Vec<Value>, String> {
    let mut values = Vec::new();
    if let Some(value) = candidate_value(&paths.previous, "previous")? { values.push(value); }
    for entry in fs::read_dir(&paths.data_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("planner-v2.rollback-") && name.ends_with(".json") {
            if let Some(value) = candidate_value(&entry.path(), "previous")? { values.push(value); }
        }
    }
    for entry in fs::read_dir(&paths.backup_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = if name.starts_with("routine-") { Some("routine") } else if name.starts_with("operation-") { Some("operation") } else { None };
        if name.ends_with(".json") {
            if let Some(kind) = kind { if let Some(value) = candidate_value(&entry.path(), kind)? { values.push(value); } }
        }
    }
    values.sort_by(|a, b| b["modifiedAtMs"].as_u64().cmp(&a["modifiedAtMs"].as_u64()).then_with(|| a["path"].as_str().cmp(&b["path"].as_str())));
    Ok(values)
}
fn field<'a>(value: &'a Value, name: &str) -> Result<&'a str, String> { value.get(name).and_then(Value::as_str).ok_or_else(|| format!("Missing storage request field: {name}")) }
fn backup_name(name: &str) -> bool { !name.contains(['/', '\\']) && !name.contains("..") && name.ends_with(".json") && (name.starts_with("routine-") || name.starts_with("operation-")) }
fn prune_verified(paths: &DesktopStoragePaths, request: &Value) -> Result<(), String> {
    let current = field(request, "current")?;
    if read_text(&paths.primary)? != current { return Err("Primary changed; retention was deferred.".into()); }
    validate_planner_json(current)?;
    let proofs = request.get("candidates").and_then(Value::as_array).ok_or("Missing verified backup inventory.")?;
    let mut names = std::collections::BTreeSet::new();
    for proof in proofs {
        let name = field(proof, "name")?;
        let serialized = field(proof, "serialized")?;
        if !backup_name(name) { return Err("Invalid backup name; retention was stopped.".into()); }
        // Exact-byte recheck closes the validation-to-deletion race. Unknown, changed,
        // unreadable, malformed and non-canonical candidates are never pruned.
        if read_text(&paths.backup_dir.join(name))? != serialized { return Err("Backup changed; retention was deferred.".into()); }
        validate_planner_json(serialized)?;
        names.insert(name.to_string());
    }
    for (prefix, retain) in [("routine-", ROUTINE_RETENTION), ("operation-", OPERATION_RETENTION)] {
        for name in names.iter().rev().filter(|name| name.starts_with(prefix)).skip(retain) { remove_if_exists(&paths.backup_dir.join(name))?; }
    }
    Ok(())
}
fn commit_restore(paths: &DesktopStoragePaths, runtime: &mut RuntimeState, request: &Value) -> Result<Value, String> {
    let sequence = request.get("sequence").and_then(Value::as_u64).ok_or("Invalid Restore sequence.")?;
    if sequence <= runtime.last_committed_sequence { return Err("Stale Restore sequence.".into()); }
    let expected = field(request, "expected")?;
    let replacement = field(request, "serialized")?;
    let day = field(request, "localDay")?;
    let saved_at = field(request, "savedAt")?;
    let snapshot_name = field(request, "snapshotName")?;
    validate_planner_json(expected)?;
    validate_planner_json(replacement)?;
    let actual: Value = serde_json::from_str(&read_text(&paths.primary)?).map_err(|_| "Primary is corrupt; Restore was stopped.")?;
    let expected_value: Value = serde_json::from_str(expected).map_err(|_| "Invalid expected planner.")?;
    if actual != expected_value { return Err("Planner changed since Restore began; nothing was replaced.".into()); }
    if !backup_name(snapshot_name) || !snapshot_name.starts_with("operation-") || read_text(&paths.backup_dir.join(snapshot_name))? != expected { return Err("Pre-Restore snapshot did not match the current planner.".into()); }
    let old_recovery = read_optional(&paths.restore_recovery)?;
    let recovery = match request.get("recovery") { Some(Value::Null) => None, Some(Value::String(value)) => Some(value), _ => return Err("Invalid Restore recovery record.".into()) };
    if let Some(record) = recovery {
        let parsed: Value = serde_json::from_str(record).map_err(|_| "Malformed Restore recovery record.")?;
        if parsed["format"] != "bsp-planner-restore-recovery" || parsed["previousData"] != expected_value || !parsed["replacementFingerprint"].is_string() { return Err("Restore recovery record did not match the transaction.".into()); }
        write_auxiliary(&paths.restore_recovery, record.as_bytes())?;
    }
    if let Err(error) = write_primary(paths, replacement, day, true) {
        let reverted = match old_recovery { Some(bytes) => write_auxiliary(&paths.restore_recovery, &bytes), None => remove_if_exists(&paths.restore_recovery) };
        return Err(match reverted { Ok(()) => error, Err(other) => format!("{error} Recovery-record rollback also failed: {other}") });
    }
    runtime.last_committed_sequence = sequence;
    let warning = if recovery.is_none() { remove_if_exists(&paths.restore_recovery).err().map(|e| format!("Planner committed; stale Undo record cleanup failed: {e}")) } else { None };
    Ok(json!({ "sequence": sequence, "saved": true, "stale": false, "noOp": false, "savedAt": saved_at, "warning": warning }))
}

#[tauri::command]
pub fn desktop_storage_bootstrap(state: State<'_, DesktopStorageState>) -> Result<String, String> {
    let mut runtime = state.lock_runtime()?;
    let primary = candidate_value(&state.paths.primary, "primary")?;
    let backups = list_backup_candidates(&state.paths)?;
    let session = runtime.begin_session()?;
    Ok(json!({ "writable": state.writer_available, "dataPath": path_text(&state.paths.primary), "backupPath": path_text(&state.paths.backup_dir), "migrationComplete": state.paths.migration_marker.exists(), "session": session, "primary": primary, "backups": backups, "warning": state.writer_warning }).to_string())
}
#[tauri::command]
pub fn desktop_storage_save(serialized: String, sequence: u64, local_day: String, saved_at: String, session: u64, state: State<'_, DesktopStorageState>) -> Result<String, String> {
    let mut runtime = state.lock_writer(session)?;
    if sequence <= runtime.last_committed_sequence { return Err("Stale save sequence.".into()); }
    let changed = write_primary(&state.paths, &serialized, &local_day, true)?;
    runtime.last_committed_sequence = sequence;
    Ok(json!({ "sequence": sequence, "saved": true, "stale": false, "noOp": !changed, "savedAt": saved_at }).to_string())
}
#[tauri::command]
pub fn desktop_storage_recover(serialized: String, local_day: String, timestamp: String, session: u64, state: State<'_, DesktopStorageState>) -> Result<String, String> {
    let _runtime = state.lock_writer(session)?;
    validate_planner_json(&serialized)?;
    let preserved = preserve_corrupt_primary(&state.paths, &timestamp)?;
    write_primary(&state.paths, &serialized, &local_day, false)?;
    Ok(json!({ "recovered": true, "preservedCorruptPath": preserved.map(|p| path_text(&p)) }).to_string())
}
#[tauri::command]
pub fn desktop_storage_create_operation_snapshot(serialized: String, reason: String, timestamp: String, session: u64, state: State<'_, DesktopStorageState>) -> Result<String, String> {
    let _runtime = state.lock_writer(session)?;
    let path = operation_snapshot(&state.paths, &serialized, &reason, &timestamp)?;
    Ok(json!({ "name": path.file_name().and_then(|n| n.to_str()), "path": path_text(&path) }).to_string())
}
#[tauri::command]
pub fn desktop_storage_commit_restore(request: String, session: u64, state: State<'_, DesktopStorageState>) -> Result<String, String> {
    let request: Value = serde_json::from_str(&request).map_err(|_| "Malformed Restore request.")?;
    let mut runtime = state.lock_writer(session)?;
    commit_restore(&state.paths, &mut runtime, &request).map(|result| result.to_string())
}
#[tauri::command]
pub fn desktop_storage_mark_migration_complete(session: u64, state: State<'_, DesktopStorageState>) -> Result<(), String> {
    let _runtime = state.lock_writer(session)?;
    validate_planner_json(&read_text(&state.paths.primary)?)?;
    write_auxiliary(&state.paths.migration_marker, b"desktop-file-storage-v1\n")
}
#[tauri::command]
pub fn desktop_storage_read_restore_recovery(session: u64, state: State<'_, DesktopStorageState>) -> Result<Option<String>, String> {
    let runtime = state.lock_runtime()?; runtime.verify_session(session)?;
    read_optional(&state.paths.restore_recovery)?.map(|bytes| String::from_utf8(bytes).map_err(|_| "Restore recovery contains invalid UTF-8.".into())).transpose()
}
#[tauri::command]
pub fn desktop_storage_clear_restore_recovery(session: u64, state: State<'_, DesktopStorageState>) -> Result<(), String> {
    let _runtime = state.lock_writer(session)?; remove_if_exists(&state.paths.restore_recovery)
}
#[tauri::command]
pub fn desktop_storage_list_backups(session: u64, state: State<'_, DesktopStorageState>) -> Result<String, String> {
    let runtime = state.lock_runtime()?; runtime.verify_session(session)?;
    list_backup_candidates(&state.paths).map(|v| json!(v).to_string())
}
#[tauri::command]
pub fn desktop_storage_prune_backups(request: String, session: u64, state: State<'_, DesktopStorageState>) -> Result<(), String> {
    let _runtime = state.lock_writer(session)?;
    prune_verified(&state.paths, &serde_json::from_str(&request).map_err(|_| "Malformed retention proof.")?)
}
#[tauri::command]
pub fn desktop_storage_enable_close_guard(state: State<'_, DesktopStorageState>) { state.close_guard.store(true, Ordering::SeqCst); }
#[tauri::command]
pub fn desktop_storage_finish_close(window: tauri::Window, state: State<'_, DesktopStorageState>) -> Result<(), String> {
    if window.label() != "main" { return Err("Unsupported window.".into()); }
    let _runtime = state.lock_runtime()?;
    state.allow_close.store(true, Ordering::SeqCst);
    if let Err(error) = window.close() { state.allow_close.store(false, Ordering::SeqCst); return Err(error.to_string()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct TestRoot(PathBuf);
    impl TestRoot { fn new() -> Self { let root = std::env::temp_dir().join(format!("planner-storage-test-{}-{}", process::id(), nanos())); fs::create_dir_all(&root).unwrap(); Self(root) } fn paths(&self) -> DesktopStoragePaths { let p = DesktopStoragePaths::new(self.0.clone()); p.ensure_directories().unwrap(); p } }
    impl Drop for TestRoot { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
    fn planner(label: &str) -> String { json!({ "version": 2, "projects": [{"id": label, "name": label, "description":"", "priority":0, "pinned":false, "createdAt":"2026-08-28T00:00:00Z", "updatedAt":"2026-08-28T00:00:00Z"}], "buckets":[], "tasks":[], "templates":[], "templateDefinitions":[] }).to_string() }
    #[test]
    fn daily_snapshot_is_first_prechange_and_identical_save_is_noop() {
        let root = TestRoot::new(); let p = root.paths(); let a = planner("a"); let b = planner("b");
        assert!(write_primary(&p, &a, "2026-08-28", true).unwrap());
        assert!(!write_primary(&p, &a, "2026-08-28", true).unwrap());
        assert!(!p.backup_dir.join("routine-2026-08-28.json").exists());
        write_primary(&p, &b, "2026-08-28", true).unwrap(); write_primary(&p, &planner("c"), "2026-08-28", true).unwrap();
        assert_eq!(read_text(&p.backup_dir.join("routine-2026-08-28.json")).unwrap(), a);
    }
    #[test]
    fn failed_recovery_keeps_the_only_previous_file() {
        for stage in [ReplaceStep::Write, ReplaceStep::Sync, ReplaceStep::Promote, ReplaceStep::Verify] {
            let root = TestRoot::new(); let p = root.paths(); let old = planner("previous"); fs::write(&p.previous, &old).unwrap();
            assert!(replace_with_fault(&p.primary, &p.previous, planner("new").as_bytes(), &mut |s| if s == stage { Err("injected".into()) } else { Ok(()) }).is_err());
            assert_eq!(read_text(&p.previous).unwrap(), old);
            assert!(!p.primary.exists());
        }
    }
    #[test]
    fn write_sync_preserve_promote_and_verify_failures_preserve_primary_bytes() {
        for stage in [ReplaceStep::Write, ReplaceStep::Sync, ReplaceStep::Preserve, ReplaceStep::Promote, ReplaceStep::Verify] {
            let root = TestRoot::new(); let p = root.paths(); let old = planner("old"); fs::write(&p.primary, &old).unwrap();
            assert!(replace_with_fault(&p.primary, &p.previous, planner("new").as_bytes(), &mut |s| if s == stage { Err("injected".into()) } else { Ok(()) }).is_err());
            assert_eq!(read_text(&p.primary).unwrap(), old);
        }
    }
    #[test]
    fn failed_rollback_leaves_discoverable_recovery() {
        let root = TestRoot::new(); let p = root.paths(); let old = planner("old"); fs::write(&p.primary, &old).unwrap(); fs::write(&p.previous, planner("older")).unwrap();
        assert!(replace_with_fault(&p.primary, &p.previous, planner("new").as_bytes(), &mut |s| if matches!(s, ReplaceStep::Promote | ReplaceStep::Rollback) { Err("injected".into()) } else { Ok(()) }).is_err());
        assert!(list_backup_candidates(&p).unwrap().iter().any(|v| v["serialized"] == old));
    }
    #[test]
    fn successful_recovery_removes_previous_only_after_verified_primary() {
        let root = TestRoot::new(); let p = root.paths(); let old = planner("old"); fs::write(&p.previous, &old).unwrap();
        replace_bytes(&p.primary, &p.previous, old.as_bytes()).unwrap(); assert_eq!(read_text(&p.primary).unwrap(), old); assert!(!p.previous.exists());
    }
    #[test]
    fn invalid_utf8_is_present_and_preserved_exactly() {
        let root = TestRoot::new(); let p = root.paths(); let bytes = [0xff, 0xfe, 0, 0x7b]; fs::write(&p.primary, bytes).unwrap();
        assert!(candidate_value(&p.primary, "primary").unwrap().is_some());
        let preserved = preserve_corrupt_primary(&p, "test").unwrap().unwrap(); assert_eq!(fs::read(preserved).unwrap(), bytes);
    }
    #[test]
    fn partial_version_only_json_is_not_complete_planner_data() { assert!(validate_planner_json("{\"version\":2}").is_err()); assert!(validate_planner_json(&planner("valid")).is_ok()); }
    #[test]
    fn invalid_calendar_dates_are_rejected() { assert!(local_day_is_valid("2024-02-29")); assert!(!local_day_is_valid("2026-02-29")); assert!(!local_day_is_valid("2026-07-00")); assert!(!local_day_is_valid("../../bad")); }
    #[test]
    fn reload_starts_new_session_and_rejects_old_writer() { let mut state = RuntimeState::default(); let first = state.begin_session().unwrap(); state.last_committed_sequence = 27; let next = state.begin_session().unwrap(); assert!(state.verify_session(first).is_err()); assert!(state.verify_session(next).is_ok()); assert_eq!(state.last_committed_sequence, 0); }
    #[test]
    fn writer_handle_is_scoped_to_data_root_and_released_on_drop() {
        let a = TestRoot::new(); let b = TestRoot::new(); let pa = a.paths(); let pb = b.paths();
        let first = acquire_writer_guard(&pa).unwrap().unwrap(); assert!(acquire_writer_guard(&pa).unwrap().is_none()); let second_root = acquire_writer_guard(&pb).unwrap().unwrap(); drop(first); assert!(acquire_writer_guard(&pa).unwrap().is_some()); drop(second_root);
    }
    #[cfg(windows)]
    #[test]
    fn stale_lockfile_is_not_a_stale_writer_on_windows() { let root = TestRoot::new(); let p = root.paths(); fs::write(p.data_dir.join("planner-storage.lock"), "old").unwrap(); assert!(acquire_writer_guard(&p).unwrap().is_some()); }
    #[test]
    fn retention_requires_current_primary_and_exact_verified_candidates() {
        let root = TestRoot::new(); let p = root.paths(); let data = planner("retention"); write_primary(&p, &data, "2026-08-28", false).unwrap();
        let mut candidates = Vec::new();
        for i in 1..=35 { let name = format!("routine-2026-{:02}-{:02}.json", 1 + (i - 1) / 28, 1 + (i - 1) % 28); fs::write(p.backup_dir.join(&name), &data).unwrap(); candidates.push(json!({"name":name,"serialized":data})); }
        for i in 1..=18 { let name = format!("operation-2026-08-28T00-00-{i:02}-restore.json"); fs::write(p.backup_dir.join(&name), &data).unwrap(); candidates.push(json!({"name":name,"serialized":data})); }
        let unknown = p.backup_dir.join("routine-unknown.json"); fs::write(&unknown, "corrupt").unwrap();
        assert!(prune_verified(&p, &json!({"current":planner("stale"),"candidates":candidates})).is_err());
        prune_verified(&p, &json!({"current":data,"candidates":candidates})).unwrap();
        let names = fs::read_dir(&p.backup_dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert_eq!(names.iter().filter(|n| n.starts_with("routine-") && **n != "routine-unknown.json").count(), 30);
        assert_eq!(names.iter().filter(|n| n.starts_with("operation-")).count(), 12); assert_eq!(read_text(&unknown).unwrap(), "corrupt");
    }
    #[test]
    fn changed_backup_and_path_traversal_block_pruning() {
        let root = TestRoot::new(); let p = root.paths(); let data = planner("a"); write_primary(&p, &data, "2026-08-28", false).unwrap();
        assert!(prune_verified(&p, &json!({"current":data,"candidates":[{"name":"../planner-v2.json","serialized":data}]})).is_err());
        fs::write(p.backup_dir.join("routine-2026-08-28.json"), "changed").unwrap();
        assert!(prune_verified(&p, &json!({"current":data,"candidates":[{"name":"routine-2026-08-28.json","serialized":data}]})).is_err());
    }
    fn restore_request(p: &DesktopStoragePaths, before: &str, after: &str) -> Value {
        let snapshot = operation_snapshot(p, before, "restore", "2026-08-28T00:00:00Z").unwrap();
        json!({"sequence":1,"expected":before,"serialized":after,"snapshotName":snapshot.file_name().unwrap().to_str().unwrap(),"recovery":null,"localDay":"2026-08-28","savedAt":"2026-08-28T00:00:00Z"})
    }
    #[test]
    fn restore_compares_current_planner_and_verified_snapshot_before_replacement() {
        let root = TestRoot::new(); let p = root.paths(); let before = planner("before"); let after = planner("after"); write_primary(&p, &before, "2026-08-28", false).unwrap(); let request = restore_request(&p, &before, &after);
        fs::write(&p.primary, planner("external-change")).unwrap(); let mut state = RuntimeState::default();
        assert!(commit_restore(&p, &mut state, &request).is_err()); assert_eq!(read_text(&p.primary).unwrap(), planner("external-change"));
        fs::write(&p.primary, &before).unwrap(); assert_eq!(commit_restore(&p, &mut state, &request).unwrap()["saved"], true); assert_eq!(read_text(&p.primary).unwrap(), after);
    }
    #[test]
    fn undo_recovery_is_not_removed_when_restore_replacement_fails() {
        let root = TestRoot::new(); let p = root.paths(); let before = planner("before"); write_primary(&p, &before, "2026-08-28", false).unwrap(); fs::write(&p.restore_recovery, "old recovery").unwrap();
        let mut request = restore_request(&p, &before, &planner("after")); request["localDay"] = json!("invalid-day");
        assert!(commit_restore(&p, &mut RuntimeState::default(), &request).is_err()); assert_eq!(read_text(&p.primary).unwrap(), before); assert_eq!(read_text(&p.restore_recovery).unwrap(), "old recovery");
    }
}
