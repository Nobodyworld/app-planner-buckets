import { useEffect, useLayoutEffect } from 'react';
import type { PlannerDataV2 } from '../types/v2';
import { savePlannerDataV2ToLocalStorage } from '../services/plannerPersistence';
import { getPlannerStorageRuntimeTarget, type RuntimeStorageStatus } from '../storage/plannerStorageBridge';

export const describeStorageSave = (status: RuntimeStorageStatus): string => {
  if (!status.writable || status.phase === 'read-only') return 'Read-only — changes cannot be saved';
  if (status.phase === 'saving') return 'Saving…';
  if (status.phase === 'error') return `Could not save: ${status.error ?? 'storage error'}`;
  if (status.phase === 'saved') return 'Saved locally';
  return 'Storage ready';
};
export function usePlannerStoragePersistence(data: PlannerDataV2, report: (message: string) => void, suspended = false): void {
  // Queue the committed React state before the next paint/native close event.
  useLayoutEffect(() => {
    let active = true;
    const target = getPlannerStorageRuntimeTarget();
    const unsubscribe = target?.subscribe?.((status) => { if (active) report(describeStorageSave(status)); });
    if (!suspended) {
      try {
        if (target) {
          void target.save(data).catch((error: unknown) => {
            if (active) report(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
          });
        } else {
          const result = savePlannerDataV2ToLocalStorage(data);
          if (result) {
            report('Saving…');
            void result.then(() => { if (active) report('Saved locally'); }, () => { if (active) report('Could not save locally'); });
          } else report('Saved locally');
        }
      } catch { report('Could not save locally'); }
    }
    return () => { active = false; unsubscribe?.(); };
  }, [data, report, suspended]);
  useEffect(() => {
    const blocked = (event: Event): void => { report(String((event as CustomEvent).detail)); };
    window.addEventListener('planner-storage-close-blocked', blocked);
    return () => window.removeEventListener('planner-storage-close-blocked', blocked);
  }, [report]);
}
