import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { BucketTaskSelectionState } from '../services/plannerSelection';
import type { BucketV2 as Bucket, PlannerTaskV2 as PlannerTask } from '../types/v2';
import { BucketPinButton, BucketSelectionCheckbox } from './SelectionControls';
import { TaskCard } from './TaskCard';

interface BucketColumnProps {
    columnIndex: number;
    bucket: Bucket | null;
    tasks: PlannerTask[];
    draggedTaskId: string | null;
    isBucketDragActive?: boolean;
    isBucketDragSource?: boolean;
    nudgeFromLeftGap?: boolean;
    nudgeFromRightGap?: boolean;
    isBucketDropSettled?: boolean;
    bucketDropSettleFrom?: 'left' | 'right' | null;
    draggedAccentIndex: number | null;
    highlightedTaskId: string | null;
    uploadedTaskIdSet?: Set<string>;
    registerColumnRef?: (bucketId: string, element: HTMLElement | null) => void;
    isWarpHighlight?: boolean;
    onQuickAddTask: (bucketId: string | null, title: string) => void;
    onCopyBucketTasks?: (bucketId: string | null) => void;
    onCopyTask?: (task: PlannerTask, bucketName: string) => void;
    onEditTask: (task: PlannerTask) => void;
    onDeleteTask: (task: PlannerTask) => void;
    onToggleTask: (taskId: string) => void;
    onMoveTask: (taskId: string, bucketId: string | null, targetIndex?: number) => void;
    onMoveTasks?: (taskIds: string[], bucketId: string | null, targetIndex?: number) => void;
    onToggleTaskPin: (taskId: string) => void;
    onDragStart: (taskId: string, taskIds: string[]) => void;
    onDragEnd: () => void;
    selectedTaskIds?: ReadonlySet<string>;
    bucketSelectionState?: BucketTaskSelectionState;
    onTaskSelectionChange?: (taskId: string, selected: boolean) => void;
    onBucketSelectionChange?: (selected: boolean) => void;
    onPasteIntoBucket?: (bucketId: string | null) => void;
    canPasteIntoBucket?: boolean;
    onBucketDragStart?: (bucketId: string) => void;
    onBucketDragEnd?: () => void;
    bucketDropIndex?: number;
    onBucketDragHover?: (targetIndex: number) => void;
    onBucketDrop?: (targetIndex: number) => void;
    onMoveBucketByOffset?: (bucketId: string, offset: -1 | 1) => void;
    canMoveBucketLeft?: boolean;
    canMoveBucketRight?: boolean;
    onBucketDropSettleEnd?: () => void;
    onToggleBucketPin?: (bucket: Bucket) => void;
    onRenameBucket?: (bucket: Bucket) => void;
    onDeleteBucket?: (bucket: Bucket) => void;
}

const accentIndexFromBucket = (bucketId: string | null) => {
    if (!bucketId) return 0;
    const hash = bucketId
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return (hash % 8) + 1;
};

