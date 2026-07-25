import type { TaskDraft } from '../types';
import type { QuickAddAddition } from '../services/quickAdd';
import type { BucketTemplate, BucketTemplateDefinition, BucketV2, PlannerDataV2, PlannerTaskV2, Project } from '../types/v2';
import { validatePlannerDataV2Integrity } from '../types/validators';

export type PlannerActionV2 =
  | { type: 'APPLY_QUICK_ADD'; addition: QuickAddAddition }
  | { type: 'ADD_PROJECT'; project: Project }
  | { type: 'RENAME_PROJECT'; projectId: string; name: string; updatedAt: string }
  | { type: 'UPDATE_PROJECT_DESCRIPTION'; projectId: string; description: string; updatedAt: string }
  | { type: 'TOGGLE_PROJECT_PIN'; projectId: string; updatedAt: string }
  | { type: 'MOVE_PROJECT'; projectId: string; targetIndex: number }
  | { type: 'DELETE_PROJECT'; projectId: string }
  | { type: 'ADD_BUCKET'; bucket: BucketV2 }
  | { type: 'MOVE_BUCKET'; projectId: string; bucketId: string; targetIndex: number }
  | { type: 'TOGGLE_BUCKET_PIN'; projectId: string; bucketId: string; updatedAt: string }
  | { type: 'RENAME_BUCKET'; projectId: string; bucketId: string; name: string; updatedAt: string }
  | { type: 'DELETE_BUCKET'; projectId: string; bucketId: string; updatedAt: string }
  | { type: 'ADD_TASK'; task: PlannerTaskV2 }
  | { type: 'ADD_TASK_BATCH'; tasks: PlannerTaskV2[] }
  | { type: 'UPDATE_TASK'; projectId: string; taskId: string; draft: TaskDraft; updatedAt: string }
  | { type: 'TOGGLE_TASK_PIN'; projectId: string; taskId: string; updatedAt: string }
  | { type: 'DELETE_TASK'; projectId: string; taskId: string }
  | { type: 'TOGGLE_TASK'; projectId: string; taskId: string; updatedAt: string }
  | { type: 'MOVE_TASK'; projectId: string; taskId: string; bucketId: string | null; targetIndex?: number; updatedAt: string }
  | { type: 'MOVE_TASKS'; projectId: string; taskIds: string[]; bucketId: string | null; targetIndex?: number; updatedAt: string }
  | { type: 'ARCHIVE_COMPLETED_TASKS'; projectId: string; archivedAt: string }
  | { type: 'UNARCHIVE_TASK'; projectId: string; taskId: string; updatedAt: string }
  | { type: 'ADD_TEMPLATE'; template: BucketTemplate }
  | { type: 'RENAME_TEMPLATE'; templateId: string; name: string; updatedAt: string }
  | { type: 'UPDATE_TEMPLATE_DESCRIPTION'; templateId: string; description: string; updatedAt: string }
  | { type: 'SET_TEMPLATE_ACTIVE'; templateId: string; active: boolean; updatedAt: string }
  | { type: 'MOVE_TEMPLATE'; templateId: string; targetIndex: number }
  | { type: 'DELETE_TEMPLATE'; templateId: string }
  | { type: 'ADD_TEMPLATE_DEFINITION'; definition: BucketTemplateDefinition }
  | { type: 'RENAME_TEMPLATE_DEFINITION'; definitionId: string; name: string; updatedAt: string }
  | { type: 'UPDATE_TEMPLATE_DEFINITION_DESCRIPTION'; definitionId: string; description: string; updatedAt: string }
  | { type: 'SET_TEMPLATE_DEFINITION_DEFAULT_ACTIVE'; definitionId: string; defaultActive: boolean; updatedAt: string }
  | { type: 'MOVE_TEMPLATE_DEFINITION'; definitionId: string; targetIndex: number; updatedAt: string }
  | { type: 'DELETE_TEMPLATE_DEFINITION'; definitionId: string }
  | { type: 'APPLY_TEMPLATE'; projectId: string; templateId: string; buckets: BucketV2[] }
  | { type: 'REPLACE_DATA'; data: PlannerDataV2 };

