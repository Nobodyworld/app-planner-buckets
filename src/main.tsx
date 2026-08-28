import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installBoardScrollChaining } from './services/boardScrollChaining';
import { saveRestoreRecoverySnapshot } from './services/restoreRecovery';
import { registerPlannerStorageRuntimeBridge } from './storage/plannerStorageBridge';
import { bootstrapPlannerStorageRuntime } from './storage/plannerStorageBootstrap';
import './styles.css';
import './responsiveLayout.css';
import './storageStatus.css';

installBoardScrollChaining();

const root = createRoot(document.getElementById('root')!);

const startPlanner = async (): Promise<void> => {
  try {
    const runtime = await bootstrapPlannerStorageRuntime();
    if (
      runtime.adapter.mode === 'desktop-file'
      && runtime.restoreRecovery
    ) {
      saveRestoreRecoverySnapshot(
        localStorage,
        runtime.restoreRecovery,
        runtime.data,
        new Date().toISOString(),
      );
    }
    registerPlannerStorageRuntimeBridge(
      runtime.adapter,
      runtime.data,
      runtime.warning,
    );
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Planner storage could not be initialized safely.';
    root.render(
      <StrictMode>
        <main className="app-bootstrap-error" role="alert">
          <h1>Planner Buckets could not start safely</h1>
          <p>{message}</p>
          <p>Your existing planner data was not replaced. Close the application and retry.</p>
        </main>
      </StrictMode>,
    );
  }
};

void startPlanner();
