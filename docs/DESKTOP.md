# Desktop distribution

Planner Buckets supports two parallel delivery modes that share the same React/Vite frontend and planner schema:

- the browser application, which uses browser `localStorage`; and
- the Windows desktop application, which uses validated files in Tauri's runtime-resolved application-data directory.

This document records the implemented Tauri shell, installer provenance, durable desktop persistence, and signed-updater boundaries. Detailed signing and promotion procedures are in `docs/RELEASES.md`.

## Current Windows support and prerequisites

The desktop shell targets Windows 10 version 1803 or later and Windows 11. Microsoft Edge WebView2 is included with supported Windows versions; install the Evergreen WebView2 Runtime if it is absent.

Building from a checkout requires:

- maintained Node.js 22 LTS (at least 22.12) or 24 LTS; the package engine range still records historical Node 20 compatibility, not an upstream support promise;
- Rust stable with the `x86_64-pc-windows-msvc` host;
- Microsoft C++ Build Tools with the **Desktop development with C++** workload; and
- WebView2.

The Tauri shell uses `@tauri-apps/cli` `2.11.4`, Rust `tauri` `2.11.5`, and `tauri-build` `2.6.3`. The frontend uses the Tauri core invoke API only to call constrained Planner Buckets commands registered by the shell.

## Development and build commands

```text
npm run dev             # browser development server at http://localhost:5173
npm run build           # browser production build
npm run desktop:dev     # Tauri window using the Vite development server
npm run desktop:build   # production Windows NSIS installer
npm run release:check   # static signed-release/updater contract checks
```

`npm run dev` remains the browser application. Tauri uses that command only as its desktop development server and does not create a second frontend.

The configured main window is titled **Planner Buckets**, is resizable, starts at 1440 × 900, and has a 960 × 640 minimum size. Its application identifier is `com.nobodyworld.plannerbuckets`.

On Windows, native Tauri file-drop interception is disabled for the main window so the planner's existing HTML5 task and bucket drag-and-drop interactions continue to reach the frontend.

## Installer behavior

`npm run desktop:build` creates an NSIS installer under:

```text
src-tauri\target\release\bundle\nsis\
```

The configured current-user installer does not require elevated installation and is intended to install outside the Git checkout. It uses normal NSIS Start menu, launch, pinning, and uninstall behavior.

`dist/`, `src-tauri/target/`, installers, application-data files, backups, and exported planner JSON are generated user or build artifacts and are not committed.

## Hosted installer artifacts and provenance

CI retains exact NSIS candidates with run-specific identity and provenance. For pull requests, the Windows job packages the exact pull-request head rather than GitHub's synthetic merge commit; the workflow merge SHA remains traceable separately.

Artifact names follow:

```text
planner-buckets-windows-<application-version>-<full-source-sha>-run-<run-id>-attempt-<attempt>
```

The ordinary CI artifact contains:

- the exact NSIS installer;
- `<installer-filename>.sha256`; and
- `provenance.json` containing source/run/toolchain/build identity and installer SHA-256.

For acceptance:

1. record source SHA, workflow run/attempt, artifact ID/name, installer filename/size/hash;
2. download the artifact and verify its adjacent checksum;
3. preserve that candidate unchanged during acceptance; and
4. treat every rebuild as a new candidate even when source is identical.

An ordinary CI artifact is not a signed updater, GitHub Release, or byte-for-byte reproducibility claim.

## Storage authority and health

Browser mode remains an offline localStorage application. The installed Windows application uses Tauri's runtime-resolved application-data directory. The Data panel reports the resolved planner and backup locations; these paths are runtime diagnostics, not hard-coded developer paths.

Relative native files include:

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

Shared TypeScript validators remain the canonical schema and relational-integrity boundary. Rust defensively requires complete v2 collections and owns paths, exclusive writer handles, flushing, replacement, and exact-byte verification.

New bytes are written and synchronized beside the primary before promotion. Existing previous/rollback candidates survive until replacement verifies. Promotion or rollback failure retains discoverable recovery files and reports an error. Corrupt-primary preservation copies raw bytes, including invalid UTF-8.

Startup creates one native session handshake before React mounts. It selects a valid primary, then the newest fully validated previous/routine/operation candidate with deterministic tie-breaking. Unreadable files are errors, not missing data. Existing corrupt evidence with no valid candidate, or missing data after completed migration, stops startup without resetting the planner or replaying legacy WebView state.

Routine snapshots retain the first pre-change planner for each changed local calendar day and keep the newest **30** validated daily files. Operation snapshots retain **12** validated files. Identical saves do not create snapshots. Retention occurs only after the primary is established, and unreviewed/changed/invalid/corrupt-preservation files are not pruned.

## Migration

A valid durable primary wins over legacy WebView data. One-time migration is allowed only when no primary/recovery evidence or completed marker exists. Legacy v2/v1 values are read without deleting or changing them; malformed-only legacy data blocks initialization. A valid legacy planner is validated, snapshotted, written, and verified before the completion marker.

