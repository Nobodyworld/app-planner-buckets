import { describe, expect, it, vi } from 'vitest';
import { installDesktopCloseGuard } from './plannerStorageLifecycle';
import type { PlannerStorageStatus } from './plannerStorageRuntime';

const status = (phase: PlannerStorageStatus['phase'] = 'saved'): PlannerStorageStatus => ({ mode: 'desktop-file', writable: true, phase, dataPath: null, backupPath: null, lastSavedAt: null, warning: null, error: null });
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe('desktop close handshake', () => {
  it('drains queued work before allowing native close and coalesces repeated requests', async () => {
    let resolve!: () => void; const pending = new Promise<void>((yes) => { resolve = yes; }); let close!: () => void;
    const finish = vi.fn(async () => undefined); const unsubscribe = vi.fn(); const flush = vi.fn(() => pending);
    const dispose = await installDesktopCloseGuard({ flush, getStatus: () => status('saving') }, async (handler) => { close = handler; return unsubscribe; }, { enable: async () => undefined, finish });
    close(); close(); expect(flush).toHaveBeenCalledOnce(); expect(finish).not.toHaveBeenCalled();
    resolve(); await settle(); expect(finish).toHaveBeenCalledOnce(); dispose(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('keeps the window open and reports a failed save rather than acknowledging close', async () => {
    let close!: () => void; const finish = vi.fn(async () => undefined); const report = vi.fn();
    const dispose = await installDesktopCloseGuard({ flush: async () => { throw new Error('unsaved changes'); }, getStatus: () => status('error') }, async (handler) => { close = handler; return () => undefined; }, { enable: async () => undefined, finish }, report);
    close(); await settle(); expect(finish).not.toHaveBeenCalled(); expect(report).toHaveBeenCalledWith('Close was cancelled: unsaved changes'); dispose();
  });
  it('removes the listener if enabling the native guard fails', async () => {
    const unsubscribe = vi.fn();
    await expect(installDesktopCloseGuard({ flush: async () => undefined, getStatus: () => status() }, async () => unsubscribe, { enable: async () => { throw new Error('denied'); }, finish: async () => undefined })).rejects.toThrow('denied');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
