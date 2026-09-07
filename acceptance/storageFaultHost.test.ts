import { describe, expect, it } from 'vitest';
import { createInitialPlannerDataV2 } from '../src/types/v2';
import { DesktopPlannerStorageAdapter } from '../src/storage/plannerStorageRuntime';
import { createStorageFaultHost } from './storageFaultHost';

const initial = () => createInitialPlannerDataV2('2026-01-01T00:00:00.000Z');
describe('synthetic fault acceptance host with real desktop coordinator', () => {
  it('keeps persisted bytes after one failure and retries the latest captured planner', async () => {
    const data = initial();
    const host = createStorageFaultHost(data);
    const adapter = new DesktopPlannerStorageAdapter(host.invokeCommand, {
      writable: true, session: 1, warning: null, dataPath: 'synthetic-memory/data', backupPath: 'synthetic-memory/backups',
    });
    await adapter.save(data);
    const next = { ...data, projects: data.projects.map((project) => ({ ...project, name: 'Saved after retry' })) };
    host.armFailure();
    await expect(adapter.save(next)).rejects.toThrow('Synthetic acceptance write failure');
    expect(host.inspect().durable).toEqual(data);
    expect(adapter.getStatus().phase).toBe('error');
    await expect(adapter.flush()).rejects.toThrow();
    await adapter.retry();
    expect(host.inspect().durable).toEqual(next);
    expect(host.inspect().failures).toBe(1);
    expect(adapter.getStatus().phase).toBe('saved');
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
  it('returns copies and rejects unimplemented commands instead of faking native proof', async () => {
    const data = initial();
    const host = createStorageFaultHost(data);
    host.inspect().durable.projects[0].name = 'Mutated inspection';
    expect(host.inspect().durable).toEqual(data);
    await expect(host.invokeCommand('desktop_storage_commit_restore', { session: 1 })).rejects.toThrow('Unsupported harness command');
    await expect(host.invokeCommand('desktop_storage_save', { session: 7 })).rejects.toThrow('Unexpected synthetic session');
  });
});
