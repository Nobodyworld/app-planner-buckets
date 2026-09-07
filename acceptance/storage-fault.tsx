import { isTauri } from '@tauri-apps/api/core';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { createRuntimeInitialPlannerDataV2 } from '../src/services/plannerPersistence';
import { installBoardScrollChaining } from '../src/services/boardScrollChaining';
import { registerPlannerStorageRuntimeBridge } from '../src/storage/plannerStorageBridge';
import { DesktopPlannerStorageAdapter } from '../src/storage/plannerStorageRuntime';
import { createStorageFaultHost } from './storageFaultHost';
import '../src/styles.css';
import '../src/responsiveLayout.css';
import '../src/storageStatus.css';

// A separately addressed dev entry: never imported from the production index/main.
if (!import.meta.env.DEV || import.meta.env.MODE !== 'acceptance' || isTauri()
  || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  document.body.textContent = 'Fault harness refused: use a loopback browser dev server in acceptance mode, not Tauri or a production build.';
  throw new Error('Synthetic acceptance harness context refused.');
}
const fixture = createRuntimeInitialPlannerDataV2();
fixture.projects[0].name = 'Synthetic Save Acceptance';
const host = createStorageFaultHost(fixture);
const adapter = new DesktopPlannerStorageAdapter(host.invokeCommand, {
  writable: true, session: 1, warning: null,
  dataPath: 'synthetic-memory/planner-v2.json', backupPath: 'synthetic-memory/backups',
});
registerPlannerStorageRuntimeBridge(adapter, fixture, null);
installBoardScrollChaining();
const arm = document.getElementById('arm-failure') as HTMLButtonElement;
const state = document.getElementById('fault-state')!;
const evidence = document.getElementById('persisted-evidence')!;
const refresh = (): void => {
  const snapshot = host.inspect();
  arm.disabled = adapter.getStatus().phase !== 'saved' || snapshot.armed;
  state.textContent = snapshot.armed ? 'Next write will fail once.' : `Failures: ${snapshot.failures}; save attempts: ${snapshot.attempts}.`;
  evidence.textContent = JSON.stringify(snapshot, null, 2);
};
arm.addEventListener('click', () => { host.armFailure(); refresh(); });
adapter.subscribe(refresh);
createRoot(document.getElementById('root')!).render(<App />);
