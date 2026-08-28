import { fingerprintPlannerData } from '../services/restoreRecovery';
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
  createRestoreRecovery?: (
    previousData: PlannerDataV2,
    replacementData: PlannerDataV2,
    createdAt: string,
  ) => Promise<boolean>;
  clearRestoreRecovery?: () => Promise<void>;
}

interface RuntimeBootstrapSeed {
  data: PlannerDataV2;
  warning: string | null;
}

let bootstrapSeed: RuntimeBootstrapSeed | null = null;
let saveTarget: RuntimeSaveTarget | null = null;
let currentPlannerData: PlannerDataV2 | null = null;
let pendingRestoreData: PlannerDataV2 | null = null;
let preparedRestoreReplacementFingerprint: string | null = null;

const mergeBootstrapWarning = (
  status: RuntimeStorageStatus,
  warning: string | null,
): RuntimeStorageStatus => ({
  ...status,
  warning: status.warning ?? warning,
});

export const registerPlannerStorageRuntimeBridge = (
  target: RuntimeSaveTarget,
  data: PlannerDataV2,
  warning: string | null,
  hasRestoreRecovery = false,
): void => {
  bootstrapSeed = { data, warning };
  currentPlannerData = data;
  pendingRestoreData = null;
  preparedRestoreReplacementFingerprint = hasRestoreRecovery
    ? fingerprintPlannerData(data)
    : null;
  saveTarget = {
    mode: target.mode,
    getStatus: () => mergeBootstrapWarning(target.getStatus(), warning),
    subscribe: target.subscribe
      ? (listener) => target.subscribe?.((status) => {
        listener(mergeBootstrapWarning(status, warning));
      }) ?? (() => undefined)
      : undefined,
    save: (nextData) => target.save(nextData),
    createRestoreRecovery: target.createRestoreRecovery
      ? (previousData, replacementData, createdAt) => target.createRestoreRecovery?.(
        previousData,
        replacementData,
        createdAt,
      ) ?? Promise.resolve(false)
      : undefined,
    clearRestoreRecovery: target.clearRestoreRecovery
      ? () => target.clearRestoreRecovery?.() ?? Promise.resolve()
      : undefined,
  };
};

export const getPlannerStorageRuntimeBootstrap = (): RuntimeBootstrapSeed | null => (
  bootstrapSeed
    ? { data: bootstrapSeed.data, warning: bootstrapSeed.warning }
    : null
);

export const getPlannerStorageRuntimeTarget = (): RuntimeSaveTarget | null => saveTarget;

export const setPendingPlannerRestoreData = (data: PlannerDataV2 | null): void => {
  pendingRestoreData = data;
};

export const preparePlannerRestoreRecovery = async (): Promise<boolean> => {
  if (!saveTarget || saveTarget.mode !== 'desktop-file') return true;
  if (
    !currentPlannerData
    || !pendingRestoreData
    || !saveTarget.createRestoreRecovery
  ) {
    return false;
  }

  const recoveryPrepared = await saveTarget.createRestoreRecovery(
    currentPlannerData,
    pendingRestoreData,
    new Date().toISOString(),
  );
  if (recoveryPrepared) {
    preparedRestoreReplacementFingerprint = fingerprintPlannerData(pendingRestoreData);
  }
  return recoveryPrepared;
};

export const clearPlannerRestoreRecoveryRuntime = async (): Promise<void> => {
  pendingRestoreData = null;
  preparedRestoreReplacementFingerprint = null;
  if (
    saveTarget?.mode === 'desktop-file'
    && saveTarget.clearRestoreRecovery
  ) {
    await saveTarget.clearRestoreRecovery();
  }
};

const retireDivergedRestoreRecovery = (data: PlannerDataV2): void => {
  if (
    !preparedRestoreReplacementFingerprint
    || fingerprintPlannerData(data) === preparedRestoreReplacementFingerprint
  ) {
    return;
  }

  preparedRestoreReplacementFingerprint = null;
  pendingRestoreData = null;
  if (saveTarget?.clearRestoreRecovery) {
    void saveTarget.clearRestoreRecovery().catch(() => {
      // The adapter publishes durable cleanup failures through storage status.
    });
  }
};

/**
 * Returns true when a desktop runtime accepted responsibility for this save.
 * Browser mode returns false so the caller preserves ordinary localStorage.
 */
export const forwardPlannerSaveToRuntime = (data: PlannerDataV2): boolean => {
  if (!saveTarget || saveTarget.mode !== 'desktop-file') return false;

  currentPlannerData = data;
  retireDivergedRestoreRecovery(data);
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
  currentPlannerData = null;
  pendingRestoreData = null;
  preparedRestoreReplacementFingerprint = null;
};
