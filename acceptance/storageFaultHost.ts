import type { PlannerDataV2 } from '../src/types/v2';
import { isValidPlannerDataV2 } from '../src/types/validators';
import type { TauriInvoke } from '../src/storage/plannerStorageRuntime';

const copy = (value: PlannerDataV2): PlannerDataV2 => JSON.parse(JSON.stringify(value)) as PlannerDataV2;
/** Synthetic command boundary only. This module never imports Tauri invoke or writes files/storage. */
export function createStorageFaultHost(initial: PlannerDataV2) {
  if (!isValidPlannerDataV2(initial)) throw new Error('The harness requires valid synthetic planner data.');
  let durable = copy(initial);
  let failNext = false;
  let lastSequence = 0;
  let attempts = 0;
  let failures = 0;
  const invokeCommand: TauriInvoke = async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    if (args.session !== 1) throw new Error('Unexpected synthetic session.');
    if (command === 'desktop_storage_list_backups') return '[]' as T;
    if (command === 'desktop_storage_prune_backups') return undefined as T;
    if (command === 'desktop_storage_read_restore_recovery') return null as T;
    if (command === 'desktop_storage_clear_restore_recovery') return undefined as T;
    if (command !== 'desktop_storage_save') throw new Error(`Unsupported harness command: ${command}. Use the normal app for non-fault acceptance.`);
    attempts += 1;
    if (failNext) {
      failNext = false;
      failures += 1;
      throw new Error('Synthetic acceptance write failure; persisted fixture is unchanged.');
    }
    if (typeof args.serialized !== 'string' || typeof args.sequence !== 'number' || typeof args.savedAt !== 'string') {
      throw new Error('Malformed synthetic write.');
    }
    const next: unknown = JSON.parse(args.serialized);
    if (!isValidPlannerDataV2(next) || args.sequence <= lastSequence) throw new Error('Invalid or stale synthetic planner write.');
    const noOp = JSON.stringify(durable) === args.serialized;
    durable = copy(next as PlannerDataV2);
    lastSequence = args.sequence;
    return JSON.stringify({ sequence: lastSequence, saved: true, stale: false, noOp, savedAt: args.savedAt }) as T;
  };
  return {
    invokeCommand,
    armFailure: (): void => { failNext = true; },
    inspect: () => ({ kind: 'SYNTHETIC_MEMORY_NOT_NATIVE_DISK', armed: failNext, attempts, failures, durable: copy(durable) }),
  };
}