const normalizePinnedOrder = <Item extends { pinned: boolean }>(items: Item[]): Item[] => {
  const pinned = items.filter((item) => item.pinned);
  const unpinned = items.filter((item) => !item.pinned);
  return [...pinned, ...unpinned];
};

export const hasPlannerDataV2Id = (state: PlannerDataV2, id: string): boolean => (
  state.projects.some((project) => project.id === id) ||
  state.buckets.some((bucket) => bucket.id === id) ||
  state.tasks.some((task) => task.id === id) ||
  state.templates.some((template) => template.id === id) ||
  state.templateDefinitions.some((definition) => definition.id === id)
);

const areSameIdOrder = <Item extends { id: string }>(left: Item[], right: Item[]): boolean => (
  left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
);

const areSameReferences = <Item>(left: Item[], right: Item[]): boolean => (
  left.length === right.length && left.every((item, index) => item === right[index])
);

const moveWithOrder = <Item extends { id: string }>(
  items: Item[],
  itemId: string,
  targetIndex: number,
): Item[] => {
  const sourceIndex = items.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return items;

  // Clamp targetIndex to valid range [0, items.length - 1]
  const clampedTargetIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
  if (sourceIndex === clampedTargetIndex) return items; // No-op: already at target

  // Remove the item from its current position
  const withoutMoved = items.filter((item) => item.id !== itemId);

  // Insert at the target index in the reduced array
  const nextItems = [
    ...withoutMoved.slice(0, clampedTargetIndex),
    items[sourceIndex],
    ...withoutMoved.slice(clampedTargetIndex),
  ];

  return areSameIdOrder(items, nextItems) ? items : nextItems;
};

const sortDefinitionsForTemplate = (definitions: BucketTemplateDefinition[]): BucketTemplateDefinition[] => (
  definitions.slice().sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    return left.id.localeCompare(right.id);
  })
);

const normalizeDefinitionPositions = (
  definitions: BucketTemplateDefinition[],
  updatedAt: string,
): BucketTemplateDefinition[] => definitions.map((definition, index) => (
  definition.position === index
    ? definition
    : { ...definition, position: index, updatedAt }
));

const templateDefinitionIsReferenced = (state: PlannerDataV2, definitionId: string): boolean => (
  state.buckets.some((bucket) => bucket.templateDefinitionId === definitionId)
);

const templateHasReferencedDefinitions = (state: PlannerDataV2, templateId: string): boolean => {
  const definitionIds = new Set(
    state.templateDefinitions
      .filter((definition) => definition.templateId === templateId)
      .map((definition) => definition.id),
  );

  return state.buckets.some((bucket) => (
    bucket.templateDefinitionId !== null && definitionIds.has(bucket.templateDefinitionId)
  ));
};

const areSameTaskPositions = (
  left: PlannerTaskV2[],
  right: PlannerTaskV2[],
  movedTaskIds: Set<string>,
  targetBucketId: string | null,
): boolean => (
  areSameIdOrder(left, right) &&
  left.every((task) => !movedTaskIds.has(task.id) || task.bucketId === targetBucketId)
);

const moveWithPinnedOrder = <Item extends { id: string; pinned: boolean }>(
  items: Item[],
  itemId: string,
  targetIndex: number,
): Item[] => {
  const sourceIndex = items.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return items;
  const movingItem = items[sourceIndex];

  const withoutMoved = items.filter((item) => item.id !== itemId);
  const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  const safeIndex = Math.max(0, Math.min(adjustedTargetIndex, withoutMoved.length));
  const groupInsertIndex = withoutMoved
    .slice(0, safeIndex)
    .filter((item) => item.pinned === movingItem.pinned).length;
  const sameGroup = withoutMoved.filter((item) => item.pinned === movingItem.pinned);
  const otherGroup = withoutMoved.filter((item) => item.pinned !== movingItem.pinned);
  const reorderedGroup = [
    ...sameGroup.slice(0, groupInsertIndex),
    movingItem,
    ...sameGroup.slice(groupInsertIndex),
  ];

  const nextItems = movingItem.pinned
    ? [...reorderedGroup, ...otherGroup]
    : [...otherGroup, ...reorderedGroup];

  return areSameIdOrder(items, nextItems) ? items : nextItems;
};

