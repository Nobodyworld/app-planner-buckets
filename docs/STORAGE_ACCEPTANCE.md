# Focused storage acceptance

PR #82 / #40 uses `slice/durable-desktop-persistence`. This support removes test-access gaps, not acceptance gates. Read `AGENTS.md` and current PR evidence. Preserve the primary checkout, stashes, rescue refs and artifacts; use one owned exact-head worktree.

## Evidence retained

The owner-supplied Codex report at `3666d4c6f640144a66f1345c151a54aa7dca60eb` reports 551 frontend tests, 15 Rust tests, compilation, diff checks and normal browser status/Restore/Undo/reload/containment PASS. An initial run failed 13 tests during concurrent Rust compilation, then passed unchanged. The cause is **not established**; preserve both logs and run subsequent validation sequentially, not repeatedly until green. The connector received the report, not the workstation-only logs. #85 owns the high npm finding; #60 remains NOT RUN.

## Browser save-fault check

From the owned worktree, in a synthetic isolated browser context:

```text
npm ci
npm run dev -- --mode acceptance --host localhost --port 5179 --strictPort
```

Open `http://localhost:5179/acceptance/storage-fault.html`. This dev-only entry loads the real App, desktop coordinator and Data retry UI, replacing only native invoke with a labelled in-memory host. It does not call Rust or persist planner data to disk. Normal preferences belong to this isolated browser context.

1. Wait for Saved; record the inspector's persisted synthetic planner.
2. Select **Fail next save**, then create a task using the normal App Add controls.
3. Open Data. Verify an error rather than false Saved, and a real **Retry save** button. The inspector must still contain the preceding persisted state.
4. Use **Retry save**. Verify Saved, the latest pending task in the persisted inspector, and exactly one injected failure. Capture error/recovered screenshots and console evidence.

Do not test Restore or claim native disk/backup behavior here: unsupported host commands reject. Reload resets the fixture. The entry refuses non-loopback, production and Tauri contexts and is not imported by production index/main. CI typechecks acceptance entries, tests the host with the real coordinator, and checks fault text is absent from the production bundle.

## Native profile preparation

Tauri's `--config` supports a separate application identifier; the repository resolves durable storage using `app_local_data_dir()`, with a configured relative WebView directory `webview`. Production source/configuration remains unchanged.

Official references:
- https://v2.tauri.app/develop/configuration-files/
- https://v2.tauri.app/reference/config/#identifier
- https://v2.tauri.app/reference/config/#datadirectory

On Windows, from the clean owned worktree:

```text
node --test scripts/acceptance/native-profile.check.mjs
node scripts/acceptance/native-profile.mjs . <exact-current-head>
```

The generator verifies source/origin/cleanliness, rejects common environment overrides and unreviewed platform config, and writes a unique configuration plus hashed manifest under OS temp. It never launches, installs, deletes or changes production config. It explicitly reports **configuration prepared, runtime isolation not yet proven**. The generated title/identifier is unique and bundling is disabled.

Before using the printed `npm run desktop:dev -- --config "<config-file>"` command, inspect config/manifest hashes and confirm no production identifier/path or altered capability. Recheck `TAURI_CONFIG`, all `WEBVIEW2_*` variables and applicable registry/policy overrides (especially UserDataFolder/AdditionalBrowserArguments). Do not change machine-wide settings or bypass policy; stop on uncertain isolation. The unique LocalAppData/RoamingAppData identity roots must not contain unrelated state.

The generated configuration opens **native-start.html before mounting App or reading/migrating legacy WebView data**. It reports the actual native paths. Before starting the planner or injecting anything:

1. Match those paths to the manifest's unique data root.
2. Inspect this app's child WebView2 process command lines, for example via local `Get-CimInstance Win32_Process`. Verify actual `--user-data-dir` lies beneath one of the manifest's unique allowed profile roots. Canonicalize paths and compare full directory boundaries; an identifier substring alone is insufficient.
3. Keep process IDs, actual roots and source/config fingerprints outside Git. Missing evidence, redirection or production-root matches are BLOCKED, not a pass.
4. Only after external verification, check the preflight acknowledgement. For first-run migration choose **Seed synthetic v2 legacy planner**, then **Start isolated planner**. Seeding refuses to overwrite existing v1/v2 or native data. Verify Data still shows the same root and the legacy source value survives migration unchanged. Restart with the same config; do not reseed.

Once both roots are proven isolated, test synthetic save/restart, queued-save close, failed-save/retry, WebView reload then immediate save, second-writer exclusion, Restore/Undo across restart, corruption recovery and no-valid-candidate preservation from #40. Apply filesystem failures only to the proven synthetic root. Preserve diagnostic evidence; never recursively delete unknown roots.

This is **source-equivalent native development acceptance**, not execution of the production-identity retained NSIS binary. It does not prove Start-menu registration, signing or uninstall/reinstall survival. #60 requires separately authorized visible lifecycle testing, preferably an isolated Windows user/VM, with the exact approved installer and external backup. This runbook does not authorize production-profile install/uninstall.

## Return evidence, not another implementation

Do not repeat unaffected zoom/drag/import/export/layout matrices. Report source/config identity, fault/retry and native PASS/FAIL/BLOCKED outcomes, evidence location, exact remaining tool limits and owned-worktree preservation/cleanup. No source commit is needed unless a new defect is reproduced. Keep PR #82 draft until native/lifecycle/security gates are resolved; neither unit tests nor a generated configuration can substitute for actual native observations.
