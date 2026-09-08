import { describe, expect, it, vi } from 'vitest';
import { checkDesktopUpdate, installDesktopUpdate, type UpdaterInvoke } from './desktopUpdater';

describe('desktop updater service', () => {
  it('parses signed update metadata from the constrained native command', async () => {
    const invokeCommand: UpdaterInvoke = vi.fn(async () => JSON.stringify({
      configured: true,
      available: true,
      currentVersion: '1.1.0',
      version: '1.2.0',
      notes: 'Durable update test',
    })) as UpdaterInvoke;

    await expect(checkDesktopUpdate(invokeCommand)).resolves.toEqual({
      configured: true,
      available: true,
      currentVersion: '1.1.0',
      version: '1.2.0',
      notes: 'Durable update test',
    });
  });

  it('flushes through the storage context before invoking native install', async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invokeCommand: UpdaterInvoke = async (command, args) => {
      calls.push({ command, args });
      return undefined;
    };
    const prepareInstall = vi.fn(async () => ({
      serialized: '{"version":2}',
      session: 7,
    }));

    await installDesktopUpdate(
      invokeCommand,
      prepareInstall,
      () => '2026-09-07T12:00:00.000Z',
    );

    expect(prepareInstall).toHaveBeenCalledOnce();
    expect(calls).toEqual([{
      command: 'desktop_update_install',
      args: {
        serialized: '{"version":2}',
        session: 7,
        timestamp: '2026-09-07T12:00:00.000Z',
      },
    }]);
  });

  it('rejects incomplete native update metadata', async () => {
    const invokeCommand: UpdaterInvoke = async () => JSON.stringify({ configured: true });
    await expect(checkDesktopUpdate(invokeCommand)).rejects.toThrow('incomplete status');
  });
});
