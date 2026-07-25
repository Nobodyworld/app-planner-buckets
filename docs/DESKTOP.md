# Desktop distribution

Planner Buckets supports two parallel delivery modes that share the same React/Vite frontend and planner schema:

- the existing browser application; and
- a Windows desktop shell built with Tauri 2.

This document records the implemented shell in issue #39. It does not expand the scope of durable persistence in #40 or signed updates and release publishing in #41.

## Current Windows support and prerequisites

The desktop shell is intended for Windows 10 version 1803 or later and Windows 11. Microsoft Edge WebView2 is included with those supported Windows versions; install the Evergreen WebView2 Runtime if it is absent.

Building from a checkout requires:

- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`;
- Rust stable with the `x86_64-pc-windows-msvc` host;
- Microsoft C++ Build Tools with the **Desktop development with C++** workload; and
- WebView2.

The Tauri shell uses `@tauri-apps/cli` `2.11.4`, Rust `tauri` `2.11.5`, and `tauri-build` `2.6.3`. No Tauri frontend API package or Tauri plugin is used.

## Development and build commands

```text
npm run dev             # browser development server at http://localhost:5173
npm run build           # browser production build
npm run desktop:dev     # Tauri window using the Vite development server
npm run desktop:build   # production Windows NSIS installer
```

`npm run dev` remains the browser application. Tauri uses that command only as its desktop development server and does not create a second frontend.

The configured main window is titled **Planner Buckets**, is resizable, starts at 1440 × 900, and has a 960 × 640 minimum size. Its application identifier is `com.nobodyworld.plannerbuckets`.

On Windows, native Tauri file-drop interception is disabled for the main window so the planner's existing HTML5 task and bucket drag-and-drop interactions continue to reach the frontend.

## Installer behavior

`npm run desktop:build` creates an NSIS installer under:

```text
src-tauri\target\release\bundle\nsis\
```

The configured current-user installer does not require elevated installation and is intended to install outside the Git checkout. It is configured for the normal NSIS Start menu, launch, pinning, and uninstall behavior. Validate those user-facing behaviors through the local installation test before release.

`dist/`, `src-tauri/target/`, installers, and exported planner JSON are generated user or build artifacts and are not committed.

## Data and migration limitation

The desktop shell is transitional. It currently uses the desktop WebView's `localStorage`; it does not yet use an application-data file, automatic backups, or recovery snapshots. The main WebView is configured with an application-data-relative data directory so its browser storage is not tied to the install directory. It is still not a data-loss guarantee.

Continue exporting JSON backups. Browser-to-desktop migration is explicit:

1. In the browser application, choose **Export All Data**.
2. Open the desktop application.
3. Choose **Restore** and select that JSON file.

The same flow can move validated planner data back to the browser. No browser profile is read directly by the desktop shell.

## Security boundaries

The packaged shell loads only its local frontend. Development uses `http://localhost:5173` and its local Vite WebSocket for hot reload. The CSP allows only these local development connections plus local packaged assets; it allows inline styles because the existing React frontend uses them. The shell exposes no global Tauri JavaScript object and grants its main window no frontend Tauri API permissions.

It does not request filesystem, shell, process, broad network, clipboard, dialog, updater, or user-selected-path access. It contains no persistence commands.

## Scope split

### #39 — Tauri shell and Windows installer

- Tauri 2 project, NSIS installer configuration, icons, and constrained capability setup.
- Browser and desktop development/build commands.
- Windows CI compilation and local installer validation.
- Transitional WebView `localStorage` disclosure and JSON migration instructions.

### #40 — durable persistence and backups

- Validated application-data files, backup retention, recovery snapshots, and desktop data-location reporting.
- Any persistence adapter changes or frontend/Rust persistence commands.

### #41 — signed updater and releases

- Signing keys, updater configuration, tagged release publishing, and automatic update delivery.

## Validation

Run the browser checks and the Rust shell checks before submitting desktop changes:

```text
npm ci
npm test
npm run build
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

Also perform local Windows smoke tests for `npm run desktop:dev`, the generated installer, and the independent browser command. Record only tests that were genuinely completed.
