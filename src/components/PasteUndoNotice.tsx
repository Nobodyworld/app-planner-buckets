import './PasteUndoNotice.css';

interface PasteUndoNoticeProps {
  taskCount: number;
  destinationName: string;
  onKeep: () => void;
  onUndo: () => void;
}

export function PasteUndoNotice({
  taskCount,
  destinationName,
  onKeep,
  onUndo,
}: PasteUndoNoticeProps) {
  const taskLabel = taskCount === 1 ? 'task' : 'tasks';

  return (
    <section
      className="paste-undo-notice"
      aria-label="Paste confirmation"
    >
      <p role="status" aria-live="polite" aria-atomic="true">
        Pasted {taskCount} {taskLabel} into {destinationName}. Keep it?
      </p>
      <div className="paste-undo-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onKeep}
          aria-label="Keep pasted tasks"
        >
          <span aria-hidden="true">✓</span> Keep
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onUndo}
          aria-label="Undo pasted tasks"
        >
          <span aria-hidden="true">↶</span> Undo
        </button>
      </div>
    </section>
  );
}
