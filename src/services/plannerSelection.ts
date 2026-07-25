export type BucketTaskSelectionState = 'unchecked' | 'indeterminate' | 'checked';

export interface SelectionTaskReference {
    id: string;
    bucketId: string | null;
}

const uniqueTaskIds = (taskIds: Iterable<string>): string[] => {
    const seen = new Set<string>();
    const uniqueIds: string[] = [];

    for (const taskId of taskIds) {
        if (seen.has(taskId)) continue;
        seen.add(taskId);
        uniqueIds.push(taskId);
    }

    return uniqueIds;
};

export const isTaskSelected = (
    selectedTaskIds: ReadonlySet<string>,
    taskId: string,
): boolean => selectedTaskIds.has(taskId);

export const toggleTaskSelection = (
    selectedTaskIds: ReadonlySet<string>,
    taskId: string,
): Set<string> => {
    const nextSelection = new Set(selectedTaskIds);

    if (nextSelection.has(taskId)) {
        nextSelection.delete(taskId);
    } else {
        nextSelection.add(taskId);
    }

    return nextSelection;
};

export const setVisibleTaskListSelection = (
    selectedTaskIds: ReadonlySet<string>,
    visibleTaskIds: Iterable<string>,
    shouldSelect: boolean,
): Set<string> => {
    const nextSelection = new Set(selectedTaskIds);

    for (const taskId of uniqueTaskIds(visibleTaskIds)) {
        if (shouldSelect) {
            nextSelection.add(taskId);
        } else {
            nextSelection.delete(taskId);
        }
    }

    return nextSelection;
};

export const getVisibleBucketTaskIds = (
    visibleTasks: readonly SelectionTaskReference[],
    bucketId: string | null,
): string[] => uniqueTaskIds(
    visibleTasks
        .filter((task) => task.bucketId === bucketId)
        .map((task) => task.id),
);

export const getBucketTaskSelectionState = (
    selectedTaskIds: ReadonlySet<string>,
    visibleTasks: readonly SelectionTaskReference[],
    bucketId: string | null,
): BucketTaskSelectionState => {
    const visibleBucketTaskIds = getVisibleBucketTaskIds(visibleTasks, bucketId);
    if (visibleBucketTaskIds.length === 0) return 'unchecked';

    const selectedCount = visibleBucketTaskIds.reduce(
        (count, taskId) => count + (selectedTaskIds.has(taskId) ? 1 : 0),
        0,
    );

    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === visibleBucketTaskIds.length) return 'checked';
    return 'indeterminate';
};

export const setVisibleBucketTaskSelection = (
    selectedTaskIds: ReadonlySet<string>,
    visibleTasks: readonly SelectionTaskReference[],
    bucketId: string | null,
    shouldSelect: boolean,
): Set<string> => setVisibleTaskListSelection(
    selectedTaskIds,
    getVisibleBucketTaskIds(visibleTasks, bucketId),
    shouldSelect,
);

export const pruneTaskSelection = (
    selectedTaskIds: ReadonlySet<string>,
    allowedTaskIds: ReadonlySet<string>,
): Set<string> => {
    const nextSelection = new Set<string>();

    for (const taskId of selectedTaskIds) {
        if (allowedTaskIds.has(taskId)) {
            nextSelection.add(taskId);
        }
    }

    return nextSelection;
};

export const getSelectedTaskCount = (
    selectedTaskIds: ReadonlySet<string>,
): number => selectedTaskIds.size;

export const getSelectedTasksInVisibleOrder = <Task extends { id: string }>(
    selectedTaskIds: ReadonlySet<string>,
    visibleTasks: readonly Task[],
): Task[] => {
    const seen = new Set<string>();
    const orderedTasks: Task[] = [];

    for (const task of visibleTasks) {
        if (seen.has(task.id) || !selectedTaskIds.has(task.id)) continue;
        seen.add(task.id);
        orderedTasks.push(task);
    }

    return orderedTasks;
};
