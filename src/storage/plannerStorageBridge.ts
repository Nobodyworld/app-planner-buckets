import type { PlannerDataV2 } from '../types/v2';

export interface RuntimeStorageStatus {
  mode?: 'browser-local-storage' | 'desktop-file';
  writable: boolean;
  phase?: 'idle' | 'saving' | 'saved' | 'error' | 'read-only';
  dataPath?: string | null;
  backupPath?: string | null;
  lastSavedAt?: string | null;
  warning?: string | null;
  error?: string | null;
}

export interface RuntimeSaveTarget {
  mode: 'browser-local-storage' | 'desktop-file';
  getStatus: () => RuntimeStorageStatus;
  subscribe?: (listener: (status: RuntimeStorageStatus) => void) => () => void;
  save: (data: PlannerDataV2) => Promise<unknown>;
}

interface RuntimeBootstrapSeed {
  data: PlannerDataV2;
  warning: string | null;
}

let bootstrapSeed: RuntimeBootstrapSeed | null = null;
let saveTarget: RuntimeSaveTarget | null = null;

export const registerPlannerStorageRuntimeBridge = (
  target: RuntimeSaveTarget,
  data: PlannerDataV2,
  warning: string | null,
): void => {
  bootstrapSeed = { data, warning };
  saveTarget = target;
};

export const getPlannerStorageRuntimeBootstrap = (): RuntimeBootstrapSeed | null => (
  bootstrapSeed
    ? { data: bootstrapSeed.data, warning: bootstrapSeed.warning }
    : null
);

export const getPlannerStorageRuntimeTarget = (): RuntimeSaveTarget | null => saveTarget;

/**
 * Returns true when a desktop runtime accepted responsibility for this save.
 * Browser mode returns false so the caller preserves ordinary localStorage.
 */
export const forwardPlannerSaveToRuntime = (data: PlannerDataV2): boolean => {
  if (!saveTarget || saveTarget.mode !== 'desktop-file') return false;

  const status = saveTarget.getStatus();
  if (!status.writable) {
    throw new Error('Desktop planner storage is read-only; changes cannot be saved from this instance.');
  }

  void saveTarget.save(data).catch(() => {
    // The adapter publishes durable save failures through its observable status.
    // The existing synchronous save caller cannot safely rethrow an async failure.
  });
  return true;
};

export const resetPlannerStorageRuntimeBridgeForTests = (): void => {
  bootstrapSeed = null;
  saveTarget = null;
};
