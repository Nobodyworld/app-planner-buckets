import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PlannerStorageAdapter } from './plannerStorageRuntime';

type SubscribeClose = (handler: () => void) => Promise<() => void>;
interface CloseCommands { enable(): Promise<void>; finish(): Promise<void> }
/** Native close is acknowledged only after the latest queued write/transaction settles. */
export const installDesktopCloseGuard = async (
  adapter: Pick<PlannerStorageAdapter, 'flush' | 'getStatus'>,
  subscribe: SubscribeClose = (handler) => listen('planner-storage-close-requested', handler),
  commands: CloseCommands = {
    enable: () => invoke('desktop_storage_enable_close_guard'),
    finish: () => invoke('desktop_storage_finish_close'),
  },
  reportFailure: (message: string) => void = (message) => {
    window.dispatchEvent(new CustomEvent('planner-storage-close-blocked', { detail: message }));
  },
): Promise<() => void> => {
  let closing = false;
  const unsubscribe = await subscribe(() => {
    if (closing) return;
    closing = true;
    void (async () => {
      try { await adapter.flush(); await commands.finish(); }
      catch (error) { reportFailure(`Close was cancelled: ${error instanceof Error ? error.message : String(error)}`); }
      finally { closing = false; }
    })();
  });
  const beforeUnload = (event: BeforeUnloadEvent): void => {
    if (adapter.getStatus().phase === 'saving' || adapter.getStatus().phase === 'error') {
      event.preventDefault(); event.returnValue = '';
    }
  };
  try { await commands.enable(); }
  catch (error) { unsubscribe(); throw error; }
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); };
};
