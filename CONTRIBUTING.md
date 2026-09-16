# Contributing

Planner Buckets uses this repository as its public release/source mirror. Active feature development occurs in a private development repository and accepted release candidates are promoted here for public validation, tagging, and distribution.

## Public-repository scope

This repository is intentionally not the day-to-day feature-development workspace.

Appropriate public-repository changes are limited to:

- release promotion and release-specific verification;
- public documentation or metadata corrections;
- narrowly scoped fixes required for a public release; and
- security-related maintenance that belongs in the public source history.

Do not open speculative feature branches here merely to continue product development. Security reports should follow [SECURITY.md](SECURITY.md).

## Development setup

The public source remains buildable and auditable.

1. Install Node.js 20.19 or newer within the Node 20 line, Node.js 22.12 or newer within the Node 22 line, or Node.js 24.x.
2. Install dependencies:

```bash
npm install
```

3. Run locally:

```bash
npm run dev
```

## Windows desktop shell

The browser and desktop applications share the same frontend source. Keep `npm run dev` as the browser command.

To build the Windows shell, install Rust stable for `x86_64-pc-windows-msvc`, Microsoft C++ Build Tools with **Desktop development with C++**, and WebView2 (included with supported Windows 10 and Windows 11 versions).

```bash
npm run desktop:dev
npm run desktop:build
```

The installed desktop application uses durable native planner files, backups, recovery, writer exclusion, and the signed updater described in [docs/DESKTOP.md](docs/DESKTOP.md) and [docs/RELEASES.md](docs/RELEASES.md).

## Release validation

Before promoting public source, run the checks appropriate to the changed scope:

```bash
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

Release/updater-sensitive changes additionally require the repository's signed-updater validation and release-promotion gates. Do not weaken those gates to simplify promotion from private development.

## Coding and testing guidelines

- Use TypeScript types for new data/state shapes.
- Prefer explicit state transitions and deterministic tests.
- Keep animation/motion timings on shared CSS tokens when possible.
- Avoid unrelated behavior changes in a public release-promotion PR.
- Add or update reducer tests for logic changes in `src/state/plannerReducerV2.ts`.
- For compatibility, migration, persistence, or import/export changes, include coverage near the relevant validators and runtime path.
- Preserve browser and desktop data compatibility unless an explicitly documented migration is part of the release.

## Security and privacy

- Do not commit secrets, signing material, tokens, private planner data, or machine-specific evidence paths.
- Do not commit local export files (`bsp-planner-*.json`).
- Follow [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
