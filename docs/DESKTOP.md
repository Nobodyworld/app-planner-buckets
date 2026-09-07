# Desktop distribution

Planner Buckets supports two parallel delivery modes that share the same React/Vite frontend and planner schema:

- the browser application, which uses browser `localStorage`; and
- the Windows desktop application, which uses validated files in Tauri's runtime-resolved application-data directory.

This document records the implemented Tauri shell, installer provenance, and durable desktop persistence. Signed updates and release publishing remain issue #41.

## Current Windows support and prerequisites

The desktop shell is intended for Windows 10 version 1803 or later and Windows 11. Microsoft Edge WebView2 is included with those supported Windows versions; install the Evergreen WebView2 Runtime if it is absent.

Building from a checkout requires:

- maintained Node.js 22 LTS (at least 22.12) or 24 LTS; the package engine range still records historical Node 20 compatibility, not an upstream support promise;
- Rust stable with the `x86_64-pc-windows-msvc` host;
- Microsoft C++ Build Tools with the **Desktop development with C++** workload; and
- WebView2.

The Tauri shell uses `@tauri-apps/cli` `2.11.4`, Rust `tauri` `2.11.5`, and `tauri-build` `2.6.3`. The frontend uses the Tauri core invoke API only to call the constrained Planner Buckets storage commands registered by the shell.

## Development and build commands

```text
npm run dev             # browser development server at http://localhost:5173
npm run build           # browser production build
npm run desktop:dev     # Tauri window using the Vite development server
npm run desktop:build   # production Windows NSIS installer
```

`npm run dev` remains the browser application. Tauri uses that command only as its desktop development server and does not create a second frontend.

The configured main window is titled **Planner Buckets**, is resizable, starts at 1440 × 900, and has a 960 × 640 minimum size. Its application identifier is `com.nobodyworld.plannerbuckets`.

On Windows, native Tauri file-drop interception is disabled for the main window so the planner's existing HTML5 task and bucket drag-and-drop interactions continue to reach the frontend.

## Installer behavior

`npm run desktop:build` creates an NSIS installer under:

```text
src-tauri\target\release\bundle\nsis\
```

The configured current-user installer does not require elevated installation and is intended to install outside the Git checkout. It is configured for the normal NSIS Start menu, launch, pinning, and uninstall behavior. Validate those user-facing behaviors through the local installation test before release.

`dist/`, `src-tauri/target/`, installers, application-data files, backups, and exported planner JSON are generated user or build artifacts and are not committed.

## Hosted installer artifacts and provenance

For any CI run that includes the current provenance workflow, the `desktop-windows` job retains the exact CI-built NSIS candidate for 30 days. For pull requests, that job checks out and verifies the exact pull-request head rather than packaging GitHub's synthetic merge commit. The workflow merge SHA is still recorded separately for traceability.

The artifact name is:

```text
planner-buckets-windows-<application-version>-<full-source-sha>-run-<run-id>-attempt-<attempt>
```

Including the run ID and attempt keeps immutable artifacts distinct when one source SHA is rebuilt or a workflow is rerun.

The uploaded artifact contains:

- the exact NSIS installer produced by `npm run desktop:build`;
- `<installer-filename>.sha256`, containing the installer's SHA-256 digest; and
- `provenance.json`, recording the application version, full source SHA, expected source SHA, workflow and pull-request SHAs, source ref, workflow run and attempt, runner and toolchain versions, installer filename, byte size, build time, and SHA-256.

The workflow summary also records the hosted artifact ID, URL, and immutable artifact-archive digest returned by GitHub Actions.

Use this policy for an exact acceptance candidate:

1. Record the source SHA, workflow run ID and attempt, artifact name, installer filename, byte size, and installer SHA-256.
2. Download the retained artifact and verify the installer against its adjacent `.sha256` file before installation.
3. Preserve that downloaded installer unchanged while physical acceptance is in progress.
4. Treat any rebuild—even from the same source SHA—as a new candidate with its own identity and evidence.
5. Prefer the retained hosted candidate over a local build when both exist for the same acceptance cycle.

A retained CI artifact is not a GitHub Release, is not signed update metadata, and is not evidence that packaging is byte-for-byte reproducible. Reproducibility may be claimed only after independent clean builds produce matching installer bytes. Promoted releases remain governed by issue #41 and must either reuse the exact approved candidate bytes or identify a release rebuild as a distinct candidate with a new manifest and acceptance record.

## Storage authority and health

The browser remains a supported offline localStorage application using the existing schema-v2 keys and import/export behavior. The installed Windows application uses Tauri's runtime-resolved application-data directory. The Data panel intentionally reports the resolved planner and backup locations; these runtime diagnostics are not hard-coded developer paths.

Relative native files are:

```text
data/planner-v2.json
data/planner-v2.previous.json
data/planner-v2.rollback-<identity>.json
data/planner-storage.lock
backups/routine-YYYY-MM-DD.json
backups/operation-<UTC timestamp>-<reason>-<identity>.json
backups/corrupt-primary-<identity>.json
backups/restore-recovery.json
migration-v1.complete
```

Previous/rollback files are interrupted-transaction recovery candidates, not routine backups. Temporary files are never selected as authoritative data.

## Safe writes, recovery and retention

