import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createInitialPlannerDataV2, type PlannerDataV2 } from './types/v2';
import { RESTORE_RECOVERY_STORAGE_KEY } from './services/restoreRecovery';
import { registerPlannerStorageRuntimeBridge, resetPlannerStorageRuntimeBridgeForTests } from './storage/plannerStorageBridge';
import { DesktopPlannerStorageAdapter, type TauriInvoke } from './storage/plannerStorageRuntime';

const planner = (name: string): PlannerDataV2 => { const data = createInitialPlannerDataV2('2026-08-28T00:00:00Z'); return { ...data, projects: data.projects.map((p) => ({ ...p, name })) }; };
const gate = () => { let resolve!: () => void; const promise = new Promise<void>((yes) => { resolve = yes; }); return { promise, resolve }; };
const setup = () => {
  const before = planner('Before');
  const state = { current: before, recovery: null as string | null, failCommit: false, prepareGate: null as ReturnType<typeof gate> | null, commitGate: null as ReturnType<typeof gate> | null, commits: 0 };
  const invoke: TauriInvoke = async <T,>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    if (command === 'desktop_storage_save') { state.current = JSON.parse(args.serialized as string); return JSON.stringify({ sequence: args.sequence, saved: true, stale: false, noOp: false, savedAt: args.savedAt }) as T; }
    if (command === 'desktop_storage_list_backups') return '[]' as T;
    if (command === 'desktop_storage_prune_backups') return undefined as T;
    if (command === 'desktop_storage_create_operation_snapshot') { await state.prepareGate?.promise; return JSON.stringify({ name: 'operation-test-restore.json' }) as T; }
    if (command === 'desktop_storage_commit_restore') {
      state.commits++; await state.commitGate?.promise;
      if (state.failCommit) throw new Error('injected promotion failure');
      const request = JSON.parse(args.request as string); expect(JSON.parse(request.expected)).toEqual(state.current);
      state.current = JSON.parse(request.serialized); state.recovery = request.recovery;
      return JSON.stringify({ sequence: request.sequence, saved: true }) as T;
    }
    if (command === 'desktop_storage_read_restore_recovery') return state.recovery as T;
    if (command === 'desktop_storage_clear_restore_recovery') { state.recovery = null; return undefined as T; }
    throw new Error(`Unexpected native command: ${command}`);
  };
  const adapter = new DesktopPlannerStorageAdapter(invoke, { writable: true, session: 1, dataPath: 'runtime-data/planner-v2.json', backupPath: 'runtime-data/backups', warning: null });
  registerPlannerStorageRuntimeBridge(adapter, before, null);
  render(<App />);
  return { state, adapter };
};
const selectReplacement = async () => {
  fireEvent.click(screen.getByRole('button', { name: /^Data$/ }));
  const file = { name: 'synthetic.json', text: vi.fn(async () => JSON.stringify(planner('After'))) };
  fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), { target: { files: [file] } });
  await screen.findByRole('button', { name: 'Confirm restore' });
  expect(file.text).toHaveBeenCalledOnce();
  return file;
};
beforeEach(() => { resetPlannerStorageRuntimeBridgeForTests(); localStorage.clear(); });
describe('App durable storage transaction integration', () => {
  it('restores and undoes without writing the WebView recovery key', async () => {
    const { state, adapter } = setup(); await act(async () => { await adapter.flush(); });
    const original = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === RESTORE_RECOVERY_STORAGE_KEY) throw new Error('WebView recovery unavailable');
      original.call(this, key, value);
    });
    try {
      await selectReplacement(); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
      await waitFor(() => { expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('After'); });
      expect(state.current).toEqual(planner('After')); expect(adapter.getRestoreRecovery(state.current)).toEqual(planner('Before'));
      fireEvent.click(screen.getByRole('button', { name: 'Undo restore' }));
      await waitFor(() => { expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('Before'); });
      expect(state.current).toEqual(planner('Before')); expect(state.recovery).toBeNull();
      expect(setItem.mock.calls.some(([key]) => key === RESTORE_RECOVERY_STORAGE_KEY)).toBe(false);
    } finally { setItem.mockRestore(); }
  });
  it('cancels during preparation without applying the stale confirmation callback', async () => {
    const { state, adapter } = setup(); await act(async () => { await adapter.flush(); }); state.prepareGate = gate();
    await selectReplacement(); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel durable restore' }));
    await act(async () => { state.prepareGate!.resolve(); await adapter.flush(); });
    expect(state.commits).toBe(0); expect(state.current).toEqual(planner('Before')); expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('Before');
  });
  it('disables cancellation at commit and only updates planner state after native success', async () => {
    const { state, adapter } = setup(); await act(async () => { await adapter.flush(); }); state.commitGate = gate();
    await selectReplacement(); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Cancel durable restore' })).toBeDisabled(); });
    expect(document.querySelector('main')).toHaveAttribute('inert'); expect(state.current).toEqual(planner('Before'));
    await act(async () => { state.commitGate!.resolve(); await adapter.flush(); });
    await waitFor(() => { expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('After'); });
  });
  it('preserves state after a failed native replacement instead of reporting success', async () => {
    const { state, adapter } = setup(); await act(async () => { await adapter.flush(); }); state.failCommit = true;
    await selectReplacement(); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    expect(await screen.findByText(/Restore failed: injected promotion failure/)).toBeInTheDocument(); expect(state.current).toEqual(planner('Before')); expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('Before');
  });
  it('keeps Undo recovery when native Undo fails', async () => {
    const { state, adapter } = setup(); await act(async () => { await adapter.flush(); });
    await selectReplacement(); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    await waitFor(() => { expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('After'); });
    const recovery = state.recovery; state.failCommit = true;
    fireEvent.click(screen.getByRole('button', { name: 'Undo restore' }));
    await screen.findByText(/Restore failed: injected promotion failure/);
    expect(state.current).toEqual(planner('After')); expect(state.recovery).toBe(recovery); expect(adapter.getRestoreRecovery(state.current)).toEqual(planner('Before'));
  });
});
