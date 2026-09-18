# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Added structured bug report and feature request issue forms.
- Added a pull request template with validation, screenshot, and release-safety prompts.
- Added retained CI-built Windows installer artifacts with SHA-256 and provenance manifests for exact-source acceptance.

### Changed

- Clarified that the original planning documents are historical design records and that current source, tests, and README documentation are authoritative.
- Routed security reports to the private reporting guidance instead of allowing unstructured public security issues.
- Clarified local-data privacy notes for the browser and desktop storage modes.

### Fixed

- Updated the Windows startup and verification scripts to reject unsupported early Node 20/22 versions and unsupported odd-numbered major versions.
- Added horizontal board edge autoscroll for task and bucket drag interactions.
- Cleaned up stale public-facing product naming in docs and the local start script.
- Aligned contributor guidance with the current v2 reducer path and JSON export filename.
- Aligned package metadata description with the public README positioning.
- Added the current `bsp-planner-*.json` export filename pattern to `.gitignore` while preserving the older export pattern.

## [1.2.0] - Unreleased

### Added

- Added durable Tauri application-data persistence with validated safe replacement, one-time WebView migration, automatic routine and operation backups, corruption recovery, writer exclusion, close-time save protection, and durable Restore/Undo recovery.
- Added storage-health diagnostics and exact resolved planner/backup locations in the Data surface while preserving the browser application's localStorage workflow.
- Added a signed Tauri desktop updater with explicit user-controlled check/install actions and a mandatory verified `pre-update` durable snapshot before installation.
- Added a tag-gated GitHub Release pipeline for signed Windows updater assets, `latest.json`, the browser distribution, and exact release provenance.
- Added repeatable hosted Windows installer lifecycle acceptance for install, repair, uninstall/data survival, reinstall, and corruption recovery.
- Added cryptographic updater-signature verification plus a tampered-artifact rejection proof to release-sensitive validation.

### Changed

- Advanced Planner Buckets desktop/browser release metadata from 1.1.0 to 1.2.0.
- Moved maintained CI and release validation to Node 22 while retaining the documented package-compatible Node range.
- Kept the release workflow compatible with the repository Actions allowlist by using only GitHub-maintained actions; signed Tauri builds and draft-release operations now use the repository-pinned Tauri CLI and runner-provided GitHub CLI directly.
- Updated the npm lockfile to a patched Browserslist 4.28.9 graph and retained zero reported npm vulnerabilities in accepted validation.
- Updated Vitest from 4.1.10 to 4.1.11 before release promotion to pick up the patched mocker/server security behavior without taking the Vitest 5 major upgrade.
- Documented the canonical installer candidate, signed-update trust boundary, release promotion, rollback, and updater-key handling procedures.
- Changed release promotion so a version tag creates and verifies a GitHub Release draft only; publishing the verified draft requires a separate explicit approval.
- Draft-release verification now downloads the actual GitHub-hosted installer/signature/`latest.json`, compares bytes with the local signed build, and requires the exact tag/asset updater URL.

### Fixed

- Fixed draft-release asset verification by staging the signed installer and signature under a deterministic GitHub-safe filename so hosted asset names, updater metadata URLs, and re-download verification stay identical.
- Fixed the tag-triggered Release workflow startup failure by removing third-party GitHub Actions from the release path instead of weakening the repository action policy.
- Prevented recovery replacement from deleting its last valid fallback before promotion is verified.
- Made desktop Saved/error/Retry state reflect acknowledged durable writes rather than optimistic in-memory completion.
- Hardened Restore cancellation/commit ordering, WebView reload session renewal, queued-close behavior, and stale-write rejection.
- Fixed Data-panel clipping, focus-induced pointer target movement, and long native error paths that could hide Retry controls.
- Removed the stale assumption that a `.sig` file's presence alone proves the updater artifact is trusted; release validation now verifies the signature against the configured public key and requires tamper rejection.

## [1.1.0] - 2026-07-06

### Changed

- Extracted the planner sidepanel into focused components for improved maintainability.
- Reordered the sidepanel flow to Projects, Quick Add, Buckets, Templates, Archive, and Data.
- Updated Vite/Vitest tooling and release workflow dependencies.
- Bumped project metadata to version 1.1.0 for the public showcase release baseline.

### Fixed

- Resolved dependency audit findings so the release baseline has zero reported npm vulnerabilities.

## [1.0.1] - 2026-06-30

### Fixed

- Release workflow: removed redundant `npm run build` step (build already included in `npm run verify`).

## [1.0.0] - 2026-06-30

### Added

- Clipboard copy actions for individual tasks and ordered active task lists per bucket.
- Multi-select task copy/paste between buckets.
- Undo and redo history wrapper for reducer-driven planner actions.
- GitHub Actions CI workflow for build/test verification.
- Contribution, security, and pull request templates.
- MIT license and README architecture/screenshot documentation.

### Changed

- Bucket/task drag-and-drop interaction polish and visual feedback improvements.
- Bucket and task hover states now use mode-tuned slow glow behavior, with energetic long-hover sparks.
- Side panel behavior now separates manual Show/Hide, autohide, and automatic-open locking.
- Import behavior now merges tasks into existing buckets by name and skips duplicates.

### Fixed

- Bucket placement index bug when dragging rightward.
- Lingering task drop-line glitch during bucket moves.
- Board/sidebar spacing regressions after the side panel layout update.

## [0.1.0] - 2026-06-26

### Initial release

- Initial local-first bucket planner.
- Task and bucket management (create, edit, move, archive, restore).
- JSON export/import and local storage persistence.
- Theme and visual mode controls.