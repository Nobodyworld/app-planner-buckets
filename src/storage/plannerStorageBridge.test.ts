import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPlannerDataV2FromLocalStorage,
  PLANNER_STORAGE_KEY_V2,
  savePlannerDataV2ToLocalStorage,
} from '../services/plannerPersistence';
import { createInitialPlannerDataV2, type PlannerDataV2 } from '../types/v2';
import {
  registerPlannerStorageRuntimeBridge,
  resetPlannerStorageRuntimeBridgeForTests,
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
});
