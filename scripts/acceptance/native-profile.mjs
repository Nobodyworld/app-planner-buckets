/** Generates isolated Tauri configuration; never launches or deletes an application. */
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const productionId = 'com.nobodyworld.plannerbuckets';
const blockedEnvironment = [
  'TAURI_CONFIG', 'WEBVIEW2_USER_DATA_FOLDER',
  'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'WEBVIEW2_BROWSER_EXECUTABLE_FOLDER',
];
export function assertEnvironment(environment) {
  for (const key of blockedEnvironment) {
    if (environment[key]) throw new Error(`Unset ${key} in this shell before preparing or running acceptance.`);
  }
}
export function makeProfile(base, token, port = 5178) {
  if (base.identifier !== productionId) throw new Error('Unexpected production application identifier.');
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Acceptance token must be 32 lowercase hex digits.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback port.');
  if (base.app?.windows?.length !== 1 || base.app.windows[0].label !== 'main') {
    throw new Error('Review isolation for changed window configuration before proceeding.');
  }
  const identifier = `${productionId}.acceptance.${token}`;
  const csp = base.app.security?.csp;
  if (typeof csp !== 'string' || !csp.includes('http://localhost:5173')) throw new Error('Unexpected development CSP.');
  return {
    identifier,
    productName: `Planner Buckets Acceptance ${token.slice(0, 8)}`,
    build: {
      devUrl: `http://localhost:${port}`,
      beforeDevCommand: `npm run dev -- --host localhost --port ${port} --strictPort`,
    },
    app: {
      windows: [{ ...base.app.windows[0], title: `SYNTHETIC ACCEPTANCE ${token.slice(0, 8)}`, dataDirectory: 'webview' }],
      security: { ...base.app.security, csp: csp.replaceAll('localhost:5173', `localhost:${port}`) },
    },
    // This configuration is for a dev process, not an alternative installer.
    bundle: { active: false },
  };
}
export function expectedRoots(identifier, environment, platform = process.platform) {
  if (platform !== 'win32') throw new Error('Native acceptance preparation requires Windows.');
  if (!new RegExp(`^${productionId.replaceAll('.', '\\.')}\\.acceptance\\.[a-f0-9]{32}$`).test(identifier)) throw new Error('Production profile refused.');
  for (const key of ['LOCALAPPDATA', 'APPDATA']) {
    if (!environment[key] || !path.win32.isAbsolute(environment[key])) throw new Error(`Invalid ${key}.`);
  }
  return {
    dataRoot: path.win32.join(environment.LOCALAPPDATA, identifier),
    // Tauri versions may place relative WebView data below appDataDir or appLocalDataDir.
    // Runtime process inspection must establish the actual directory; neither is assumed proven.
    allowedProfileRoots: [...new Set([environment.LOCALAPPDATA, environment.APPDATA])]
      .map((root) => path.win32.join(root, identifier)),
  };
}
export function hash(text) { return createHash('sha256').update(text).digest('hex'); }
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
export function prepare(root, expectedHead, environment = process.env) {
  assertEnvironment(environment);
  if (!/^[a-f0-9]{40}$/.test(expectedHead)) throw new Error('Supply the exact expected PR head.');
  const source = git(root, 'rev-parse', 'HEAD');
  if (source !== expectedHead) throw new Error(`Source mismatch: ${source}`);
  const remote = git(root, 'remote', 'get-url', 'origin');
  if (!/^(https:\/\/github\.com\/|git@github\.com:)Nobodyworld\/app-planner-buckets(?:\.git)?\/?$/i.test(remote)) {
    throw new Error('Unexpected origin repository.');
  }
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all')) throw new Error('Owned worktree must be clean.');
  for (const name of ['tauri.windows.conf.json', 'tauri.windows.conf.json5', 'Tauri.windows.toml']) {
    if (existsSync(path.join(root, 'src-tauri', name))) throw new Error('Review platform-specific configuration before isolation.');
  }
  const baseText = readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8');
  const config = makeProfile(JSON.parse(baseText), randomUUID().replaceAll('-', ''));
  const roots = expectedRoots(config.identifier, environment);
  for (const directory of roots.allowedProfileRoots) {
    if (existsSync(directory)) throw new Error('Generated acceptance root already exists; refusing reuse.');
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'planner-buckets-native-acceptance-'));
  const configPath = path.join(directory, 'tauri.acceptance.json');
  const configText = JSON.stringify(config, null, 2) + '\n';
  const manifest = {
    kind: 'planner-buckets-isolated-dev-acceptance', source,
    identifier: config.identifier, configSha256: hash(configText), baseConfigSha256: hash(baseText),
    ...roots, configFile: 'tauri.acceptance.json',
    status: 'CONFIGURATION_PREPARED_NOT_RUNTIME_ISOLATION_PROOF',
    artifact: 'Not the retained production installer; do not claim installer/lifecycle acceptance.',
  };
  writeFileSync(configPath, configText, { flag: 'wx' });
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { directory, configPath, manifest };
}
function main() {
  const [rootArg, head, ...extra] = process.argv.slice(2);
  if (!rootArg || !head || extra.length) throw new Error('Usage: node scripts/acceptance/native-profile.mjs <owned-worktree> <expected-head>');
  const result = prepare(path.resolve(rootArg), head);
  console.log(JSON.stringify(result, null, 2));
  console.log('\nNo app launched. Recheck environment overrides and the generated config before running:');
  console.log(`npm run desktop:dev -- --config "${result.configPath}"`);
  console.log('Before synthetic native changes, verify the Data panel root and WebView2 --user-data-dir against manifest.json.');
  console.log('A registry/policy WebView2 override can defeat config isolation. Stop if the actual path is not inside this unique profile.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
