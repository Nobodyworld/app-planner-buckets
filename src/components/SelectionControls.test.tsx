// @ts-expect-error Vitest executes this source-contract assertion in Node, while app code omits Node types.
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    BucketPinButton,
    BucketSelectionCheckbox,
    SelectionActions,
    TaskSelectionCheckbox,
} from './SelectionControls';

describe('TaskSelectionCheckbox', () => {
    it('renders a square bulk-selection checkbox distinct from completion', () => {
        const onChange = vi.fn();
        const { container, rerender } = render(
            <TaskSelectionCheckbox
                taskTitle="Synthetic task"
                selected={false}
                onChange={onChange}
            />,
        );

        const checkbox = screen.getByRole('checkbox', {
            name: 'Select "Synthetic task" for bulk actions',
        });
        expect(checkbox).not.toBeChecked();
        expect(checkbox.closest('label')).toHaveClass(
            'selection-checkbox-control',
            'task-selection-control',
        );
        expect(container.querySelector('.completion-control')).toBeNull();

        fireEvent.click(checkbox);
        expect(onChange).toHaveBeenCalledWith(true);

        rerender(
            <TaskSelectionCheckbox
                taskTitle="Synthetic task"
                selected
                onChange={onChange}
            />,
        );
        expect(screen.getByRole('checkbox', {
            name: 'Deselect "Synthetic task" for bulk actions',
        })).toBeChecked();
    });

    it('uses a deterministic Untitled task label for a blank legacy title', () => {
        render(
            <TaskSelectionCheckbox
                taskTitle="   "
                selected={false}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByRole('checkbox', {
            name: 'Select "Untitled task" for bulk actions',
        })).toBeInTheDocument();
    });
});

describe('BucketSelectionCheckbox', () => {
    it('sets and clears the native indeterminate property across tri-state updates', () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <BucketSelectionCheckbox
                bucketName="Ready"
                state="unchecked"
                onChange={onChange}
            />,
        );

        const unchecked = screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Ready',
        });
        expect(unchecked).not.toBeChecked();
        expect(unchecked).not.toBePartiallyChecked();
        fireEvent.click(unchecked);
        expect(onChange).toHaveBeenCalledWith(true);

        rerender(
            <BucketSelectionCheckbox
                bucketName="Ready"
                state="indeterminate"
                onChange={onChange}
            />,
        );
        const mixed = screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Ready',
        });
        expect(mixed).toBePartiallyChecked();
        expect((mixed as HTMLInputElement).indeterminate).toBe(true);

        rerender(
            <BucketSelectionCheckbox
                bucketName="Ready"
                state="checked"
                onChange={onChange}
            />,
        );
        const checked = screen.getByRole('checkbox', {
            name: 'Deselect all visible tasks in Ready',
        });
        expect(checked).toBeChecked();
        expect((checked as HTMLInputElement).indeterminate).toBe(false);
        fireEvent.click(checked);
        expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it('uses an explicit Unassigned accessible name for a null bucket', () => {
        render(
            <BucketSelectionCheckbox
                bucketName={null}
                state="indeterminate"
                onChange={vi.fn()}
            />,
        );

        const checkbox = screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Unassigned',
        });
        expect(checkbox).toBePartiallyChecked();
        expect(checkbox.closest('label')).toHaveClass('bucket-selection-control');
    });

    it('distinguishes a blank legacy bucket and clearly announces a disabled empty state', () => {
        render(
            <BucketSelectionCheckbox
                bucketName="   "
                state="unchecked"
                onChange={vi.fn()}
                disabled
            />,
        );

        const checkbox = screen.getByRole('checkbox', {
            name: 'No visible tasks to select in Untitled bucket',
        });
        expect(checkbox).toBeDisabled();
        expect(checkbox).toHaveAttribute('aria-label', 'No visible tasks to select in Untitled bucket');
        expect(checkbox.closest('label')).toHaveAttribute(
            'title',
            'No visible tasks to select in Untitled bucket',
        );
    });
});

describe('SelectionActions', () => {
    it('shows the selected count with disabled zero-state actions', () => {
        render(
            <SelectionActions
                selectedCount={0}
                onCopySelected={vi.fn()}
                onClearAll={vi.fn()}
            />,
        );

        expect(screen.getByText('0 selected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Copy selected' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();
    });

    it('places enabled Copy selected and Clear all actions together', () => {
        const onCopySelected = vi.fn();
        const onClearAll = vi.fn();
        render(
            <SelectionActions
                selectedCount={3}
                onCopySelected={onCopySelected}
                onClearAll={onClearAll}
            />,
        );

        const group = screen.getByRole('group', { name: 'Task selection actions' });
        expect(group).toHaveTextContent('3 selected');
        const buttons = screen.getAllByRole('button');
        expect(buttons.map((button) => button.textContent)).toEqual([
            'Copy selected',
            'Clear all',
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Copy selected' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        expect(onCopySelected).toHaveBeenCalledOnce();
        expect(onClearAll).toHaveBeenCalledOnce();
    });
});

describe('BucketPinButton', () => {
    it('uses the same pin glyph with muted and active visual states', () => {
        const onToggle = vi.fn();
        const { rerender } = render(
            <BucketPinButton
                bucketName="Ready"
                pinned={false}
                onToggle={onToggle}
            />,
        );

        const unpinned = screen.getByRole('button', {
            name: 'Pin Ready to the left group',
        });
        expect(unpinned).toHaveClass('bucket-pin-button', 'is-unpinned');
        expect(unpinned).toHaveAttribute('aria-pressed', 'false');
        expect(unpinned).toHaveTextContent('📌');
        fireEvent.click(unpinned);
        expect(onToggle).toHaveBeenCalledOnce();

        rerender(
            <BucketPinButton
                bucketName="Ready"
                pinned
                onToggle={onToggle}
            />,
        );
        const pinned = screen.getByRole('button', { name: 'Unpin Ready' });
        expect(pinned).toHaveClass('bucket-pin-button', 'is-pinned');
        expect(pinned).toHaveAttribute('aria-pressed', 'true');
        expect(pinned).toHaveTextContent('📌');
    });
});

describe('selection control styling contract', () => {
    it('keeps explicit selection indicators square rather than completion circles', () => {
        const stylesheet = readFileSync('src/components/SelectionControls.css', 'utf8');
        const indicator = stylesheet.match(
            /\.selection-checkbox-indicator\s*\{([\s\S]*?)\}/,
        )?.[1] ?? '';

        expect(indicator).toMatch(/width:\s*20px;/);
        expect(indicator).toMatch(/height:\s*20px;/);
        expect(indicator).toMatch(/border-radius:\s*5px;/);
        expect(indicator).not.toMatch(/border-radius:\s*50%;/);
    });
});
