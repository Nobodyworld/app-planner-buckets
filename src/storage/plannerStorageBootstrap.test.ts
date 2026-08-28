import { describe, expect, it, vi } from 'vitest';
import { createInitialPlannerDataV2 } from '../types/v2';
import {
  bootstrapDesktopPlannerStorageSafely,
  createPostMigrationPlannerForTests,
} from './plannerStorageBootstrap';
import type { TauriInvoke } from './plannerStorageRuntime';

const createInvoke = (
  handlers: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>,
): TauriInvoke => async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
  const handler = handlers[command];
  if (!handler) throw new Error(`Unexpected command: ${command}`);
  return await handler(args) as T;
};

const bootstrapPayload = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  writable: true,
  dataPath: 'runtime-data/planner-v2.json',
  backupPath: 'runtime-data/backups',
  migrationComplete: true,
  primary: null,
  backups: [],
  warning: null,
  ...overrides,
});

describe('post-migration desktop bootstrap', () => {
  it('creates a new durable planner without reading stale WebView data', async () => {
    const recover = vi.fn(() => JSON.stringify({ recovered: true, preservedCorruptPath: null }));
    const loadBrowserData = vi.fn(() => ({
      data: createInitialPlannerDataV2('2000-01-01T00:00:00.000Z'),
      source: 'v2' as const,
      warning: null,
    }));
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => bootstrapPayload(),
      desktop_storage_recover: recover,
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorageSafely(
      invokeCommand,
      loadBrowserData,
      () => '2026-08-28T12:00:00.000Z',
    );

    expect(loadBrowserData).not.toHaveBeenCalled();
    expect(runtime.source).toBe('new');
    expect(runtime.data).toEqual(
      createPostMigrationPlannerForTests('2026-08-28T12:00:00.000Z'),
    );
    expect(runtime.warning).toContain('Legacy WebView data was not imported again');
    expect(recover).toHaveBeenCalledOnce();
  });

  it('opens a fresh in-memory planner when the migrated desktop store is read-only', async () => {
    const loadBrowserData = vi.fn(() => ({
      data: createInitialPlannerDataV2('2000-01-01T00:00:00.000Z'),
      source: 'v2' as const,
      warning: null,
    }));
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => bootstrapPayload({
        writable: false,
        warning: 'Another process owns desktop storage.',
      }),
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorageSafely(
      invokeCommand,
      loadBrowserData,
      () => '2026-08-28T12:00:00.000Z',
    );

    expect(loadBrowserData).not.toHaveBeenCalled();
    expect(runtime.source).toBe('new');
    expect(runtime.adapter.getStatus()).toMatchObject({
      writable: false,
      phase: 'read-only',
    });
    expect(runtime.warning).toContain('cannot save it');
  });

  it('delegates to one-time WebView migration while the marker is incomplete', async () => {
    const legacy = createInitialPlannerDataV2('2026-08-28T00:00:00.000Z');
    const loadBrowserData = vi.fn(() => ({
      data: legacy,
      source: 'v2' as const,
      warning: null,
    }));
    const calls: string[] = [];
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => bootstrapPayload({ migrationComplete: false }),
      desktop_storage_recover: () => {
        calls.push('recover');
        return JSON.stringify({ recovered: true, preservedCorruptPath: null });
      },
      desktop_storage_mark_migration_complete: () => {
        calls.push('mark');
      },
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorageSafely(
      invokeCommand,
      loadBrowserData,
      () => '2026-08-28T12:00:00.000Z',
    );

    expect(loadBrowserData).toHaveBeenCalledOnce();
    expect(runtime.data).toEqual(legacy);
    expect(runtime.source).toBe('desktop-migrated-webview');
    expect(calls).toEqual(['recover', 'mark']);
  });

  it('does not suppress a valid backup merely because migration completed', async () => {
    const backup = createInitialPlannerDataV2('2026-08-28T00:00:00.000Z');
    const invokeCommand = createInvoke({
      desktop_storage_bootstrap: () => bootstrapPayload({
        primary: {
          kind: 'primary',
          path: 'runtime-data/planner-v2.json',
          serialized: '{broken',
          modifiedAtMs: 200,
        },
        backups: [
          {
            kind: 'routine',
            path: 'runtime-data/backups/routine.json',
            serialized: JSON.stringify(backup),
            modifiedAtMs: 100,
          },
        ],
      }),
      desktop_storage_recover: () => JSON.stringify({
        recovered: true,
        preservedCorruptPath: 'runtime-data/backups/corrupt.json',
      }),
      desktop_storage_read_restore_recovery: () => null,
    });

    const runtime = await bootstrapDesktopPlannerStorageSafely(invokeCommand);

    expect(runtime.data).toEqual(backup);
    expect(runtime.source).toBe('desktop-backup');
  });
});
