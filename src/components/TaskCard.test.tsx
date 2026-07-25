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