const togglePinnedWithOrder = <Item extends { id: string; pinned: boolean }>(
  items: Item[],
  itemId: string,
  update: (item: Item, pinned: boolean) => Item,
): Item[] => {
  const target = items.find((item) => item.id === itemId);
  if (!target) return items;

  const updated = update(target, !target.pinned);
  const withoutTarget = items.filter((item) => item.id !== itemId);
  const pinned = withoutTarget.filter((item) => item.pinned);
  const unpinned = withoutTarget.filter((item) => !item.pinned);

  return [...pinned, updated, ...unpinned];
};

const bucketBelongsToProject = (
  state: PlannerDataV2,
  projectId: string,
  bucketId: string | null,
): boolean => {
  if (bucketId === null) return true;
  return state.buckets.some((bucket) => bucket.id === bucketId && bucket.projectId === projectId);
};

const replaceProjectBuckets = (
  state: PlannerDataV2,
  projectId: string,
  buckets: BucketV2[],
): PlannerDataV2 => {
  const nextBuckets = state.projects.flatMap((project) => (
    project.id === projectId
      ? buckets
      : state.buckets.filter((bucket) => bucket.projectId === project.id)
  ));

  return nextBuckets === state.buckets || areSameReferences(nextBuckets, state.buckets)
    ? state
    : { ...state, buckets: nextBuckets };
};

const replaceProjectTasks = (
  state: PlannerDataV2,
  projectId: string,
  tasks: PlannerTaskV2[],
): PlannerDataV2 => {
  const nextTasks = state.projects.flatMap((project) => (
    project.id === projectId
      ? tasks
      : state.tasks.filter((task) => task.projectId === project.id)
  ));

  return nextTasks === state.tasks || areSameReferences(nextTasks, state.tasks)
    ? state
    : { ...state, tasks: nextTasks };
};

const moveTaskWithOrder = (
  tasks: PlannerTaskV2[],
  taskId: string,
  bucketId: string | null,
  updatedAt: string,
  targetIndex?: number,
): PlannerTaskV2[] => {
  const fromTask = tasks.find((task) => task.id === taskId);
  if (!fromTask) return tasks;

  const withoutMoved = tasks.filter((task) => task.id !== taskId);
  const movedTask = {
    ...fromTask,
    bucketId,
    updatedAt,
  };

  const bucketTasks = withoutMoved.filter(
    (task) => task.bucketId === bucketId && !task.archivedAt,
  );

  const safeIndex = Math.max(
    0,
    Math.min(targetIndex ?? bucketTasks.length, bucketTasks.length),
  );

  const beforeTask = bucketTasks[safeIndex] ?? null;
  const nextTasks = (() => {
    if (beforeTask) {
      const insertAt = withoutMoved.findIndex((task) => task.id === beforeTask.id);
      return [
        ...withoutMoved.slice(0, insertAt),
        movedTask,
        ...withoutMoved.slice(insertAt),
      ];
    }

    const lastBucketIndex = (() => {
      for (let index = withoutMoved.length - 1; index >= 0; index -= 1) {
        if (withoutMoved[index]?.bucketId === bucketId && !withoutMoved[index]?.archivedAt) {
          return index;
        }
      }
      return -1;
    })();

    if (lastBucketIndex >= 0) {
      const insertAt = lastBucketIndex + 1;
      return [
        ...withoutMoved.slice(0, insertAt),
        movedTask,
        ...withoutMoved.slice(insertAt),
      ];
    }

    return [...withoutMoved, movedTask];
  })();

  return areSameTaskPositions(tasks, nextTasks, new Set([taskId]), bucketId) ? tasks : nextTasks;
};

