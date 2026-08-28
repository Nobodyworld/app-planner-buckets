import { beforeEach, describe, expect, it } from 'vitest';
import { PLANNER_STORAGE_KEY_V2 } from '../services/plannerPersistence';
import { createInitialPlannerDataV2, type PlannerDataV2 } from '../types/v2';
import {
  bootstrapDesktopPlannerStorage,
  BrowserPlannerStorageAdapter,
  DesktopPlannerStorageAdapter,
  type TauriInvoke,
} from './plannerStorageRuntime';

const createPlanner = (name: string): PlannerDataV2 => {
  const data = createInitialPlannerDataV2('2026-08-28T00:00:00.000Z');
  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      name,
      updatedAt: '2026-08-28T00:00:00.000Z',
    })),
  };
};

const createInvoke = (
  handlers: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>,
): TauriInvoke => async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
  const handler = handlers[command];
  if (!handler) throw new Error(`Unexpected command: ${command}`);
  return await handler(args) as T;
};

const createBootstrap = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  writable: true,
  dataPath: 'runtime-data/planner-v2.json',
  backupPath: 'runtime-data/backups',
  migrationComplete: true,
  primary: null,
  backups: [],
  warning: null,
  ...overrides,
});

describe('planner storage runtime', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('preserves browser localStorage behavior behind the browser adapter', async () => {
    const planner = createPlanner('Browser planner');
    const adapter = new BrowserPlannerStorageAdapter();

    const result = await adapter.save(planner);

    expect(result.saved).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY_V2) ?? 'null')).toEqual(planner);
    expect(adapter.getStatus()).toMatchObject({
      mode: 'browser-local-storage',
      writable: true,
      phase: 'saved',
      error: null,
    });
  });

  it('loads a valid desktop primary without consulting legacy browser storage', async () => {
    const primary = createPlanner('Desktop primary');
    let browserLoads = 0;
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => createBootstrap({
        primary: {
          kind: 'primary',
          path: 'runtime-data/planner-v2.json',
          serialized: JSON.stringify(primary),
          modifiedAtMs: 200,
        },
      }),
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorage(
      invokeCommand,
      () => {
        browserLoads += 1;
        return { data: createPlanner('Legacy'), source: 'v2', warning: null };
      },
    );

    expect(runtime.data).toEqual(primary);
    expect(runtime.source).toBe('desktop-primary');
    expect(browserLoads).toBe(0);
  });

  it('skips invalid backups, recovers the newest valid candidate, and repairs the primary', async () => {
    const validBackup = createPlanner('Recovered backup');
    const commands: Array<{ command: string; args: Record<string, unknown> }> = [];
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => createBootstrap({
        primary: {
          kind: 'primary',
          path: 'runtime-data/planner-v2.json',
          serialized: '{broken',
          modifiedAtMs: 500,
        },
        backups: [
          {
            kind: 'routine',
            path: 'runtime-data/backups/routine-invalid.json',
            serialized: '{}',
            modifiedAtMs: 400,
          },
          {
            kind: 'operation',
            path: 'runtime-data/backups/operation-valid.json',
            serialized: JSON.stringify(validBackup),
            modifiedAtMs: 300,
          },
        ],
      }),
      desktop_storage_recover: (args) => {
        commands.push({ command: 'desktop_storage_recover', args });
        return JSON.stringify({ recovered: true, preservedCorruptPath: 'corrupt-copy.json' });
      },
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorage(invokeCommand);

    expect(runtime.data).toEqual(validBackup);
    expect(runtime.source).toBe('desktop-backup');
    expect(runtime.warning).toContain('newest valid backup (operation)');
    expect(commands).toHaveLength(1);
    expect(JSON.parse(commands[0].args.serialized as string)).toEqual(validBackup);
  });

  it('copies legacy WebView data once when durable storage has no valid candidate', async () => {
    const legacy = createPlanner('Legacy planner');
    const commands: string[] = [];
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => createBootstrap({ migrationComplete: false }),
      desktop_storage_recover: () => {
        commands.push('recover');
        return JSON.stringify({ recovered: true, preservedCorruptPath: null });
      },
      desktop_storage_mark_migration_complete: () => {
        commands.push('mark');
      },
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorage(
      invokeCommand,
      () => ({ data: legacy, source: 'v2', warning: null }),
      () => '2026-08-28T12:00:00.000Z',
    );

    expect(runtime.data).toEqual(legacy);
    expect(runtime.source).toBe('desktop-migrated-webview');
    expect(runtime.warning).toContain('legacy browser copy was preserved');
    expect(commands).toEqual(['recover', 'mark']);
  });

  it('loads a valid backup without attempting repair when the process is read-only', async () => {
    const backup = createPlanner('Read-only backup');
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => createBootstrap({
        writable: false,
        warning: 'Another process owns desktop storage.',
        backups: [
          {
            kind: 'routine',
            path: 'runtime-data/backups/routine.json',
            serialized: JSON.stringify(backup),
            modifiedAtMs: 100,
          },
        ],
      }),
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorage(invokeCommand);

    expect(runtime.data).toEqual(backup);
    expect(runtime.warning).toContain('read-only instance could not repair');
    expect(runtime.adapter.getStatus()).toMatchObject({
      mode: 'desktop-file',
      writable: false,
      phase: 'read-only',
    });
  });

  it('coalesces queued desktop saves while preserving monotonic write order', async () => {
    const invocations: Array<{
      args: Record<string, unknown>;
      resolve: (value: string) => void;
    }> = [];
    const invokeCommand: TauriInvoke = <T>(command: string, args: Record<string, unknown> = {}) => {
      if (command !== 'desktop_storage_save') throw new Error(`Unexpected command: ${command}`);
      return new Promise<string>((resolve) => {
        invocations.push({ args, resolve });
      }) as Promise<T>;
    };
    const adapter = new DesktopPlannerStorageAdapter(invokeCommand, {
      writable: true,
      dataPath: 'runtime-data/planner-v2.json',
      backupPath: 'runtime-data/backups',
      warning: null,
    });

    const firstPromise = adapter.save(createPlanner('First'));
    await Promise.resolve();
    const secondPromise = adapter.save(createPlanner('Second'));
    const thirdPromise = adapter.save(createPlanner('Third'));

    await expect(secondPromise).resolves.toMatchObject({ saved: false, stale: true, noOp: true });
    expect(invocations).toHaveLength(1);
    invocations[0].resolve(JSON.stringify({
      sequence: invocations[0].args.sequence,
      saved: true,
      stale: false,
      noOp: false,
      savedAt: invocations[0].args.savedAt,
    }));
    await expect(firstPromise).resolves.toMatchObject({ sequence: 1, saved: true });
    await Promise.resolve();

    expect(invocations).toHaveLength(2);
    expect(invocations[1].args.sequence).toBe(3);
    invocations[1].resolve(JSON.stringify({
      sequence: invocations[1].args.sequence,
      saved: true,
      stale: false,
      noOp: false,
      savedAt: invocations[1].args.savedAt,
    }));
    await expect(thirdPromise).resolves.toMatchObject({ sequence: 3, saved: true });
  });

  it('persists and validates desktop Restore recovery through the shared snapshot format', async () => {
    let serializedRecovery: string | null = null;
    let operationSnapshotCount = 0;
    const invokeCommand = createInvoke({
      desktop_storage_create_operation_snapshot: () => {
        operationSnapshotCount += 1;
        return JSON.stringify({ path: 'runtime-data/backups/operation-restore.json' });
      },
      desktop_storage_write_restore_recovery: (args) => {
        serializedRecovery = args.serialized as string;
      },
      desktop_storage_read_restore_recovery: () => serializedRecovery,
      desktop_storage_clear_restore_recovery: () => {
        serializedRecovery = null;
      },
    });
    const adapter = new DesktopPlannerStorageAdapter(invokeCommand, {
      writable: true,
      dataPath: 'runtime-data/planner-v2.json',
      backupPath: 'runtime-data/backups',
      warning: null,
    });
    const previous = createPlanner('Before Restore');
    const replacement = createPlanner('After Restore');

    await expect(adapter.createRestoreRecovery(
      previous,
      replacement,
      '2026-08-28T12:00:00.000Z',
    )).resolves.toBe(true);
    expect(operationSnapshotCount).toBe(1);
    await expect(adapter.loadRestoreRecovery(replacement)).resolves.toEqual(previous);

    await adapter.clearRestoreRecovery();
    expect(serializedRecovery).toBeNull();
  });
});
