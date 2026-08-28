# Desktop distribution

Planner Buckets supports two parallel delivery modes that share the same React/Vite frontend and planner schema:

- the browser application, which uses browser `localStorage`; and
- the Windows desktop application, which uses validated files in Tauri's runtime-resolved application-data directory.

This document records the implemented Tauri shell, installer provenance, and durable desktop persistence. Signed updates and release publishing remain issue #41.

## Current Windows support and prerequisites

The desktop shell is intended for Windows 10 version 1803 or later and Windows 11. Microsoft Edge WebView2 is included with those supported Windows versions; install the Evergreen WebView2 Runtime if it is absent.

Building from a checkout requires:

- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`;
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

## Storage authority

The browser and desktop modes intentionally use different persistence adapters:

- **Browser local storage** — the browser application preserves the established schema-v2 `localStorage` keys and remains offline with no Tauri dependency.
- **Desktop file storage** — the installed Tauri application treats a validated schema-v2 file in the runtime-resolved application-data directory as authoritative.

The Data panel reports the active mode, save state, last successful save, and the exact runtime-resolved desktop planner and backup locations. Repository code and documentation do not embed a machine-specific checkout or user-profile path.

Within the Tauri application-data root, the desktop adapter uses these relative locations:

```text
data/planner-v2.json
backups/routine-YYYY-MM-DD.json
backups/operation-<UTC timestamp>-<reason>.json
backups/corrupt-primary-<UTC timestamp>-preserved.json
backups/restore-recovery.json
migration-v1.complete
```

A temporary file and `data/planner-v2.previous.json` may exist while a recoverable replacement is in progress. They are not independent user backups.

## Safe writes and save ordering

Every desktop save is validated by the shared TypeScript schema/integrity boundary before it reaches Rust. The Rust command defensively parses the payload and requires schema version 2 before touching the authoritative file.

For changed content, the shell:

1. creates the applicable routine snapshot before replacement;
2. writes a uniquely named temporary file beside the primary;
3. flushes and synchronizes the temporary file;
4. preserves the old primary as a recoverable previous file;
5. promotes the temporary file;
6. re-reads the promoted file;
7. restores the previous file when promotion or verification fails; and
8. prunes bounded backups only after the new primary is established.

Identical saves are no-ops and do not create routine snapshots. The frontend serializes and coalesces async saves, assigns monotonically increasing sequence numbers, and the Rust command rejects an older sequence after a newer sequence has committed.

## Automatic backups and retention

Desktop backup policy is deterministic:

- **Routine snapshots** — at most one snapshot of the pre-change primary per local calendar day; newest 30 retained.
- **Operation snapshots** — verified pre-operation copies for destructive workflows such as full Restore; newest 12 retained.
- **Corrupt-primary preservation** — an unreadable or invalid primary is copied without modification before repair. Corrupt copies are not silently deleted by routine retention.

The primary file is never counted as a backup and retention does not delete the only established valid candidate.

These snapshots are local recovery aids, not encrypted vaults, remote backups, or a substitute for user-controlled JSON exports.

## Startup recovery

Desktop startup completes storage bootstrap before React mounts, preventing an empty initial render from overwriting a valid primary.

Recovery order is:

1. validate the authoritative primary with the shared schema-v2 validators;
2. when invalid or missing, inspect the recoverable previous file and ordered routine/operation candidates;
3. skip invalid candidates without deleting them;
4. select the newest valid candidate;
5. preserve an invalid primary and repair the primary through the same verified replacement command when the writer is available; and
6. surface the recovery result and any read-only limitation in the Data panel.

If no valid candidate remains after the one-time migration marker exists, Planner Buckets initializes a new planner rather than resurrecting stale WebView data.

## One-time WebView migration

The desktop shell migrates only when all of these conditions are true:

- no valid durable primary exists;
- no valid desktop backup exists; and
- `migration-v1.complete` is absent.

It then evaluates the current desktop WebView's established v2/v1 localStorage through the same validators and deterministic migration used by the browser application. The durable primary is written and verified before the marker is created.

The legacy WebView data is not deleted or overwritten by desktop planner saves. Once the marker exists, the desktop bootstrap will not import that legacy planner again. Browser-to-desktop transfer from an unrelated browser profile still uses explicit **Export All data** and **Restore** because the desktop application does not inspect another browser's profile.

## Restore and Undo Restore

The Data panel parses and validates the selected full-backup JSON before confirmation. In desktop mode, the Confirm Restore action awaits both:

- a verified operation snapshot of the current planner; and
- a durable Restore-recovery record that fingerprints the replacement planner.

Restore does not begin if that preparation fails. After restart, a matching durable recovery record is mirrored into the existing Undo Restore UI. Undo, dismissal, project import, or a later divergent planner state retires stale recovery state.

Scoped project/bucket/Unassigned exchange files remain import inputs and are rejected by full Restore.

## Multi-instance behavior

The desktop shell acquires one process-lifetime Windows writer mutex for the application identifier. A second process that cannot acquire the writer guard opens with an explicit read-only storage state instead of participating in last-writer-wins file replacement.

Read-only status and the reason are visible in the Data panel. Browser mode is unaffected.

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
