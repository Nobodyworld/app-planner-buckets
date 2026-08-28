import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  loadPlannerDataV2FromLocalStorage,
  savePlannerDataV2ToLocalStorage,
  type PlannerDataV2LoadResult,
} from '../services/plannerPersistence';
import {
  clearRestoreRecoverySnapshot,
  loadRestoreRecoverySnapshot,
  RESTORE_RECOVERY_STORAGE_KEY,
  saveRestoreRecoverySnapshot,
  type StorageAdapter as RecoveryStorageAdapter,
} from '../services/restoreRecovery';
import type { PlannerDataV2 } from '../types/v2';
import { isValidPlannerDataV2 } from '../types/validators';

export type PlannerStorageMode = 'browser-local-storage' | 'desktop-file';
export type PlannerStorageSavePhase = 'idle' | 'saving' | 'saved' | 'error' | 'read-only';
export type PlannerStorageLoadSource =
  | PlannerDataV2LoadResult['source']
  | 'desktop-primary'
  | 'desktop-backup'
  | 'desktop-migrated-webview';

export interface PlannerStorageStatus {
  mode: PlannerStorageMode;
  writable: boolean;
  phase: PlannerStorageSavePhase;
  dataPath: string | null;
  backupPath: string | null;
  lastSavedAt: string | null;
  warning: string | null;
  error: string | null;
}

export interface PlannerStorageSaveResult {
  sequence: number;
  saved: boolean;
  stale: boolean;
  noOp: boolean;
  savedAt: string;
}

export interface PlannerStorageRuntime {
  adapter: PlannerStorageAdapter;
  data: PlannerDataV2;
  source: PlannerStorageLoadSource;
  warning: string | null;
  restoreRecovery: PlannerDataV2 | null;
}

export interface PlannerStorageAdapter {
  readonly mode: PlannerStorageMode;
  getStatus: () => PlannerStorageStatus;
  subscribe: (listener: (status: PlannerStorageStatus) => void) => () => void;
  save: (data: PlannerDataV2) => Promise<PlannerStorageSaveResult>;
  createRestoreRecovery: (
    previousData: PlannerDataV2,
    replacementData: PlannerDataV2,
    createdAt: string,
  ) => Promise<boolean>;
  loadRestoreRecovery: (currentData: PlannerDataV2) => Promise<PlannerDataV2 | null>;
  clearRestoreRecovery: () => Promise<void>;
}

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface DesktopCandidate {
  kind: 'primary' | 'previous' | 'routine' | 'operation';
  path: string;
  serialized: string;
  modifiedAtMs: number;
}

interface DesktopBootstrapPayload {
  writable: boolean;
  dataPath: string;
  backupPath: string;
  migrationComplete: boolean;
  primary: DesktopCandidate | null;
  backups: DesktopCandidate[];
  warning: string | null;
}

interface DesktopSavePayload {
  sequence: number;
  saved: boolean;
  stale: boolean;
  noOp: boolean;
  savedAt: string;
}

interface PendingDesktopSave {
  data: PlannerDataV2;
  sequence: number;
  savedAt: string;
  resolve: (result: PlannerStorageSaveResult) => void;
  reject: (error: Error) => void;
}

