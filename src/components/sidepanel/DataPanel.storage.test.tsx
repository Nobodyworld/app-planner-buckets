import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerPlannerStorageRuntimeBridge,
  resetPlannerStorageRuntimeBridgeForTests,
} from '../../storage/plannerStorageBridge';
import { createInitialPlannerDataV2 } from '../../types/v2';
import { DataPanel, type DataPanelProps } from './DataPanel';

const currentPlanner = createInitialPlannerDataV2('2026-08-28T00:00:00.000Z');
const replacementPlanner = {
  ...currentPlanner,
  projects: currentPlanner.projects.map((project) => ({
    ...project,
    name: 'Restored project',
  })),
};

const createProps = (overrides: Partial<DataPanelProps> = {}): DataPanelProps => ({
  projectImportInputRef: createRef<HTMLInputElement>(),
  restoreInputRef: createRef<HTMLInputElement>(),
  projectImportConfirmRef: createRef<HTMLDivElement>(),
  restoreConfirmRef: createRef<HTMLDivElement>(),
  exportScopeMenuRef: createRef<HTMLDivElement>(),
  hasPendingProjectImport: false,
  projectImportSourceKindLabel: '',
  projectImportSourceOptions: [],
  selectedProjectImportSourceId: '',
  projectImportDestinationKind: null,
  selectedProjectImportDestinationId: '',
  projectImportDestinationProjects: [],
  canConfirmProjectImport: false,
  hasPendingRestoreData: true,
  pendingRestoreSummary: '1 project',
  hasLastRestoreBackup: false,
  hideRestoreUndoCard: false,
  isRestoreUndoClosing: false,
  dataActionMessage: null,
  showExportScopeMenu: false,
  exportScope: 'all',
  exportScopeOptionCount: 3,
  activeProjectName: 'Current project',
  activeBuckets: [],
  openAdvancedSectionsInTests: true,
  onConfirmProjectImport: vi.fn(),
  onCancelProjectImport: vi.fn(),
  onProjectImportSourceChange: vi.fn(),
  onProjectImportDestinationKindChange: vi.fn(),
  onProjectImportDestinationChange: vi.fn(),
  onToggleExportScopeMenu: vi.fn(),
  onSelectExportScope: vi.fn(),
  onExportData: vi.fn(),
  onConfirmRestoreData: vi.fn(),
  onCancelRestoreData: vi.fn(),
  onDismissRestoreUndoCard: vi.fn(),
  onUndoRestoreData: vi.fn(),
  onRestoreFileChange: vi.fn(),
  onProjectImportFileChange: vi.fn(),
  ...overrides,
});

const selectRestoreFile = async (): Promise<void> => {
  const file = {
    name: 'planner.json',
    type: 'application/json',
    text: vi.fn(async () => JSON.stringify(replacementPlanner)),
  } as unknown as File;

  fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
    target: { files: [file] },
  });

  await waitFor(() => {
    expect(file.text).toHaveBeenCalledOnce();
  });
};

describe('DataPanel durable Restore gate', () => {
  beforeEach(() => {
    resetPlannerStorageRuntimeBridgeForTests();
  });

  it('awaits a verified desktop recovery snapshot before calling the Restore handler', async () => {
    const createRestoreRecovery = vi.fn(async () => true);
    const onConfirmRestoreData = vi.fn();
    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        createRestoreRecovery,
        clearRestoreRecovery: vi.fn(async () => undefined),
      },
      currentPlanner,
      null,
    );
    render(<DataPanel {...createProps({ onConfirmRestoreData })} />);

    await selectRestoreFile();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

    await waitFor(() => {
      expect(createRestoreRecovery).toHaveBeenCalledWith(
        currentPlanner,
        replacementPlanner,
        expect.any(String),
      );
      expect(onConfirmRestoreData).toHaveBeenCalledOnce();
    });
  });

  it('blocks Restore and reports the failure when durable recovery cannot be verified', async () => {
    const onConfirmRestoreData = vi.fn();
    registerPlannerStorageRuntimeBridge(
      {
        mode: 'desktop-file',
        getStatus: () => ({ writable: true }),
        save: vi.fn(async () => undefined),
        createRestoreRecovery: vi.fn(async () => false),
        clearRestoreRecovery: vi.fn(async () => undefined),
      },
      currentPlanner,
      null,
    );
    render(<DataPanel {...createProps({ onConfirmRestoreData })} />);

    await selectRestoreFile();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Restore was not started because a verified desktop recovery snapshot could not be created.',
    );
    expect(onConfirmRestoreData).not.toHaveBeenCalled();
  });
});
