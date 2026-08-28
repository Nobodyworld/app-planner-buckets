import { describe, expect, it, vi } from 'vitest';
import type { PlannerDataV2 } from '../types/v2';
import {
  RESTORE_RECOVERY_STORAGE_KEY,
  clearRestoreRecoverySnapshot,
  fingerprintPlannerData,
  loadRestoreRecoverySnapshot,
  saveRestoreRecoverySnapshot,
  type StorageAdapter,
} from './restoreRecovery';

const createPlannerData = (suffix: string): PlannerDataV2 => {
  const timestamp = `2026-07-25T01:30:0${suffix}.000Z`;
  return {
    version: 2,
    projects: [{
      id: `project-${suffix}`,
      name: `Synthetic project ${suffix}`,
      description: '',
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    buckets: [{
      id: `bucket-${suffix}`,
      projectId: `project-${suffix}`,
      name: `Synthetic bucket ${suffix}`,
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    tasks: [{
      id: `task-${suffix}`,
      projectId: `project-${suffix}`,
      bucketId: `bucket-${suffix}`,
      title: `Synthetic task ${suffix}`,
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    templates: [],
    templateDefinitions: [],
  };
};

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('Restore recovery snapshots', () => {
  it('fingerprints equivalent planner objects independently of object key order', () => {
    const data = createPlannerData('1');
    const reordered = {
      templateDefinitions: data.templateDefinitions,
      templates: data.templates,
      tasks: data.tasks,
      buckets: data.buckets,
      projects: data.projects,
      version: data.version,
    } as PlannerDataV2;

    expect(fingerprintPlannerData(reordered)).toBe(fingerprintPlannerData(data));
    expect(fingerprintPlannerData(createPlannerData('2'))).not.toBe(
      fingerprintPlannerData(data),
    );
  });

  it('saves and loads a validated prior state only for the exact replacement', () => {
    const storage = new MemoryStorage();
    const previousData = createPlannerData('1');
    const replacementData = createPlannerData('2');

    const saved = saveRestoreRecoverySnapshot(
      storage,
      previousData,
      replacementData,
      '2026-07-25T01:30:03.000Z',
    );

    expect(saved).toMatchObject({ ok: true });
    expect(loadRestoreRecoverySnapshot(storage, replacementData)).toMatchObject({
      previousData,
      replacementFingerprint: fingerprintPlannerData(replacementData),
    });
  });

  it('retires a stale snapshot after the replacement state changes', () => {
    const storage = new MemoryStorage();
    saveRestoreRecoverySnapshot(
      storage,
      createPlannerData('1'),
      createPlannerData('2'),
      '2026-07-25T01:30:03.000Z',
    );

    expect(loadRestoreRecoverySnapshot(storage, createPlannerData('3'))).toBeNull();
    expect(storage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('preserves a valid snapshot when current planner data is invalid and cannot be fingerprinted safely', () => {
    const storage = new MemoryStorage();
    saveRestoreRecoverySnapshot(
      storage,
      createPlannerData('1'),
      createPlannerData('2'),
      '2026-07-25T01:30:03.000Z',
    );
    const serializedSnapshot = storage.getItem(RESTORE_RECOVERY_STORAGE_KEY);

    expect(loadRestoreRecoverySnapshot(storage, {
      ...createPlannerData('2'),
      projects: [],
    })).toBeNull();
    expect(storage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBe(serializedSnapshot);
  });

  it('rejects and removes malformed or invalid recovery records', () => {
    const storage = new MemoryStorage();
    storage.setItem(RESTORE_RECOVERY_STORAGE_KEY, '{"format":"wrong"}');

    expect(loadRestoreRecoverySnapshot(storage, createPlannerData('2'))).toBeNull();
    expect(storage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();

    storage.setItem(RESTORE_RECOVERY_STORAGE_KEY, '{not-json');
    expect(loadRestoreRecoverySnapshot(storage, createPlannerData('2'))).toBeNull();
    expect(storage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();
  });

  it('does not overwrite a prior snapshot when storage rejects the new write', () => {
    const storage = new MemoryStorage();
    storage.setItem(RESTORE_RECOVERY_STORAGE_KEY, 'prior-snapshot');
    storage.setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });

    expect(saveRestoreRecoverySnapshot(
      storage,
      createPlannerData('1'),
      createPlannerData('2'),
      '2026-07-25T01:30:03.000Z',
    )).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(storage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBe('prior-snapshot');
  });

  it('rejects invalid planner data before writing and clears best-effort', () => {
    const storage = new MemoryStorage();
    const invalid = {
      ...createPlannerData('1'),
      projects: [],
    };

    expect(saveRestoreRecoverySnapshot(
      storage,
      invalid,
      createPlannerData('2'),
      '2026-07-25T01:30:03.000Z',
    )).toEqual({ ok: false, reason: 'invalid-previous-data' });

    storage.setItem(RESTORE_RECOVERY_STORAGE_KEY, 'snapshot');
    clearRestoreRecoverySnapshot(storage);
    expect(storage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();
  });
});
