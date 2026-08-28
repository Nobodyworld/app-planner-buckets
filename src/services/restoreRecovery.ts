import type { PlannerDataV2 } from '../types/v2';
import { isValidPlannerDataV2 } from '../types/validators';

export const RESTORE_RECOVERY_STORAGE_KEY = 'planner-buckets:restore-recovery-v1';
export const RESTORE_RECOVERY_FORMAT = 'bsp-planner-restore-recovery';
export const RESTORE_RECOVERY_VERSION = 1;

export interface RestoreRecoverySnapshot {
  format: typeof RESTORE_RECOVERY_FORMAT;
  version: typeof RESTORE_RECOVERY_VERSION;
  createdAt: string;
  replacementFingerprint: string;
  previousData: PlannerDataV2;
}

export interface StorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export type SaveRestoreRecoveryResult =
  | { ok: true; snapshot: RestoreRecoverySnapshot }
  | {
    ok: false;
    reason: 'invalid-previous-data' | 'invalid-replacement-data' | 'storage-unavailable';
  };

const canonicalize = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
};

/**
 * Produces a deterministic 64-bit FNV-1a fingerprint over canonical planner JSON.
 * This is an identity guard for retiring stale local recovery state, not a
 * cryptographic authenticity check.
 */
export const fingerprintPlannerData = (data: PlannerDataV2): string => {
  const canonical = canonicalize(data);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, '0');
};

const isRestoreRecoverySnapshot = (value: unknown): value is RestoreRecoverySnapshot => {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RestoreRecoverySnapshot>;

  return (
    snapshot.format === RESTORE_RECOVERY_FORMAT
    && snapshot.version === RESTORE_RECOVERY_VERSION
    && typeof snapshot.createdAt === 'string'
    && snapshot.createdAt.length > 0
    && typeof snapshot.replacementFingerprint === 'string'
    && /^[0-9a-f]{16}$/.test(snapshot.replacementFingerprint)
    && isValidPlannerDataV2(snapshot.previousData)
  );
};

const removeSnapshotBestEffort = (storage: StorageAdapter): void => {
  try {
    storage.removeItem(RESTORE_RECOVERY_STORAGE_KEY);
  } catch {
    // A failed cleanup must not make loading or continuing the planner fail.
  }
};

export const saveRestoreRecoverySnapshot = (
  storage: StorageAdapter,
  previousData: PlannerDataV2,
  replacementData: PlannerDataV2,
  createdAt: string,
): SaveRestoreRecoveryResult => {
  if (!isValidPlannerDataV2(previousData)) {
    return { ok: false, reason: 'invalid-previous-data' };
  }
  if (!isValidPlannerDataV2(replacementData)) {
    return { ok: false, reason: 'invalid-replacement-data' };
  }

  const snapshot: RestoreRecoverySnapshot = {
    format: RESTORE_RECOVERY_FORMAT,
    version: RESTORE_RECOVERY_VERSION,
    createdAt,
    replacementFingerprint: fingerprintPlannerData(replacementData),
    previousData,
  };

  try {
    storage.setItem(RESTORE_RECOVERY_STORAGE_KEY, JSON.stringify(snapshot));
    return { ok: true, snapshot };
  } catch {
    return { ok: false, reason: 'storage-unavailable' };
  }
};

export const loadRestoreRecoverySnapshot = (
  storage: StorageAdapter,
  currentData: PlannerDataV2,
): RestoreRecoverySnapshot | null => {
  let serialized: string | null;
  try {
    serialized = storage.getItem(RESTORE_RECOVERY_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!serialized) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    removeSnapshotBestEffort(storage);
    return null;
  }

  if (!isRestoreRecoverySnapshot(parsed)) {
    removeSnapshotBestEffort(storage);
    return null;
  }

  // Invalid current state cannot be compared safely. Preserve the validated
  // recovery snapshot so a later repair path does not lose the prior planner.
  if (!isValidPlannerDataV2(currentData)) return null;

  if (parsed.replacementFingerprint !== fingerprintPlannerData(currentData)) {
    removeSnapshotBestEffort(storage);
    return null;
  }

  return parsed;
};

export const clearRestoreRecoverySnapshot = (storage: StorageAdapter): void => {
  removeSnapshotBestEffort(storage);
};
