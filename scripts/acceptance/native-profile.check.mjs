import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProfile, expectedRoots, assertEnvironment, productionId, hash } from './native-profile.mjs';
const base = { identifier: productionId, app: { windows: [{ label: 'main', dataDirectory: 'webview', dragDropEnabled: false }], security: { capabilities: ['default'], csp: "default-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173" } } };
const token = 'a'.repeat(32);
test('isolates identity and preserves security/window settings without changing production config', () => {
  const before = JSON.stringify(base);
  const result = makeProfile(base, token);
  assert.equal(result.identifier, `${productionId}.acceptance.${token}`);
  assert.equal(result.bundle.active, false);
  assert.equal(result.app.windows[0].label, 'main');
  assert.equal(result.app.windows[0].dragDropEnabled, false);
  assert.equal(result.app.windows[0].dataDirectory, 'webview');
  assert.deepEqual(result.app.security.capabilities, ['default']);
  assert.ok(result.app.security.csp.includes('ws://localhost:5178'));
  assert.ok(result.build.beforeDevCommand.includes('--strictPort'));
  assert.equal(JSON.stringify(base), before);
});
test('refuses unsafe identity, tokens, ports and unknown window layouts', () => {
  assert.throws(() => makeProfile({ ...base, identifier: 'other' }, token));
  assert.throws(() => makeProfile(base, '../production'));
  assert.throws(() => makeProfile(base, token, 0));
  assert.throws(() => makeProfile(base, token, 70000));
  assert.throws(() => makeProfile({ ...base, app: { ...base.app, windows: [] } }, token));
});
test('refuses environment overrides rather than silently altering global settings', () => {
  assertEnvironment({});
  for (const key of ['TAURI_CONFIG', 'WEBVIEW2_USER_DATA_FOLDER', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'WEBVIEW2_BROWSER_EXECUTABLE_FOLDER']) {
    assert.throws(() => assertEnvironment({ [key]: 'override' }), new RegExp(key));
  }
});
test('expected directories contain the isolated identity, never the production directory', () => {
  const environment = { LOCALAPPDATA: 'X:\\SyntheticLocal', APPDATA: 'X:\\SyntheticRoaming' };
  const id = makeProfile(base, token).identifier;
  const roots = expectedRoots(id, environment, 'win32');
  assert.equal(roots.dataRoot, `${environment.LOCALAPPDATA}\\${id}`);
  assert.equal(roots.allowedProfileRoots.length, 2);
  assert.ok(roots.allowedProfileRoots.every((root) => root.endsWith(id)));
  assert.throws(() => expectedRoots(productionId, environment, 'win32'));
  assert.throws(() => expectedRoots(id, environment, 'linux'));
  assert.throws(() => expectedRoots(id, { ...environment, APPDATA: 'relative' }, 'win32'));
});
test('config fingerprints detect changed identity or content', () => {
  assert.equal(hash('same'), hash('same'));
  assert.notEqual(hash('same'), hash('changed'));
});
