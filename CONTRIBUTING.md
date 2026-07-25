# Contributing

Thanks for helping improve Planner Buckets.

## Development setup

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

The desktop shell currently uses WebView `localStorage`. Export JSON backups during testing; durable desktop persistence and backups belong to #40, and signed updater/release work belongs to #41.

## Branch and PR workflow

1. Create a feature branch from `main`.
2. Keep commits focused and small.
3. Run checks before opening a PR:

```bash
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

4. Open a PR with:

- What changed
- Why it changed
- How to test it
- Screenshots/GIFs for UI changes

## Coding guidelines

- Use TypeScript types for new data/state shapes.
- Prefer small reducer actions with explicit state transitions.
- Keep animation/motion timings on shared CSS tokens when possible.
- Avoid changing unrelated behavior in the same PR.

## Testing guidelines

- Add or update reducer tests for logic changes in `src/state/plannerReducerV2.ts`.
- For v1 compatibility, migration, or import/export changes, include coverage near the relevant import, persistence, or migration tests.
- For UI behavior changes, include manual test steps in the PR. Cover affected drag/drop, clipboard, sidepanel, import/export, and responsive states when relevant.

## Security and privacy

- Do not commit secrets or tokens.
- Do not commit local export files (`bsp-planner-*.json`).
- Follow [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
