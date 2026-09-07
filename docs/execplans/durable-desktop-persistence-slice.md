# Durable Desktop Persistence Slice

## Identity and scope

- Repository: Nobodyworld/app-planner-buckets
- Issue: #40; existing draft PR: #82
- Canonical branch: `slice/durable-desktop-persistence`
- Base main: `242e4a067bcb60951b47cfd9e95dc3f64c8d30d9`
- This file is the execution record. Earlier references to a `feat/` branch or `docs/DURABLE_PERSISTENCE.md` were incorrect.

Continue and repair the existing implementation; do not create a parallel store, branch, or PR. Keep schema-v2, browser behavior, scoped import/export, templates, and board behavior compatible. Signed updater/release work (#41), native lifecycle observations (#60), and unrelated warning cleanup (#80) are separate.

## Implemented repair contract

1. One validated bootstrap and session handshake before React mounts; durable primary, then fully validated recovery candidates. Invalid historical data never becomes an automatic blank planner.
2. Pure legacy v2/v1 migration reads; preserve original values, snapshot migrated data, commit the native primary, and only then mark completion. Valid durable data always wins.
3. Preserve all previous/rollback recovery sources until replacement verifies, including the previous-only interrupted-write case. Preserve non-UTF-8 corrupt bytes exactly. Surface I/O errors instead of treating them as absence.
4. One ordered queue for ordinary saves, Restore, Undo, and recovery retirement. Session generations reject obsolete frontend writes after WebView reload. Saved means acknowledged durable state; retain failed ordinary state for explicit retry.
5. Full Restore uses one App-owned validated candidate. Allow cancellation during preparation, then disable cancellation and mutations during native CAS/commit. Verify a pre-operation snapshot, preserve prior recovery on failed replacement, and update React only after commit. No desktop dependency on WebView recovery writes.
6. Scope the exclusive Windows writer handle to the resolved data directory; stale lockfile existence is not writer ownership. Second writers are read-only. Normal close waits for queued state; failed unsaved writes block close. Forced termination is not a guarantee for unacknowledged edits.
7. Preserve the agreed backup policy: one pre-change routine copy per changed local day, newest 30; newest 12 operation copies. Canonical frontend validation plus native exact-byte recheck precedes pruning. Keep invalid/unreviewed files, and prune only after a committed primary.
8. Browser storage remains supported and synchronous where previously synchronous. No unnecessary browser CAS or new data format. Runtime data paths are intentionally shown in the Data panel; machine-specific source paths must never be committed.
9. Use maintained Node 22/24 for development; CI defaults to Node 22. Cargo commands use the committed lockfile and fail on build-input drift.

## Validation

Hosted CI must pass at the final exact head: frontend suite, TypeScript/Vite, Cargo formatting, locked strict Clippy, locked Rust tests, Windows NSIS packaging, clean tracked inputs, installer checksum and provenance.

Regression coverage must exercise previous-only recovery failure, promotion/verification/rollback errors, invalid UTF-8 preservation, validated retention and byte-race rejection, session renewal, writer exclusion, save ordering and retry, false-success prevention, cancelled Restore, failed Undo, one-file selection, WebView recovery independence, and the native close handshake. Tests must not weaken existing browser assertions to hide timing regressions.

The branch stays draft until the final candidate has exact-head hosted evidence and local/browser/native evidence below. A retained installer from a failed frontend run is not accepted.

## Remaining local acceptance

Use one owned isolated worktree from the final PR head and preserve the primary checkout, stashes, rescue refs and historical evidence. Use synthetic data only. Follow root AGENTS.md for browser-first checks and safe reconciliation.

- Rendered browser: storage status, maintained browser persistence/Restore, retry/error display, and Data-panel containment at desktop and narrow viewports. Do not repeat unaffected zoom/drag suites.
- Isolated Windows/Tauri profile: first-run migration and original-byte preservation; save/restart; queued-save close; failed-save retry; WebView reload then immediate save; second-writer exclusion; Restore/Undo across restart; controlled corrupt-primary recovery and no-candidate fail-closed behavior.
- Isolation must be proven before native execution. Never run corruption/failure tests against the owner's profile. Missing native tooling is a specific limitation, not permission to claim a pass or hand back browser-observable work.
- Reconcile #60 uninstall/reinstall observations against the new data root before closing #40 or promoting a desktop release. Preserve external All-data backups. Do not silently waive this gate.

No real planner data, installers, browser traces, generated state, caches, or machine paths belong in Git. Record final branch/head, commands, results and any narrow unresolved native requirement in PR #82.
