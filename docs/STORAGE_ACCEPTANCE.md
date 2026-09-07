# Focused storage acceptance

PR #82 / #40 uses the existing `slice/durable-desktop-persistence` branch. This support closes tooling gaps, not product acceptance by itself. Read `AGENTS.md` and the current PR evidence before starting. Preserve the primary checkout, stashes, rescue refs and prior artifacts; work in one owned exact-head worktree.

## Evidence already reported

The local Codex report for `3666d4c6f640144a66f1345c151a54aa7dca60eb` reported 551 frontend tests, 15 Rust tests, compilation, diff checks and normal browser storage/Restore/Undo/reload/containment PASS. An initial run failed 13 tests during concurrent Rust compilation, then passed unchanged. The cause is **not established**. Keep both logs; use sequential validation for the next run rather than attributing all failures to resource pressure or rerunning until green. The connector has the report, not the workstation-only log contents.

Blocked checks were browser failed-save/retry presentation and native isolation. Do not repeat unaffected zoom, drag, import/export or layout matrices. #85 owns the separate high audit finding; #60's installer lifecycle remains unperformed.

## Browser save-fault harness

In an isolated browser context using only synthetic data, from the owned worktree:

```text
npm ci
npm run dev -- --mode acceptance --host localhost --port 5179 --strictPort
```

Open `http://localhost:5179/acceptance/storage-fault.html` in the approved Codex browser. This separately addressed development entry loads the **real App, desktop persistence coordinator and Data status/retry component**, but replaces only native invoke with a synthetic in-memory host. It does not call Rust or write planner data to disk. The visible banner and inspector explicitly label that boundary. Normal browser preferences still belong to this isolated browser context.

1. Wait for Saved and note the inspector's persisted synthetic planner.
2. Select **Fail next save**. Create a task using the normal Quick Add/Add controls.
3. Open Data. Verify the real save status reports the injected failure, does not claim the new task was durably saved, and provides **Retry save**.
4. The inspector must still contain the preceding persisted planner; record the task title and failure/attempt counts.
5. Use **Retry save** in Data. Verify Saved, the latest pending task now present in the persisted inspector, and exactly one injected failure. Capture the error and recovered states.

The host intentionally rejects unsupported operations; do not run Restore or claim disk/backup behavior from this harness. Reload resets its in-memory planner. It refuses non-loopback, production and Tauri contexts. Production `index.html` does not import it, and CI typechecks it, tests fail/retry against the real coordinator, and verifies fault text is absent from the production build.

## Isolated native development profile

Tauri supports an extra configuration via `--config`; a unique application identifier separates app-owned locations. This repository obtains durable storage from `app_local_data_dir()`, and the configured relative WebView directory is `webview`. Production configuration remains unchanged.

Official references:
- https://v2.tauri.app/develop/configuration-files/
- https://v2.tauri.app/reference/config/#identifier
- https://v2.tauri.app/reference/config/#datadirectory

On Windows, from the clean owned worktree at the current reviewed head:

```text
node --test scripts/acceptance/native-profile.check.mjs
node scripts/acceptance/native-profile.mjs . <exact-current-head>
```

The generator verifies source/origin/cleanliness, refuses common environment overrides or unreviewed platform configuration, and writes a unique config plus hashed manifest under the OS temporary directory. It does **not** launch anything, delete anything, change production config, install software, or establish runtime isolation. The generated name/identifier is visibly different, packaging is disabled, and the source and configuration fingerprints distinguish this from the retained release installer.

Before launching the printed `npm run desktop:dev -- --config "<config-file>"` command:

- Recheck `TAURI_CONFIG` and all `WEBVIEW2_*` environment settings and applicable WebView2 registry/policy overrides, particularly UserDataFolder and AdditionalBrowserArguments. These can override profile selection. Do not modify machine-wide settings or bypass a policy; stop when isolation cannot be established.
- Inspect the generated config and hash against its manifest. Confirm the application identifier is the unique acceptance identifier, not production; no absolute dataDirectory override or altered capability exists. Keep the original config unchanged.
- Confirm generated LocalAppData/RoamingAppData identity roots do not already contain an unrelated profile. Do not point the test at the existing installed app. Use the new title/identifier, not an existing shortcut or installer.

After launch and **before** migrating fixtures, making native edits or injecting file failures/corruption:

- Verify Data reports the planner/backups inside the manifest's exact unique data root.
- Inspect the acceptance process and its child WebView2 process command lines (for example with local PowerShell `Get-CimInstance Win32_Process`); verify the actual `--user-data-dir` is beneath one of the manifest's unique allowed profile roots. Canonicalize paths and check full directory boundaries, not substring matches. Do not attach to a personal browser or unrelated WebView process.
- Record the actual roots, process IDs, source/config hashes and isolation outcome outside Git. Stop on missing/unreadable evidence, redirected paths or any production-root match. A worktree or generated config alone is not proof.

Once isolation is established, use only synthetic state for save/restart, queued-save close, failed-save/retry, WebView reload followed by save, second writer, Restore/Undo across restart and controlled recovery cases in #40. For first-run legacy migration, prepare only this new WebView profile before its first storage initialization; do not remove or seed a production profile. Run native failure operations only against the proven synthetic root. Preserve any test data needed for diagnosis; no recursive cleanup of unknown roots.

This is a **source-equivalent isolated development configuration**, not the production-identity retained NSIS binary. Its results do not establish Start-menu registration, signed delivery, or installer uninstall/reinstall survival. #60 still requires separately authorized visible lifecycle testing, preferably an isolated Windows user/VM with the exact approved installer and external All-data backup. No owner production-profile installation/uninstallation is authorized by this runbook.

## Report only the remaining gaps

Report source/config/browser identity; PASS/FAIL/BLOCKED for fault/retry and each isolated native case; evidence location; exact tool limitations; and preserved/cleaned owned workspace state. Do not turn unit tests or a generated config into a claimed native PASS. If no new defect appears, create no source commit and return evidence for connector review; PR #82 stays draft until its native/lifecycle/security gates are resolved.
