import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { throw new Error(message); };
const expectIncludes = (text, value, label) => {
  if (!text.includes(value)) fail(`${label} is missing required value: ${value}`);
};
const expectExcludes = (text, value, label) => {
  if (text.includes(value)) fail(`${label} contains forbidden value: ${value}`);
};

const pkg = JSON.parse(read('package.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const releaseTauri = JSON.parse(read('src-tauri/tauri.release.conf.json'));
const cargo = read('src-tauri/Cargo.toml');
const release = read('.github/workflows/release.yml');
const signedValidation = read('.github/workflows/signed-updater-validation.yml');
const verifier = read('scripts/release/verify-updater-signature.rs');
const capability = read('src-tauri/capabilities/default.json');
const updater = read('src-tauri/src/desktop_updater.rs');

const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!cargoVersion || pkg.version !== tauri.version || pkg.version !== cargoVersion) {
  fail(`Version mismatch: package=${pkg.version}, tauri=${tauri.version}, cargo=${cargoVersion ?? 'missing'}`);
}
if (releaseTauri.bundle?.createUpdaterArtifacts !== true) {
  fail('Release-only Tauri configuration must use createUpdaterArtifacts=true.');
}
if (tauri.plugins?.updater?.pubkey !== 'RUNTIME_CONFIGURED_BY_RUST') {
  fail('Base Tauri config must keep the updater bootstrap placeholder; the trusted key is injected by the constrained Rust updater builder.');
}

const releaseActions = [...release.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
if (releaseActions.length === 0) fail('Release workflow must use pinned GitHub-maintained actions for checkout/setup/artifact retention.');
for (const action of releaseActions) {
  if (!action.startsWith('actions/')) {
    fail(`Release workflow must not depend on third-party GitHub Actions under the repository allowlist: ${action}`);
  }
}

expectIncludes(release, 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'Release workflow');
expectIncludes(release, 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'Release workflow');
expectIncludes(release, 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', 'Release workflow');
expectExcludes(release, 'tauri-apps/tauri-action@', 'Release workflow');
expectExcludes(release, 'softprops/action-gh-release@', 'Release workflow');
expectIncludes(release, 'TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}', 'Release workflow');
expectIncludes(release, 'PLANNER_BUCKETS_UPDATER_PUBKEY: ${{ vars.TAURI_UPDATER_PUBLIC_KEY }}', 'Release workflow');
expectIncludes(release, "Get-Content 'src-tauri/tauri.release.conf.json' -Raw | ConvertFrom-Json -AsHashtable", 'Release workflow');
expectIncludes(release, "$config['plugins'] = @{ updater = @{ pubkey = $env:PLANNER_BUCKETS_UPDATER_PUBKEY } }", 'Release workflow');
expectIncludes(release, 'npm run desktop:build -- --config "$env:SIGNED_TAURI_CONFIG"', 'Release workflow');
expectIncludes(release, '[Uri]::EscapeDataString($localInstaller.Name)', 'Release workflow');
expectIncludes(release, "'windows-x86_64' = [ordered]@{", 'Release workflow');
expectIncludes(release, '& gh release create $tag --repo $repo --draft', 'Release workflow');
expectIncludes(release, '& gh release upload $tag $asset --repo $repo --clobber', 'Release workflow');
expectIncludes(release, "gh release download $env:GITHUB_REF_NAME --repo $env:GITHUB_REPOSITORY --pattern $localInstaller.Name --pattern \"$($localInstaller.Name).sig\" --pattern 'latest.json'", 'Release workflow');
expectIncludes(release, '[Convert]::FromBase64String($env:PLANNER_BUCKETS_UPDATER_PUBKEY)', 'Release workflow');
expectIncludes(release, '[Convert]::FromBase64String($downloadedSignatureText)', 'Release workflow');
expectIncludes(release, 'rustc scripts/release/verify-updater-signature.rs', 'Release workflow');
expectIncludes(release, 'cryptographicSignatureVerified = $true', 'Release workflow');
expectIncludes(release, 'tamperRejectionVerified = $true', 'Release workflow');
expectIncludes(release, '$expectedPath = "/$env:GITHUB_REPOSITORY/releases/download/$env:GITHUB_REF_NAME/$($localInstaller.Name)"', 'Release workflow');
expectIncludes(release, "releaseState = 'draft'", 'Release workflow');
expectIncludes(release, 'The release remains **draft** after complete asset verification.', 'Release workflow');
expectExcludes(release, 'gh release edit $env:GITHUB_REF_NAME --draft=false', 'Release workflow');
if (release.includes('workflow_dispatch:')) fail('Release candidate creation must remain tag-triggered, not manually dispatched.');

expectIncludes(signedValidation, 'github.event.pull_request.head.repo.full_name == github.repository', 'Signed updater validation');
expectIncludes(signedValidation, "github.actor != 'dependabot[bot]'", 'Signed updater validation');
expectExcludes(signedValidation, 'feat/signed-desktop-updater', 'Signed updater validation');
expectIncludes(signedValidation, "Get-Content 'src-tauri/tauri.release.conf.json' -Raw | ConvertFrom-Json -AsHashtable", 'Signed updater validation');
expectIncludes(signedValidation, "$config['plugins'] = @{ updater = @{ pubkey = $env:PLANNER_BUCKETS_UPDATER_PUBKEY } }", 'Signed updater validation');
expectIncludes(signedValidation, 'npm run desktop:build -- --config "$env:SIGNED_TAURI_CONFIG"', 'Signed updater validation');
expectIncludes(signedValidation, '[Convert]::FromBase64String($env:PLANNER_BUCKETS_UPDATER_PUBKEY)', 'Signed updater validation');
expectIncludes(signedValidation, '[Convert]::FromBase64String((Get-Content -LiteralPath $encodedSignature -Raw).Trim())', 'Signed updater validation');
expectIncludes(signedValidation, 'rustc scripts/release/verify-updater-signature.rs', 'Signed updater validation');
expectIncludes(signedValidation, 'cryptographicSignatureVerified = $true', 'Signed updater validation');
expectIncludes(signedValidation, 'tamperRejectionVerified = $true', 'Signed updater validation');

expectIncludes(verifier, 'PublicKey::from_file', 'Updater signature verifier');
expectIncludes(verifier, 'Signature::from_file', 'Updater signature verifier');
expectIncludes(verifier, '.verify(&bytes, &signature, false)', 'Updater signature verifier');
expectIncludes(verifier, 'tampered[index] ^= 0x01', 'Updater signature verifier');
expectIncludes(verifier, 'tampered updater artifact unexpectedly verified', 'Updater signature verifier');

if (capability.includes('updater:')) {
  fail('WebView capability must not expose direct updater plugin permissions.');
}
expectIncludes(updater, 'https://github.com/Nobodyworld/app-planner-buckets/releases/latest/download/latest.json', 'Rust updater');
expectIncludes(updater, 'option_env!("PLANNER_BUCKETS_UPDATER_PUBKEY")', 'Rust updater');
expectIncludes(updater, '"pre-update".into()', 'Rust updater');
expectIncludes(updater, 'desktop_storage_create_operation_snapshot', 'Rust updater');
expectIncludes(updater, '.download_and_install(', 'Rust updater');

console.log(`Release configuration PASS for Planner Buckets ${pkg.version}.`);
