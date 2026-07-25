import type { DragEvent, MouseEvent } from 'react';
import type { PlannerTask } from '../types';

interface TaskCardProps {
  task: PlannerTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onTogglePin?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onCopy?: () => void;
  onAuxAction?: () => void;
  auxActionLabel?: string;
  bucketName?: string;
  dragLabel?: string;
  draggable?: boolean;
  isDragging?: boolean;
  isSelected?: boolean;
  isFreshHighlight?: boolean;
  isUploadedHighlight?: boolean;
  isDropSettled?: boolean;
  onCardClick?: (event: MouseEvent<HTMLElement>) => void;
  onCardDragOver?: (event: DragEvent<HTMLElement>) => void;
  onCardDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggle,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onCopy,
  onAuxAction,
  auxActionLabel,
  bucketName,
  dragLabel = '⠿',
  draggable = true,
  isDragging = false,
  isSelected = false,
  isFreshHighlight = false,
  isUploadedHighlight = false,
  isDropSettled = false,
  onCardClick,
  onCardDragOver,
  onCardDrop,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  return (
    <article
      className={`task-card${task.completed ? ' completed' : ''}${isDragging ? ' is-dragging' : ''}${isSelected ? ' is-selected' : ''}${isFreshHighlight ? ' fresh-task-highlight' : ''}${isUploadedHighlight ? ' uploaded-task-highlight' : ''}${isDropSettled ? ' drop-settled' : ''}`}
      onClick={onCardClick}
      onDragOver={onCardDragOver}
      onDrop={onCardDrop}
    >
      <div className="task-card-header">
        <label className="completion-control" title="Mark complete">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={onToggle}
            aria-label={`Mark "${task.title}" complete`}
          />
          <span aria-hidden="true" />
        </label>
        <button type="button" className="task-title" onClick={onEdit}>
          {task.title}
        </button>
      </div>

      {task.description && <p>{task.description}</p>}
      {bucketName && <p className="task-meta">Bucket: {bucketName}</p>}

      <div className="task-card-actions">
        <span
          className="drag-hint interaction-drag-handle drag-handle"
          title="Drag to move"
          aria-hidden="true"
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {dragLabel}
        </span>
        {onMoveUp && (
          <button
            type="button"
            className="icon-button task-move-button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move task up"
            aria-label="Move task up"
          >
            ↑
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            className="icon-button task-move-button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move task down"
            aria-label="Move task down"
          >
            ↓
          </button>
        )}
        {onTogglePin && (
          <button type="button" className={`text-button${task.pinned ? ' is-pinned' : ''}`} onClick={onTogglePin}>
            {task.pinned ? 'Unpin' : 'Pin'}
          </button>
        )}
        {onCopy && (
          <button type="button" className="text-button" onClick={onCopy}>
            Copy
          </button>
        )}
        {onAuxAction && auxActionLabel && (
          <button type="button" className="text-button" onClick={onAuxAction}>
            {auxActionLabel}
          </button>
        )}
        <button type="button" className="text-button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="text-button danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
}
