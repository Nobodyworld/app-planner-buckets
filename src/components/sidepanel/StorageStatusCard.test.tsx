import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialPlannerDataV2 } from '../../types/v2';
import {
  registerPlannerStorageRuntimeBridge,
  resetPlannerStorageRuntimeBridgeForTests,
  type RuntimeStorageStatus,
} from '../../storage/plannerStorageBridge';
import { StorageStatusCard } from './StorageStatusCard';

describe('StorageStatusCard', () => {
  beforeEach(() => {
    resetPlannerStorageRuntimeBridgeForTests();
  });

  it('shows browser mode when no runtime bridge is registered', () => {
    render(<StorageStatusCard />);

    expect(screen.getByText('Browser local storage')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows desktop paths, read-only warnings, and save failures', () => {
    let status: RuntimeStorageStatus = {
      mode: 'desktop-file',
      writable: false,
      phase: 'read-only',
      dataPath: 'runtime-data/planner-v2.json',
      backupPath: 'runtime-data/backups',
      lastSavedAt: null,
      warning: 'Another process owns desktop storage.',
      error: null,
    };
    let listener: ((nextStatus: RuntimeStorageStatus) => void) | null = null;

    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => status,
        subscribe: (nextListener) => {
          listener = nextListener;
          nextListener(status);
          return () => {
            listener = null;
          };
        },
        save: vi.fn(async () => undefined),
      },
      createInitialPlannerDataV2('2026-08-28T00:00:00.000Z'),
      status.warning ?? null,
    );

    render(<StorageStatusCard />);

    expect(screen.getByText('Desktop file storage')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('runtime-data/planner-v2.json')).toBeInTheDocument();
    expect(screen.getByText('runtime-data/backups')).toBeInTheDocument();
    expect(screen.getByText('Another process owns desktop storage.')).toBeInTheDocument();

    status = {
      ...status,
      writable: true,
      phase: 'error',
      error: 'Disk write failed.',
    };
    act(() => {
      listener?.(status);
    });

    expect(screen.getByText('Save failed')).toBeInTheDocument();
    expect(screen.getByText('Disk write failed.')).toHaveAttribute('role', 'alert');
  });
});
