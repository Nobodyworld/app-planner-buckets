import { TaskCard } from '../TaskCard';
import type { PlannerTaskV2 as PlannerTask } from '../../types/v2';

export interface ArchiveStats {
    completed: number;
    visible: number;
}

export interface ArchivePanelProps {
    archivedTasks: PlannerTask[];
    stats: ArchiveStats;
    embedded?: boolean;
    showArchive: boolean;
    showCompleted: boolean;
    showArchiveConfirm: boolean;
    triageRecommendation: string;
    openAdvancedSectionsInTests: boolean;
    onToggleArchive: () => void;
    onShowCompletedChange: (showCompleted: boolean) => void;
    onArchiveCompletedTasks: () => void;
    onConfirmArchiveCompletedTasks: () => void;
    onCancelArchiveCompletedTasks: () => void;
    onEditTask: (task: PlannerTask) => void;
    onDeleteTask: (task: PlannerTask) => void;
    onToggleTask: (task: PlannerTask) => void;
    onToggleTaskPin: (task: PlannerTask) => void;
    onCopyTask: (task: PlannerTask) => void;
    onUnarchiveTask: (task: PlannerTask) => void;
    getBucketName: (bucketId: string | null) => string;
}

export function ArchivePanel({
    archivedTasks,
    stats,
    embedded = false,
    showArchive,
    showCompleted,
    showArchiveConfirm,
    triageRecommendation,
    openAdvancedSectionsInTests,
    onToggleArchive,
    onShowCompletedChange,
    onArchiveCompletedTasks,
    onConfirmArchiveCompletedTasks,
    onCancelArchiveCompletedTasks,
    onEditTask,
    onDeleteTask,
    onToggleTask,
    onToggleTaskPin,
    onCopyTask,
    onUnarchiveTask,
    getBucketName,
}: ArchivePanelProps) {
    const Wrapper = embedded ? 'div' : 'section';

    return (
        <Wrapper
            className={`archive-panel${embedded ? '' : ' panel-card'}`}
            aria-label={embedded ? undefined : 'Archive and view options'}
        >
            {!embedded ? (
                <div className="archive-header">
                    <h2>Archive / View Options</h2>
                    <span className="toolbar-meta">{stats.visible} visible</span>
                </div>
            ) : null}

            <div className="archive-controls">
                <label className="inline-toggle" title="Toggle completed task visibility">
                    <input
                        type="checkbox"
                        checked={showCompleted}
                        onChange={(event) => onShowCompletedChange(event.target.checked)}
                    />
                    <span>Show completed</span>
                </label>

                {!showCompleted && (
                    <button
                        type="button"
                        className="text-button"
                        onClick={() => onShowCompletedChange(true)}
                    >
                        Show completed again
                    </button>
                )}

                <p className="toolbar-meta archive-meta">Archived tasks: {archivedTasks.length}</p>
                <p className="toolbar-meta pin-recommendation archive-meta">{triageRecommendation}</p>
            </div>

            <details className="panel-details" aria-label="Archive controls and bucket management" open={openAdvancedSectionsInTests}>
                <summary>Archive controls and bucket management</summary>

                <div className="archive-controls archive-controls-expanded">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onArchiveCompletedTasks}
                        disabled={stats.completed === 0}
                    >
                        Archive completed ({stats.completed})
                    </button>

                    {showArchiveConfirm && stats.completed > 0 && (
                        <div className="inline-confirm" role="group" aria-label="Confirm archive completed tasks">
                            <span className="inline-confirm-text">
                                Archive {stats.completed} completed task{stats.completed === 1 ? '' : 's'}?
                            </span>
                            <div className="inline-confirm-actions">
                                <button
                                    type="button"
                                    className="icon-button inline-confirm-accept"
                                    onClick={onConfirmArchiveCompletedTasks}
                                    aria-label="Confirm archive completed tasks"
                                    title="Confirm"
                                >
                                    ✓
                                </button>
                                <button
                                    type="button"
                                    className="icon-button inline-confirm-cancel"
                                    onClick={onCancelArchiveCompletedTasks}
                                    aria-label="Cancel archive completed tasks"
                                    title="Cancel"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onToggleArchive}
                    >
                        {showArchive ? 'Hide archived task list' : 'Show archived task list'} ({archivedTasks.length})
                    </button>
                </div>

                {showArchive && (
                    archivedTasks.length > 0 ? (
                        <div className="archive-list">
                            {archivedTasks
                                .slice()
                                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                                .map((task) => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        draggable={false}
                                        dragLabel="Archived"
                                        onEdit={() => onEditTask(task)}
                                        onDelete={() => onDeleteTask(task)}
                                        onToggle={() => onToggleTask(task)}
                                        onTogglePin={() => onToggleTaskPin(task)}
                                        onCopy={() => onCopyTask(task)}
                                        onAuxAction={() => onUnarchiveTask(task)}
                                        auxActionLabel="Undo"
                                        onDragStart={(_event) => undefined}
                                        onDragEnd={() => undefined}
                                        bucketName={getBucketName(task.bucketId)}
                                    />
                                ))}
                        </div>
                    ) : (
                        <p className="archive-empty">No archived tasks yet.</p>
                    )
                )}
            </details>
        </Wrapper>
    );
}
