import type { ChangeEvent, RefObject } from 'react';
import type { BucketV2 as Bucket } from '../../types/v2';

export interface DataPanelProps {
    embedded?: boolean;
    uploadInputRef: RefObject<HTMLInputElement>;
    restoreInputRef: RefObject<HTMLInputElement>;
    uploadConfirmRef: RefObject<HTMLDivElement>;
    restoreConfirmRef: RefObject<HTMLDivElement>;
    exportScopeMenuRef: RefObject<HTMLDivElement>;
    hasPendingUploadData: boolean;
    pendingUploadSummary: string;
    hasPendingRestoreData: boolean;
    pendingRestoreSummary: string;
    hasLastRestoreBackup: boolean;
    hideRestoreUndoCard: boolean;
    isRestoreUndoClosing: boolean;
    dataActionMessage: string | null;
    showExportScopeMenu: boolean;
    exportScope: string;
    exportScopeOptionCount: number;
    activeBuckets: Bucket[];
    openAdvancedSectionsInTests: boolean;
    onConfirmUploadData: () => void;
    onCancelUploadData: () => void;
    onToggleExportScopeMenu: () => void;
    onSelectExportScope: (scope: string) => void;
    onExportData: () => void;
    onConfirmRestoreData: () => void;
    onCancelRestoreData: () => void;
    onDismissRestoreUndoCard: () => void;
    onUndoRestoreData: () => void;
    onRestoreFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onUploadFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function DataPanel({
    embedded = false,
    uploadInputRef,
    restoreInputRef,
    uploadConfirmRef,
    restoreConfirmRef,
    exportScopeMenuRef,
    hasPendingUploadData,
    pendingUploadSummary,
    hasPendingRestoreData,
    pendingRestoreSummary,
    hasLastRestoreBackup,
    hideRestoreUndoCard,
    isRestoreUndoClosing,
    dataActionMessage,
    showExportScopeMenu,
    exportScope,
    exportScopeOptionCount,
    activeBuckets,
    openAdvancedSectionsInTests,
    onConfirmUploadData,
    onCancelUploadData,
    onToggleExportScopeMenu,
    onSelectExportScope,
    onExportData,
    onConfirmRestoreData,
    onCancelRestoreData,
    onDismissRestoreUndoCard,
    onUndoRestoreData,
    onRestoreFileChange,
    onUploadFileChange,
}: DataPanelProps) {
    const Wrapper = embedded ? 'div' : 'section';

    return (
        <Wrapper
            className={`${embedded ? 'data-panel-content' : 'panel-card data-panel'}`}
            aria-label={embedded ? undefined : 'Data controls'}
        >
            {!embedded ? <h2>Data</h2> : null}
            <p className="section-helper">
                Export a backup any time. Upload and restore actions are in Advanced options.
            </p>
            <div className="data-action-row">
                <button type="button" className="secondary-button" onClick={onExportData}>
                    Export JSON
                </button>
            </div>

            <details className="panel-details" aria-label="Advanced data actions" open={openAdvancedSectionsInTests}>
                <summary>Advanced data actions</summary>

                <div className="data-action-row">
                    <button type="button" className="secondary-button" onClick={() => uploadInputRef.current?.click()}>
                        Upload JSON to merge
                    </button>
                </div>

                {hasPendingUploadData && (
                    <div ref={uploadConfirmRef} className="inline-confirm interaction-scroll-target interaction-enter" role="group" aria-label="Confirm upload data">
                        <span className="inline-confirm-text">
                            Upload {pendingUploadSummary} into current planner?
                        </span>
                        <div className="inline-confirm-actions">
                            <button
                                type="button"
                                className="icon-button inline-confirm-accept"
                                onClick={onConfirmUploadData}
                                aria-label="Confirm upload"
                                title="Confirm upload"
                            >
                                ✓
                            </button>
                            <button
                                type="button"
                                className="icon-button inline-confirm-cancel"
                                onClick={onCancelUploadData}
                                aria-label="Cancel upload"
                                title="Cancel upload"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

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
                        >
                            All data
                        </button>
                        <button
                            type="button"
                            className={`scope-menu-item${exportScope === 'unassigned' ? ' active' : ''}`}
                            onClick={() => onSelectExportScope('unassigned')}
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
                                >
                                    Bucket: {bucket.name}
                                </button>
                            );
                        })}
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
                                onClick={onConfirmRestoreData}
                                aria-label="Confirm restore"
                                title="Confirm restore"
                            >
                                ✓
                            </button>
                            <button
                                type="button"
                                className="icon-button inline-confirm-cancel"
                                onClick={onCancelRestoreData}
                                aria-label="Cancel restore"
                                title="Cancel restore"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

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
                                onClick={onDismissRestoreUndoCard}
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
                                onClick={onUndoRestoreData}
                                aria-label="Undo restore"
                            >
                                Undo restore
                            </button>
                        </div>
                    </div>
                )}
            </details>

            {dataActionMessage && <p className="data-message">{dataActionMessage}</p>}

            <input
                ref={restoreInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Restore planner data from JSON"
                onChange={onRestoreFileChange}
            />
            <input
                ref={uploadInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="Upload planner data from JSON"
                onChange={onUploadFileChange}
            />
        </Wrapper>
    );
}
