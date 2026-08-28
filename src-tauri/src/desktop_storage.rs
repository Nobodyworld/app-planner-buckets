use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    process,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[cfg(not(windows))]
use std::fs::File;

const ROUTINE_RETENTION: usize = 30;
const OPERATION_RETENTION: usize = 12;
const PRIMARY_FILE_NAME: &str = "planner-v2.json";
const PREVIOUS_FILE_NAME: &str = "planner-v2.previous.json";
const RESTORE_RECOVERY_FILE_NAME: &str = "restore-recovery.json";
const MIGRATION_MARKER_FILE_NAME: &str = "migration-v1.complete";

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
        Self {
            primary: data_dir.join(PRIMARY_FILE_NAME),
            previous: data_dir.join(PREVIOUS_FILE_NAME),
            restore_recovery: backup_dir.join(RESTORE_RECOVERY_FILE_NAME),
            migration_marker: root.join(MIGRATION_MARKER_FILE_NAME),
            data_dir,
            backup_dir,
        }
    }

    fn ensure_directories(&self) -> Result<(), String> {
        fs::create_dir_all(&self.data_dir)
            .map_err(|error| format!("Could not create the planner data directory: {error}"))?;
        fs::create_dir_all(&self.backup_dir)
            .map_err(|error| format!("Could not create the planner backup directory: {error}"))?;
        Ok(())
    }
}

#[cfg(windows)]
struct WriterGuard {
    handle: isize,
}

#[cfg(windows)]
impl Drop for WriterGuard {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        unsafe {
            CloseHandle(self.handle as HANDLE);
        }
    }
}

#[cfg(windows)]
fn acquire_writer_guard() -> Result<Option<WriterGuard>, String> {
    use std::{iter, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
    };

    let name: Vec<u16> =
        std::ffi::OsStr::new("Local\\com.nobodyworld.plannerbuckets.storage.writer")
            .encode_wide()
            .chain(iter::once(0))
            .collect();

    let handle = unsafe { CreateMutexW(ptr::null(), 1, name.as_ptr()) };
    if handle.is_null() {
        return Err(format!(
            "Could not create the Planner Buckets writer mutex (Windows error {}).",
            unsafe { GetLastError() }
        ));
    }

    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(handle);
        }
        return Ok(None);
    }

    Ok(Some(WriterGuard {
        handle: handle as isize,
    }))
}

#[cfg(not(windows))]
struct WriterGuard {
    _file: File,
    path: PathBuf,
}

#[cfg(not(windows))]
impl Drop for WriterGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

#[cfg(not(windows))]
fn acquire_writer_guard(paths: &DesktopStoragePaths) -> Result<Option<WriterGuard>, String> {
    paths.ensure_directories()?;
    let path = paths.data_dir.join("planner-storage.lock");
    match OpenOptions::new().write(true).create_new(true).open(&path) {
        Ok(mut file) => {
            writeln!(file, "{}", process::id()).map_err(|error| {
                format!("Could not initialize the planner writer lock: {error}")
            })?;
            file.sync_all()
                .map_err(|error| format!("Could not flush the planner writer lock: {error}"))?;
            Ok(Some(WriterGuard { _file: file, path }))
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(None),
        Err(error) => Err(format!("Could not create the planner writer lock: {error}")),
    }
}

#[derive(Default)]
struct RuntimeState {
    last_committed_sequence: u64,
}

pub struct DesktopStorageState {
    paths: DesktopStoragePaths,
    runtime: Mutex<RuntimeState>,
    writer_available: bool,
    _writer_guard: Option<WriterGuard>,
    writer_warning: Option<String>,
}

impl DesktopStorageState {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        let paths = DesktopStoragePaths::new(root);
        paths.ensure_directories()?;

        #[cfg(windows)]
        let guard_result = acquire_writer_guard();
        #[cfg(not(windows))]
        let guard_result = acquire_writer_guard(&paths);

        let (writer_guard, writer_warning) = match guard_result {
            Ok(Some(guard)) => (Some(guard), None),
            Ok(None) => (
                None,
                Some(
                    "Another Planner Buckets process owns desktop storage. This instance is read-only to prevent conflicting writes."
                        .to_string(),
                ),
            ),
            Err(error) => (
                None,
                Some(format!(
                    "Desktop storage could not acquire its writer guard. This instance is read-only: {error}"
                )),
            ),
        };

        Ok(Self {
            paths,
            runtime: Mutex::new(RuntimeState::default()),
            writer_available: writer_guard.is_some(),
            _writer_guard: writer_guard,
            writer_warning,
        })
    }

    fn lock_runtime(&self) -> Result<MutexGuard<'_, RuntimeState>, String> {
        self.runtime.lock().map_err(|_| {
            "Desktop storage state is unavailable after an internal lock failure.".to_string()
        })
    }

    fn ensure_writer(&self) -> Result<(), String> {
        if self.writer_available {
            Ok(())
        } else {
            Err(self.writer_warning.clone().unwrap_or_else(|| {
                "Desktop storage is read-only because no writer guard is available.".to_string()
            }))
        }
    }
}