export function BucketColumn({
    columnIndex,
    bucket,
    tasks,
    draggedTaskId,
    isBucketDragActive = false,
    isBucketDragSource = false,
    nudgeFromLeftGap = false,
    nudgeFromRightGap = false,
    isBucketDropSettled = false,
    bucketDropSettleFrom = null,
    draggedAccentIndex,
    highlightedTaskId,
    uploadedTaskIdSet,
    registerColumnRef,
    isWarpHighlight = false,
    onQuickAddTask,
    onCopyBucketTasks,
    onCopyTask,
    onEditTask,
    onDeleteTask,
    onToggleTask,
    onMoveTask,
    onMoveTasks,
    onToggleTaskPin,
    onDragStart,
    onDragEnd,
    selectedTaskIds,
    bucketSelectionState = 'unchecked',
    onTaskSelectionChange,
    onBucketSelectionChange,
    onPasteIntoBucket,
    canPasteIntoBucket = false,
    onBucketDragStart,
    onBucketDragEnd,
    bucketDropIndex,
    onBucketDragHover,
    onBucketDrop,
    onMoveBucketByOffset,
    canMoveBucketLeft = false,
    canMoveBucketRight = false,
    onBucketDropSettleEnd,
    onToggleBucketPin,
    onRenameBucket,
    onDeleteBucket,
}: BucketColumnProps) {
    const [isEntering, setIsEntering] = useState(true);
    const [isOver, setIsOver] = useState(false);
    const [activeDropIndex, setActiveDropIndex] = useState<number | null>(null);
    const [settledDropIndex, setSettledDropIndex] = useState<number | null>(null);
    const [settledTaskId, setSettledTaskId] = useState<string | null>(null);
    const [inlineTaskTitle, setInlineTaskTitle] = useState('');
    const [isInlineTaskEntryOpen, setIsInlineTaskEntryOpen] = useState(false);
    const settleTimeoutRef = useRef<number | null>(null);
    const inlineTaskInputRef = useRef<HTMLInputElement>(null);
    const bucketDragPreviewRef = useRef<HTMLElement | null>(null);
    const bucketId = bucket?.id ?? null;
    const bucketLabel = bucket?.name ?? 'Unassigned';
    const accentIndex = accentIndexFromBucket(bucketId);
    const dragSourceAccentIndex = draggedAccentIndex ?? 0;
    const staggerIndex = columnIndex % 12;

    useEffect(() => {
        if (!draggedTaskId) {
            setIsOver(false);
            setActiveDropIndex(null);
        }
    }, [draggedTaskId]);

    useEffect(() => {
        if (!isBucketDragActive) return;
        setIsOver(false);
        setActiveDropIndex(null);
    }, [isBucketDragActive]);

    const removeBucketDragPreview = () => {
        bucketDragPreviewRef.current?.remove();
        bucketDragPreviewRef.current = null;
    };

    useEffect(() => () => {
        if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current);
        }
        removeBucketDragPreview();
    }, []);

    const startBucketDrag = (event: DragEvent<HTMLElement>) => {
        if (!bucket) return;

        removeBucketDragPreview();
        const preview = document.createElement('div');
        preview.className = `bucket-drag-preview bucket-accent-${accentIndex}`;
        preview.textContent = bucket.name;
        document.body.appendChild(preview);
        bucketDragPreviewRef.current = preview;

        try {
            event.dataTransfer.setData('text/plain', bucket.id);
            event.dataTransfer.effectAllowed = 'move';
        } catch {
            removeBucketDragPreview();
            return;
        }

        // A custom drag image is optional. Some WebView2 builds can reject it
        // after a native drag has already started; keep the transfer and board
        // state active so the browser's default preview remains a usable fallback.
        onBucketDragStart?.(bucket.id);
        try {
            event.dataTransfer.setDragImage(preview, 28, 22);
        } catch {
            removeBucketDragPreview();
        }
    };

    const endBucketDrag = () => {
        removeBucketDragPreview();
        onBucketDragEnd?.();
    };

    const getBucketDropTargetIndex = (event: DragEvent<HTMLElement>) => {
        if (bucketDropIndex === undefined) return null;
        const rect = event.currentTarget.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        return event.clientX < midpoint ? bucketDropIndex : bucketDropIndex + 1;
    };

    const drop = (event: DragEvent<HTMLElement>, targetIndex?: number) => {
        if (isBucketDragActive) return;
        event.preventDefault();
        event.stopPropagation();
        const encodedTaskIds = event.dataTransfer.getData('application/x-planner-task-ids');
        const parsedTaskIds = (() => {
            if (!encodedTaskIds) return [] as string[];
            try {
                const value: unknown = JSON.parse(encodedTaskIds);
                return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
            } catch {
                return [] as string[];
            }
        })();
        const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId;
        const moveIds = parsedTaskIds.length > 0 ? parsedTaskIds : (taskId ? [taskId] : []);

        if (moveIds.length > 0) {
            if (moveIds.length > 1 && onMoveTasks) {
                onMoveTasks(moveIds, bucketId, targetIndex);
            } else {
                onMoveTask(moveIds[0], bucketId, targetIndex);
            }
            setSettledTaskId(moveIds[0]);
            setSettledDropIndex(targetIndex ?? tasks.length);
            if (settleTimeoutRef.current !== null) {
                window.clearTimeout(settleTimeoutRef.current);
            }
            settleTimeoutRef.current = window.setTimeout(() => {
                setSettledTaskId(null);
                setSettledDropIndex(null);
                settleTimeoutRef.current = null;
            }, 820);
        }
        setIsOver(false);
        setActiveDropIndex(null);
        onDragEnd();
    };

    const moveTaskByOffset = (taskId: string, currentIndex: number, offset: -1 | 1) => {
        const targetIndex = Math.max(0, Math.min(tasks.length - 1, currentIndex + offset));
        if (targetIndex === currentIndex) return;
        onMoveTask(taskId, bucketId, targetIndex);
    };

    const openInlineTaskEntry = () => {
        setIsInlineTaskEntryOpen(true);
        window.requestAnimationFrame(() => {
            inlineTaskInputRef.current?.focus();
        });
    };

    const submitInlineTask = () => {
        const title = inlineTaskTitle.trim();
        if (!title) return;
        onQuickAddTask(bucketId, title);
        setInlineTaskTitle('');
        window.requestAnimationFrame(() => {
            inlineTaskInputRef.current?.focus();
        });
    };

    const handleInlineTaskKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitInlineTask();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            setInlineTaskTitle('');
            setIsInlineTaskEntryOpen(false);
        }
    };

    return (
        <section
            ref={(element) => {
                if (bucket) registerColumnRef?.(bucket.id, element);
            }}
            className={`bucket-column bucket-accent-${accentIndex} drag-source-${dragSourceAccentIndex} column-stagger-${staggerIndex}${isEntering ? ' bucket-entering' : ''}${isOver ? ' drag-over' : ''}${isBucketDragSource ? ' bucket-drag-source' : ''}${isWarpHighlight ? ' warp-highlight' : ''}${nudgeFromLeftGap ? ' bucket-drop-nudge-left' : ''}${nudgeFromRightGap ? ' bucket-drop-nudge-right' : ''}${isBucketDropSettled ? ' bucket-drop-settled' : ''}${bucketDropSettleFrom === 'left' ? ' bucket-drop-settled-from-left' : ''}${bucketDropSettleFrom === 'right' ? ' bucket-drop-settled-from-right' : ''}`}
            onDragOver={(event) => {
                if (isBucketDragActive) {
                    const targetIndex = getBucketDropTargetIndex(event);
                    if (targetIndex === null || !onBucketDragHover) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    onBucketDragHover(targetIndex);
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setIsOver(true);
            }}
            onDragLeave={(event) => {
                if (isBucketDragActive) return;
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsOver(false);
                }
            }}
            onDrop={(event) => {
                if (isBucketDragActive) {
                    const targetIndex = getBucketDropTargetIndex(event);
                    if (targetIndex === null || !onBucketDrop) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onBucketDrop(targetIndex);
                    return;
                }
                drop(event, tasks.length);
            }}
            onAnimationEnd={(event) => {
                if (event.animationName === 'reveal-column-opacity') {
                    setIsEntering(false);
                    return;
                }
                if (!isBucketDropSettled) return;
                if (event.animationName !== 'bucket-relocate-settle') return;
                onBucketDropSettleEnd?.();
            }}
        >
            <header className="bucket-header">
                {onBucketSelectionChange && (
                    <BucketSelectionCheckbox
                        bucketName={bucket?.name ?? null}
                        state={bucketSelectionState}
                        onChange={onBucketSelectionChange}
                        disabled={tasks.length === 0}
                    />
                )}
                <div className="bucket-title-block">
                    <h2>{bucketLabel}</h2>
                    <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
                </div>
                {(onCopyBucketTasks || bucket) && (
                    <div className="bucket-actions">
                        {onCopyBucketTasks && (
                            <button
                                type="button"
                                className="icon-button copy-button"
                                onClick={() => onCopyBucketTasks(bucketId)}
                                title={`Copy ${bucketLabel} as JSON`}
                                aria-label={`Copy ${bucketLabel} as JSON`}
                            >
                                ⧉
                            </button>
                        )}
                        {onPasteIntoBucket && (
                            <button
                                type="button"
                                className="icon-button"
                                onClick={() => onPasteIntoBucket(bucketId)}
                                disabled={!canPasteIntoBucket}
                                title={canPasteIntoBucket ? `Paste tasks into ${bucketLabel}` : 'Copy tasks first to paste'}
                                aria-label={canPasteIntoBucket ? `Paste tasks into ${bucketLabel}` : 'Copy tasks first to paste'}
                            >
                                ⎘
                            </button>
                        )}
                        {bucket && (
                            <>
                                <span
                                    className="icon-button interaction-drag-handle drag-handle bucket-drag-handle"
                                    draggable
                                    onDragStart={startBucketDrag}
                                    onDragEnd={endBucketDrag}
                                    title="Drag to move bucket"
                                    aria-label="Drag to move bucket"
                                    role="img"
                                    tabIndex={0}
                                >
                                    ⠿
                                </span>
                                <button
                                    type="button"
                                    className="icon-button bucket-move-button"
                                    onClick={() => bucket && onMoveBucketByOffset?.(bucket.id, -1)}
                                    disabled={!canMoveBucketLeft}
                                    title="Move bucket left"
                                    aria-label="Move bucket left"
                                >
                                    ←
                                </button>
                                <button
                                    type="button"
                                    className="icon-button bucket-move-button"
                                    onClick={() => bucket && onMoveBucketByOffset?.(bucket.id, 1)}
                                    disabled={!canMoveBucketRight}
                                    title="Move bucket right"
                                    aria-label="Move bucket right"
                                >
                                    →
                                </button>
                                <BucketPinButton
                                    bucketName={bucket.name}
                                    pinned={bucket.pinned}
                                    onToggle={() => onToggleBucketPin?.(bucket)}
                                />
                                <button
                                    type="button"
                                    className="icon-button"
                                    onClick={() => onRenameBucket?.(bucket)}
                                    title="Rename bucket"
                                    aria-label="Rename bucket"
                                >
                                    ✎
                                </button>
                                <button
                                    type="button"
                                    className="icon-button danger"
                                    onClick={() => onDeleteBucket?.(bucket)}
                                    title="Delete bucket"
                                    aria-label="Delete bucket"
                                >
                                    ×
                                </button>
                            </>
                        )}
                    </div>
                )}
            </header>

            <div className="task-list">
                {tasks.map((task, index) => (
                    <div
                        key={task.id}
                        className={`task-row${activeDropIndex === index ? ' active-drop' : ''}${draggedTaskId && activeDropIndex === index ? ' active-drop-preview' : ''}`}
                        onDragOver={(event) => {
                            if (isBucketDragActive) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setActiveDropIndex(index);
                        }}
                    >
                        <div
                            className={`drop-slot interaction-drop-slot interaction-task-drop-slot${draggedTaskId ? ' visible' : ''}${activeDropIndex === index ? ' active' : ''}${settledDropIndex === index ? ' settled' : ''}`}
                            onDragOver={(event) => {
                                if (isBucketDragActive) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setActiveDropIndex(index);
                            }}
                            onDrop={(event) => drop(event, index)}
                            aria-hidden="true"
                        />
                        <TaskCard
                            task={task}
                            onEdit={() => onEditTask(task)}
                            onDelete={() => onDeleteTask(task)}
                            onToggle={() => onToggleTask(task.id)}
                            onTogglePin={() => onToggleTaskPin(task.id)}
                            onMoveUp={() => moveTaskByOffset(task.id, index, -1)}
                            onMoveDown={() => moveTaskByOffset(task.id, index, 1)}
                            canMoveUp={index > 0}
                            canMoveDown={index < tasks.length - 1}
                            onCopy={onCopyTask ? () => onCopyTask(task, bucketLabel) : undefined}
                            isSelected={selectedTaskIds?.has(task.id) ?? false}
                            onSelectionChange={onTaskSelectionChange
                                ? (selected) => onTaskSelectionChange(task.id, selected)
                                : undefined}
                            onCardDragOver={(event) => {
                                if (isBucketDragActive) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setActiveDropIndex(index);
                            }}
                            onDragStart={(event) => {
                                const dragTaskIds = selectedTaskIds?.has(task.id)
                                    ? tasks.filter((item) => selectedTaskIds?.has(item.id)).map((item) => item.id)
                                    : [task.id];
                                event.dataTransfer.setData('application/x-planner-task-ids', JSON.stringify(dragTaskIds));
                                event.dataTransfer.setData('text/plain', dragTaskIds[0]);
                                event.dataTransfer.effectAllowed = 'move';
                                onDragStart(task.id, dragTaskIds);
                            }}
                            onDragEnd={onDragEnd}
                            isDragging={draggedTaskId === task.id}
                            isFreshHighlight={highlightedTaskId === task.id}
                            isUploadedHighlight={uploadedTaskIdSet?.has(task.id) ?? false}
                            isDropSettled={settledTaskId === task.id}
                        />
                    </div>
                ))}

                {tasks.length > 0 && (
                    <div
                        className={`drop-slot interaction-drop-slot interaction-task-drop-slot${draggedTaskId ? ' visible' : ''}${activeDropIndex === tasks.length ? ' active' : ''}${settledDropIndex === tasks.length ? ' settled' : ''}`}
                        onDragOver={(event) => {
                            if (isBucketDragActive) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setActiveDropIndex(tasks.length);
                        }}
                        onDrop={(event) => drop(event, tasks.length)}
                        aria-hidden="true"
                    />
                )}

                {tasks.length === 0 && (
                    <div className="empty-bucket">
                        {draggedTaskId ? 'Drop task here' : 'No tasks'}
                    </div>
                )}
            </div>

            {isInlineTaskEntryOpen ? (
                <input
                    ref={inlineTaskInputRef}
                    className="add-task-inline-input"
                    value={inlineTaskTitle}
                    onChange={(event) => setInlineTaskTitle(event.target.value)}
                    onKeyDown={handleInlineTaskKeyDown}
                    placeholder={`Add task to ${bucketLabel}`}
                    maxLength={160}
                    aria-label={`Add task in ${bucketLabel}`}
                />
            ) : (
                <button type="button" className="add-task-button" onClick={openInlineTaskEntry}>
                    + Add task
                </button>
            )}
        </section>
    );
}
