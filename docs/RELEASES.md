# Signed desktop releases

Planner Buckets publishes browser and Windows desktop assets from version tags. The desktop updater is intentionally opt-in: the user checks for an update and explicitly chooses **Install and restart**.

## Trust model

Tauri updater signatures and Windows code signing are separate concerns.

- The Tauri updater public/private key pair proves that update artifacts were signed by the key trusted by the installed Planner Buckets build.
- The updater private key must never be committed, printed in logs, or pasted into issues, pull requests, or chat.
- This repository does not claim Microsoft Authenticode/SmartScreen publisher trust unless a separate Windows code-signing certificate is configured and accepted later.

The application checks the static updater metadata at:

```text
https://github.com/Nobodyworld/app-planner-buckets/releases/latest/download/latest.json
```

The updater plugin verifies the artifact signature before installation. Direct WebView updater permissions are not granted; Planner Buckets exposes only its constrained Rust commands.

## One-time signing configuration

Generate the updater key pair outside Git. From a trusted local checkout with the pinned Tauri CLI installed:

```powershell
$KeyPath = Join-Path $HOME '.tauri\planner-buckets.key'
npm run tauri signer generate -- -w $KeyPath
```

Protect the private key and its password as long-lived release credentials. Losing the private key prevents future releases from updating clients that trust its public key.

Configure these repository values before creating the first updater-enabled version tag:

| Name | GitHub storage | Purpose |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Actions secret | Private updater signing key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Actions secret | Password when the private key is encrypted; empty only for an intentionally unencrypted key |
| `TAURI_UPDATER_PUBLIC_KEY` | Actions variable | Public key compiled into signed release builds |

Do not store the private key in a repository variable or tracked file.

## Pre-merge signed validation

PR #89 adds `Signed updater validation`, a same-repository pull-request workflow that never publishes a GitHub Release.

Before the signing values exist, the workflow reports that signing is not configured and stops without attempting a fake signed build. After the values are configured, rerun the exact PR-head job. It then:

- runs the normal source, TypeScript/Vite and locked Rust validation;
- builds using `src-tauri/tauri.release.conf.json` with the real updater signing key;
- requires exactly one NSIS installer and its `.exe.sig` updater signature;
- records exact source/run, installer size/hash and signature hash;
- confirms tracked source inputs remained unchanged; and
- retains the signed candidate as a 30-day Actions artifact without publishing it.

This is the required pre-merge proof that the repository's configured signing material can build the proposed updater path without consuming a version tag or creating a public release.

## Release sequence

1. Merge a fully accepted release candidate to `main`.
2. Confirm `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` all declare the same version and that no tag for that version already exists.
3. Confirm CI, storage lifecycle, security, and signed-updater validation are green.
4. Create the exact `vMAJOR.MINOR.PATCH` tag only after explicit release approval.
5. The `Release` workflow validates the tag/version identity before any GitHub Release is created.
6. The Windows release job requires the signing secret and public-key variable, builds updater artifacts with `createUpdaterArtifacts: true`, and lets pinned Tauri Action create a **draft** release plus `latest.json`.
7. The workflow verifies the signed NSIS artifact and `latest.json`, adds the browser ZIP and `release-provenance.json`, verifies the complete draft asset set, and only then publishes the release.
8. Record the final source SHA, run ID, installer/update hashes, `latest.json` hash, and release URL as the promoted candidate identity.

A failed validation/build/upload leaves no misleading published complete release.

## In-app installation sequence

When the user chooses **Install and restart**:

1. the frontend blocks conflicting interaction;
2. the durable planner save queue is flushed;
3. the current desktop storage session and exact planner state are supplied to the constrained native updater command;
4. Rust creates and verifies a `pre-update` operation snapshot through the established durable-storage path;
5. only after that snapshot succeeds does the signed updater download/install begin;
6. Tauri verifies the update signature; Windows may close the application as the installer launches.

If flushing, snapshot creation, update download, signature verification, or installer launch fails, the failure is reported and update installation is not treated as successful.

## First updater-enabled release boundary

Version `1.1.0` predates this updater implementation. It cannot discover or install `1.2.0` through an updater it does not contain. Therefore the first updater-enabled `1.2.0` release can establish the signing trust root, signed artifacts, `latest.json`, user controls, backup-before-install contract, and release provenance, but it cannot by itself prove a production `1.1.0 -> 1.2.0` in-app update.

Do not manufacture or publish a throwaway public tag merely to simulate that upgrade. The first real production in-app updater transition can be observed when a later accepted version exists (for example `1.2.1`), or earlier in an isolated acceptance environment using explicitly test-only signed metadata that cannot affect the production endpoint.

Before promoting `1.2.0`, verify at minimum:

- the signed pre-merge candidate and signature are bound to the exact source;
- the tag-generated draft release contains the expected signed NSIS artifact, signature, `latest.json`, browser ZIP and provenance before publication;
- the production `1.2.0` build recognizes its updater configuration and does not install without explicit user action;
- a controlled invalid/tampered signature or metadata case is rejected in an isolated test boundary where it can be demonstrated safely;
- the promoted assets match the exact tag/run being released.

A later production update acceptance must additionally prove update detection, the `pre-update` operation snapshot, update/restart, and planner-data survival end to end.

## Rollback

The normal updater only accepts newer versions. Keep the previous accepted installer and its provenance available as rollback evidence. If a release must be rolled back, first preserve an external All-data JSON export and the durable backup directory, then follow an explicitly approved rollback procedure rather than changing updater version comparison or publishing unsigned/downgrade metadata.

Do not rotate the updater signing key casually. A future key-rotation plan must preserve a verified trust path for already-installed clients before changing the embedded public key.