The shared TypeScript validators remain the canonical schema and relational-integrity boundary. Rust defensively requires complete v2 collections and owns paths, exclusive writer handles, flushing, replacement and exact-byte verification. A version marker alone is not proof of valid planner data.

New bytes are written and synchronized beside the primary before promotion. Existing previous/rollback candidates survive until the replacement verifies. Promotion or rollback failures retain discoverable recovery files and report an error; cleanup cannot turn a committed write into a false failure. Corrupt-primary preservation copies raw bytes, including invalid UTF-8.

Startup makes one native session handshake before React mounts. It selects a valid primary, then the newest fully validated previous/routine/operation candidate with a deterministic tie-break. Unreadable files are errors, not missing data. Existing corrupt evidence with no valid candidate, or missing data after completed migration, stops startup without resetting the planner or replaying legacy WebView state.

Routine snapshots retain the first pre-change planner for each changed local calendar day and keep the newest **30** validated daily files. Operation snapshots retain **12** validated files. Identical saves do not create snapshots. Retention occurs only after the primary is established. TypeScript submits only fully validated candidates; Rust rechecks the exact current primary, reviewed filenames and candidate bytes under its lock before deletion. Unreviewed, changed, invalid and corrupt-preservation files are not pruned. Retention failures produce a warning rather than falsely reporting an already-committed planner as unsaved.

## Migration

A valid durable primary wins over legacy data. One-time migration is allowed only when no primary/recovery evidence or completed marker exists. Legacy v2/v1 values are read without changing them; malformed-only legacy data blocks initialization. A valid legacy planner is validated, snapshotted, written and verified before the completion marker. An interrupted marker write is finished on the next valid-primary startup without replaying migration. No WebView profile or legacy planner key is deleted.

Unrelated browser profiles are never scraped; transfer uses explicit All-data export/Restore.

## Serialized saves and Restore

All native saves, full Restore, Undo Restore and recovery retirement share one frontend queue and a native session-checked lock. A new WebView bootstrap establishes a new generation: old queued requests are rejected rather than overwriting newer state, while the new frontend can save immediately. This does not add a browser revision/CAS redesign.

The application reports Saved only after the actual durable acknowledgement. Failed ordinary saves retain the newest unsaved state for **Retry save**. Before normal window close, the native shell asks the frontend to drain its queue; a failed outstanding save keeps the window open. Forced termination, OS shutdown and power loss cannot promise delivery of edits not yet acknowledged; recoverable file replacement protects the last committed state.

Restore uses the App's single validated file-selection path. Preparation creates a verified native operation snapshot. It can be cancelled while waiting/preparing. At commit, cancellation and other planner mutations are disabled. Native commit compares the expected current planner, verifies the pre-operation snapshot, writes the matching Undo record and replaces the primary. React changes its planner only after that commit succeeds. Undo retirement follows successful replacement, not merely an in-memory edit. Desktop Restore and Undo do not require a WebView localStorage recovery write.

The installed writer guard is an exclusive OS file handle scoped to the data directory, not a process-global name or lockfile-existence check. Windows releases it on process exit/crash; a second instance remains explicitly read-only. Different isolated test roots do not contend with production storage.

## Uninstall and lifecycle boundary

The authoritative planner and backup directories are application data, not Git checkout files. Issue #60 owns native verification of repair install, uninstall/reinstall, retained application data, optional cleanup behavior, and WebView lifecycle boundaries. Do not claim uninstall survival until that exact installed-candidate matrix is completed.

Continue making external **Export All data** JSON backups before destructive or release acceptance work.

## Security boundaries

The packaged shell loads only its local frontend. Development uses `http://localhost:5173` and its local Vite WebSocket for hot reload. The CSP allows only these local development connections plus local packaged assets; it allows inline styles because the existing React frontend uses them.

The shell exposes no global Tauri JavaScript object and grants no generic filesystem, shell, process, dialog, broad network, updater, or user-selected-path permission. The frontend can invoke only the registered Planner Buckets storage command surface and the existing clipboard plugin. Rust resolves the application-data paths; the frontend never supplies an arbitrary filesystem destination.

Storage is local but is not claimed to be encrypted at rest. Planner data, backups, and migration copies should be protected by the operating-system account and device controls appropriate to the user.

## Scope split

### #39 — Tauri shell and Windows installer

- Tauri 2 project, NSIS installer configuration, icons, and constrained capability setup.
- Browser and desktop development/build commands.
- Windows CI compilation and local installer validation.

### #40 — durable persistence and backups

- Validated application-data files and browser/desktop storage adapters.
- Safe replacement, backup retention, recovery candidates, writer exclusion, migration, Restore recovery, and storage-health reporting.
- Deterministic frontend/Rust validation and narrow installed-Tauri acceptance preparation.

### #41 — signed updater and releases

- Signing keys, updater configuration, tagged release publishing, and automatic update delivery.

## Validation

Run the browser checks and the Rust shell checks before submitting desktop changes:

```text
npm ci
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

Also perform exact-head browser-first storage-status/recovery checks and narrow local Windows smoke tests for `npm run desktop:dev`, installed-app restart persistence, writer exclusion, the generated installer, and lifecycle behavior. Record only tests that were genuinely completed.
