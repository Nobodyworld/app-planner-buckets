import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPlannerDataV2FromLocalStorage,
  PLANNER_STORAGE_KEY_V2,
  savePlannerDataV2ToLocalStorage,
} from '../services/plannerPersistence';
import { createInitialPlannerDataV2, type PlannerDataV2 } from '../types/v2';
import {
  clearPlannerRestoreRecoveryRuntime,
  getPlannerStorageRuntimeTarget,
  preparePlannerRestoreRecovery,
  registerPlannerStorageRuntimeBridge,
  resetPlannerStorageRuntimeBridgeForTests,
  setPendingPlannerRestoreData,
} from './plannerStorageBridge';

const createPlanner = (name: string): PlannerDataV2 => {
  const data = createInitialPlannerDataV2('2026-08-28T00:00:00.000Z');
  return {
    ...data,
    projects: data.projects.map((project) => ({ ...project, name })),
  };
};

describe('planner storage runtime bridge', () => {
  beforeEach(() => {
    resetPlannerStorageRuntimeBridgeForTests();
    localStorage.clear();
  });

  it('supplies desktop bootstrap data without overwriting legacy WebView storage', () => {
    const legacy = createPlanner('Legacy WebView planner');
    const desktop = createPlanner('Durable desktop planner');
    localStorage.setItem(PLANNER_STORAGE_KEY_V2, JSON.stringify(legacy));
    const save = vi.fn(async () => undefined);

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save,
      },
      desktop,
      'Recovered from durable storage.',
    );

    expect(loadPlannerDataV2FromLocalStorage()).toEqual({
      data: desktop,
      source: 'v2',
      warning: 'Recovered from durable storage.',
    });
    expect(getPlannerStorageRuntimeTarget()?.getStatus().warning).toBe(
      'Recovered from durable storage.',
    );
    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2) ?? 'null')).toEqual(legacy);
  });

  it('forwards desktop saves without mutating legacy WebView storage', async () => {
    const legacy = createPlanner('Legacy WebView planner');
    const desktop = createPlanner('Durable desktop planner');
    localStorage.setItem(PLANNER_STORAGE_KEY_V2, JSON.stringify(legacy));
    const save = vi.fn(async () => undefined);

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save,
      },
      desktop,
      null,
    );

    savePlannerDataV2ToLocalStorage(desktop);
    await Promise.resolve();

    expect(save).toHaveBeenCalledWith(desktop);
    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2) ?? 'null')).toEqual(legacy);
  });

  it('keeps ordinary localStorage writes in browser mode', () => {
    const planner = createPlanner('Browser planner');
    registerPlannerStorageRuntimeBridge(
      {
        mode: 'browser-local-storage',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
      },
      planner,
      null,
    );

    savePlannerDataV2ToLocalStorage(planner);

    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2) ?? 'null')).toEqual(planner);
  });

  it('blocks synchronous save acceptance when the desktop writer is read-only', () => {
    const planner = createPlanner('Read-only desktop planner');
    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: false }),
        save: vi.fn(async () => undefined),
      },
      planner,
      'Another process owns desktop storage.',
    );

    expect(() => savePlannerDataV2ToLocalStorage(planner)).toThrow(
      'Desktop planner storage is read-only',
    );
  });

  it('prepares a verified desktop recovery snapshot before Restore proceeds', async () => {
    const previous = createPlanner('Before Restore');
    const replacement = createPlanner('After Restore');
    const createRestoreRecovery = vi.fn(async () => true);
    const clearRestoreRecovery = vi.fn(async () => undefined);

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        createRestoreRecovery,
        clearRestoreRecovery,
      },
      previous,
      null,
    );
    setPendingPlannerRestoreData(replacement);

    await expect(preparePlannerRestoreRecovery()).resolves.toBe(true);
    expect(createRestoreRecovery).toHaveBeenCalledWith(
      previous,
      replacement,
      expect.any(String),
    );

    await clearPlannerRestoreRecoveryRuntime();
    expect(clearRestoreRecovery).toHaveBeenCalledOnce();
  });

  it('uses the latest in-memory planner as the pre-Restore recovery source', async () => {
    const initial = createPlanner('Initial');
    const edited = createPlanner('Edited');
    const replacement = createPlanner('Replacement');
    const createRestoreRecovery = vi.fn(async () => true);

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        createRestoreRecovery,
      },
      initial,
      null,
    );
    savePlannerDataV2ToLocalStorage(edited);
    setPendingPlannerRestoreData(replacement);

    await preparePlannerRestoreRecovery();

    expect(createRestoreRecovery).toHaveBeenCalledWith(
      edited,
      replacement,
      expect.any(String),
    );
  });

  it('does not allow desktop Restore when no validated pending replacement is registered', async () => {
    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        createRestoreRecovery: vi.fn(async () => true),
      },
      createPlanner('Current'),
      null,
    );

    await expect(preparePlannerRestoreRecovery()).resolves.toBe(false);
  });

  it('keeps matching Restore recovery and clears it after the planner diverges', async () => {
    const previous = createPlanner('Previous');
    const replacement = createPlanner('Replacement');
    const edited = createPlanner('Edited after Restore');
    const clearRestoreRecovery = vi.fn(async () => undefined);

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        createRestoreRecovery: vi.fn(async () => true),
        clearRestoreRecovery,
      },
      previous,
      null,
    );
    setPendingPlannerRestoreData(replacement);
    await preparePlannerRestoreRecovery();

    savePlannerDataV2ToLocalStorage(replacement);
    await Promise.resolve();
    expect(clearRestoreRecovery).not.toHaveBeenCalled();

    savePlannerDataV2ToLocalStorage(edited);
    await Promise.resolve();
    expect(clearRestoreRecovery).toHaveBeenCalledOnce();
  });

  it('tracks a matching durable recovery loaded at startup until later divergence', async () => {
    const replacement = createPlanner('Replacement at startup');
    const edited = createPlanner('Edited later');
    const clearRestoreRecovery = vi.fn(async () => undefined);

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        clearRestoreRecovery,
      },
      replacement,
      null,
      true,
    );

    savePlannerDataV2ToLocalStorage(replacement);
    await Promise.resolve();
    expect(clearRestoreRecovery).not.toHaveBeenCalled();

    savePlannerDataV2ToLocalStorage(edited);
    await Promise.resolve();
    expect(clearRestoreRecovery).toHaveBeenCalledOnce();
  });
});
