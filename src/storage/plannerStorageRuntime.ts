import { invoke, isTauri } from '@tauri-apps/api/core';
import { createRuntimeInitialPlannerDataV2, loadPlannerDataV2FromLocalStorage, savePlannerDataV2ToLocalStorage, PLANNER_STORAGE_KEY_V1, PLANNER_STORAGE_KEY_V2, type PlannerDataV2LoadResult } from '../services/plannerPersistence';
import { clearRestoreRecoverySnapshot, fingerprintPlannerData, loadRestoreRecoverySnapshot, RESTORE_RECOVERY_STORAGE_KEY, saveRestoreRecoverySnapshot, type RestoreRecoverySnapshot, type StorageAdapter as RecoveryStorageAdapter } from '../services/restoreRecovery';
import { migrateV1toV2 } from '../types/migration';
import type { PlannerDataV2 } from '../types/v2';
import { isValidPlannerDataV1, isValidPlannerDataV2 } from '../types/validators';

export type PlannerStorageMode = 'browser-local-storage' | 'desktop-file';
export type PlannerStorageSavePhase = 'idle' | 'saving' | 'saved' | 'error' | 'read-only';
export type PlannerStorageLoadSource = PlannerDataV2LoadResult['source'] | 'desktop-primary' | 'desktop-backup' | 'desktop-migrated-webview';
export type RestorePhase = 'preparing' | 'committing';
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
  getStatus(): PlannerStorageStatus;
  subscribe(listener: (status: PlannerStorageStatus) => void): () => void;
  save(data: PlannerDataV2): Promise<PlannerStorageSaveResult>;
  flush(): Promise<void>;
  retry(): Promise<void>;
  loadRestoreRecovery(data: PlannerDataV2): Promise<PlannerDataV2 | null>;
  getRestoreRecovery(data: PlannerDataV2): PlannerDataV2 | null;
  clearRestoreRecovery(): Promise<void>;
  replacePlanner?(previous: PlannerDataV2, replacement: PlannerDataV2, keepUndo: boolean, signal: AbortSignal, onPhase: (phase: RestorePhase) => void): Promise<boolean>;
}
export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
interface DesktopCandidate {
  kind: 'primary' | 'previous' | 'routine' | 'operation';
  path: string;
  name: string;
  serialized: string;
  modifiedAtMs: number;
}
interface DesktopBootstrapPayload {
  writable: boolean;
  dataPath: string;
  backupPath: string;
  migrationComplete: boolean;
  session: number;
  primary: DesktopCandidate | null;
  backups: DesktopCandidate[];
  warning: string | null;
}
const localDay = (date: Date): string => `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
const parseObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported desktop storage response.');
  return value as Record<string, unknown>;
};
const parseCandidate = (value: unknown): DesktopCandidate | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<DesktopCandidate>;
  return typeof item.serialized === 'string' && typeof item.path === 'string' && typeof item.kind === 'string' && typeof item.modifiedAtMs === 'number'
    ? { ...item, name: item.name ?? '' } as DesktopCandidate : null;
};
const candidateData = (candidate: DesktopCandidate | null): PlannerDataV2 | null => {
  if (!candidate) return null;
  try { const data: unknown = JSON.parse(candidate.serialized); return isValidPlannerDataV2(data) ? data as PlannerDataV2 : null; } catch { return null; }
};
const memoryStorage = (initial: string | null = null): RecoveryStorageAdapter & { read(): string | null } => {
  let value = initial;
  return { getItem: () => value, setItem: (_key, next) => { value = next; }, removeItem: () => { value = null; }, read: () => value };
};

abstract class ObservableStorage {
  protected status: PlannerStorageStatus;
  private listeners = new Set<(status: PlannerStorageStatus) => void>();
  constructor(status: PlannerStorageStatus) { this.status = status; }
  getStatus = (): PlannerStorageStatus => ({ ...this.status });
  subscribe = (listener: (status: PlannerStorageStatus) => void): (() => void) => {
    this.listeners.add(listener); listener(this.getStatus()); return () => { this.listeners.delete(listener); };
  };
  protected update(next: Partial<PlannerStorageStatus>): void {
    this.status = { ...this.status, ...next };
    this.listeners.forEach((listener) => listener(this.getStatus()));
  }
}
export class BrowserPlannerStorageAdapter extends ObservableStorage implements PlannerStorageAdapter {
  readonly mode = 'browser-local-storage' as const;
  private sequence = 0;
  private unsaved: PlannerDataV2 | null = null;
  constructor(private storage: RecoveryStorageAdapter = localStorage) {
    super({ mode: 'browser-local-storage', writable: true, phase: 'idle', dataPath: null, backupPath: null, lastSavedAt: null, warning: null, error: null });
  }
  save = async (data: PlannerDataV2): Promise<PlannerStorageSaveResult> => {
    this.unsaved = data; this.update({ phase: 'saving', error: null });
    try {
      savePlannerDataV2ToLocalStorage(data);
      const savedAt = new Date().toISOString(); this.unsaved = null;
      this.update({ phase: 'saved', lastSavedAt: savedAt, error: null });
      return { sequence: ++this.sequence, saved: true, stale: false, noOp: false, savedAt };
    } catch (error) { this.update({ phase: 'error', error: messageOf(error) }); throw error; }
  };
  flush = async (): Promise<void> => { if (this.unsaved) throw new Error(this.status.error ?? 'Planner changes are not saved.'); };
  retry = async (): Promise<void> => { if (this.unsaved) await this.save(this.unsaved); };
  loadRestoreRecovery = async (data: PlannerDataV2): Promise<PlannerDataV2 | null> => this.getRestoreRecovery(data);
  getRestoreRecovery = (data: PlannerDataV2): PlannerDataV2 | null => loadRestoreRecoverySnapshot(this.storage, data)?.previousData ?? null;
  clearRestoreRecovery = async (): Promise<void> => { clearRestoreRecoverySnapshot(this.storage); };
}

/** All desktop mutations, including Restore and recovery cleanup, use this one queue. */
export class DesktopPlannerStorageAdapter extends ObservableStorage implements PlannerStorageAdapter {
  readonly mode = 'desktop-file' as const;
  private sequence = 0;
  private tail: Promise<void> = Promise.resolve();
  private unsaved: PlannerDataV2 | null = null;
  private recovery: RestoreRecoverySnapshot | null = null;
  private readonly session: number;
  constructor(private invokeCommand: TauriInvoke, status: Pick<PlannerStorageStatus, 'writable' | 'dataPath' | 'backupPath' | 'warning'> & { session: number }) {
    super({ mode: 'desktop-file', ...status, phase: status.writable ? 'idle' : 'read-only', lastSavedAt: null, error: null });
    this.session = status.session;
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
  private writable(): void { if (!this.status.writable) throw new Error(this.status.warning ?? 'Desktop storage is read-only.'); }
  private async write(data: PlannerDataV2): Promise<PlannerStorageSaveResult> {
    const serialized = JSON.stringify(data);
    const savedAt = new Date().toISOString();
    const sequence = ++this.sequence;
    const value = parseObject(await this.invokeCommand<string>('desktop_storage_save', { serialized, sequence, session: this.session, localDay: localDay(new Date(savedAt)), savedAt }));
    if (value.stale === true || value.saved !== true || value.sequence !== sequence || typeof value.savedAt !== 'string') throw new Error('Desktop storage rejected a stale or unverified save. Reload the application before retrying.');
    if (typeof value.warning === 'string') this.update({ warning: value.warning });
    return value as unknown as PlannerStorageSaveResult;
  }
  private async retireRecovery(data: PlannerDataV2): Promise<void> {
    if (!this.recovery || this.recovery.replacementFingerprint === fingerprintPlannerData(data)) return;
    try {
      await this.invokeCommand('desktop_storage_clear_restore_recovery', { session: this.session });
      this.recovery = null;
    } catch (error) { this.update({ warning: `Planner was saved; stale recovery cleanup failed: ${messageOf(error)}` }); }
  }
  private async prune(data: PlannerDataV2): Promise<void> {
    try {
      const raw = await this.invokeCommand<string>('desktop_storage_list_backups', { session: this.session });
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values)) throw new Error('Invalid backup inventory.');
      const candidates = values.map(parseCandidate).filter((item): item is DesktopCandidate => Boolean(item))
        .filter((item) => (item.kind === 'routine' || item.kind === 'operation') && candidateData(item));
      // Only candidates accepted by the canonical schema/integrity validator may be pruned.
      // Rust rechecks the exact bytes under its lock before removing any reviewed name.
      await this.invokeCommand('desktop_storage_prune_backups', { session: this.session, request: JSON.stringify({ current: JSON.stringify(data), candidates: candidates.map(({ name, serialized }) => ({ name, serialized })) }) });
    } catch (error) { this.update({ warning: `Planner was saved; backup retention was deferred: ${messageOf(error)}` }); }
  }
  save = (data: PlannerDataV2): Promise<PlannerStorageSaveResult> => {
    if (!isValidPlannerDataV2(data)) return Promise.reject(new Error('Cannot save invalid v2 planner data.'));
    if (!this.status.writable) return Promise.reject(new Error(this.status.warning ?? 'Desktop storage is read-only.'));
    // Capture immutable bytes now, not a mutable caller-owned object at queue execution time.
    const captured = JSON.parse(JSON.stringify(data)) as PlannerDataV2;
    this.unsaved = captured;
    this.update({ phase: 'saving', error: null });
    return this.enqueue(async () => {
      try {
        const result = await this.write(captured);
        await this.retireRecovery(captured);
        if (!result.noOp) await this.prune(captured);
        if (this.unsaved === captured) {
          this.unsaved = null;
          this.update({ phase: 'saved', error: null, lastSavedAt: result.savedAt });
        }
        return result;
      } catch (error) { this.update({ phase: 'error', error: messageOf(error) }); throw error; }
    });
  };
  flush = async (): Promise<void> => {
    for (;;) { const tail = this.tail; await tail; if (tail === this.tail) break; }
    if (this.unsaved) throw new Error(this.status.error ?? 'Planner changes have not been saved.');
  };
  retry = async (): Promise<void> => {
    if (this.unsaved) await this.save(this.unsaved);
    else if (this.status.error) throw new Error('Retry the failed operation; the previous planner is unchanged.');
  };
  getRestoreRecovery = (data: PlannerDataV2): PlannerDataV2 | null => this.recovery?.replacementFingerprint === fingerprintPlannerData(data) ? this.recovery.previousData : null;
  loadRestoreRecovery = async (data: PlannerDataV2): Promise<PlannerDataV2 | null> => {
    const serialized = await this.invokeCommand<string | null>('desktop_storage_read_restore_recovery', { session: this.session });
    this.recovery = serialized ? loadRestoreRecoverySnapshot(memoryStorage(serialized), data) : null;
    // Invalid/mismatching records are not applied, but read-only bootstrap never deletes files.
    return this.getRestoreRecovery(data);
  };
  clearRestoreRecovery = (): Promise<void> => this.enqueue(async () => {
    this.writable();
    await this.invokeCommand('desktop_storage_clear_restore_recovery', { session: this.session });
    this.recovery = null;
  });
  replacePlanner = (previous: PlannerDataV2, replacement: PlannerDataV2, keepUndo: boolean, signal: AbortSignal, onPhase: (phase: RestorePhase) => void): Promise<boolean> => {
    if (!isValidPlannerDataV2(previous) || !isValidPlannerDataV2(replacement)) return Promise.reject(new Error('Restore requires valid complete planner data.'));
    const before = JSON.parse(JSON.stringify(previous)) as PlannerDataV2;
    const after = JSON.parse(JSON.stringify(replacement)) as PlannerDataV2;
    return this.enqueue(async () => {
      this.writable();
      if (signal.aborted) return false;
      onPhase('preparing');
      const createdAt = new Date().toISOString();
      try {
        // Ordinary saves ahead of this transaction have drained. CAS in Rust also checks
        // the actual primary, so a stale UI cannot replace a newer durable planner.
        const receipt = parseObject(await this.invokeCommand<string>('desktop_storage_create_operation_snapshot', { serialized: JSON.stringify(before), reason: keepUndo ? 'restore' : 'undo-restore', timestamp: createdAt, session: this.session }));
        if (signal.aborted) return false;
        const memory = memoryStorage();
        const prepared = saveRestoreRecoverySnapshot(memory, before, after, createdAt);
        if (!prepared.ok) throw new Error('Could not validate the Restore recovery snapshot.');
        onPhase('committing');
        // Cancellation is deliberately unavailable after this atomic native transaction starts.
        const result = parseObject(await this.invokeCommand<string>('desktop_storage_commit_restore', { session: this.session, request: JSON.stringify({ sequence: ++this.sequence, expected: JSON.stringify(before), serialized: JSON.stringify(after), snapshotName: receipt.name, recovery: keepUndo ? memory.read() : null, localDay: localDay(new Date(createdAt)), savedAt: createdAt }) }));
        if (result.saved !== true || result.sequence !== this.sequence) throw new Error('Restore did not return a verified commit.');
        this.recovery = keepUndo ? prepared.snapshot : null;
        this.unsaved = null;
        this.update({ phase: 'saved', lastSavedAt: createdAt, error: null, ...(typeof result.warning === 'string' ? { warning: result.warning } : {}) });
        await this.prune(after);
        return true;
      } catch (error) { this.update({ phase: 'error', error: messageOf(error) }); throw error; }
    });
  };
}

/** Read migration inputs without writing, deleting or repairing WebView storage. */
export const loadLegacyDesktopPlanner = (): PlannerDataV2LoadResult => {
  const rawV2 = localStorage.getItem(PLANNER_STORAGE_KEY_V2);
  const rawV1 = localStorage.getItem(PLANNER_STORAGE_KEY_V1);
  if (rawV2 !== null) {
    try { const value: unknown = JSON.parse(rawV2); if (isValidPlannerDataV2(value)) return { data: value as PlannerDataV2, source: 'v2', warning: null }; } catch { /* Try the independently preserved v1 source. */ }
  }
  if (rawV1 !== null) {
    try {
      const value: unknown = JSON.parse(rawV1);
      if (isValidPlannerDataV1(value)) { const data = migrateV1toV2(value); if (isValidPlannerDataV2(data)) return { data, source: 'migrated-v1', warning: rawV2 !== null ? 'Invalid legacy v2 data was left intact; migration used valid v1 data.' : null }; }
    } catch { /* Fail closed below, never initialize over malformed legacy data. */ }
  }
  if (rawV1 !== null || rawV2 !== null) throw new Error('Legacy desktop planner data is invalid. Migration was stopped and the original WebView values were preserved.');
  return { data: createRuntimeInitialPlannerDataV2(), source: 'new', warning: null };
};
export const bootstrapDesktopPlannerStorage = async (invokeCommand: TauriInvoke = invoke, loadBrowserData: () => PlannerDataV2LoadResult = loadLegacyDesktopPlanner, createTimestamp: () => string = () => new Date().toISOString()): Promise<PlannerStorageRuntime> => {
  const value = parseObject(await invokeCommand<string>('desktop_storage_bootstrap'));
  if (typeof value.writable !== 'boolean' || typeof value.dataPath !== 'string' || typeof value.backupPath !== 'string' || typeof value.migrationComplete !== 'boolean' || !Number.isSafeInteger(value.session) || Number(value.session) < 1 || !Array.isArray(value.backups)) throw new Error('Incomplete desktop storage bootstrap response.');
  const bootstrap: DesktopBootstrapPayload = { writable: value.writable, dataPath: value.dataPath, backupPath: value.backupPath, migrationComplete: value.migrationComplete, session: Number(value.session), primary: parseCandidate(value.primary), backups: value.backups.map(parseCandidate).filter((item): item is DesktopCandidate => Boolean(item)), warning: typeof value.warning === 'string' ? value.warning : null };
  let data = candidateData(bootstrap.primary);
  let source: PlannerStorageLoadSource = 'desktop-primary';
  let warning = bootstrap.warning;
  if (!data) {
    const ordered = [...bootstrap.backups].sort((a, b) => b.modifiedAtMs - a.modifiedAtMs || a.path.localeCompare(b.path));
    const backup = ordered.find((item) => candidateData(item));
    if (backup) {
      data = candidateData(backup)!; source = 'desktop-backup';
      warning = [warning, `Recovery selected the newest valid backup (${backup.kind}).`].filter(Boolean).join(' ');
      if (bootstrap.writable) await invokeCommand('desktop_storage_recover', { serialized: JSON.stringify(data), localDay: localDay(new Date(createTimestamp())), timestamp: createTimestamp(), session: bootstrap.session });
      else warning += ' This read-only instance could not repair the primary file.';
    } else {
      // A missing primary after migration or any invalid durable evidence is recovery,
      // not first run. Preserve everything and require an explicit recovery decision.
      if (bootstrap.migrationComplete || value.primary !== null || value.backups.length > 0) throw new Error('No valid durable planner remains. Startup stopped without replacing files or re-importing stale WebView data. Restore from an external backup in an isolated recovery workflow.');
      const legacy = loadBrowserData();
      data = legacy.data;
      if (!isValidPlannerDataV2(data)) throw new Error('Migration source failed planner validation.');
      source = legacy.source === 'new' ? 'new' : 'desktop-migrated-webview';
      warning = [warning, legacy.warning].filter(Boolean).join(' ') || null;
      if (bootstrap.writable) {
        const timestamp = createTimestamp();
        if (legacy.source !== 'new') await invokeCommand('desktop_storage_create_operation_snapshot', { serialized: JSON.stringify(data), reason: 'migration', timestamp, session: bootstrap.session });
        await invokeCommand('desktop_storage_recover', { serialized: JSON.stringify(data), localDay: localDay(new Date(timestamp)), timestamp, session: bootstrap.session });
        if (legacy.source !== 'new') warning = [warning, 'Legacy WebView data was migrated; the legacy browser copy was preserved.'].filter(Boolean).join(' ');
      } else warning = [warning, 'No durable primary exists yet; this instance is read-only and cannot persist changes.'].filter(Boolean).join(' ');
    }
  }
  // Also finish an interrupted marker write when a valid durable primary already exists.
  if (bootstrap.writable && !bootstrap.migrationComplete) await invokeCommand('desktop_storage_mark_migration_complete', { session: bootstrap.session });
  const adapter = new DesktopPlannerStorageAdapter(invokeCommand, { ...bootstrap, warning });
  const restoreRecovery = await adapter.loadRestoreRecovery(data);
  return { adapter, data, source, warning, restoreRecovery };
};
export const bootstrapBrowserPlannerStorage = (): PlannerStorageRuntime => {
  const loaded = loadPlannerDataV2FromLocalStorage();
  const adapter = new BrowserPlannerStorageAdapter();
  return { adapter, ...loaded, restoreRecovery: adapter.getRestoreRecovery(loaded.data) };
};
export const bootstrapPlannerStorageRuntime = async (): Promise<PlannerStorageRuntime> => isTauri() ? bootstrapDesktopPlannerStorage() : bootstrapBrowserPlannerStorage();
