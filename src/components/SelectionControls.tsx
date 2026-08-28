import { useEffect, useRef } from 'react';
import type { BucketTaskSelectionState } from '../services/plannerSelection';
import './SelectionControls.css';

interface TaskSelectionCheckboxProps {
    taskTitle: string;
    selected: boolean;
    onChange: (selected: boolean) => void;
    disabled?: boolean;
}

export function TaskSelectionCheckbox({
    taskTitle,
    selected,
    onChange,
    disabled = false,
}: TaskSelectionCheckboxProps) {
    const taskLabel = taskTitle.trim() || 'Untitled task';
    const action = selected ? 'Deselect' : 'Select';
    const accessibleName = `${action} "${taskLabel}" for bulk actions`;

    return (
        <label className="selection-checkbox-control task-selection-control" title={accessibleName}>
            <input
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={(event) => {
                    if (disabled) return;
                    onChange(event.currentTarget.checked);
                }}
                aria-label={accessibleName}
            />
            <span className="selection-checkbox-indicator" aria-hidden="true" />
        </label>
    );
}

interface BucketSelectionCheckboxProps {
    bucketName: string | null;
    state: BucketTaskSelectionState;
    onChange: (selected: boolean) => void;
    disabled?: boolean;
}

export function BucketSelectionCheckbox({
    bucketName,
    state,
    onChange,
    disabled = false,
}: BucketSelectionCheckboxProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const bucketLabel = bucketName === null
        ? 'Unassigned'
        : bucketName.trim() || 'Untitled bucket';
    const checked = state === 'checked';
    const action = checked ? 'Deselect' : 'Select';
    const accessibleName = disabled
        ? `No visible tasks to select in ${bucketLabel}`
        : `${action} all visible tasks in ${bucketLabel}`;

    useEffect(() => {
        if (!inputRef.current) return;
        inputRef.current.indeterminate = state === 'indeterminate';
    }, [state]);

    return (
        <label className="selection-checkbox-control bucket-selection-control" title={accessibleName}>
            <input
                ref={inputRef}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                    if (disabled) return;
                    onChange(event.currentTarget.checked);
                }}
                aria-label={accessibleName}
            />
            <span className="selection-checkbox-indicator" aria-hidden="true" />
        </label>
    );
}

interface SelectionActionsProps {
    selectedCount: number;
    onCopySelected: () => void;
    onClearAll: () => void;
}

export function SelectionActions({
    selectedCount,
    onCopySelected,
    onClearAll,
}: SelectionActionsProps) {
    const hasSelection = selectedCount > 0;
    const selectedLabel = `${selectedCount} selected`;

    return (
        <div className="selection-actions-row" role="group" aria-label="Task selection actions">
            <span className="selection-count" aria-live="polite" aria-atomic="true">
                {selectedLabel}
            </span>
            <button
                type="button"
                className="secondary-button selection-copy-button"
                onClick={onCopySelected}
                disabled={!hasSelection}
                title={hasSelection ? `Copy ${selectedLabel}` : 'Select tasks to copy'}
            >
                Copy selected
            </button>
            <button
                type="button"
                className="secondary-button selection-clear-button"
                onClick={onClearAll}
                disabled={!hasSelection}
                title={hasSelection ? `Clear ${selectedLabel}` : 'No selected tasks to clear'}
            >
                Clear all
            </button>
        </div>
    );
}

interface BucketPinButtonProps {
    bucketName: string;
    pinned: boolean;
    onToggle: () => void;
}

export function BucketPinButton({
    bucketName,
    pinned,
    onToggle,
}: BucketPinButtonProps) {
    const accessibleName = pinned
        ? `Unpin ${bucketName}`
        : `Pin ${bucketName} to the left group`;

    return (
        <button
            type="button"
            className={`icon-button bucket-pin-button ${pinned ? 'is-pinned' : 'is-unpinned'}`}
            onClick={onToggle}
            title={accessibleName}
            aria-label={accessibleName}
            aria-pressed={pinned}
        >
            <span className="bucket-pin-icon" aria-hidden="true">📌</span>
        </button>
    );
}