const moveTasksWithOrder = (
  tasks: PlannerTaskV2[],
  taskIds: string[],
  bucketId: string | null,
  updatedAt: string,
  targetIndex?: number,
): PlannerTaskV2[] => {
  const selectedTaskIds = new Set(taskIds);
  const movingTasks = tasks.filter((task) => selectedTaskIds.has(task.id));
  if (movingTasks.length === 0) return tasks;

  const withoutMoved = tasks.filter((task) => !selectedTaskIds.has(task.id));
  const movedTasks = movingTasks.map((task) => ({
    ...task,
    bucketId,
    updatedAt,
  }));

  const bucketTasks = withoutMoved.filter(
    (task) => task.bucketId === bucketId && !task.archivedAt,
  );

  const safeIndex = Math.max(
    0,
    Math.min(targetIndex ?? bucketTasks.length, bucketTasks.length),
  );

  const beforeTask = bucketTasks[safeIndex] ?? null;
  const nextTasks = (() => {
    if (beforeTask) {
      const insertAt = withoutMoved.findIndex((task) => task.id === beforeTask.id);
      return [
        ...withoutMoved.slice(0, insertAt),
        ...movedTasks,
        ...withoutMoved.slice(insertAt),
      ];
    }

    const lastBucketIndex = (() => {
      for (let index = withoutMoved.length - 1; index >= 0; index -= 1) {
        if (withoutMoved[index]?.bucketId === bucketId && !withoutMoved[index]?.archivedAt) {
          return index;
        }
      }
      return -1;
    })();

    if (lastBucketIndex >= 0) {
      const insertAt = lastBucketIndex + 1;
      return [
        ...withoutMoved.slice(0, insertAt),
        ...movedTasks,
        ...withoutMoved.slice(insertAt),
      ];
    }

    return [...withoutMoved, ...movedTasks];
  })();

  return areSameTaskPositions(tasks, nextTasks, selectedTaskIds, bucketId) ? tasks : nextTasks;
};

const applyQuickAddAddition = (
  state: PlannerDataV2,
  addition: QuickAddAddition,
): PlannerDataV2 => {
  const project = addition.project
    ? {
      ...addition.project,
      name: addition.project.name.trim(),
      description: addition.project.description.trim(),
    }
    : undefined;
  const bucket = addition.bucket
    ? {
      ...addition.bucket,
      name: addition.bucket.name.trim(),
      description: addition.bucket.description.trim(),
    }
    : undefined;
  const task = addition.task
    ? {
      ...addition.task,
      title: addition.task.title.trim(),
      description: addition.task.description.trim(),
    }
    : undefined;

  if (!project && !bucket && !task) return state;
  if (project && !project.name) return state;
  if (bucket && !bucket.name) return state;
  if (task && !task.title) return state;

  const additions = [project, bucket, task].filter(
    (entity): entity is Project | BucketV2 | PlannerTaskV2 => entity !== undefined,
  );
  const incomingIds = new Set<string>();
  for (const entity of additions) {
    if (!entity.id || entity.id !== entity.id.trim()) return state;
    if (incomingIds.has(entity.id) || hasPlannerDataV2Id(state, entity.id)) return state;
    incomingIds.add(entity.id);
  }

  const projectIds = [
    project?.id,
    bucket?.projectId,
    task?.projectId,
  ].filter((projectId): projectId is string => projectId !== undefined);
  const targetProjectId = projectIds[0];
  if (!targetProjectId || projectIds.some((projectId) => projectId !== targetProjectId)) return state;

  if (project) {
    if (project.id !== targetProjectId) return state;
  } else if (!state.projects.some((item) => item.id === targetProjectId)) {
    return state;
  }

  if (bucket?.templateDefinitionId !== null && bucket?.templateDefinitionId !== undefined) {
    if (!state.templateDefinitions.some((definition) => definition.id === bucket.templateDefinitionId)) {
      return state;
    }
    if (state.buckets.some((item) => (
      item.projectId === targetProjectId
      && item.templateDefinitionId === bucket.templateDefinitionId
    ))) {
      return state;
    }
  }

  if (task?.bucketId !== null && task?.bucketId !== undefined) {
    const referencesIncomingBucket = bucket?.id === task.bucketId;
    const referencesExistingBucket = state.buckets.some((item) => (
      item.id === task.bucketId && item.projectId === targetProjectId
    ));
    if (!referencesIncomingBucket && !referencesExistingBucket) return state;
  }

  let nextState = state;
  if (project) {
    nextState = {
      ...nextState,
      projects: normalizePinnedOrder([...nextState.projects, project]),
    };
  }

  if (bucket) {
    const projectBuckets = nextState.buckets.filter((item) => item.projectId === targetProjectId);
    nextState = replaceProjectBuckets(
      nextState,
      targetProjectId,
      normalizePinnedOrder([...projectBuckets, bucket]),
    );
  }

  if (task) {
    const projectTasks = nextState.tasks.filter((item) => item.projectId === targetProjectId);
    nextState = replaceProjectTasks(nextState, targetProjectId, [...projectTasks, task]);
  }

  return nextState;
};

