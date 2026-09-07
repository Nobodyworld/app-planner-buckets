import { describe, expect, it, vi } from 'vitest';
import { installDesktopCloseGuard } from '../src/storage/plannerStorageLifecycle';
import { bootstrapDesktopPlannerStorage, DesktopPlannerStorageAdapter, type TauriInvoke } from '../src/storage/plannerStorageRuntime';
import { createInitialPlannerDataV2, type PlannerDataV2 } from '../src/types/v2';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const planner = (name: string): PlannerDataV2 => {
  const value = createInitialPlannerDataV2('2026-09-07T00:00:00.000Z');
  return { ...value, projects: value.projects.map((project) => ({ ...project, name })) };
};
const settle = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

/** Controlled command boundary; the queue, bootstrap and close guard are production code.
 * These tests establish ordering, not Windows IPC or installed-app execution. */
function host() {
  let durable = planner('Initial');
  let session = 41;
  let sequence = 0;
  let held = false;
  const entered = deferred<void>();
  const release = deferred<void>();
  const events: string[] = [];
  const invokeCommand: TauriInvoke = async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    if (command === 'desktop_storage_bootstrap') {
      session += 1; sequence = 0;
      return JSON.stringify({ writable: true, dataPath: 'synthetic/data/planner-v2.json', backupPath: 'synthetic/backups', migrationComplete: true, session, warning: null, backups: [], primary: { kind: 'primary', name: 'planner-v2.json', path: 'synthetic/data/planner-v2.json', modifiedAtMs: 1, serialized: JSON.stringify(durable) } }) as T;
    }
    if (args.session !== session) throw new Error('Obsolete native session.');
    if (command === 'desktop_storage_read_restore_recovery') return null as T;
    if (command === 'desktop_storage_list_backups') return '[]' as T;
    if (command === 'desktop_storage_prune_backups') return undefined as T;
    if (command !== 'desktop_storage_save') throw new Error(`Unexpected command: ${command}`);
    events.push(`start:${args.sequence}`);
    if (held) { held = false; entered.resolve(); await release.promise; }
    if (args.session !== session || Number(args.sequence) <= sequence) throw new Error('Stale native write.');
    durable = JSON.parse(String(args.serialized)) as PlannerDataV2;
    sequence = Number(args.sequence);
    events.push(`saved:${sequence}`);
    return JSON.stringify({ sequence, saved: true, stale: false, noOp: false, savedAt: args.savedAt }) as T;
  };
  return { invokeCommand, entered, release, events, hold: () => { held = true; }, read: () => durable,
    adapter: () => new DesktopPlannerStorageAdapter(invokeCommand, { writable: true, session, dataPath: null, backupPath: null, warning: null }) };
}

async function guard(adapter: DesktopPlannerStorageAdapter, events: string[]) {
  let close!: () => void;
  const finished = deferred<void>();
  const finish = vi.fn(async () => { events.push('closed'); finished.resolve(); });
  const failure = vi.fn();
  const dispose = await installDesktopCloseGuard(adapter, async (handler) => { close = handler; return () => undefined; }, { enable: async () => undefined, finish }, failure);
  return { close, finish, failure, finished, dispose };
}

describe('real coordinator close/reload ordering', () => {
  it('does not finish close until the active write and the queued newer save are acknowledged', async () => {
    const native = host(); const adapter = native.adapter(); const close = await guard(adapter, native.events);
    try {
      native.hold();
      const first = adapter.save(planner('First'));
      await native.entered.promise;
      const newest = planner('Newest'); const second = adapter.save(newest);
      close.close(); close.close();
      await settle();
      expect(close.finish).not.toHaveBeenCalled();
      expect(native.events).toEqual(['start:1']);
      native.release.resolve();
      await Promise.all([first, second, close.finished.promise]);
      expect(native.events).toEqual(['start:1', 'saved:1', 'start:2', 'saved:2', 'closed']);
      expect(native.read()).toEqual(newest);
      expect(close.finish).toHaveBeenCalledOnce();
    } finally { close.dispose(); }
  });

  it('includes a save appended while the real close flush is already waiting', async () => {
    const native = host(); const adapter = native.adapter(); const close = await guard(adapter, native.events);
    try {
      native.hold(); const first = adapter.save(planner('First'));
      await native.entered.promise; close.close(); await settle();
      const latest = planner('Appended during flush'); const appended = adapter.save(latest);
      expect(close.finish).not.toHaveBeenCalled();
      native.release.resolve();
      await Promise.all([first, appended, close.finished.promise]);
      expect(native.read()).toEqual(latest);
      expect(native.events.at(-2)).toBe('saved:2');
      expect(native.events.at(-1)).toBe('closed');
    } finally { close.dispose(); }
  });

  it('does not close on an in-flight failure and permits close only after explicit retry', async () => {
    const native = host(); const adapter = native.adapter(); const close = await guard(adapter, native.events);
    try {
      native.hold(); const pending = planner('Retry me'); const save = adapter.save(pending);
      const rejection = expect(save).rejects.toThrow('controlled write failure');
      await native.entered.promise; close.close();
      native.release.reject(new Error('controlled write failure'));
      await rejection; await settle();
      expect(close.finish).not.toHaveBeenCalled();
      expect(close.failure).toHaveBeenCalledWith(expect.stringContaining('controlled write failure'));
      expect(native.read()).not.toEqual(pending);
      await adapter.retry(); close.close(); await close.finished.promise;
      expect(native.read()).toEqual(pending);
      expect(close.finish).toHaveBeenCalledOnce();
    } finally { close.dispose(); }
  });

  it('saves sequence one immediately after renewed bootstrap and rejects the obsolete adapter', async () => {
    const native = host();
    const legacy = vi.fn(() => { throw new Error('Legacy storage must not be read.'); });
    const first = await bootstrapDesktopPlannerStorage(native.invokeCommand, legacy);
    await first.adapter.save(planner('Old session'));
    const renewed = await bootstrapDesktopPlannerStorage(native.invokeCommand, legacy);
    const latest = planner('Immediate new session');
    await expect(renewed.adapter.save(latest)).resolves.toMatchObject({ sequence: 1, saved: true });
    await expect(first.adapter.save(planner('Obsolete writer'))).rejects.toThrow('Obsolete native session');
    expect(native.read()).toEqual(latest);
    expect(legacy).not.toHaveBeenCalled();
  });
});