fn modified_millis(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn current_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Could not read {}: {error}", path.display()))
}

fn planner_json_is_defensively_valid(serialized: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(serialized) else {
        return false;
    };
    value
        .as_object()
        .and_then(|object| object.get("version"))
        .and_then(Value::as_u64)
        == Some(2)
}

fn validate_planner_json(serialized: &str) -> Result<(), String> {
    if planner_json_is_defensively_valid(serialized) {
        Ok(())
    } else {
        Err(
            "Desktop storage rejected planner data that was not valid schema-version 2 JSON."
                .to_string(),
        )
    }
}

fn sanitize_component(value: &str, fallback: &str) -> String {
    let mut sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    while sanitized.contains("--") {
        sanitized = sanitized.replace("--", "-");
    }
    let sanitized = sanitized.trim_matches('-');
    if sanitized.is_empty() {
        fallback.to_string()
    } else {
        sanitized.chars().take(64).collect()
    }
}

fn validate_local_day(local_day: &str) -> Result<(), String> {
    let bytes = local_day.as_bytes();
    let valid = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    if valid {
        Ok(())
    } else {
        Err("Desktop storage requires a local day formatted as YYYY-MM-DD.".to_string())
    }
}

fn unique_temp_path(destination: &Path) -> Result<PathBuf, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Desktop storage destination has no parent directory.".to_string())?;
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("planner.json");
    Ok(parent.join(format!(
        ".{file_name}.{}.{}.tmp",
        process::id(),
        current_nanos()
    )))
}

fn write_new_synced(path: &Path, serialized: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
    file.write_all(serialized.as_bytes())
        .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    file.flush()
        .map_err(|error| format!("Could not flush {}: {error}", path.display()))?;
    file.sync_all()
        .map_err(|error| format!("Could not synchronize {}: {error}", path.display()))?;
    Ok(())
}

fn write_verified_copy(path: &Path, serialized: &str) -> Result<(), String> {
    if path.exists() {
        let existing = read_text(path)?;
        if existing == serialized || planner_json_is_defensively_valid(&existing) {
            return Ok(());
        }
        return Err(format!(
            "Existing recovery copy at {} is invalid and was preserved; the save was blocked.",
            path.display()
        ));
    }
    write_new_synced(path, serialized)?;
    let verified = read_text(path)?;
    if verified != serialized || !planner_json_is_defensively_valid(&verified) {
        let _ = fs::remove_file(path);
        return Err(format!(
            "Desktop storage could not verify the new recovery copy at {}.",
            path.display()
        ));
    }
    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove {}: {error}", path.display())),
    }
}

fn replace_text_recoverably(
    destination: &Path,
    previous: &Path,
    serialized: &str,
) -> Result<(), String> {
    let temp = unique_temp_path(destination)?;
    write_new_synced(&temp, serialized)?;

    remove_file_if_exists(previous)?;
    let had_destination = destination.exists();
    if had_destination {
        if let Err(error) = fs::rename(destination, previous) {
            let _ = fs::remove_file(&temp);
            return Err(format!(
                "Could not preserve the previous desktop storage file before replacement: {error}"
            ));
        }
    }

    if let Err(error) = fs::rename(&temp, destination) {
        if had_destination {
            let _ = fs::rename(previous, destination);
        }
        let _ = fs::remove_file(&temp);
        return Err(format!(
            "Could not promote the new desktop storage file; the previous file was retained: {error}"
        ));
    }

    let verified = read_text(destination);
    match verified {
        Ok(value) if value == serialized => {
            let _ = remove_file_if_exists(previous);
            Ok(())
        }
        Ok(_) | Err(_) => {
            let _ = fs::remove_file(destination);
            if had_destination {
                let _ = fs::rename(previous, destination);
            }
            Err("The promoted desktop storage file did not verify; the previous file was restored when available.".to_string())
        }
    }
}