export const plannerReducerV2 = (
  state: PlannerDataV2,
  action: PlannerActionV2,
): PlannerDataV2 => {
  switch (action.type) {
    case 'APPLY_QUICK_ADD':
      return applyQuickAddAddition(state, action.addition);

    case 'ADD_PROJECT': {
      if (!action.project.name.trim()) return state;
      if (hasPlannerDataV2Id(state, action.project.id)) return state;
      return {
        ...state,
        projects: normalizePinnedOrder([...state.projects, action.project]),
      };
    }

    case 'RENAME_PROJECT': {
      const name = action.name.trim();
      if (!name) return state;
      const project = state.projects.find((item) => item.id === action.projectId);
      if (!project || project.name === name) return state;
      return {
        ...state,
        projects: state.projects.map((project) => (
          project.id === action.projectId
            ? { ...project, name, updatedAt: action.updatedAt }
            : project
        )),
      };
    }

    case 'UPDATE_PROJECT_DESCRIPTION': {
      const description = action.description.trim();
      const project = state.projects.find((item) => item.id === action.projectId);
      if (!project || project.description === description) return state;
      return {
        ...state,
        projects: state.projects.map((project) => (
          project.id === action.projectId
            ? { ...project, description, updatedAt: action.updatedAt }
            : project
        )),
      };
    }

    case 'TOGGLE_PROJECT_PIN': {
      if (!state.projects.some((project) => project.id === action.projectId)) return state;
      return {
        ...state,
        projects: togglePinnedWithOrder(state.projects, action.projectId, (project, pinned) => ({
          ...project,
          pinned,
          updatedAt: action.updatedAt,
        })),
      };
    }

    case 'MOVE_PROJECT': {
      const projects = moveWithPinnedOrder(state.projects, action.projectId, action.targetIndex);
      if (projects === state.projects) return state;
      return {
        ...state,
        projects,
      };
    }

    case 'DELETE_PROJECT': {
      if (state.projects.length <= 1) return state;
      if (!state.projects.some((project) => project.id === action.projectId)) return state;
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== action.projectId),
        buckets: state.buckets.filter((bucket) => bucket.projectId !== action.projectId),
        tasks: state.tasks.filter((task) => task.projectId !== action.projectId),
      };
    }

    case 'ADD_BUCKET': {
      const name = action.bucket.name.trim();
      if (!name) return state;
      if (!state.projects.some((project) => project.id === action.bucket.projectId)) return state;
      if (hasPlannerDataV2Id(state, action.bucket.id)) return state;
      const projectBuckets = state.buckets.filter((bucket) => bucket.projectId === action.bucket.projectId);
      return replaceProjectBuckets(
        state,
        action.bucket.projectId,
        normalizePinnedOrder([...projectBuckets, { ...action.bucket, name }]),
      );
    }

    case 'MOVE_BUCKET': {
      if (!state.projects.some((project) => project.id === action.projectId)) return state;
      if (!state.buckets.some((bucket) => bucket.id === action.bucketId && bucket.projectId === action.projectId)) return state;
      const projectBuckets = state.buckets.filter((bucket) => bucket.projectId === action.projectId);
      return replaceProjectBuckets(
        state,
        action.projectId,
        moveWithPinnedOrder(projectBuckets, action.bucketId, action.targetIndex),
      );
    }

    case 'TOGGLE_BUCKET_PIN': {
      if (!state.buckets.some((bucket) => bucket.id === action.bucketId && bucket.projectId === action.projectId)) return state;
      const projectBuckets = state.buckets.filter((bucket) => bucket.projectId === action.projectId);
      return replaceProjectBuckets(
        state,
        action.projectId,
        togglePinnedWithOrder(projectBuckets, action.bucketId, (bucket, pinned) => ({
          ...bucket,
          pinned,
          updatedAt: action.updatedAt,
        })),
      );
    }

    case 'RENAME_BUCKET': {
      const name = action.name.trim();
      if (!name) return state;
      const bucket = state.buckets.find((item) => item.id === action.bucketId && item.projectId === action.projectId);
      if (!bucket || bucket.name === name) return state;
      return {
        ...state,
        buckets: state.buckets.map((bucket) => (
          bucket.id === action.bucketId && bucket.projectId === action.projectId
            ? { ...bucket, name, updatedAt: action.updatedAt }
            : bucket
        )),
      };
    }

    case 'DELETE_BUCKET': {
      if (!state.buckets.some((bucket) => bucket.id === action.bucketId && bucket.projectId === action.projectId)) return state;
      return {
        ...state,
        buckets: state.buckets.filter(
          (bucket) => !(bucket.id === action.bucketId && bucket.projectId === action.projectId),
        ),
        tasks: state.tasks.map((task) => (
          task.projectId === action.projectId && task.bucketId === action.bucketId
            ? { ...task, bucketId: null, updatedAt: action.updatedAt }
            : task
        )),
      };
    }

    case 'ADD_TASK': {
      const title = action.task.title.trim();
      if (!title) return state;
      if (!state.projects.some((project) => project.id === action.task.projectId)) return state;
      if (!bucketBelongsToProject(state, action.task.projectId, action.task.bucketId)) return state;
      if (hasPlannerDataV2Id(state, action.task.id)) return state;
      const projectTasks = state.tasks.filter((task) => task.projectId === action.task.projectId);
      return replaceProjectTasks(
        state,
        action.task.projectId,
        [...projectTasks, { ...action.task, title, description: action.task.description.trim() }],
      );
    }

    case 'ADD_TASK_BATCH': {
      const tasks = action.tasks.map((task) => ({
        ...task,
        title: task.title.trim(),
        description: task.description.trim(),
      }));
      if (tasks.length === 0) return state;
      if (tasks.some((task) => !task.title)) return state;
      const projectId = tasks[0].projectId;
      if (!tasks.every((task) => task.projectId === projectId)) return state;
      if (!state.projects.some((project) => project.id === projectId)) return state;
      if (!tasks.every((task) => bucketBelongsToProject(state, projectId, task.bucketId))) return state;
      const incomingTaskIds = new Set<string>();
      for (const task of tasks) {
        if (incomingTaskIds.has(task.id) || hasPlannerDataV2Id(state, task.id)) return state;
        incomingTaskIds.add(task.id);
      }
      const projectTasks = state.tasks.filter((task) => task.projectId === projectId);
      return replaceProjectTasks(state, projectId, [...projectTasks, ...tasks]);
    }

    case 'UPDATE_TASK': {
      const title = action.draft.title.trim();
      if (!title) return state;
      if (!bucketBelongsToProject(state, action.projectId, action.draft.bucketId)) return state;
      const task = state.tasks.find((item) => item.id === action.taskId && item.projectId === action.projectId);
      const description = action.draft.description.trim();
      if (!task) return state;
      if (task.title === title && task.description === description && task.bucketId === action.draft.bucketId) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? {
              ...task,
              title,
              description,
              bucketId: action.draft.bucketId,
              updatedAt: action.updatedAt,
            }
            : task
        )),
      };
    }

    case 'TOGGLE_TASK_PIN': {
      if (!state.tasks.some((task) => task.id === action.taskId && task.projectId === action.projectId)) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? { ...task, pinned: !task.pinned, updatedAt: action.updatedAt }
            : task
        )),
      };
    }

    case 'DELETE_TASK': {
      if (!state.tasks.some((task) => task.id === action.taskId && task.projectId === action.projectId)) return state;
      return {
        ...state,
        tasks: state.tasks.filter((task) => !(task.id === action.taskId && task.projectId === action.projectId)),
      };
    }

    case 'TOGGLE_TASK': {
      if (!state.tasks.some((task) => task.id === action.taskId && task.projectId === action.projectId)) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? {
              ...task,
              completed: !task.completed,
              archivedAt: task.archivedAt ? null : task.archivedAt,
              updatedAt: action.updatedAt,
            }
            : task
        )),
      };
    }

    case 'MOVE_TASK': {
      if (!bucketBelongsToProject(state, action.projectId, action.bucketId)) return state;
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (!task || task.projectId !== action.projectId) return state;
      const projectTasks = state.tasks.filter((item) => item.projectId === action.projectId);
      return replaceProjectTasks(
        state,
        action.projectId,
        moveTaskWithOrder(projectTasks, action.taskId, action.bucketId, action.updatedAt, action.targetIndex),
      );
    }

    case 'MOVE_TASKS': {
      if (!bucketBelongsToProject(state, action.projectId, action.bucketId)) return state;
      if (new Set(action.taskIds).size !== action.taskIds.length) return state;
      const selectedTaskIds = new Set(action.taskIds);
      const selectedTasks = state.tasks.filter((task) => selectedTaskIds.has(task.id));
      if (selectedTasks.length !== action.taskIds.length) return state;
      if (!selectedTasks.every((task) => task.projectId === action.projectId)) return state;
      const projectTasks = state.tasks.filter((item) => item.projectId === action.projectId);
      return replaceProjectTasks(
        state,
        action.projectId,
        moveTasksWithOrder(projectTasks, action.taskIds, action.bucketId, action.updatedAt, action.targetIndex),
      );
    }

    case 'ARCHIVE_COMPLETED_TASKS': {
      if (!state.tasks.some((task) => task.projectId === action.projectId && task.completed && !task.archivedAt)) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.projectId === action.projectId && task.completed && !task.archivedAt
            ? { ...task, archivedAt: action.archivedAt, updatedAt: action.archivedAt }
            : task
        )),
      };
    }

    case 'UNARCHIVE_TASK': {
      const task = state.tasks.find((item) => item.id === action.taskId && item.projectId === action.projectId);
      if (!task || task.archivedAt === null) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (
          task.id === action.taskId && task.projectId === action.projectId
            ? {
              ...task,
              archivedAt: null,
              completed: false,
              updatedAt: action.updatedAt,
            }
            : task
        )),
      };
    }

    case 'ADD_TEMPLATE': {
      const name = action.template.name.trim();
      if (!name) return state;
      if (hasPlannerDataV2Id(state, action.template.id)) return state;
      return {
        ...state,
        templates: [...state.templates, { ...action.template, name, description: action.template.description.trim() }],
      };
    }

    case 'RENAME_TEMPLATE': {
      const name = action.name.trim();
      if (!name) return state;
      const template = state.templates.find((item) => item.id === action.templateId);
      if (!template || template.name === name) return state;
      return {
        ...state,
        templates: state.templates.map((item) => (
          item.id === action.templateId
            ? { ...item, name, updatedAt: action.updatedAt }
            : item
        )),
      };
    }

    case 'UPDATE_TEMPLATE_DESCRIPTION': {
      const description = action.description.trim();
      const template = state.templates.find((item) => item.id === action.templateId);
      if (!template || template.description === description) return state;
      return {
        ...state,
        templates: state.templates.map((item) => (
          item.id === action.templateId
            ? { ...item, description, updatedAt: action.updatedAt }
            : item
        )),
      };
    }

    case 'SET_TEMPLATE_ACTIVE': {
      const template = state.templates.find((item) => item.id === action.templateId);
      if (!template || template.active === action.active) return state;
      return {
        ...state,
        templates: state.templates.map((item) => (
          item.id === action.templateId
            ? { ...item, active: action.active, updatedAt: action.updatedAt }
            : item
        )),
      };
    }

    case 'MOVE_TEMPLATE': {
      const templates = moveWithOrder(state.templates, action.templateId, action.targetIndex);
      if (templates === state.templates) return state;
      return { ...state, templates };
    }

    case 'DELETE_TEMPLATE': {
      if (!state.templates.some((template) => template.id === action.templateId)) return state;
      if (templateHasReferencedDefinitions(state, action.templateId)) return state;
      return {
        ...state,
        templates: state.templates.filter((template) => template.id !== action.templateId),
        templateDefinitions: state.templateDefinitions.filter((definition) => definition.templateId !== action.templateId),
      };
    }

    case 'ADD_TEMPLATE_DEFINITION': {
      const name = action.definition.name.trim();
      if (!name) return state;
      if (hasPlannerDataV2Id(state, action.definition.id)) return state;
      if (!state.templates.some((template) => template.id === action.definition.templateId)) return state;
      return {
        ...state,
        templateDefinitions: [
          ...state.templateDefinitions,
          {
            ...action.definition,
            name,
            description: action.definition.description.trim(),
          },
        ],
      };
    }

    case 'RENAME_TEMPLATE_DEFINITION': {
      const name = action.name.trim();
      if (!name) return state;
      const definition = state.templateDefinitions.find((item) => item.id === action.definitionId);
      if (!definition || definition.name === name) return state;
      return {
        ...state,
        templateDefinitions: state.templateDefinitions.map((item) => (
          item.id === action.definitionId
            ? { ...item, name, updatedAt: action.updatedAt }
            : item
        )),
      };
    }

    case 'UPDATE_TEMPLATE_DEFINITION_DESCRIPTION': {
      const description = action.description.trim();
      const definition = state.templateDefinitions.find((item) => item.id === action.definitionId);
      if (!definition || definition.description === description) return state;
      return {
        ...state,
        templateDefinitions: state.templateDefinitions.map((item) => (
          item.id === action.definitionId
            ? { ...item, description, updatedAt: action.updatedAt }
            : item
        )),
      };
    }

    case 'SET_TEMPLATE_DEFINITION_DEFAULT_ACTIVE': {
      const definition = state.templateDefinitions.find((item) => item.id === action.definitionId);
      if (!definition || definition.defaultActive === action.defaultActive) return state;
      return {
        ...state,
        templateDefinitions: state.templateDefinitions.map((item) => (
          item.id === action.definitionId
            ? { ...item, defaultActive: action.defaultActive, updatedAt: action.updatedAt }
            : item
        )),
      };
    }

    case 'MOVE_TEMPLATE_DEFINITION': {
      const definition = state.templateDefinitions.find((item) => item.id === action.definitionId);
      if (!definition) return state;
      const sameTemplateDefinitions = sortDefinitionsForTemplate(
        state.templateDefinitions.filter((item) => item.templateId === definition.templateId),
      );
      const movedDefinitions = moveWithOrder(sameTemplateDefinitions, action.definitionId, action.targetIndex);
      if (movedDefinitions === sameTemplateDefinitions) return state;
      const normalizedMovedDefinitions = normalizeDefinitionPositions(movedDefinitions, action.updatedAt);
      const movedDefinitionById = new Map(normalizedMovedDefinitions.map((item) => [item.id, item]));

      return {
        ...state,
        templateDefinitions: state.templateDefinitions.map((item) => movedDefinitionById.get(item.id) ?? item),
      };
    }

    case 'DELETE_TEMPLATE_DEFINITION': {
      const definition = state.templateDefinitions.find((item) => item.id === action.definitionId);
      if (!definition) return state;
      if (templateDefinitionIsReferenced(state, action.definitionId)) return state;
      return {
        ...state,
        templateDefinitions: state.templateDefinitions.filter((item) => item.id !== action.definitionId),
      };
    }

    case 'APPLY_TEMPLATE': {
      const project = state.projects.find((item) => item.id === action.projectId);
      const template = state.templates.find((item) => item.id === action.templateId);
      if (!project || !template || !template.active) return state;

      const eligibleDefinitions = sortDefinitionsForTemplate(
        state.templateDefinitions.filter((definition) => (
          definition.templateId === action.templateId && definition.defaultActive
        )),
      );
      const missingDefinitions = eligibleDefinitions.filter((definition) => (
        !state.buckets.some((bucket) => (
          bucket.projectId === action.projectId && bucket.templateDefinitionId === definition.id
        ))
      ));
      if (missingDefinitions.length === 0) return state;
      if (action.buckets.length !== missingDefinitions.length) return state;

      const incomingBucketIds = new Set<string>();
      for (let index = 0; index < missingDefinitions.length; index += 1) {
        const definition = missingDefinitions[index];
        const bucket = action.buckets[index];
        if (!bucket) return state;
        if (incomingBucketIds.has(bucket.id) || hasPlannerDataV2Id(state, bucket.id)) return state;
        if (bucket.projectId !== action.projectId) return state;
        if (bucket.templateDefinitionId !== definition.id) return state;
        if (bucket.name !== definition.name) return state;
        if (bucket.description !== definition.description) return state;
        if (bucket.priority !== definition.priority) return state;
        incomingBucketIds.add(bucket.id);
      }

      return {
        ...state,
        buckets: [...state.buckets, ...action.buckets],
      };
    }

    case 'REPLACE_DATA':
      if (action.data === state) return state;
      validatePlannerDataV2Integrity(action.data);
      return action.data;

    default:
      return state;
  }
};
