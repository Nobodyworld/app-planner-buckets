# Signed desktop updater and release execution plan

Issue: #41
Baseline: `main` at `1c7d5af5689adc55b22dd5cc4a796116c506486a`
Branch: `feat/signed-desktop-updater`

## Objective

Add a signed, user-approved Windows updater and a GitHub Release pipeline without weakening the durable-storage guarantees merged in #40.

## Design decisions

- Keep browser mode unchanged; updater UI and commands are desktop-only.
- Keep updater authority in Rust. Do not grant the WebView direct `updater:*` permissions.
- Check GitHub Releases through Tauri's signed updater client using the static `latest.json` endpoint.
- Require explicit user confirmation before install.
- Flush pending planner writes and create a verified `pre-update` operation snapshot immediately before updater installation. If either step fails, installation does not begin.
- Use Tauri v2 updater artifacts (`bundle.createUpdaterArtifacts: true`), not v1-compatible bundles.
- Keep ordinary CI unsigned. Signing is release-only.
- Never commit the updater private key, key password, GitHub tokens, generated installer signatures, or machine-specific paths.
- Generate/update releases only after validation has succeeded; a failed build must not publish a misleading complete release.

## Runtime contract

Rust owns:

- updater plugin initialization;
- static HTTPS endpoint configuration;
- embedded updater public key supplied at release build time;
- pending-update state;
- update check metadata;
- verified pre-update snapshot;
- signed updater download/install.

Frontend owns:

- a desktop-only update card;
- explicit check action;
- update-available/no-update/error states;
- explicit `Install and restart` confirmation;
- planner save-queue flush before invoking native install;
- blocking conflicting planner interaction once installation begins.

No direct updater plugin permission is exposed to the WebView.

## Release contract

- All application version declarations must match the `vMAJOR.MINOR.PATCH` release tag.
- Release validation uses maintained Node 22 and the repository's pinned Rust toolchain behavior.
- The release workflow builds the verified web distribution and the Windows NSIS/updater artifacts from the exact tag commit.
- Tauri updater signing uses GitHub Actions secrets only.
- Tauri Action is pinned to a full commit SHA and creates the GitHub Release assets plus `latest.json`.
- Releases begin as drafts and become publishable only when all required artifacts and signatures exist.
- Release notes distinguish the browser build from the Windows installer/updater assets.
- Exact source SHA, run identity, installer/update artifact hashes, signatures, and updater metadata are retained as acceptance evidence.

## Required GitHub configuration

Before a real signed release can be accepted, the repository must have:

- `TAURI_SIGNING_PRIVATE_KEY` — secret containing the updater private key;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — secret when the key is password protected;
- `TAURI_UPDATER_PUBLIC_KEY` — repository variable or secret containing the corresponding public key.

The private key must be generated and stored outside Git and must never be pasted into repository files or public logs.

## Validation

Before merge:

- `npm ci`
- `npm run verify`
- Rust formatting, locked strict Clippy, and locked Rust tests
- ordinary NSIS build
- updater command/unit coverage with a fake updater boundary where practical
- browser-first update-card acceptance with synthetic update responses
- workflow/config static checks proving secrets are referenced but not embedded

Before the first promoted release:

- generate/configure the signing key pair;
- build a signed candidate from a version tag;
- verify installer/update signatures and `latest.json` against the exact source/run;
- install a prior accepted version in an isolated Windows environment;
- confirm update detection;
- confirm the user must approve installation;
- confirm a pre-update operation snapshot exists before installation;
- confirm update/restart preserves planner data;
- confirm invalid/tampered metadata or signature is rejected;
- verify rollback documentation and preserved prior installer/data.

## Out of scope

- cloud accounts or sync;
- silent update installation;
- auto-generated signing secrets committed to Git;
- replacing durable backup/recovery logic;
- unrelated dependency/test-warning cleanup;
- claiming code-signing/SmartScreen trust unless a separate Windows code-signing certificate is configured and tested.
