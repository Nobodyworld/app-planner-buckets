# Signed desktop releases

Planner Buckets publishes browser and Windows desktop assets from version tags. The desktop updater is intentionally opt-in: the user checks for an update and explicitly chooses **Install and restart**.

The release process has two separate approval boundaries:

1. **Create candidate:** an explicitly approved version tag starts the release workflow and may create a verified GitHub Release **draft**.
2. **Promote candidate:** publishing that verified draft requires a second explicit owner approval. The tag workflow does not publish automatically.

## Trust model

Tauri updater signatures and Windows code signing are separate concerns.

- The Tauri updater public/private key pair proves that updater artifacts were signed by the key trusted by the installed Planner Buckets build.
- The updater private key must never be committed, printed in logs, or pasted into issues, pull requests, or chat.
- This repository does not claim Microsoft Authenticode/SmartScreen publisher trust unless a separate Windows code-signing certificate is configured and accepted later.

The installed updater checks:

```text
https://github.com/Nobodyworld/app-planner-buckets/releases/latest/download/latest.json
```

The updater plugin verifies the downloaded artifact signature before installation. Direct WebView updater permissions are not granted; Planner Buckets exposes only constrained Rust commands.

## One-time signing configuration

Generate the updater key pair outside Git. From a trusted local checkout after `npm ci`, invoke the repository-pinned Tauri CLI:

```powershell
$KeyDir = Join-Path $HOME '.tauri'
$KeyPath = Join-Path $KeyDir 'planner-buckets.key'
New-Item -ItemType Directory -Path $KeyDir -Force | Out-Null
npm exec -- tauri signer generate -w $KeyPath
```

Protect the private key and password as long-lived release credentials. Losing either prevents future releases from updating clients that trust the corresponding public key.

Required repository values:

| Name | GitHub storage | Purpose |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Actions secret | Private updater signing key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Actions secret | Password for the encrypted private key |
| `TAURI_UPDATER_PUBLIC_KEY` | Actions variable | Public key trusted by signed release builds |

Do not store private signing material in a repository variable or tracked file.

## Pre-merge signed validation

Release/updater-sensitive same-repository pull requests run `Signed updater validation`. Dependabot pull requests do not receive signing secrets; dependency-only updates use normal CI unless deliberately integrated into a trusted release-hardening branch.

The signed validation job:

- checks out the exact pull-request head;
- runs the normal browser/release contract plus locked Rust format/Clippy/tests;
- materializes a runner-local Tauri release config using `TAURI_UPDATER_PUBLIC_KEY`;
- builds a signed NSIS updater candidate without publishing;
- cryptographically verifies the generated `.sig` against the configured public key using the already locked `minisign-verify` dependency;
- mutates a copy of the artifact and requires that tampered bytes are rejected;
- records exact source/run, installer size/hash, signature hash, and the positive/negative verification results;
- confirms tracked source inputs were not changed; and
- retains the signed candidate as an Actions artifact.

A `.sig` file merely existing is not sufficient release evidence.

## Candidate creation sequence

Before approving a version tag:

1. Merge the fully accepted release candidate to `main`.
2. Confirm `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` declare the same version.
3. Confirm that tag/release do not already exist.
4. Confirm exact-head CI, installed lifecycle, security/audit, and signed-updater validation are green.
5. Review the release notes and rollback boundary.
6. Obtain explicit approval to create the exact `vMAJOR.MINOR.PATCH` tag.

After an approved tag is pushed, the `Release` workflow:

1. validates tag/version identity and the browser application;
2. requires the signing secrets and public-key variable;
3. materializes a runner-local signed Tauri configuration;
4. builds signed Tauri updater artifacts and creates/reuses a GitHub Release **draft**;
5. downloads the draft's actual NSIS installer, `.sig`, and `latest.json` back from GitHub;
6. requires the downloaded installer bytes and signature to match the local signed build;
7. cryptographically verifies the downloaded installer signature and proves a tampered copy is rejected;
8. requires exactly one Windows x86_64 updater entry in `latest.json`, with the exact tag and exact installer asset URL;
9. creates the browser ZIP and schema-v2 `release-provenance.json` with cryptographic/tamper verification flags;
10. uploads supplemental assets and verifies the complete draft asset set; and
11. **leaves the release draft/unpublished** while retaining verification evidence as an Actions artifact.

A failed build or verification must never result in a published complete release.

## Draft review and promotion

Before publication, independently review the exact draft and retained workflow evidence. At minimum record:

- version tag and exact source SHA;
- workflow run/attempt;
- installer filename, byte size, and SHA-256;
- updater `.sig` SHA-256;
- `latest.json` SHA-256 and exact updater URL;
- browser ZIP SHA-256;
- release-provenance SHA-256/content;
- proof that cryptographic signature verification passed;
- proof that tamper rejection passed; and
- confirmation that the GitHub Release is still a draft.

Publishing the draft requires a separate explicit owner approval. After approval, publish **that existing verified draft**; do not rebuild or retag merely to publish it. If the draft assets or tag change after verification, treat that as a new candidate and re-verify before promotion.

## In-app installation sequence

When the user chooses **Install and restart**:

1. the frontend blocks conflicting interaction;
2. the durable planner save queue is flushed;
3. the current desktop storage session and exact planner state are supplied to the constrained native updater command;
4. Rust creates and verifies a `pre-update` operation snapshot through the established durable-storage path;
5. only after that snapshot succeeds does signed updater download/install begin; and
6. Tauri verifies the update signature before installation.

If flushing, snapshot creation, metadata/download, signature verification, or installer launch fails, the failure is reported and update installation is not treated as successful.

## First updater-enabled release boundary

Version `1.1.0` predates the updater implementation. It cannot discover or install `1.2.0` through an updater it does not contain. Therefore `1.2.0` establishes the production signing trust root, signed assets, `latest.json`, user controls, backup-before-install contract, and release provenance; it cannot prove a production `1.1.0 → 1.2.0` in-app transition.

Do not manufacture a throwaway public release to simulate that transition. A later accepted updater-enabled version (for example `1.2.1`) must prove the real production path:

- prior updater-enabled version detects the new release;
- installation still requires explicit user action;
- the `pre-update` operation snapshot exists before installation;
- update/restart succeeds; and
- planner data and recovery behavior survive end to end.

## Rollback

The normal updater accepts newer versions; rollback is not an unsigned downgrade mechanism. Retain the previous accepted installer and provenance. If rollback is necessary, first preserve an external **All data** JSON export plus durable backup evidence, then follow an explicitly approved rollback procedure.

Do not rotate the updater signing key casually. Any key-rotation plan must preserve a verified trust path for already-installed clients before changing the embedded public key.