fn prune_backups(directory: &Path, prefix: &str, retain: usize) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| format!("Could not enumerate planner backups: {error}"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| name.starts_with(prefix) && name.ends_with(".json"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    entries.sort_by_key(|entry| std::cmp::Reverse(modified_millis(&entry.path())));
    for entry in entries.into_iter().skip(retain) {
        fs::remove_file(entry.path()).map_err(|error| {
            format!(
                "Could not prune planner backup {}: {error}",
                entry.path().display()
            )
        })?;
    }
    Ok(())
}

fn create_routine_snapshot_if_needed(
    paths: &DesktopStoragePaths,
    local_day: &str,
    previous_serialized: &str,
) -> Result<(), String> {
    validate_local_day(local_day)?;
    if !planner_json_is_defensively_valid(previous_serialized) {
        return Ok(());
    }
    let destination = paths.backup_dir.join(format!("routine-{local_day}.json"));
    write_verified_copy(&destination, previous_serialized)?;
    prune_backups(&paths.backup_dir, "routine-", ROUTINE_RETENTION)
}

fn write_primary(
    paths: &DesktopStoragePaths,
    serialized: &str,
    local_day: &str,
    create_routine_snapshot: bool,
) -> Result<bool, String> {
    validate_planner_json(serialized)?;
    paths.ensure_directories()?;

    let existing = match fs::read_to_string(&paths.primary) {
        Ok(value) => Some(value),
        Err(error) if error.kind() == ErrorKind::NotFound => None,
        Err(error) => {
            return Err(format!(
                "Could not read the current desktop planner before saving: {error}"
            ))
        }
    };

    if existing.as_deref() == Some(serialized) {
        return Ok(false);
    }

    if create_routine_snapshot {
        if let Some(previous_serialized) = existing.as_deref() {
            create_routine_snapshot_if_needed(paths, local_day, previous_serialized)?;
        }
    }

    replace_text_recoverably(&paths.primary, &paths.previous, serialized)?;
    Ok(true)
}

fn unique_backup_path(directory: &Path, prefix: &str, timestamp: &str, reason: &str) -> PathBuf {
    let timestamp = sanitize_component(timestamp, "unknown-time");
    let reason = sanitize_component(reason, "operation");
    let base = format!("{prefix}{timestamp}-{reason}");
    let mut candidate = directory.join(format!("{base}.json"));
    let mut counter = 2;
    while candidate.exists() {
        candidate = directory.join(format!("{base}-{counter}.json"));
        counter += 1;
    }
    candidate
}

fn create_operation_snapshot(
    paths: &DesktopStoragePaths,
    serialized: &str,
    reason: &str,
    timestamp: &str,
) -> Result<PathBuf, String> {
    validate_planner_json(serialized)?;
    paths.ensure_directories()?;
    let destination = unique_backup_path(&paths.backup_dir, "operation-", timestamp, reason);
    write_verified_copy(&destination, serialized)?;
    prune_backups(&paths.backup_dir, "operation-", OPERATION_RETENTION)?;
    Ok(destination)
}

fn preserve_corrupt_primary(
    paths: &DesktopStoragePaths,
    timestamp: &str,
) -> Result<Option<PathBuf>, String> {
    let raw = match fs::read_to_string(&paths.primary) {
        Ok(value) => value,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Could not read the corrupt planner file for preservation: {error}"
            ))
        }
    };
    let destination = unique_backup_path(
        &paths.backup_dir,
        "corrupt-primary-",
        timestamp,
        "preserved",
    );
    write_new_synced(&destination, &raw)?;
    if read_text(&destination)? != raw {
        let _ = fs::remove_file(&destination);
        return Err("Desktop storage could not verify the preserved corrupt primary.".to_string());
    }
    Ok(Some(destination))
}

fn candidate_value(path: &Path, kind: &str) -> Option<Value> {
    let serialized = fs::read_to_string(path).ok()?;
    Some(json!({
        "kind": kind,
        "path": path_text(path),
        "serialized": serialized,
        "modifiedAtMs": modified_millis(path).min(u64::MAX as u128) as u64,
    }))
}

