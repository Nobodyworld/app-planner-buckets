import type { PlannerDataV2 } from '../types/v2';
import type { PlannerStorageStatus, RestorePhase } from './plannerStorageRuntime';

export type RuntimeStorageStatus = Partial<PlannerStorageStatus> & { writable: boolean };
export interface RuntimeSaveTarget {
  mode: 'browser-local-storage' | 'desktop-file';
  getStatus(): RuntimeStorageStatus;
  subscribe?: (listener: (status: RuntimeStorageStatus) => void) => () => void;
  save(data: PlannerDataV2): Promise<unknown>;
  flush?: () => Promise<void>;
  retry?: () => Promise<void>;
  getRestoreRecovery?: (data: PlannerDataV2) => PlannerDataV2 | null;
  clearRestoreRecovery?: () => Promise<void>;
  replacePlanner?: (previous: PlannerDataV2, replacement: PlannerDataV2, keepUndo: boolean, signal: AbortSignal, onPhase: (phase: RestorePhase) => void) => Promise<boolean>;
}
interface RuntimeBootstrapSeed { data: PlannerDataV2; warning: string | null }
let bootstrapSeed: RuntimeBootstrapSeed | null = null;
let saveTarget: RuntimeSaveTarget | null = null;

export const registerPlannerStorageRuntimeBridge = (target: RuntimeSaveTarget, data: PlannerDataV2, warning: string | null): void => {
  bootstrapSeed = { data, warning };
  saveTarget = target;
};
export const getPlannerStorageRuntimeBootstrap = (): RuntimeBootstrapSeed | null => bootstrapSeed ? { ...bootstrapSeed } : null;
export const getPlannerStorageRuntimeTarget = (): RuntimeSaveTarget | null => saveTarget;
export const isDesktopPlannerStorage = (): boolean => saveTarget?.mode === 'desktop-file';
/** Compatibility boundary: browser calls stay synchronous; desktop callers receive the durable result. */
export const forwardPlannerSaveToRuntime = (data: PlannerDataV2): Promise<void> | false => {
  if (!saveTarget || saveTarget.mode !== 'desktop-file') return false;
  if (!saveTarget.getStatus().writable) throw new Error('Desktop planner storage is read-only; changes cannot be saved from this instance.');
  return saveTarget.save(data).then(() => undefined);
};
export const resetPlannerStorageRuntimeBridgeForTests = (): void => { bootstrapSeed = null; saveTarget = null; };
