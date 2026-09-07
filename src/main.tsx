import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installBoardScrollChaining } from './services/boardScrollChaining';
import { registerPlannerStorageRuntimeBridge } from './storage/plannerStorageBridge';
import { bootstrapPlannerStorageRuntime } from './storage/plannerStorageRuntime';
import { installDesktopCloseGuard } from './storage/plannerStorageLifecycle';
import './styles.css';
import './responsiveLayout.css';
import './storageStatus.css';

installBoardScrollChaining();
const root = createRoot(document.getElementById('root')!);
const startPlanner = async (): Promise<void> => {
  try {
    const runtime = await bootstrapPlannerStorageRuntime();
    if (runtime.adapter.mode === 'desktop-file') await installDesktopCloseGuard(runtime.adapter);
    registerPlannerStorageRuntimeBridge(runtime.adapter, runtime.data, runtime.warning);
    root.render(<StrictMode><App /></StrictMode>);
  } catch (error) {
    root.render(
      <StrictMode>
        <main className="app-bootstrap-error" role="alert">
          <h1>Planner Buckets could not start safely</h1>
          <p>{error instanceof Error ? error.message : 'Storage initialization failed.'}</p>
          <p>Do not delete or reset application data. Preserve the planner and backup files before attempting recovery.</p>
        </main>
      </StrictMode>,
    );
  }
};
void startPlanner();