const createLocalDay = (date: Date): string => {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseJsonObject = (serialized: string, label: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} returned an unsupported response.`);
  }
  return parsed as Record<string, unknown>;
};

const parsePlannerCandidate = (candidate: DesktopCandidate | null): PlannerDataV2 | null => {
  if (!candidate) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.serialized);
    return isValidPlannerDataV2(parsed) ? parsed as PlannerDataV2 : null;
  } catch {
    return null;
  }
};

const isDesktopCandidate = (value: unknown): value is DesktopCandidate => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DesktopCandidate>;
  return (
    (candidate.kind === 'primary'
      || candidate.kind === 'previous'
      || candidate.kind === 'routine'
      || candidate.kind === 'operation')
    && typeof candidate.path === 'string'
    && typeof candidate.serialized === 'string'
    && typeof candidate.modifiedAtMs === 'number'
    && Number.isFinite(candidate.modifiedAtMs)
  );
};

const parseDesktopBootstrap = (serialized: string): DesktopBootstrapPayload => {
  const parsed = parseJsonObject(serialized, 'Desktop storage bootstrap');
  const primary = parsed.primary === null
    ? null
    : isDesktopCandidate(parsed.primary)
      ? parsed.primary
      : null;
  const backups = Array.isArray(parsed.backups)
    ? parsed.backups.filter(isDesktopCandidate)
    : [];

  if (
    typeof parsed.writable !== 'boolean'
    || typeof parsed.dataPath !== 'string'
    || typeof parsed.backupPath !== 'string'
    || typeof parsed.migrationComplete !== 'boolean'
    || (parsed.warning !== null && typeof parsed.warning !== 'string')
  ) {
    throw new Error('Desktop storage bootstrap returned incomplete status information.');
  }

  return {
    writable: parsed.writable,
    dataPath: parsed.dataPath,
    backupPath: parsed.backupPath,
    migrationComplete: parsed.migrationComplete,
    primary,
    backups,
    warning: parsed.warning as string | null,
  };
};

const parseDesktopSave = (serialized: string): DesktopSavePayload => {
  const parsed = parseJsonObject(serialized, 'Desktop storage save');
  if (
    typeof parsed.sequence !== 'number'
    || typeof parsed.saved !== 'boolean'
    || typeof parsed.stale !== 'boolean'
    || typeof parsed.noOp !== 'boolean'
    || typeof parsed.savedAt !== 'string'
  ) {
    throw new Error('Desktop storage save returned incomplete result information.');
  }
  return parsed as unknown as DesktopSavePayload;
};

const createMemoryStorage = (initialValue: string | null = null): RecoveryStorageAdapter & {
  read: () => string | null;
} => {
  let value = initialValue;
  return {
    getItem: (key) => key === RESTORE_RECOVERY_STORAGE_KEY ? value : null,
    setItem: (key, nextValue) => {
      if (key === RESTORE_RECOVERY_STORAGE_KEY) value = nextValue;
    },
    removeItem: (key) => {
      if (key === RESTORE_RECOVERY_STORAGE_KEY) value = null;
    },
    read: () => value,
  };
};

const copyStatus = (status: PlannerStorageStatus): PlannerStorageStatus => ({ ...status });

abstract class ObservablePlannerStorageAdapter implements PlannerStorageAdapter {
  abstract readonly mode: PlannerStorageMode;
  protected status: PlannerStorageStatus;
  private readonly listeners = new Set<(status: PlannerStorageStatus) => void>();

  protected constructor(initialStatus: PlannerStorageStatus) {
    this.status = initialStatus;
  }

  getStatus = (): PlannerStorageStatus => copyStatus(this.status);

  subscribe = (listener: (status: PlannerStorageStatus) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  };

  protected updateStatus(next: Partial<PlannerStorageStatus>): void {
    this.status = { ...this.status, ...next };
    const snapshot = this.getStatus();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  abstract save(data: PlannerDataV2): Promise<PlannerStorageSaveResult>;
  abstract createRestoreRecovery(
    previousData: PlannerDataV2,
    replacementData: PlannerDataV2,
    createdAt: string,
  ): Promise<boolean>;
  abstract loadRestoreRecovery(currentData: PlannerDataV2): Promise<PlannerDataV2 | null>;
  abstract clearRestoreRecovery(): Promise<void>;
}

export class BrowserPlannerStorageAdapter extends ObservablePlannerStorageAdapter {
  readonly mode = 'browser-local-storage' as const;
  private sequence = 0;

  constructor(private readonly storage: RecoveryStorageAdapter = localStorage) {
    super({
      mode: 'browser-local-storage',
      writable: true,
      phase: 'idle',
      dataPath: null,
      backupPath: null,
      lastSavedAt: null,
      warning: null,
      error: null,
    });
  }

  save = async (data: PlannerDataV2): Promise<PlannerStorageSaveResult> => {
    const sequence = ++this.sequence;
    const savedAt = new Date().toISOString();
    this.updateStatus({ phase: 'saving', error: null });
    try {
      savePlannerDataV2ToLocalStorage(data);
      this.updateStatus({ phase: 'saved', lastSavedAt: savedAt, error: null });
      return { sequence, saved: true, stale: false, noOp: false, savedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser storage could not save planner data.';
      this.updateStatus({ phase: 'error', error: message });
      throw new Error(message);
    }
  };

  createRestoreRecovery = async (
    previousData: PlannerDataV2,
    replacementData: PlannerDataV2,
    createdAt: string,
  ): Promise<boolean> => (
    saveRestoreRecoverySnapshot(
      this.storage,
      previousData,
      replacementData,
      createdAt,
    ).ok
  );

  loadRestoreRecovery = async (currentData: PlannerDataV2): Promise<PlannerDataV2 | null> => (
    loadRestoreRecoverySnapshot(this.storage, currentData)?.previousData ?? null
  );

  clearRestoreRecovery = async (): Promise<void> => {
    clearRestoreRecoverySnapshot(this.storage);
  };
}

export class DesktopPlannerStorageAdapter extends ObservablePlannerStorageAdapter {
  readonly mode = 'desktop-file' as const;
  private nextSequence = 0;
  private pending: PendingDesktopSave | null = null;
  private draining = false;

  constructor(
    private readonly invokeCommand: TauriInvoke,
    status: Pick<PlannerStorageStatus, 'writable' | 'dataPath' | 'backupPath' | 'warning'>,
  ) {
    super({
      mode: 'desktop-file',
      writable: status.writable,
      phase: status.writable ? 'idle' : 'read-only',
      dataPath: status.dataPath,
      backupPath: status.backupPath,
      lastSavedAt: null,
      warning: status.warning,
      error: null,
    });
  }

  save = (data: PlannerDataV2): Promise<PlannerStorageSaveResult> => {
    if (!isValidPlannerDataV2(data)) {
      return Promise.reject(new Error('Cannot save invalid v2 planner data.'));
    }
    if (!this.status.writable) {
      const error = this.status.warning ?? 'Desktop storage is read-only.';
      this.updateStatus({ phase: 'read-only', error });
      return Promise.reject(new Error(error));
    }

    const sequence = ++this.nextSequence;
    const savedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      if (this.pending) {
        this.pending.resolve({
          sequence: this.pending.sequence,
          saved: false,
          stale: true,
          noOp: true,
          savedAt: this.pending.savedAt,
        });
      }
      this.pending = { data, sequence, savedAt, resolve, reject };
      void this.drain();
    });
  };

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending) {
        const pending = this.pending;
        this.pending = null;
        this.updateStatus({ phase: 'saving', error: null });
        try {
          const serialized = await this.invokeCommand<string>('desktop_storage_save', {
            serialized: JSON.stringify(pending.data),
            sequence: pending.sequence,
            localDay: createLocalDay(new Date(pending.savedAt)),
            savedAt: pending.savedAt,
          });
          const result = parseDesktopSave(serialized);
          if (!result.stale) {
            this.updateStatus({
              phase: 'saved',
              lastSavedAt: result.savedAt,
              error: null,
            });
          }
          pending.resolve(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.updateStatus({ phase: 'error', error: message });
          pending.reject(new Error(message));
        }
      }
    } finally {
      this.draining = false;
      if (this.pending) void this.drain();
    }
  }

  createRestoreRecovery = async (
    previousData: PlannerDataV2,
    replacementData: PlannerDataV2,
    createdAt: string,
  ): Promise<boolean> => {
    const memory = createMemoryStorage();
    const snapshot = saveRestoreRecoverySnapshot(
      memory,
      previousData,
      replacementData,
      createdAt,
    );
    const serializedRecovery = memory.read();
    if (!snapshot.ok || !serializedRecovery) return false;

    try {
      await this.invokeCommand<string>('desktop_storage_create_operation_snapshot', {
        serialized: JSON.stringify(previousData),
        reason: 'restore',
        timestamp: createdAt,
      });
      await this.invokeCommand<void>('desktop_storage_write_restore_recovery', {
        serialized: serializedRecovery,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus({ phase: 'error', error: message });
      return false;
    }
  };

  loadRestoreRecovery = async (currentData: PlannerDataV2): Promise<PlannerDataV2 | null> => {
    let serialized: string | null;
    try {
      serialized = await this.invokeCommand<string | null>('desktop_storage_read_restore_recovery');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus({ phase: 'error', error: message });
      return null;
    }
    if (!serialized) return null;

    const memory = createMemoryStorage(serialized);
    const snapshot = loadRestoreRecoverySnapshot(memory, currentData);
    if (snapshot) return snapshot.previousData;

    try {
      await this.invokeCommand<void>('desktop_storage_clear_restore_recovery');
    } catch {
      // Stale recovery cleanup is best effort; validated planner loading continues.
    }
    return null;
  };

  clearRestoreRecovery = async (): Promise<void> => {
    try {
      await this.invokeCommand<void>('desktop_storage_clear_restore_recovery');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus({ phase: 'error', error: message });
      throw new Error(message);
    }
  };
}

const selectNewestValidBackup = (backups: DesktopCandidate[]): {
  candidate: DesktopCandidate;
  data: PlannerDataV2;
} | null => {
  const ordered = [...backups].sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
  for (const candidate of ordered) {
    const data = parsePlannerCandidate(candidate);
    if (data) return { candidate, data };
  }
  return null;
};

const recoverDesktopPrimary = async (
  invokeCommand: TauriInvoke,
  data: PlannerDataV2,
  timestamp: string,
): Promise<void> => {
  await invokeCommand<string>('desktop_storage_recover', {
    serialized: JSON.stringify(data),
    localDay: createLocalDay(new Date(timestamp)),
    timestamp,
  });
};

export const bootstrapDesktopPlannerStorage = async (
  invokeCommand: TauriInvoke = invoke,
  loadBrowserData: () => PlannerDataV2LoadResult = loadPlannerDataV2FromLocalStorage,
  createTimestamp: () => string = () => new Date().toISOString(),
): Promise<PlannerStorageRuntime> => {
  const bootstrapSerialized = await invokeCommand<string>('desktop_storage_bootstrap');
  const bootstrap = parseDesktopBootstrap(bootstrapSerialized);
  const adapter = new DesktopPlannerStorageAdapter(invokeCommand, {
    writable: bootstrap.writable,
    dataPath: bootstrap.dataPath,
    backupPath: bootstrap.backupPath,
    warning: bootstrap.warning,
  });
  const validPrimary = parsePlannerCandidate(bootstrap.primary);

  let data: PlannerDataV2;
  let source: PlannerStorageLoadSource;
  let warning = bootstrap.warning;

  if (validPrimary) {
    data = validPrimary;
    source = 'desktop-primary';
  } else {
    const validBackup = selectNewestValidBackup(bootstrap.backups);
    if (validBackup) {
      data = validBackup.data;
      source = 'desktop-backup';
      const recoveryWarning = bootstrap.primary
        ? `The desktop planner file was invalid. Recovery selected the newest valid backup (${validBackup.candidate.kind}).`
        : `The desktop planner file was missing. Recovery selected the newest valid backup (${validBackup.candidate.kind}).`;
      warning = warning ? `${warning} ${recoveryWarning}` : recoveryWarning;
      if (bootstrap.writable) {
        await recoverDesktopPrimary(invokeCommand, data, createTimestamp());
      } else {
        warning = `${warning} This read-only instance could not repair the primary file.`;
      }
    } else {
      const browserLoad = loadBrowserData();
      data = browserLoad.data;
      source = browserLoad.source === 'new'
        ? 'new'
        : 'desktop-migrated-webview';
      warning = [warning, browserLoad.warning].filter(Boolean).join(' ') || null;

      if (bootstrap.writable) {
        const timestamp = createTimestamp();
        await recoverDesktopPrimary(invokeCommand, data, timestamp);
        if (!bootstrap.migrationComplete) {
          await invokeCommand<void>('desktop_storage_mark_migration_complete');
        }
        if (browserLoad.source !== 'new') {
          const migrationWarning = 'Legacy WebView planner data was copied into durable desktop file storage. The legacy browser copy was preserved.';
          warning = warning ? `${warning} ${migrationWarning}` : migrationWarning;
        }
      } else {
        const readOnlyWarning = 'No valid desktop file was available, so this read-only instance is using the browser fallback in memory and cannot persist changes.';
        warning = warning ? `${warning} ${readOnlyWarning}` : readOnlyWarning;
      }
    }
  }

  const restoreRecovery = await adapter.loadRestoreRecovery(data);
  return { adapter, data, source, warning, restoreRecovery };
};

export const bootstrapBrowserPlannerStorage = (): PlannerStorageRuntime => {
  const load = loadPlannerDataV2FromLocalStorage();
  const adapter = new BrowserPlannerStorageAdapter();
  const restoreRecovery = loadRestoreRecoverySnapshot(localStorage, load.data)?.previousData ?? null;
  return {
    adapter,
    data: load.data,
    source: load.source,
    warning: load.warning,
    restoreRecovery,
  };
};

export const bootstrapPlannerStorageRuntime = async (): Promise<PlannerStorageRuntime> => {
  if (isTauri()) {
    return bootstrapDesktopPlannerStorage();
  }
  return bootstrapBrowserPlannerStorage();
};
