import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlannerTask } from '../types';
import { TaskCard } from './TaskCard';

const task: PlannerTask = {
    id: 'task-1',
    title: 'Selectable task',
    description: 'Selectable task details',
    bucketId: null,
    pinned: false,
    completed: false,
    archivedAt: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
};

describe('TaskCard drag gating', () => {
    it('limits drag initiation to the existing drag handle', () => {
        const onDragStart = vi.fn();
        render(
            <TaskCard
                task={task}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onToggle={vi.fn()}
                onDragStart={onDragStart}
                onDragEnd={vi.fn()}
            />
        );

        const description = screen.getByText('Selectable task details');
        const card = description.closest('.task-card');
        const handle = card?.querySelector('.drag-handle');

        expect(card).not.toHaveAttribute('draggable');
        expect(handle).toHaveAttribute('draggable', 'true');
        fireEvent.dragStart(description);
        expect(onDragStart).not.toHaveBeenCalled();
        fireEvent.dragStart(handle!);
        expect(onDragStart).toHaveBeenCalledOnce();
    });
});

describe('TaskCard selection', () => {
    it('keeps explicit bulk selection independent from completion and ordinary card clicks', () => {
        const onSelectionChange = vi.fn();
        const onToggle = vi.fn();
        const { container } = render(
            <TaskCard
                task={task}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onToggle={onToggle}
                onSelectionChange={onSelectionChange}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
            />
        );

        const selectionCheckbox = screen.getByRole('checkbox', {
            name: 'Select "Selectable task" for bulk actions',
        });
        const completionCheckbox = screen.getByRole('checkbox', {
            name: 'Mark "Selectable task" complete',
        });

        expect(selectionCheckbox.closest('label')).toHaveClass('task-selection-control');
        expect(completionCheckbox.closest('label')).toHaveClass('completion-control');

        fireEvent.click(screen.getByText('Selectable task details'));
        expect(onSelectionChange).not.toHaveBeenCalled();
        expect(onToggle).not.toHaveBeenCalled();

        fireEvent.click(selectionCheckbox);
        expect(onSelectionChange).toHaveBeenCalledWith(true);
        expect(onToggle).not.toHaveBeenCalled();

        fireEvent.click(completionCheckbox);
        expect(onToggle).toHaveBeenCalledOnce();
        expect(onSelectionChange).toHaveBeenCalledOnce();
        expect(container.querySelector('.task-card')).not.toHaveClass('completed');
    });
});
