# Durable Desktop Persistence Slice

This execution plan is the durable implementation record for issue #40. Keep it current as the slice evolves. It supplements the issue contract and root `AGENTS.md`; it does not weaken either.

## Status

**ACTIVE**

- Base `main`: `242e4a067bcb60951b47cfd9e95dc3f64c8d30d9`
- Integration branch: `slice/durable-desktop-persistence`
- Tracking issue: #40
- Desktop epic: #38
- Follow-on release/updater work: #41
- Native uninstall/reinstall acceptance: #60

## Outcome

Desktop Planner Buckets will treat a validated file in the Tauri application-data directory as authoritative. Browser builds will continue to use browser `localStorage`. Both modes will preserve the same schema-v2, Restore, scoped exchange, and JSON export contracts.

The desktop implementation must provide:

- runtime-resolved data and backup paths;
- recoverable same-directory temporary-file promotion;
- one routine snapshot per changed local day, retaining 30;
- bounded operation snapshots, initially retaining 12;
- pre-Restore snapshot enforcement;
- startup recovery from the newest valid candidate;
- one-time legacy WebView-storage migration without deleting the source;
- stale-write suppression and visible save health;
- explicit multi-instance protection or a visible safe limitation;
- deterministic unit/integration coverage and exact-head Windows packaging.

## Current architecture

At the base commit:

- `src/services/plannerPersistence.ts` owns v1/v2 browser `localStorage` load, migration, malformed-v2 preservation, and save.
- `src/storage/plannerStorage.ts` contains legacy v1 storage helpers and runtime ID creation.
- `src/services/restoreRecovery.ts` stores one pre-Restore recovery snapshot in browser `localStorage`.
- `src/App.tsx` synchronously loads localStorage during initial render and saves every planner-state change directly back to localStorage.
- `src/components/sidepanel/DataPanel.tsx` exposes JSON export/import/Restore but no storage mode or health.
- `src-tauri/src/lib.rs` currently registers only the clipboard plugin and has no file-storage commands.

## Decisions

### Storage boundary

Introduce an asynchronous `PlannerStorageAdapter` used by application startup, state persistence, destructive-operation snapshots, recovery state, and storage-health presentation.

The adapter contract will expose:

- `load()` — returns validated authoritative planner data, source, warning, and storage status;
- `save(data)` — queues/coalesces validated state, rejects stale completion, and returns durable-save status;
- `createOperationSnapshot(reason, data)` — verifies a recovery copy before destructive replacement;
- `loadRestoreRecovery(currentData)` / `clearRestoreRecovery()` — preserves the current Undo Restore behavior across browser and desktop modes;
- `getStatus()` — exposes mode, resolved paths, write capability, last success/error, and recovery/migration warning.

Schema validation remains in shared TypeScript domain code. Rust commands provide filesystem safety, path resolution, bounded retention, exclusive-writer protection, and raw candidate transport; they do not become an independent competing planner-schema implementation.

### Browser adapter

The browser adapter will preserve existing keys and behavior:

- `planner-buckets:data:v1`
- `planner-buckets:data:v2`
- `planner-buckets:data:v2:recovery*`
- `planner-buckets:restore-recovery-v1`

No Tauri API, account, backend, or network dependency will be required.

### Desktop paths

The Rust shell will resolve `app_local_data_dir()` from Tauri and create child directories:

- `data/planner-v2.json`
- `data/planner-v2.previous.json` during recoverable promotion only
- `backups/routine-YYYY-MM-DD.json`
- `backups/operation-<UTC timestamp>-<reason>.json`
- `backups/corrupt-primary-<UTC timestamp>.json`
- `migration-v1.complete`
- `planner-storage.lock`

The UI reports exact resolved paths returned by the runtime. No machine-specific path is committed or guessed.

### Safe replacement

Desktop save sequence:

1. shared TypeScript validates schema-v2 and relational integrity;
2. Rust parses the serialized JSON defensively and confirms version 2;
3. identical content is treated as a no-op;
4. when content changed and a valid prior primary exists, create the daily routine snapshot if today's snapshot does not already exist;
5. write a uniquely named temporary file beside the primary;
6. flush and `sync_all` the temporary file;
7. move the existing primary to a recoverable previous file;
8. promote the temporary file;
9. restore the previous file if promotion fails;
10. re-read the promoted file before deleting the previous file;
11. prune retention only after the new primary is established.

The filesystem sequence is recoverable on Windows even where replacement rename semantics are not fully atomic.

### Backup retention