fn list_backup_candidates(paths: &DesktopStoragePaths) -> Result<Vec<Value>, String> {
    let mut candidates = Vec::new();
    if let Some(previous) = candidate_value(&paths.previous, "previous") {
        candidates.push(previous);
    }

    let entries = fs::read_dir(&paths.backup_dir)
        .map_err(|error| format!("Could not enumerate planner recovery candidates: {error}"))?;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let kind = if name.starts_with("routine-") && name.ends_with(".json") {
            Some("routine")
        } else if name.starts_with("operation-") && name.ends_with(".json") {
            Some("operation")
        } else {
            None
        };
        if let Some(kind) = kind {
            if let Some(candidate) = candidate_value(&path, kind) {
                candidates.push(candidate);
            }
        }
    }

    candidates.sort_by_key(|candidate| {
        std::cmp::Reverse(
            candidate
                .get("modifiedAtMs")
                .and_then(Value::as_u64)
                .unwrap_or_default(),
        )
    });
    Ok(candidates)
}

fn write_auxiliary_file(destination: &Path, serialized: &str) -> Result<(), String> {
    let previous = destination.with_extension("previous.json");
    replace_text_recoverably(destination, &previous, serialized)
}

#[tauri::command]
pub fn desktop_storage_bootstrap(state: State<'_, DesktopStorageState>) -> Result<String, String> {
    state.paths.ensure_directories()?;
    let primary = candidate_value(&state.paths.primary, "primary");
    let backups = list_backup_candidates(&state.paths)?;
    let warning = state.writer_warning.clone();

    Ok(json!({
        "writable": state.writer_available,
        "dataPath": path_text(&state.paths.primary),
        "backupPath": path_text(&state.paths.backup_dir),
        "migrationComplete": state.paths.migration_marker.exists(),
        "primary": primary,
        "backups": backups,
        "warning": warning,
    })
    .to_string())
}

#[tauri::command]
pub fn desktop_storage_save(
    serialized: String,
    sequence: u64,
    local_day: String,
    saved_at: String,
    state: State<'_, DesktopStorageState>,
) -> Result<String, String> {
    state.ensure_writer()?;
    let mut runtime = state.lock_runtime()?;
    if sequence <= runtime.last_committed_sequence {
        return Ok(json!({
            "sequence": sequence,
            "saved": false,
            "stale": true,
            "noOp": true,
            "savedAt": saved_at,
        })
        .to_string());
    }

    let changed = write_primary(&state.paths, &serialized, &local_day, true)?;
    runtime.last_committed_sequence = sequence;
    Ok(json!({
        "sequence": sequence,
        "saved": true,
        "stale": false,
        "noOp": !changed,
        "savedAt": saved_at,
    })
    .to_string())
}

#[tauri::command]
pub fn desktop_storage_recover(
    serialized: String,
    local_day: String,
    timestamp: String,
    state: State<'_, DesktopStorageState>,
) -> Result<String, String> {
    state.ensure_writer()?;
    validate_planner_json(&serialized)?;
    let preserved_path = preserve_corrupt_primary(&state.paths, &timestamp)?;
    write_primary(&state.paths, &serialized, &local_day, false)?;
    Ok(json!({
        "recovered": true,
        "preservedCorruptPath": preserved_path.map(|path| path_text(&path)),
    })
    .to_string())
}

#[tauri::command]
pub fn desktop_storage_create_operation_snapshot(
    serialized: String,
    reason: String,
    timestamp: String,
    state: State<'_, DesktopStorageState>,
) -> Result<String, String> {
    state.ensure_writer()?;
    let path = create_operation_snapshot(&state.paths, &serialized, &reason, &timestamp)?;
    Ok(json!({ "path": path_text(&path) }).to_string())
}

#[tauri::command]
pub fn desktop_storage_mark_migration_complete(
    state: State<'_, DesktopStorageState>,
) -> Result<(), String> {
    state.ensure_writer()?;
    state.paths.ensure_directories()?;
    write_auxiliary_file(&state.paths.migration_marker, "desktop-file-storage-v1\n")
}

#[tauri::command]
pub fn desktop_storage_read_restore_recovery(
    state: State<'_, DesktopStorageState>,
) -> Result<Option<String>, String> {
    match fs::read_to_string(&state.paths.restore_recovery) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Could not read desktop Restore recovery state: {error}"
        )),
    }
}

#[tauri::command]
pub fn desktop_storage_write_restore_recovery(
    serialized: String,
    state: State<'_, DesktopStorageState>,
) -> Result<(), String> {
    state.ensure_writer()?;
    let parsed: Value = serde_json::from_str(&serialized)
        .map_err(|_| "Desktop Restore recovery state was not valid JSON.".to_string())?;
    if parsed.get("format").and_then(Value::as_str) != Some("bsp-planner-restore-recovery") {
        return Err("Desktop Restore recovery state had an unsupported format.".to_string());
    }
    state.paths.ensure_directories()?;
    write_auxiliary_file(&state.paths.restore_recovery, &serialized)
}

