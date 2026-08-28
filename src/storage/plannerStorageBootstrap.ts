import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  createRuntimeInitialPlannerDataV2,
  loadPlannerDataV2FromLocalStorage,
  type PlannerDataV2LoadResult,
} from '../services/plannerPersistence';
import type { PlannerDataV2 } from '../types/v2';
import { isValidPlannerDataV2 } from '../types/validators';
import {
  bootstrapBrowserPlannerStorage,
  bootstrapDesktopPlannerStorage,
  DesktopPlannerStorageAdapter,
  type PlannerStorageRuntime,
  type TauriInvoke,
} from './plannerStorageRuntime';

interface BootstrapCandidate {
  serialized: string;
}

interface BootstrapPreflight {
  writable: boolean;
  dataPath: string;
  backupPath: string;
  migrationComplete: boolean;
  primary: BootstrapCandidate | null;
  backups: BootstrapCandidate[];
  warning: string | null;
}

const parseCandidate = (value: unknown): BootstrapCandidate | null => {
  if (!value || typeof value !== 'object') return null;
  const serialized = (value as { serialized?: unknown }).serialized;
  return typeof serialized === 'string' ? { serialized } : null;
};

const parsePreflight = (serialized: string): BootstrapPreflight => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Desktop storage bootstrap returned malformed JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Desktop storage bootstrap returned an unsupported response.');
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.writable !== 'boolean'
    || typeof payload.dataPath !== 'string'
    || typeof payload.backupPath !== 'string'
    || typeof payload.migrationComplete !== 'boolean'
    || (payload.warning !== null && typeof payload.warning !== 'string')
  ) {
    throw new Error('Desktop storage bootstrap returned incomplete status information.');
  }

  return {
    writable: payload.writable,
    dataPath: payload.dataPath,
    backupPath: payload.backupPath,
    migrationComplete: payload.migrationComplete,
    primary: parseCandidate(payload.primary),
    backups: Array.isArray(payload.backups)
      ? payload.backups.map(parseCandidate).filter((candidate): candidate is BootstrapCandidate => Boolean(candidate))
      : [],
    warning: payload.warning as string | null,
  };
};

const candidateIsValid = (candidate: BootstrapCandidate | null): boolean => {
  if (!candidate) return false;
  try {
    return isValidPlannerDataV2(JSON.parse(candidate.serialized) as unknown);
  } catch {
    return false;
  }
};

const createLocalDay = (date: Date): string => {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const initializeFreshPostMigrationPlanner = async (
  preflight: BootstrapPreflight,
  invokeCommand: TauriInvoke,
  createTimestamp: () => string,
): Promise<PlannerStorageRuntime> => {
  const timestamp = createTimestamp();
  const data = createRuntimeInitialPlannerDataV2(() => timestamp);
  const warningParts = [preflight.warning];

  if (preflight.writable) {
    await invokeCommand<string>('desktop_storage_recover', {
      serialized: JSON.stringify(data),
      localDay: createLocalDay(new Date(timestamp)),
      timestamp,
    });
    warningParts.push(
      'No valid durable desktop candidate remained after migration, so Planner Buckets initialized a new desktop planner. Legacy WebView data was not imported again.',
    );
  } else {
    warningParts.push(
      'No valid durable desktop candidate remained after migration. This read-only instance opened a new planner in memory and cannot save it; legacy WebView data was not imported again.',
    );
  }

  const warning = warningParts.filter(Boolean).join(' ') || null;
  const adapter = new DesktopPlannerStorageAdapter(invokeCommand, {
    writable: preflight.writable,
    dataPath: preflight.dataPath,
    backupPath: preflight.backupPath,
    warning,
  });
  const restoreRecovery = await adapter.loadRestoreRecovery(data);

  return {
    adapter,
    data,
    source: 'new',
    warning,
    restoreRecovery,
  };
};

export const bootstrapDesktopPlannerStorageSafely = async (
  invokeCommand: TauriInvoke = invoke,
  loadBrowserData: () => PlannerDataV2LoadResult = loadPlannerDataV2FromLocalStorage,
  createTimestamp: () => string = () => new Date().toISOString(),
): Promise<PlannerStorageRuntime> => {
  const preflightSerialized = await invokeCommand<string>('desktop_storage_bootstrap');
  const preflight = parsePreflight(preflightSerialized);
  const validPrimary = candidateIsValid(preflight.primary);
  const hasValidBackup = preflight.backups.some(candidateIsValid);

  if (preflight.migrationComplete && !validPrimary && !hasValidBackup) {
    return initializeFreshPostMigrationPlanner(preflight, invokeCommand, createTimestamp);
  }

  return bootstrapDesktopPlannerStorage(
    invokeCommand,
    loadBrowserData,
    createTimestamp,
  );
};

export const bootstrapPlannerStorageRuntime = async (): Promise<PlannerStorageRuntime> => {
  if (isTauri()) {
    return bootstrapDesktopPlannerStorageSafely();
  }
  return bootstrapBrowserPlannerStorage();
};

export const createPostMigrationPlannerForTests = (
  timestamp: string,
): PlannerDataV2 => createRuntimeInitialPlannerDataV2(() => timestamp);
