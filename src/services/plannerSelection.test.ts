import { describe, expect, it } from 'vitest';
import {
    getBucketTaskSelectionState,
    getSelectedTaskCount,
    getSelectedTasksInVisibleOrder,
    getVisibleBucketTaskIds,
    isTaskSelected,
    pruneTaskSelection,
    setVisibleBucketTaskSelection,
    setVisibleTaskListSelection,
    toggleTaskSelection,
    type SelectionTaskReference,
} from './plannerSelection';

interface SyntheticTask extends SelectionTaskReference {
    title: string;
    completed: boolean;
    archived: boolean;
    projectId: string;
}

const tasks: SyntheticTask[] = [
    {
        id: 'task-a',
        projectId: 'project-active',
        bucketId: 'bucket-a',
        title: 'First visible task',
        completed: false,
        archived: false,
    },
    {
        id: 'task-b',
        projectId: 'project-active',
        bucketId: 'bucket-a',
        title: 'Second visible task',
        completed: true,
        archived: false,
    },
    {
        id: 'task-c',
        projectId: 'project-active',
        bucketId: 'bucket-b',
        title: 'Other bucket task',
        completed: false,
        archived: false,
    },
    {
        id: 'task-unassigned-1',
        projectId: 'project-active',
        bucketId: null,
        title: 'First unassigned task',
        completed: false,
        archived: false,
    },
    {
        id: 'task-unassigned-2',
        projectId: 'project-active',
        bucketId: null,
        title: 'Second unassigned task',
        completed: false,
        archived: false,
    },
];

describe('explicit task selection', () => {
    it('toggles membership without changing task completion', () => {
        const originalSelection = new Set<string>();
        const completedBefore = tasks[1].completed;

        const selected = toggleTaskSelection(originalSelection, 'task-b');
        expect(isTaskSelected(selected, 'task-b')).toBe(true);
        expect(originalSelection).toEqual(new Set());
        expect(tasks[1].completed).toBe(completedBefore);

        const deselected = toggleTaskSelection(selected, 'task-b');
        expect(isTaskSelected(deselected, 'task-b')).toBe(false);
        expect(tasks[1].completed).toBe(completedBefore);
    });

    it('selects and deselects exactly the supplied visible task list', () => {
        const originalSelection = new Set(['task-existing']);

        const selected = setVisibleTaskListSelection(
            originalSelection,
            ['task-a', 'task-b', 'task-a'],
            true,
        );
        expect(selected).toEqual(new Set(['task-existing', 'task-a', 'task-b']));
        expect(originalSelection).toEqual(new Set(['task-existing']));

        const deselected = setVisibleTaskListSelection(
            selected,
            ['task-a', 'task-hidden'],
            false,
        );
        expect(deselected).toEqual(new Set(['task-existing', 'task-b']));
    });

    it('derives unchecked, indeterminate, and checked states for a named bucket', () => {
        expect(getBucketTaskSelectionState(new Set(), tasks, 'bucket-a')).toBe('unchecked');
        expect(getBucketTaskSelectionState(new Set(['task-a']), tasks, 'bucket-a')).toBe('indeterminate');
        expect(getBucketTaskSelectionState(
            new Set(['task-a', 'task-b', 'task-c']),
            tasks,
            'bucket-a',
        )).toBe('checked');
    });

    it('supports tri-state selection for the null Unassigned bucket', () => {
        expect(getVisibleBucketTaskIds(tasks, null)).toEqual([
            'task-unassigned-1',
            'task-unassigned-2',
        ]);
        expect(getBucketTaskSelectionState(
            new Set(['task-unassigned-1']),
            tasks,
            null,
        )).toBe('indeterminate');

        const selected = setVisibleBucketTaskSelection(new Set(['task-c']), tasks, null, true);
        expect(selected).toEqual(new Set([
            'task-c',
            'task-unassigned-1',
            'task-unassigned-2',
        ]));
        expect(getBucketTaskSelectionState(selected, tasks, null)).toBe('checked');

        const deselected = setVisibleBucketTaskSelection(selected, tasks, null, false);
        expect(deselected).toEqual(new Set(['task-c']));
        expect(getBucketTaskSelectionState(deselected, tasks, null)).toBe('unchecked');
    });

    it('affects only currently visible tasks when selecting a bucket', () => {
        const visibleTasks = tasks.filter((task) => task.id !== 'task-b');

        const selected = setVisibleBucketTaskSelection(
            new Set(['task-c']),
            visibleTasks,
            'bucket-a',
            true,
        );

        expect(selected).toEqual(new Set(['task-c', 'task-a']));
        expect(selected.has('task-b')).toBe(false);
    });

    it('treats a bucket with no visible tasks as unchecked and leaves selection unchanged', () => {
        const originalSelection = new Set(['task-a']);

        expect(getBucketTaskSelectionState(originalSelection, tasks, 'bucket-empty')).toBe('unchecked');
        expect(setVisibleBucketTaskSelection(
            originalSelection,
            tasks,
            'bucket-empty',
            true,
        )).toEqual(originalSelection);
    });

    it('prunes to the caller-approved visible, active, non-archived task IDs', () => {
        const selection = new Set([
            'task-visible-active',
            'task-filtered-out',
            'task-archived',
            'task-other-project',
            'task-deleted',
        ]);
        const allowedTaskIds = new Set(['task-visible-active']);

        expect(pruneTaskSelection(selection, allowedTaskIds)).toEqual(
            new Set(['task-visible-active']),
        );
        expect(selection.size).toBe(5);
    });

    it('reports the selected count from the pruned transient set', () => {
        expect(getSelectedTaskCount(new Set())).toBe(0);
        expect(getSelectedTaskCount(new Set(['task-a', 'task-b', 'task-c']))).toBe(3);
    });

    it('returns selected tasks in caller-supplied visible order without mutating selection', () => {
        const selection = new Set(['task-c', 'task-a', 'task-not-visible']);
        const visibleOrder = [tasks[1], tasks[0], tasks[2], tasks[0]];

        const ordered = getSelectedTasksInVisibleOrder(selection, visibleOrder);

        expect(ordered.map((task) => task.id)).toEqual(['task-a', 'task-c']);
        expect(selection).toEqual(new Set(['task-c', 'task-a', 'task-not-visible']));
    });
});
