# Focused storage acceptance

PR #82 / #40 uses `slice/durable-desktop-persistence`. Read `AGENTS.md` and the current PR evidence for the exact head and installer. Preserve the primary checkout, stashes, rescue refs and artifacts; use one owned exact-head worktree. Do not restart the implementation or repeat unaffected acceptance matrices.

## Evidence already supplied

At `bbc25d8965f77fe743122b2d48ef73e7c28ed880`, local Codex reported browser fault/Retry PASS and actual Windows application-data plus child WebView2-profile isolation. Synthetic native migration/source preservation, save/restart, failed-save/Retry, failed-close protection, first save after same-process WebView reload, second-writer exclusion at preflight, persisted Restore/Undo replay, corrupt-primary recovery and no-valid-candidate preservation passed. These are supplied local observations, not connector execution.

Limitations are retained: the second planner UI was not started; a separate restart immediately after Undo was not isolated; recovery restored only the selected backup's contents; precise live in-flight-close timing and immediate post-reload timing were not captured. Production-identity installer lifecycle #60 was NOT RUN.

The retained synthetic profile deliberately contains invalid no-candidate test state. Its originals and configuration were preserved outside Git. Do not treat that profile as a fresh fixture, overwrite it, or delete it incidentally. Create a new isolated identity for presentation retesting.

The earlier 13 failures at 3666d4c were investigated: ten 5-second timeouts, one missing duplicate-project option and two incorrect-result assertions, followed by an unchanged 551-test pass. Cause remains unestablished. Both original logs/hashes are retained. Run diagnostics sequentially; do not weaken assertions, increase timeouts indiscriminately or rerun until green. #80 owns historical act warnings; #85 owns the current audit finding.

## Data pointer reachability correction

Expanded disclosures used to flex-shrink while hiding overflow. The sidebar now retains each disclosure's intrinsic height and owns scrolling. The production change is scoped to `SidebarDisclosure.css` and its import; storage protocols and native configuration are unchanged.

`data-panel.browser.mjs` tests the actual App at 1280x720, 1440x900, 960x640 and 700x900 using a clean Playwright context per viewport. It checks geometry and center-point hit testing, clicks Retry, and uses normal browser Restore/Undo. A negative control restores the old flex rule to demonstrate the original clipping. CI retains screenshots and structured results outside the repository. Headless Chromium is not installed WebView2 evidence.

Local residual: verify Data scrolling and pointer access to Retry, Restore and Undo in the isolated Windows shell at default desktop size and its minimum supported size. Do not repeat migration, corruption, backup, ordinary browser or historical zoom/drag matrices unless source changes affect those behaviors.

## Deterministic close/reload timing evidence

`acceptance/storageLifecycleTiming.test.ts` composes the real desktop adapter, queue, bootstrap and close guard against a controlled native-command boundary. Deferred promises, not human click speed or sleeps, test:

- close while a write is active and a newer save is queued;
- a save appended while close/flush is already waiting;
- a failing in-flight save that must not acknowledge close until Retry succeeds;
- sequence-one save immediately after a new bootstrap session and obsolete-adapter rejection.

Run `npx vitest run acceptance/storageLifecycleTiming.test.ts` when diagnosing these contracts. Pair results with the native Rust session tests and the supplied native close/reload observations. These are deterministic protocol tests, not a measured Windows IPC race. Do not relabel the two unobserved live timing cases as native PASS. Further live timing instrumentation is required only if the evidence exposes an unexplained contract discrepancy or the final reviewer requests a specific missing native observation; do not send the owner back to manually time races.

## Browser save-fault page

From the owned worktree in an isolated synthetic browser context:

```text
npm ci
npm run dev -- --mode acceptance --host localhost --port 5179 --strictPort
```

Open `http://localhost:5179/acceptance/storage-fault.html`. Wait for Saved, record the persisted inspector, arm one failure and create a task. Data must show an error and real Retry save. Persisted bytes must remain unchanged until pointer-activated Retry succeeds and saves the pending task. This page uses the real App/coordinator but an in-memory command host; it cannot prove native disk behavior. Use the normal application for Restore, not unsupported fault-host commands. Production builds exclude this entry.

## Native profile preparation

On Windows, from a clean owned worktree at the current exact head:

```text
node --test scripts/acceptance/native-profile.check.mjs
node scripts/acceptance/native-profile.mjs . <exact-current-head>
```

The generator creates a unique Tauri identity and external hashed config/manifest; it does not launch or install anything. Inspect its hashes and known `TAURI_CONFIG`/`WEBVIEW2_*` environment and registry/policy overrides before launch. Do not alter machine-wide settings or bypass policy. Start only with the printed explicit config command; a code worktree alone does not isolate application data.

At native preflight, before acknowledgement, seeding, planner startup or faults:

1. Match actual native data paths to the manifest's unique root.
2. Inspect this application's direct child WebView2 process command line. Canonicalize the actual `--user-data-dir`, compare full directory boundaries and check for reparse redirection. Substring matching is insufficient.
3. Preserve PID/config/source/path evidence outside Git. Missing or uncertain isolation is BLOCKED.
4. Only then acknowledge isolation and optionally seed the synthetic v2 fixture. Never overwrite pre-existing planner data. Restart with the same proven config without reseeding.

For a development watcher EBUSY on generated Cargo output, preserve the error and use a diagnosed process-local watcher setting supported by installed Vite. Do not change global configuration or infer this explains unrelated test failures.

This alternate development identity supplies source-equivalent native evidence, not production NSIS acceptance. #60 requires separately authorized visible install/uninstall/reinstall in a proven isolated Windows user or VM, with an exact installer and external All-data backup. This runbook does not authorize production-profile operations. Artifact hashing alone is not lifecycle acceptance.

## Return only new evidence

Report exact source/config identity, focused pointer reachability, any new defect, and specific remaining #60/environment limits. Preserve previous passing evidence. Do not rebuild production installers just to retest CSS; a source-equivalent isolated dev shell suffices for presentation, while #60 must use its approved retained installer.

No commit is needed unless a genuine new defect is reproduced. Keep evidence outside Git, stop owned processes, and reconcile only the owned worktree without force. Keep PR #82 draft until the final connector review, native presentation evidence, lifecycle reconciliation and security disposition are adequate.
