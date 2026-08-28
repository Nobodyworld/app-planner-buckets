import { useEffect, useState } from 'react';
import {
  getPlannerStorageRuntimeTarget,
  type RuntimeStorageStatus,
} from '../../storage/plannerStorageBridge';

const createFallbackStatus = (): RuntimeStorageStatus => ({
  mode: 'browser-local-storage',
  writable: true,
  phase: 'idle',
  dataPath: null,
  backupPath: null,
  lastSavedAt: null,
  warning: null,
  error: null,
});

const describePhase = (status: RuntimeStorageStatus): string => {
  switch (status.phase) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    case 'read-only':
      return 'Read-only';
    default:
      return status.writable ? 'Ready' : 'Read-only';
  }
};

const formatSavedAt = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function StorageStatusCard() {
  const target = getPlannerStorageRuntimeTarget();
  const [status, setStatus] = useState<RuntimeStorageStatus>(() => (
    target?.getStatus() ?? createFallbackStatus()
  ));

  useEffect(() => {
    const currentTarget = getPlannerStorageRuntimeTarget();
    if (!currentTarget) {
      setStatus(createFallbackStatus());
      return undefined;
    }
    setStatus(currentTarget.getStatus());
    return currentTarget.subscribe?.(setStatus);
  }, []);

  const mode = status.mode ?? target?.mode ?? 'browser-local-storage';
  const modeLabel = mode === 'desktop-file'
    ? 'Desktop file storage'
    : 'Browser local storage';
  const lastSavedAt = formatSavedAt(status.lastSavedAt);

  return (
    <section className="storage-status-card" aria-label="Storage status">
      <div className="storage-status-heading">
        <h3>Storage</h3>
        <span
          className={`storage-status-phase storage-status-${status.phase ?? 'idle'}`}
          aria-live="polite"
        >
          {describePhase(status)}
        </span>
      </div>
      <dl className="storage-status-details">
        <div>
          <dt>Mode</dt>
          <dd>{modeLabel}</dd>
        </div>
        {lastSavedAt ? (
          <div>
            <dt>Last saved</dt>
            <dd>{lastSavedAt}</dd>
          </div>
        ) : null}
        {status.dataPath ? (
          <div>
            <dt>Planner file</dt>
            <dd><code>{status.dataPath}</code></dd>
          </div>
        ) : null}
        {status.backupPath ? (
          <div>
            <dt>Backups</dt>
            <dd><code>{status.backupPath}</code></dd>
          </div>
        ) : null}
      </dl>
      {status.warning ? (
        <p className="storage-status-warning" role="status">
          {status.warning}
        </p>
      ) : null}
      {status.error ? (
        <p className="storage-status-error" role="alert">
          {status.error}
        </p>
      ) : null}
    </section>
  );
}
