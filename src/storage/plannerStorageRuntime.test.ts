import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANNER_STORAGE_KEY_V1, PLANNER_STORAGE_KEY_V2 } from '../services/plannerPersistence';
import { fingerprintPlannerData, saveRestoreRecoverySnapshot } from '../services/restoreRecovery';
import { createInitialPlannerDataV2, type PlannerDataV2 } from '../types/v2';
import { resetPlannerStorageRuntimeBridgeForTests } from './plannerStorageBridge';
import { bootstrapDesktopPlannerStorage, BrowserPlannerStorageAdapter, DesktopPlannerStorageAdapter, loadLegacyDesktopPlanner, type TauriInvoke } from './plannerStorageRuntime';

const planner = (name: string): PlannerDataV2 => {
  const value = createInitialPlannerDataV2('2026-08-28T00:00:00.000Z');
  return { ...value, projects: value.projects.map((p) => ({ ...p, name })) };
};
const candidate = (data: PlannerDataV2, kind = 'primary', time = 1) => ({ kind, name: `${kind}-2026-08-28.json`, path: `runtime-data/${kind}.json`, serialized: JSON.stringify(data), modifiedAtMs: time });
const bootstrap = (extra: Record<string, unknown> = {}) => JSON.stringify({ writable: true, session: 1, migrationComplete: true, primary: candidate(planner('Primary')), backups: [], dataPath: 'runtime-data/planner-v2.json', backupPath: 'runtime-data/backups', warning: null, ...extra });
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const until = async (predicate: () => boolean) => { for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve(); expect(predicate()).toBe(true); };
const fake = (overrides: Record<string, (args: Record<string, unknown>) => unknown> = {}) => {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  const invoke: TauriInvoke = async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    calls.push({ command, args });
    if (overrides[command]) return await overrides[command](args) as T;
    if (command === 'desktop_storage_bootstrap') return bootstrap() as T;
    if (command === 'desktop_storage_read_restore_recovery') return null as T;
    if (command === 'desktop_storage_list_backups') return '[]' as T;
    if (command === 'desktop_storage_save') return JSON.stringify({ sequence: args.sequence, saved: true, stale: false, noOp: false, savedAt: args.savedAt }) as T;
    if (command === 'desktop_storage_create_operation_snapshot') return JSON.stringify({ name: 'operation-test-restore.json' }) as T;
    if (command === 'desktop_storage_commit_restore') { const request = JSON.parse(args.request as string); return JSON.stringify({ sequence: request.sequence, saved: true }) as T; }
    if (command === 'desktop_storage_recover') return JSON.stringify({ recovered: true }) as T;
    if (['desktop_storage_prune_backups', 'desktop_storage_clear_restore_recovery', 'desktop_storage_mark_migration_complete'].includes(command)) return undefined as T;
    throw new Error(`Unexpected command: ${command}`);
  };
  return { calls, invoke };
};
const desktop = (invoke: TauriInvoke, writable = true, session = 1) => new DesktopPlannerStorageAdapter(invoke, { writable, session, dataPath: 'runtime-data/planner-v2.json', backupPath: 'runtime-data/backups', warning: writable ? null : 'Read-only writer.' });
const recoveryFor = (before: PlannerDataV2, after: PlannerDataV2): string => {
  let value = '';
  saveRestoreRecoverySnapshot({ getItem: () => value, setItem: (_key, text) => { value = text; }, removeItem: () => { value = ''; } }, before, after, '2026-08-28T00:00:00Z');
  return value;
};

