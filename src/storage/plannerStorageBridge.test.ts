import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANNER_STORAGE_KEY_V2, loadPlannerDataV2FromLocalStorage, savePlannerDataV2ToLocalStorage } from '../services/plannerPersistence';
import { createInitialPlannerDataV2 } from '../types/v2';
import { forwardPlannerSaveToRuntime, getPlannerStorageRuntimeTarget, isDesktopPlannerStorage, registerPlannerStorageRuntimeBridge, resetPlannerStorageRuntimeBridgeForTests } from './plannerStorageBridge';

beforeEach(() => { resetPlannerStorageRuntimeBridgeForTests(); localStorage.clear(); });
describe('runtime persistence bridge', () => {
  const data = createInitialPlannerDataV2('2026-08-28T00:00:00Z');
  it('supplies bootstrap data without reading or overwriting stale WebView planner bytes', () => {
    localStorage.setItem(PLANNER_STORAGE_KEY_V2, '{legacy');
    registerPlannerStorageRuntimeBridge({ mode: 'desktop-file', getStatus: () => ({ writable: true, warning: 'Recovered.' }), save: vi.fn(async () => undefined) }, data, 'Recovered.');
    expect(loadPlannerDataV2FromLocalStorage()).toEqual({ data, source: 'v2', warning: 'Recovered.' }); expect(localStorage.getItem(PLANNER_STORAGE_KEY_V2)).toBe('{legacy'); expect(isDesktopPlannerStorage()).toBe(true);
  });
  it('returns the actual pending durable promise rather than swallowing failures', async () => {
    const save = vi.fn(async () => { throw new Error('disk full'); });
    registerPlannerStorageRuntimeBridge({ mode: 'desktop-file', getStatus: () => ({ writable: true }), save }, data, null);
    await expect(savePlannerDataV2ToLocalStorage(data)).rejects.toThrow('disk full'); expect(localStorage.getItem(PLANNER_STORAGE_KEY_V2)).toBeNull();
  });
  it('rejects read-only writes synchronously before invoking native storage', () => {
    const save = vi.fn(async () => undefined); registerPlannerStorageRuntimeBridge({ mode: 'desktop-file', getStatus: () => ({ writable: false }), save }, data, null);
    expect(() => savePlannerDataV2ToLocalStorage(data)).toThrow('read-only'); expect(save).not.toHaveBeenCalled();
  });
  it('keeps ordinary browser persistence synchronous', () => {
    expect(forwardPlannerSaveToRuntime(data)).toBe(false); expect(savePlannerDataV2ToLocalStorage(data)).toBeUndefined(); expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2)!)).toEqual(data);
  });
  it('preserves the adapter transaction and lifecycle methods without a second recovery state', () => {
    const target = { mode: 'desktop-file' as const, getStatus: () => ({ writable: true }), save: vi.fn(async () => undefined), flush: vi.fn(async () => undefined), clearRestoreRecovery: vi.fn(async () => undefined), getRestoreRecovery: () => data };
    registerPlannerStorageRuntimeBridge(target, data, null); expect(getPlannerStorageRuntimeTarget()).toBe(target); expect(getPlannerStorageRuntimeTarget()?.getRestoreRecovery?.(data)).toBe(data);
  });
});