Unrelated browser profiles are never scraped. Browser-to-desktop transfer uses explicit **All data** export and desktop Restore.

## Serialized saves and Restore

Native saves, full Restore, Undo Restore, and recovery retirement share one frontend queue and a native session-checked lock. A new WebView bootstrap establishes a new generation; stale queued requests are rejected rather than overwriting newer state.

The application reports Saved only after durable acknowledgement. Failed ordinary saves retain the newest unsaved state for **Retry save**. Before normal close, the native shell asks the frontend to drain its queue; an outstanding failed save keeps the window open. Forced termination, OS shutdown, and power loss cannot promise delivery of edits that were never durably acknowledged.

Restore uses the App's single validated file-selection path. Preparation creates a verified native operation snapshot. React changes its planner only after native commit succeeds. Desktop Restore and Undo do not depend on WebView localStorage recovery writes.

The installed writer guard is an exclusive OS file handle scoped to the data directory. A second instance remains explicitly read-only; separate isolated acceptance roots do not contend with production storage.

## Signed updater behavior

The desktop updater is opt-in and Rust-owned. Browser mode does not render updater controls. Desktop users explicitly choose **Check for updates**, then separately **Install and restart** when a newer signed release is available.

The frontend receives no generic Tauri updater permissions. It calls only registered Planner Buckets updater commands. The public updater key is supplied from `TAURI_UPDATER_PUBLIC_KEY` to trusted Rust/release configuration; the private key exists only as a GitHub Actions secret and owner-held backup.

Before installation begins, Planner Buckets:

1. flushes the durable save queue;
2. supplies exact planner state and native session to Rust;
3. creates and verifies a `pre-update` operation snapshot; and
4. only then downloads/installs the signature-verified updater artifact.

A failed flush, snapshot, metadata/download, signature check, or installer launch is surfaced as an error rather than a successful update.

Release-sensitive human-owned pull requests build a non-publishing signed candidate, cryptographically verify its `.sig` against the configured public key, and require a deliberately tampered artifact to be rejected. A signature file merely existing is not accepted as cryptographic proof.

For a version tag, the release workflow creates a GitHub Release **draft**, downloads the actual hosted installer/signature/`latest.json` back from GitHub, checks the downloaded installer bytes against the local signed build, verifies the signature and tamper rejection, requires the exact tag/asset updater URL, and retains evidence. The workflow leaves the release draft. Publication requires a separate explicit owner approval. See `docs/RELEASES.md`.

## Uninstall and lifecycle evidence

Issue #60 completed the production-identity lifecycle matrix on an isolated hosted Windows environment: install/registration, normal launch, synthetic persistence, same-installer repair, registered uninstall, application-data survival, reinstall, restored state, and corruption recovery.

The NSIS template also exposes an interactive **Delete app data** choice. Silent hosted lifecycle automation intentionally does not select that option, so ordinary uninstall data survival and explicit data deletion remain distinct behaviors.

Continue making external **Export All data** JSON backups before destructive or release acceptance work.

## Security boundaries

The packaged shell loads only its local frontend. Development uses localhost Vite/WebSocket connections. The shell exposes no global Tauri JavaScript object and grants no generic filesystem, shell, process, dialog, broad network, direct updater, or user-selected-path permission.

The frontend can invoke only registered Planner Buckets storage/updater commands and the existing clipboard plugin. Rust resolves application-data paths and owns updater authority; the frontend never supplies an arbitrary filesystem destination or updater URL.

Storage is local but is not claimed to be encrypted at rest. Signing credentials never belong in application data or Git.

## Completed workstreams

### #39 — Tauri shell and Windows installer

- Tauri 2 project, NSIS installer configuration, icons, constrained capabilities, and Windows CI packaging.

### #40 — durable persistence and backups

- Validated application-data files, runtime-selected browser/desktop adapters, safe replacement, backups/recovery, writer exclusion, migration, Restore recovery, storage-health reporting, and installed lifecycle acceptance.

### #41 — signed updater and release infrastructure

- Signing trust root, constrained update commands, explicit update UI, mandatory pre-update snapshot, signed candidate validation, GitHub Release assets/metadata/provenance, and rollback documentation.

### #92 — v1.2.0 promotion hardening

- Cryptographic signature verification and tamper rejection.
- Verification of the actual GitHub-hosted draft assets and exact updater URL.
- Tag-created draft only, with a separate explicit publication approval.
- Release-candidate documentation/security cleanup before the first updater-enabled public release.

## Validation

Run the browser and Rust checks before submitting desktop changes:

```text
npm ci
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

Updater/release changes additionally require the release-contract check and exact-head signed-updater validation when secrets are available. Record only tests and artifacts genuinely completed and bound to the exact source/run.