beforeEach(() => { resetPlannerStorageRuntimeBridgeForTests(); localStorage.clear(); });
describe('canonical desktop bootstrap', () => {
  it('loads a valid primary with exactly one session handshake and no legacy reads', async () => {
    const api = fake(); const legacy = vi.fn(() => ({ data: planner('Legacy'), source: 'v2' as const, warning: null }));
    const runtime = await bootstrapDesktopPlannerStorage(api.invoke, legacy);
    expect(runtime.source).toBe('desktop-primary'); expect(runtime.data).toEqual(planner('Primary')); expect(legacy).not.toHaveBeenCalled();
    expect(api.calls.filter((c) => c.command === 'desktop_storage_bootstrap')).toHaveLength(1);
  });
  it('recovers the newest fully valid candidate and skips malformed newer data', async () => {
    const valid = candidate(planner('Backup'), 'operation', 2);
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ primary: { ...valid, serialized: '{bad' }, backups: [{ ...valid, serialized: '{"version":2}', modifiedAtMs: 3 }, valid] }) });
    const runtime = await bootstrapDesktopPlannerStorage(api.invoke);
    expect(runtime.source).toBe('desktop-backup'); expect(runtime.data).toEqual(planner('Backup')); expect(runtime.warning).toContain('newest valid backup (operation)');
    expect(api.calls.find((c) => c.command === 'desktop_storage_recover')?.args.session).toBe(1);
  });
  it.each([{ primary: null, backups: [] }, { primary: { ...candidate(planner('Bad')), serialized: '{broken' }, backups: [] }])('does not reset or replay stale WebView data after migration: %j', async (extra) => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap(extra) }); const legacy = vi.fn();
    await expect(bootstrapDesktopPlannerStorage(api.invoke, legacy)).rejects.toThrow('No valid durable planner');
    expect(legacy).not.toHaveBeenCalled(); expect(api.calls.some((c) => c.command === 'desktop_storage_recover')).toBe(false);
  });
  it('requires explicit recovery for corrupt evidence even before the marker exists', async () => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ migrationComplete: false, primary: { ...candidate(planner('Bad')), serialized: '{}' } }) });
    await expect(bootstrapDesktopPlannerStorage(api.invoke)).rejects.toThrow('No valid durable planner');
  });
  it('migrates once, snapshots first, writes primary, and then records the marker', async () => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ migrationComplete: false, primary: null }) });
    const legacy = planner('Legacy');
    const runtime = await bootstrapDesktopPlannerStorage(api.invoke, () => ({ data: legacy, source: 'v2', warning: null }));
    expect(runtime.source).toBe('desktop-migrated-webview'); expect(runtime.data).toEqual(legacy);
    expect(api.calls.map((c) => c.command)).toEqual(['desktop_storage_bootstrap', 'desktop_storage_create_operation_snapshot', 'desktop_storage_recover', 'desktop_storage_mark_migration_complete', 'desktop_storage_read_restore_recovery']);
  });
  it('finishes an interrupted marker without rereading legacy data', async () => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ migrationComplete: false }) }); const legacy = vi.fn();
    await bootstrapDesktopPlannerStorage(api.invoke, legacy);
    expect(legacy).not.toHaveBeenCalled(); expect(api.calls.some((c) => c.command === 'desktop_storage_mark_migration_complete')).toBe(true);
  });
  it('does not mark migration successful after a failed durable write', async () => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ migrationComplete: false, primary: null }), desktop_storage_recover: () => { throw new Error('disk full'); } });
    await expect(bootstrapDesktopPlannerStorage(api.invoke, () => ({ data: planner('Legacy'), source: 'v2', warning: null }))).rejects.toThrow('disk full');
    expect(api.calls.some((c) => c.command === 'desktop_storage_mark_migration_complete')).toBe(false);
  });
  it('loads read-only recovery without repairing or deleting any file', async () => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ writable: false, primary: null, backups: [candidate(planner('Backup'), 'routine')] }) });
    const result = await bootstrapDesktopPlannerStorage(api.invoke);
    expect(result.adapter.getStatus().phase).toBe('read-only');
    expect(api.calls.map((c) => c.command)).toEqual(['desktop_storage_bootstrap', 'desktop_storage_read_restore_recovery']);
  });
  it('rejects an incomplete session handshake', async () => {
    const api = fake({ desktop_storage_bootstrap: () => bootstrap({ session: 0 }) });
    await expect(bootstrapDesktopPlannerStorage(api.invoke)).rejects.toThrow('Incomplete');
  });
});
describe('legacy migration is read-only', () => {
  it('preserves valid v2 bytes', () => {
    const text = JSON.stringify(planner('Legacy')); localStorage.setItem(PLANNER_STORAGE_KEY_V2, text);
    expect(loadLegacyDesktopPlanner().data).toEqual(planner('Legacy')); expect(localStorage.getItem(PLANNER_STORAGE_KEY_V2)).toBe(text); expect(localStorage.length).toBe(1);
  });
  it('preserves malformed legacy values and fails closed', () => {
    localStorage.setItem(PLANNER_STORAGE_KEY_V2, '{broken'); localStorage.setItem(PLANNER_STORAGE_KEY_V1, '{also-broken');
    expect(loadLegacyDesktopPlanner).toThrow('original WebView values were preserved'); expect(localStorage.length).toBe(2); expect(localStorage.getItem(PLANNER_STORAGE_KEY_V2)).toBe('{broken');
  });
  it('only initializes a valid new planner when no migration source exists', () => {
    const result = loadLegacyDesktopPlanner(); expect(result.source).toBe('new'); expect(result.data.buckets.map((b) => b.name)).toEqual(['To Do', 'In Progress']); expect(new Set(result.data.buckets.map((b) => b.id)).size).toBe(2); expect(localStorage.length).toBe(0);
  });
});
describe('desktop persistence coordinator', () => {
  it('serializes every save and captures caller data before mutation', async () => {
    const gate = deferred<string>();
    const api = fake({ desktop_storage_save: (args) => args.sequence === 1 ? gate.promise : JSON.stringify({ sequence: args.sequence, saved: true, noOp: false, stale: false, savedAt: args.savedAt }) });
    const adapter = desktop(api.invoke); const first = planner('First');
    const p1 = adapter.save(first); first.projects[0].name = 'mutated'; const p2 = adapter.save(planner('Second')); const p3 = adapter.save(planner('Third'));
    await until(() => api.calls.some((c) => c.command === 'desktop_storage_save'));
    expect(api.calls.filter((c) => c.command === 'desktop_storage_save')).toHaveLength(1);
    const firstCall = api.calls.find((c) => c.command === 'desktop_storage_save')!;
    expect(JSON.parse(firstCall.args.serialized as string).projects[0].name).toBe('First');
    gate.resolve(JSON.stringify({ sequence: 1, saved: true, stale: false, noOp: false, savedAt: firstCall.args.savedAt }));
    await Promise.all([p1, p2, p3]);
    expect(api.calls.filter((c) => c.command === 'desktop_storage_save').map((c) => c.args.sequence)).toEqual([1, 2, 3]);
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
  it('does not report saved or finish close while a write is pending', async () => {
    const gate = deferred<string>(); const api = fake({ desktop_storage_save: () => gate.promise }); const adapter = desktop(api.invoke);
    const save = adapter.save(planner('Pending')); const drained = vi.fn(); const flush = adapter.flush().then(drained);
    await until(() => api.calls.length > 0); expect(adapter.getStatus().phase).toBe('saving'); expect(drained).not.toHaveBeenCalled();
    gate.resolve(JSON.stringify({ sequence: 1, saved: true, stale: false, noOp: true, savedAt: '2026-08-28' }));
    await save; await flush; expect(adapter.getStatus().phase).toBe('saved'); expect(drained).toHaveBeenCalledOnce();
  });
  it('retains the latest failed state for explicit retry', async () => {
    let fail = true; const api = fake({ desktop_storage_save: (args) => { if (fail) throw new Error('disk full'); return JSON.stringify({ sequence: args.sequence, saved: true, stale: false, noOp: true, savedAt: args.savedAt }); } });
    const adapter = desktop(api.invoke); await expect(adapter.save(planner('Unsaved'))).rejects.toThrow('disk full'); await expect(adapter.flush()).rejects.toThrow('disk full');
    expect(adapter.getStatus().phase).toBe('error'); fail = false; await adapter.retry(); await adapter.flush(); expect(adapter.getStatus().phase).toBe('saved');
    expect(JSON.parse(api.calls.filter((c) => c.command === 'desktop_storage_save').at(-1)!.args.serialized as string).projects[0].name).toBe('Unsaved');
  });
  it('passes the active session on every write and rejects stale results', async () => {
    const api = fake({ desktop_storage_save: () => JSON.stringify({ saved: false, stale: true, sequence: 1, savedAt: 'test' }) }); const adapter = desktop(api.invoke, true, 9);
    await expect(adapter.save(planner('New session'))).rejects.toThrow('stale'); expect(api.calls[0].args.session).toBe(9); expect(adapter.getStatus().phase).toBe('error');
  });
  it('only submits fully validated candidates to retention', async () => {
    const good = candidate(planner('Valid'), 'routine'); const invalid = { ...good, name: 'routine-invalid.json', serialized: '{"version":2}' };
    const api = fake({ desktop_storage_list_backups: () => JSON.stringify([good, invalid]) }); await desktop(api.invoke).save(planner('Current'));
    const proof = JSON.parse(api.calls.find((c) => c.command === 'desktop_storage_prune_backups')!.args.request as string);
    expect(proof.candidates).toEqual([{ name: good.name, serialized: good.serialized }]);
  });
  it('treats retention failure as a warning after a successful durable write', async () => {
    const api = fake({ desktop_storage_prune_backups: () => { throw new Error('backup changed'); } }); const adapter = desktop(api.invoke);
    await adapter.save(planner('Saved')); await adapter.flush(); expect(adapter.getStatus().phase).toBe('saved'); expect(adapter.getStatus().warning).toContain('retention was deferred');
  });
});
describe('transactional Restore and Undo', () => {
  it('cancels during snapshot preparation without commit or recovery cleanup', async () => {
    const gate = deferred<string>(); const api = fake({ desktop_storage_create_operation_snapshot: () => gate.promise }); const adapter = desktop(api.invoke); const abort = new AbortController();
    const result = adapter.replacePlanner(planner('Before'), planner('After'), true, abort.signal, vi.fn());
    await until(() => api.calls.length > 0); abort.abort(); gate.resolve(JSON.stringify({ name: 'operation-test-restore.json' }));
    await expect(result).resolves.toBe(false); expect(api.calls.map((c) => c.command)).toEqual(['desktop_storage_create_operation_snapshot']);
  });
  it('keeps a matching recovery until a divergent save is committed', async () => {
    const before = planner('Before'); const after = planner('After'); const record = recoveryFor(before, after); let fail = true;
    const api = fake({ desktop_storage_read_restore_recovery: () => record, desktop_storage_save: (args) => { if (fail) throw new Error('locked'); return JSON.stringify({ sequence: args.sequence, saved: true, stale: false, noOp: false, savedAt: args.savedAt }); } });
    const adapter = desktop(api.invoke); await adapter.loadRestoreRecovery(after);
    await expect(adapter.save(planner('Diverged'))).rejects.toThrow('locked'); expect(api.calls.some((c) => c.command === 'desktop_storage_clear_restore_recovery')).toBe(false);
    expect(adapter.getRestoreRecovery(after)).toEqual(before); fail = false; await adapter.retry(); expect(api.calls.some((c) => c.command === 'desktop_storage_clear_restore_recovery')).toBe(true);
  });
  it('does not retire Undo if the replacement transaction fails', async () => {
    const before = planner('Before'); const after = planner('After'); const api = fake({ desktop_storage_read_restore_recovery: () => recoveryFor(before, after), desktop_storage_commit_restore: () => { throw new Error('promotion failed'); } });
    const adapter = desktop(api.invoke); await adapter.loadRestoreRecovery(after);
    await expect(adapter.replacePlanner(after, before, false, new AbortController().signal, vi.fn())).rejects.toThrow('promotion failed'); expect(adapter.getRestoreRecovery(after)).toEqual(before);
    expect(api.calls.some((c) => c.command === 'desktop_storage_clear_restore_recovery')).toBe(false);
  });
  it('passes a single validated replacement with its expected primary and recovery record', async () => {
    const api = fake(); const adapter = desktop(api.invoke); const before = planner('Before'); const after = planner('After'); const phases: string[] = [];
    await expect(adapter.replacePlanner(before, after, true, new AbortController().signal, (phase) => phases.push(phase))).resolves.toBe(true);
    const request = JSON.parse(api.calls.find((c) => c.command === 'desktop_storage_commit_restore')!.args.request as string);
    expect(JSON.parse(request.expected)).toEqual(before); expect(JSON.parse(request.serialized)).toEqual(after); expect(JSON.parse(request.recovery).replacementFingerprint).toBe(fingerprintPlannerData(after)); expect(phases).toEqual(['preparing', 'committing']); expect(adapter.getRestoreRecovery(after)).toEqual(before);
  });
  it('never attempts a destructive operation from a read-only adapter', async () => {
    const api = fake(); await expect(desktop(api.invoke, false).replacePlanner(planner('Before'), planner('After'), true, new AbortController().signal, vi.fn())).rejects.toThrow('Read-only'); expect(api.calls).toHaveLength(0);
  });
});
describe('browser adapter compatibility', () => {
  it('retains the existing schema key and synchronous write side effect', async () => {
    const adapter = new BrowserPlannerStorageAdapter(); const result = adapter.save(planner('Browser'));
    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2)!)).toEqual(planner('Browser')); await result; expect(adapter.getStatus().phase).toBe('saved');
  });
});
