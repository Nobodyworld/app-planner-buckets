import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { throw new Error(message); };
const expectIncludes = (text, value, label) => {
  if (!text.includes(value)) fail(`${label} is missing required value: ${value}`);
};

const pkg = JSON.parse(read('package.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const releaseTauri = JSON.parse(read('src-tauri/tauri.release.conf.json'));
const cargo = read('src-tauri/Cargo.toml');
const release = read('.github/workflows/release.yml');
const capability = read('src-tauri/capabilities/default.json');
const updater = read('src-tauri/src/desktop_updater.rs');

const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!cargoVersion || pkg.version !== tauri.version || pkg.version !== cargoVersion) {
  fail(`Version mismatch: package=${pkg.version}, tauri=${tauri.version}, cargo=${cargoVersion ?? 'missing'}`);
}
if (releaseTauri.bundle?.createUpdaterArtifacts !== true) {
  fail('Release-only Tauri configuration must use createUpdaterArtifacts=true.');
}

expectIncludes(release, 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Release workflow');
expectIncludes(release, 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Release workflow');
expectIncludes(release, 'tauri-apps/tauri-action@1deb371b0cd8bd54025b384f1cd735e725c4060f', 'Release workflow');
expectIncludes(release, 'softprops/action-gh-release@efb35369e0ad2afab669f228072c1b0d510eae64', 'Release workflow');
expectIncludes(release, 'TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}', 'Release workflow');
expectIncludes(release, 'PLANNER_BUCKETS_UPDATER_PUBKEY: ${{ vars.TAURI_UPDATER_PUBLIC_KEY }}', 'Release workflow');
expectIncludes(release, 'releaseDraft: true', 'Release workflow');
expectIncludes(release, 'args: --config src-tauri/tauri.release.conf.json', 'Release workflow');
expectIncludes(release, 'gh release edit $env:GITHUB_REF_NAME --draft=false', 'Release workflow');
if (release.includes('workflow_dispatch:')) fail('Release publication must not be manually dispatched outside an exact version tag.');

if (capability.includes('updater:')) {
  fail('WebView capability must not expose direct updater plugin permissions.');
}
expectIncludes(updater, 'https://github.com/Nobodyworld/app-planner-buckets/releases/latest/download/latest.json', 'Rust updater');
expectIncludes(updater, 'option_env!("PLANNER_BUCKETS_UPDATER_PUBKEY")', 'Rust updater');
expectIncludes(updater, '"pre-update".into()', 'Rust updater');
expectIncludes(updater, 'desktop_storage_create_operation_snapshot', 'Rust updater');
expectIncludes(updater, '.download_and_install(', 'Rust updater');

console.log(`Release configuration PASS for Planner Buckets ${pkg.version}.`);