#[tauri::command]
pub fn desktop_storage_clear_restore_recovery(
    state: State<'_, DesktopStorageState>,
) -> Result<(), String> {
    state.ensure_writer()?;
    remove_file_if_exists(&state.paths.restore_recovery)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "planner-buckets-storage-test-{label}-{}-{}",
            process::id(),
            current_nanos()
        ));
        fs::create_dir_all(&root).expect("create test root");
        root
    }

    fn planner_json(label: &str) -> String {
        format!(
            r#"{{"version":2,"projects":[{{"id":"{label}"}}],"buckets":[],"tasks":[],"templates":[],"templateDefinitions":[]}}"#
        )
    }

    #[test]
    fn safe_write_creates_one_daily_snapshot_for_changed_data() {
        let root = test_root("daily");
        let paths = DesktopStoragePaths::new(root.clone());
        paths.ensure_directories().expect("directories");
        let first = planner_json("first");
        let second = planner_json("second");
        let third = planner_json("third");

        assert!(write_primary(&paths, &first, "2026-08-28", true).expect("first write"));
        assert!(write_primary(&paths, &second, "2026-08-28", true).expect("second write"));
        assert!(write_primary(&paths, &third, "2026-08-28", true).expect("third write"));

        let routine =
            read_text(&paths.backup_dir.join("routine-2026-08-28.json")).expect("routine snapshot");
        assert_eq!(routine, first);
        assert_eq!(read_text(&paths.primary).expect("primary"), third);
        assert!(!paths.previous.exists());

        fs::remove_dir_all(root).expect("cleanup test root");
    }

    #[test]
    fn identical_save_is_a_no_op_without_backup() {
        let root = test_root("no-op");
        let paths = DesktopStoragePaths::new(root.clone());
        let data = planner_json("same");

        assert!(write_primary(&paths, &data, "2026-08-28", true).expect("first write"));
        assert!(!write_primary(&paths, &data, "2026-08-28", true).expect("no-op write"));
        assert!(!paths.backup_dir.join("routine-2026-08-28.json").exists());

        fs::remove_dir_all(root).expect("cleanup test root");
    }

    #[test]
    fn routine_and_operation_retention_are_bounded() {
        let root = test_root("retention");
        let paths = DesktopStoragePaths::new(root.clone());
        paths.ensure_directories().expect("directories");
        let data = planner_json("retention");

        for index in 0..35 {
            let path = paths
                .backup_dir
                .join(format!("routine-2026-07-{index:02}.json"));
            write_new_synced(&path, &data).expect("routine snapshot");
        }
        prune_backups(&paths.backup_dir, "routine-", ROUTINE_RETENTION).expect("prune routine");

        for index in 0..18 {
            let path = paths
                .backup_dir
                .join(format!("operation-{index:02}-restore.json"));
            write_new_synced(&path, &data).expect("operation snapshot");
        }
        prune_backups(&paths.backup_dir, "operation-", OPERATION_RETENTION)
            .expect("prune operation");

        let routine_count = fs::read_dir(&paths.backup_dir)
            .expect("read backups")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("routine-"))
            .count();
        let operation_count = fs::read_dir(&paths.backup_dir)
            .expect("read backups")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("operation-")
            })
            .count();
        assert_eq!(routine_count, ROUTINE_RETENTION);
        assert_eq!(operation_count, OPERATION_RETENTION);

        fs::remove_dir_all(root).expect("cleanup test root");
    }

    #[test]
    fn corrupt_primary_is_preserved_before_recovery() {
        let root = test_root("corrupt");
        let paths = DesktopStoragePaths::new(root.clone());
        paths.ensure_directories().expect("directories");
        fs::write(&paths.primary, "{not-json").expect("corrupt primary");
        let replacement = planner_json("replacement");

        let preserved = preserve_corrupt_primary(&paths, "2026-08-28T12:00:00Z")
            .expect("preserve corrupt")
            .expect("preserved path");
        write_primary(&paths, &replacement, "2026-08-28", false).expect("recover primary");

        assert_eq!(
            read_text(&preserved).expect("preserved corrupt"),
            "{not-json"
        );
        assert_eq!(
            read_text(&paths.primary).expect("recovered primary"),
            replacement
        );

        fs::remove_dir_all(root).expect("cleanup test root");
    }
}