- Routine snapshots: at most one per supplied/validated local calendar day; newest 30 retained.
- Operation snapshots: newest 12 retained.
- Corrupt primaries: preserved and never counted as routine snapshots; pruning requires separate explicit policy and is not performed automatically in this slice.
- Identical saves do not create routine snapshots.
- Retention never deletes the primary or the only established valid candidate.

### Startup order

Desktop adapter startup:

1. request primary and ordered backup candidates from Rust;
2. validate the primary through existing schema-v2 validators;
3. when valid, use it and ignore legacy localStorage;
4. when invalid, preserve it, select the newest valid backup, and recover through the safe write command;
5. when no primary exists and migration is not marked complete, inspect the current WebView localStorage through the existing v2/v1 migration logic, then initialize the durable primary and mark migration complete only after verification;
6. when no persisted candidate exists, initialize a valid default planner through the same safe write path.

Invalid backup candidates are skipped without deletion. Migration never deletes legacy WebView storage.

### Concurrency

The desktop shell will enforce one writer with an application-data lock file held for the process lifetime. A second instance that cannot acquire the lock will report read-only/blocked persistence instead of silently participating in last-writer-wins corruption.

Within one instance, monotonically increasing save sequence numbers and a serialized/coalescing frontend save queue prevent older async writes from overwriting newer state.

### Restore behavior

Before dispatching full `REPLACE_DATA` in desktop mode, the app must await a verified operation snapshot. Snapshot failure blocks Restore. Browser mode preserves the existing localStorage recovery snapshot behavior. Scoped imports remain merge operations and do not masquerade as Restore.

## Implementation phases

### Phase 1 — storage contract and Tauri I/O

- [ ] Add shared adapter/status/result types.
- [ ] Extract the browser adapter without changing existing behavior.
- [ ] Add Tauri bootstrap, initialize, save, operation-snapshot, recovery, and status commands.
- [ ] Add path resolution and process-lifetime writer lock.
- [ ] Add safe promotion and retention helpers.
- [ ] Add Rust unit tests for path-independent filesystem helpers.

### Phase 2 — application lifecycle

- [ ] Bootstrap storage before rendering the production app.
- [ ] Keep `App` test defaults browser-compatible.
- [ ] Replace direct save effect with queued adapter saves.
- [ ] Prevent first render/save from overwriting a desktop primary before bootstrap completes.
- [ ] Surface load/recovery/migration warnings.
- [ ] Integrate pre-Restore operation snapshots and Undo Restore.

### Phase 3 — storage-health UI

- [ ] Show Browser local storage vs Desktop file storage.
- [ ] Show last save state/time.
- [ ] Show resolved data and backup locations in desktop mode.
- [ ] Show recovery, migration, read-only, and save-failure warnings.
- [ ] Avoid encryption or durability claims beyond verified behavior.

### Phase 4 — deterministic coverage

- [ ] Browser adapter parity.
- [ ] Valid primary and missing-primary initialization.
- [ ] Corrupt primary and invalid backup skipping.
- [ ] Failed write preserves previous primary.
- [ ] Temporary promotion recovery.
- [ ] Stale save suppression.
- [ ] Daily snapshot deduplication and 30-day retention.
- [ ] Operation-snapshot 12-item retention.
- [ ] Pre-Restore success/failure blocking.
- [ ] One-time migration and existing-primary precedence.
- [ ] Storage-health UI states.
- [ ] Existing project-scoped import/export regression coverage.

### Phase 5 — documentation and acceptance

- [ ] Update `docs/DESKTOP.md` with authoritative paths, migration, backup, recovery, lock/read-only behavior, and limitations.
- [ ] Update README/CHANGELOG only where the final behavior warrants it.
- [ ] Produce a synthetic exact-head native acceptance kit outside Git.
- [ ] Reconcile #60 against the new authoritative data location.

## Validation matrix

Every implementation head intended for review must run:

```text
npm ci
focused storage/migration/backup tests
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
git diff --check
```

Hosted CI must pass at the exact branch head. Browser-observable status and recovery behavior should use the Codex browser first. Installed Tauri persistence, runtime paths, exclusive-writer behavior, and uninstall/reinstall survival remain narrow native acceptance.

## Boundaries

Do not include:

- updater signing, keys, tags, releases, or publication (#41);
- template onboarding (#49);
- motion-profile redesign (#58);
- unrelated React warning cleanup (#80);
- private planner data or machine-specific paths;
- encryption-at-rest claims;
- deletion of legacy WebView storage;
- backend, account, telemetry, or network requirements.

## Progress log

- 2026-08-28 — sequencing gates cleared; exact base verified; branch created; current browser and Tauri storage boundaries reviewed; execution plan started.
