import { useState, type ChangeEvent, type RefObject } from 'react';
import { coercePlannerDataToV2 } from '../../services/plannerImport';
import {
    clearPlannerRestoreRecoveryRuntime,
    preparePlannerRestoreRecovery,
    setPendingPlannerRestoreData,
} from '../../storage/plannerStorageBridge';
import type { BucketV2 as Bucket } from '../../types/v2';
import { StorageStatusCard } from './StorageStatusCard';

export interface ProjectImportSourceOption {
    projectId: string;
    label: string;
}

export type ProjectImportDestinationKind = 'new' | 'existing' | null;

export interface DataPanelProps {
    embedded?: boolean;
    projectImportInputRef: RefObject<HTMLInputElement>;
    restoreInputRef: RefObject<HTMLInputElement>;
    projectImportConfirmRef: RefObject<HTMLDivElement>;
    restoreConfirmRef: RefObject<HTMLDivElement>;
    exportScopeMenuRef: RefObject<HTMLDivElement>;
    hasPendingProjectImport: boolean;
    projectImportSourceKindLabel: string;
    projectImportSourceOptions: ProjectImportSourceOption[];
    selectedProjectImportSourceId: string;
    projectImportDestinationKind: ProjectImportDestinationKind;
    selectedProjectImportDestinationId: string;
    projectImportDestinationProjects: ProjectImportSourceOption[];
    canConfirmProjectImport: boolean;
    hasPendingRestoreData: boolean;
    pendingRestoreSummary: string;
    hasLastRestoreBackup: boolean;
    hideRestoreUndoCard: boolean;
    isRestoreUndoClosing: boolean;
    dataActionMessage: string | null;
    showExportScopeMenu: boolean;
    exportScope: string;
    exportScopeOptionCount: number;
    activeProjectName: string;
    activeBuckets: Bucket[];
    openAdvancedSectionsInTests: boolean;
    onConfirmProjectImport: () => void;
    onCancelProjectImport: () => void;
    onProjectImportSourceChange: (projectId: string) => void;
    onProjectImportDestinationKindChange: (kind: Exclude<ProjectImportDestinationKind, null>) => void;
    onProjectImportDestinationChange: (projectId: string) => void;
    onToggleExportScopeMenu: () => void;
    onSelectExportScope: (scope: string) => void;
    onExportData: () => void;
    onConfirmRestoreData: () => void;
    onCancelRestoreData: () => void;
    onDismissRestoreUndoCard: () => void;
    onUndoRestoreData: () => void;
    onRestoreFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onProjectImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function DataPanel({
    embedded = false,
    projectImportInputRef,
    restoreInputRef,
    projectImportConfirmRef,
    restoreConfirmRef,
    exportScopeMenuRef,
    hasPendingProjectImport,
    projectImportSourceKindLabel,
    projectImportSourceOptions,
    selectedProjectImportSourceId,
    projectImportDestinationKind,
    selectedProjectImportDestinationId,
    projectImportDestinationProjects,
    canConfirmProjectImport,
    hasPendingRestoreData,
    pendingRestoreSummary,
    hasLastRestoreBackup,
    hideRestoreUndoCard,
    isRestoreUndoClosing,
    dataActionMessage,
    showExportScopeMenu,
    exportScope,
    exportScopeOptionCount,
    activeProjectName,
    activeBuckets,
    openAdvancedSectionsInTests,
    onConfirmProjectImport,
    onCancelProjectImport,
    onProjectImportSourceChange,
    onProjectImportDestinationKindChange,
    onProjectImportDestinationChange,
    onToggleExportScopeMenu,
    onSelectExportScope,
    onExportData,
    onConfirmRestoreData,
    onCancelRestoreData,
    onDismissRestoreUndoCard,
    onUndoRestoreData,
    onRestoreFileChange,
    onProjectImportFileChange,
}: DataPanelProps) {
    const [restorePreparationMessage, setRestorePreparationMessage] = useState<string | null>(null);
    const Wrapper = embedded ? 'div' : 'section';
    const selectedBucket = exportScope.startsWith('bucket:')
        ? activeBuckets.find((bucket) => bucket.id === exportScope.slice('bucket:'.length))
        : null;
    const selectedScopeLabel = exportScope === 'project'
        ? `Project: ${activeProjectName}`
        : exportScope === 'unassigned'
            ? `Unassigned tasks in ${activeProjectName}`
            : selectedBucket
                ? `Bucket: ${selectedBucket.name}`
                : 'All data';

    const handleRestoreFileSelection = async (
        event: ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        setRestorePreparationMessage(null);
        setPendingPlannerRestoreData(null);
        const file = event.target.files?.[0] ?? null;

        if (file) {
            try {
                const parsed = JSON.parse(await file.text()) as unknown;
                setPendingPlannerRestoreData(coercePlannerDataToV2(parsed).data);
            } catch {
                // The established App handler owns user-facing validation errors.
            }
        }

        onRestoreFileChange(event);
    };

    const handleConfirmRestore = async (): Promise<void> => {
        setRestorePreparationMessage(null);
        const recoveryPrepared = await preparePlannerRestoreRecovery();
        if (!recoveryPrepared) {
            setRestorePreparationMessage(
                'Restore was not started because a verified desktop recovery snapshot could not be created.',
            );
            return;
        }

        setPendingPlannerRestoreData(null);
        onConfirmRestoreData();
    };

    const handleCancelRestore = (): void => {
        setRestorePreparationMessage(null);
        setPendingPlannerRestoreData(null);
        onCancelRestoreData();
    };

    const clearDurableRestoreRecovery = (): void => {
        void clearPlannerRestoreRecoveryRuntime().catch(() => {
            // The storage status card reports durable cleanup failures.
        });
    };

    const handleConfirmProjectImport = (): void => {
        onConfirmProjectImport();
        clearDurableRestoreRecovery();
    };

    const handleDismissRestoreUndo = (): void => {
        onDismissRestoreUndoCard();
        clearDurableRestoreRecovery();
    };

    const handleUndoRestore = (): void => {
        onUndoRestoreData();
        clearDurableRestoreRecovery();
    };

    return (
        <Wrapper
            className={`${embedded ? 'data-panel-content' : 'panel-card data-panel'}`}
            aria-label={embedded ? undefined : 'Data controls'}
        >
            {!embedded ? <h2>Data</h2> : null}
            <p className="section-helper">
                Export All data for a full backup. Project, bucket, and Unassigned
                scopes are exchange files for Project import. Import and Restore
                actions are in Advanced options.
            </p>
            <StorageStatusCard />
            <div className="data-action-row">
                <button type="button" className="secondary-button" onClick={onExportData}>
                    Export JSON
                </button>
            </div>

            <details className="panel-details" aria-label="Advanced data actions" open={openAdvancedSectionsInTests}>
                <summary>Advanced data actions</summary>

                <div className="data-action-row export-action-row">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onToggleExportScopeMenu}
                        aria-label="Choose export scope"
                    >
                        Choose export scope
                    </button>
                </div>
                <p className="data-scope-context" aria-live="polite">
                    Selected export scope: <strong>{selectedScopeLabel}</strong>
                </p>

                {showExportScopeMenu && (
                    <div
                        ref={exportScopeMenuRef}
                        className={`scope-menu interaction-scroll-target interaction-enter${exportScopeOptionCount > 5 ? ' scope-menu-scrollable' : ''}`}
                        aria-label="Export scope options"
                    >
                        <button
                            type="button"
                            className={`scope-menu-item${exportScope === 'all' ? ' active' : ''}`}
                            onClick={() => onSelectExportScope('all')}
                            aria-pressed={exportScope === 'all'}
                        >
                            All data
                        </button>
                        <button
                            type="button"
                            className={`scope-menu-item${exportScope === 'project' ? ' active' : ''}`}
                            onClick={() => onSelectExportScope('project')}
                            aria-pressed={exportScope === 'project'}
                        >
                            Project: {activeProjectName}
                        </button>
                        <button
                            type="button"
                            className={`scope-menu-item${exportScope === 'unassigned' ? ' active' : ''}`}
                            onClick={() => onSelectExportScope('unassigned')}
                            aria-pressed={exportScope === 'unassigned'}
                        >
                            Unassigned tasks
                        </button>
                        {activeBuckets.map((bucket) => {
                            const bucketScope = `bucket:${bucket.id}`;
                            return (
                                <button
                                    key={bucket.id}
                                    type="button"
                                    className={`scope-menu-item${exportScope === bucketScope ? ' active' : ''}`}
                                    onClick={() => onSelectExportScope(bucketScope)}
                                    aria-pressed={exportScope === bucketScope}
                                >
                                    Bucket: {bucket.name}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div
                    className="data-action-group project-import"
                    role="group"
                    aria-label="Project import"
                >
                    <p className="data-action-label">Project import</p>
                    <div className="data-action-row">
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => projectImportInputRef.current?.click()}
                        >
                            Import project JSON
                        </button>
                    </div>
                </div>

                {hasPendingProjectImport && (
                    <div
                        ref={projectImportConfirmRef}
                        className="inline-confirm project-import-config interaction-scroll-target interaction-enter"
                        role="group"
                        aria-label="Configure project import"
                    >
                        <span className="inline-confirm-text">{projectImportSourceKindLabel}</span>
                        {projectImportSourceOptions.length === 1 ? (
                            <p className="data-scope-context">
                                Source project: <strong>{projectImportSourceOptions[0].label}</strong>
                            </p>
                        ) : (
                            <label className="project-import-field">
                                <span>Source project</span>
                                <select
                                    aria-label="Source project"
                                    value={selectedProjectImportSourceId}
                                    onChange={(event) => onProjectImportSourceChange(event.target.value)}
                                >
                                    <option value="">Choose source project</option>
                                    {projectImportSourceOptions.map((option) => (
                                        <option key={option.projectId} value={option.projectId}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <fieldset className="project-import-destination">
                            <legend>Import destination</legend>
                            <label>
                                <input
                                    type="radio"
                                    name="project-import-destination"
                                    value="new"
                                    checked={projectImportDestinationKind === 'new'}
                                    onChange={() => onProjectImportDestinationKindChange('new')}
                                />
                                <span>Create as new project</span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="project-import-destination"
                                    value="existing"
                                    checked={projectImportDestinationKind === 'existing'}
                                    disabled={projectImportDestinationProjects.length === 0}
                                    onChange={() => onProjectImportDestinationKindChange('existing')}
                                />
                                <span>Merge into existing project</span>
                            </label>
                        </fieldset>

                        {projectImportDestinationKind === 'existing' && (
                            <label className="project-import-field">
                                <span>Destination project</span>
                                <select
                                    aria-label="Destination project"
                                    value={selectedProjectImportDestinationId}
                                    onChange={(event) => onProjectImportDestinationChange(event.target.value)}
                                >
                                    <option value="">Choose destination project</option>
                                    {projectImportDestinationProjects.map((project) => (
                                        <option key={project.projectId} value={project.projectId}>
                                            {project.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <div className="inline-confirm-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={handleConfirmProjectImport}
                                aria-label="Confirm project import"
                                disabled={!canConfirmProjectImport}
                            >
                                Import project
                            </button>
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={onCancelProjectImport}
                                aria-label="Cancel project import"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <div className="data-action-row">
                    <button type="button" className="secondary-button" onClick={() => restoreInputRef.current?.click()}>
                        Restore from JSON backup
                    </button>
                </div>

                {hasPendingRestoreData && (
                    <div ref={restoreConfirmRef} className="inline-confirm interaction-scroll-target interaction-enter" role="group" aria-label="Confirm restore data">
                        <span className="inline-confirm-text">
                            Restore {pendingRestoreSummary} and replace current planner?
                        </span>
                        <div className="inline-confirm-actions">
                            <button
                                type="button"
                                className="icon-button inline-confirm-accept"
                                onClick={() => {
                                    void handleConfirmRestore();
                                }}
                                aria-label="Confirm restore"
                                title="Confirm restore"
                            >
                                ✓
                            </button>
                            <button
                                type="button"
                                className="icon-button inline-confirm-cancel"
                                onClick={handleCancelRestore}
                                aria-label="Cancel restore"
                                title="Cancel restore"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {restorePreparationMessage ? (
                    <p className="data-message" role="alert">
                        {restorePreparationMessage}
                    </p>
                ) : null}

                {hasLastRestoreBackup && !hideRestoreUndoCard && (
                    <div
                        className={`inline-confirm restore-undo${isRestoreUndoClosing ? ' is-closing' : ''}`}
                        role="group"
                        aria-label="Undo restore"
                    >
                        <div className="restore-undo-head">
                            <span className="inline-confirm-text">Need to revert the last restore?</span>
                            <button
                                type="button"
                                className="icon-button restore-undo-close"
                                onClick={handleDismissRestoreUndo}
                                aria-label="Dismiss undo restore notice"
                                title="Dismiss"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="inline-confirm-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={handleUndoRestore}
                                aria-label="Undo restore"
                            >
                                Undo restore
                            </button>
                        </div>
                    </div>
                )}
            </details>

            {dataActionMessage && (
                <p className="data-message" role="status" aria-live="polite">
                    {dataActionMessage}
                </p>
            )}

            <input
                ref={restoreInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Restore planner data from JSON"
                onChange={(event) => {
                    void handleRestoreFileSelection(event);
                }}
            />
            <input
                ref={projectImportInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Import a project from JSON"
                onChange={onProjectImportFileChange}
            />
        </Wrapper>
    );
}
