import { invoke, isTauri } from '@tauri-apps/api/core';
import { createInitialPlannerDataV2 } from '../src/types/v2';

const identity = document.getElementById('native-identity')!;
const message = document.getElementById('native-preflight-result')!;
const verified = document.getElementById('profile-verified') as HTMLInputElement;
const seed = document.getElementById('seed-legacy') as HTMLButtonElement;
const start = document.getElementById('start-planner') as HTMLButtonElement;
async function preflight(): Promise<void> {
  const profile = new URL(location.href).searchParams.get('profile') ?? '';
  if (!import.meta.env.DEV || import.meta.env.MODE !== 'acceptance' || !isTauri()
    || !/^com\.nobodyworld\.plannerbuckets\.acceptance\.[a-f0-9]{32}$/.test(profile)) {
    throw new Error('Use only the generated isolated acceptance config.');
  }
  // Bootstrap reads only the runtime-owned native root; it does not run legacy migration.
  // Real App bootstrap gets a fresh session later, after the external profile check.
  const result: unknown = JSON.parse(await invoke<string>('desktop_storage_bootstrap'));
  if (!result || typeof result !== 'object') throw new Error('Invalid native preflight response.');
  const state = result as Record<string, unknown>;
  for (const key of ['dataPath', 'backupPath']) {
    if (typeof state[key] !== 'string' || !(state[key] as string).replaceAll('\\', '/').split('/').includes(profile)) {
      throw new Error('Native storage is not inside the expected acceptance identity; planner not started.');
    }
  }
  identity.textContent = JSON.stringify({ profile, dataPath: state.dataPath, backupPath: state.backupPath, writable: state.writable, migrationComplete: state.migrationComplete }, null, 2);
  const fresh = state.writable === true && state.primary === null && state.migrationComplete === false
    && Array.isArray(state.backups) && state.backups.length === 0;
  verified.disabled = false;
  verified.addEventListener('change', () => { start.disabled = !verified.checked; seed.disabled = !verified.checked || !fresh; });
  seed.addEventListener('click', () => {
    if (!verified.checked || !fresh) return;
    try {
      const v2 = 'planner-buckets:data:v2';
      if (localStorage.getItem(v2) !== null || localStorage.getItem('planner-buckets:data:v1') !== null) {
        throw new Error('Existing profile data found; refusing to overwrite it.');
      }
      const data = createInitialPlannerDataV2('2026-01-01T00:00:00.000Z');
      data.projects[0].name = 'Synthetic Native Migration';
      localStorage.setItem(v2, JSON.stringify(data));
      seed.disabled = true;
      message.textContent = 'Synthetic v2 source prepared. Start planner, then verify the source value remains unchanged after migration.';
    } catch (error) { message.textContent = String(error); }
  });
  start.addEventListener('click', () => {
    if (!verified.checked) return;
    start.disabled = true; seed.disabled = true; verified.disabled = true;
    void import('../src/main').then(() => {
      document.getElementById('native-preflight')?.remove();
    }).catch((error: unknown) => { message.textContent = `Planner could not start: ${String(error)}`; });
  });
}
void preflight().catch((error: unknown) => { message.textContent = `BLOCKED: ${String(error)}`; });
