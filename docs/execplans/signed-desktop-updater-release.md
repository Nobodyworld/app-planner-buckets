# v1.2.0 release hardening execution plan

Issue: #92
Baseline: `main` at `c43328692fa8227903950bec3f05fb98313b479b`
Branch: `release/v1.2.0-hardening`

## Context

Issue #41 and PR #89 completed the signed desktop updater and GitHub Release implementation. The merged source is version `1.2.0`, but no `v1.2.0` tag or GitHub Release exists yet.

This follow-up hardens the promotion boundary before the first updater-enabled public release. It does not redesign the updater or durable storage.

## Objective

Make the first `1.2.0` promotion evidence cryptographically meaningful and keep candidate creation separate from publication.

## Required corrections

- Include the minimal Vitest 4.1.11 patch that resolves the current 4.1.10 mocker/server security advisory without taking the Vitest 5 major upgrade or broader dependency bundle.
- Make signed-updater validation reusable for future same-repository release-sensitive pull requests instead of binding it to the historical #89 branch name.
- Treat presence of an updater `.sig` as insufficient; cryptographically verify it against `TAURI_UPDATER_PUBLIC_KEY`.
- Require a deliberately tampered copy of the installer to fail verification.
- During tag workflow validation, download the draft release's actual installer, signature, and `latest.json` from GitHub and compare them with the local signed build.
- Require `latest.json` to identify the exact triggering tag and exact NSIS asset, not merely any URL under this repository's release-download namespace.
- Generate schema-v2 release provenance that records cryptographic verification and tamper rejection.
- Leave the tag-generated GitHub Release as a verified **draft**.
- Require a separate explicit owner approval to publish that existing draft.
- Correct README, changelog, release guide, and desktop documentation so they match the merged implementation and unpublished `1.2.0` state.

## Security and trust boundaries

- Never commit the updater private key or key password.
- Use the repository public-key variable only in runner-local Tauri release configuration and verification.
- Reuse the locked transitive `minisign-verify` crate already built by the Tauri updater dependency; do not add another network-downloaded verifier or a new direct dependency solely for CI verification.
- The verification helper must prove both the valid signature and rejection of changed artifact bytes.
- Dependabot pull requests do not receive signing secrets.
- Ordinary CI remains unsigned.

## Validation contract

Before merge of the hardening PR:

- `npm ci`
- `npm run verify`
- zero unresolved npm audit findings relevant to the locked graph
- Rust formatting, locked strict Clippy, and locked Rust tests
- ordinary NSIS build/provenance
- browser/storage acceptance regression
- installed Windows lifecycle regression
- signed-updater validation on the exact human-owned PR head
- retained signed evidence showing cryptographic verification PASS and tamper rejection PASS

No local owner rerun is required when hosted exact-head evidence covers these boundaries credibly.

## Release-candidate boundary after merge

After this slice is merged and post-merge `main` is green:

1. Review exact `main`, version identity, open release-blocking issues, and tag/release absence.
2. Obtain explicit owner approval before creating `v1.2.0`.
3. Create the tag at that exact accepted `main` SHA.
4. Let the tag workflow create and fully verify a **draft** release.
5. Inspect retained draft evidence and the actual GitHub Release assets.
6. Obtain a second explicit owner approval before publication.
7. Publish the existing verified draft without rebuilding or moving the tag.

Any asset, source, or tag change after draft verification invalidates the promotion decision and requires re-verification.

## First updater-enabled release limitation

`v1.1.0` predates the updater and cannot update itself to `1.2.0`. Do not treat that as a product failure and do not publish a throwaway version to manufacture an updater transition.

For `1.2.0`, required acceptance covers signing trust, explicit update controls, pre-update snapshot enforcement, signature verification/tamper rejection, installed lifecycle, and exact release provenance.

A later updater-enabled release must add the real production prior-version → update → restart/data-survival acceptance.

## Out of scope

- Vitest 5 or other unrelated major dependency upgrades;
- broad dependency refreshes not required for release safety;
- cloud accounts or sync;
- silent update installation;
- Authenticode/SmartScreen publisher-trust claims;
- redesigning durable persistence, backup retention, or WebView/browser storage;
- creating or publishing the `v1.2.0` release within this implementation PR.
