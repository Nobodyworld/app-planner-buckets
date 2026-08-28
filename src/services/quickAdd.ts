import type {
  BucketV2,
  PlannerDataV2,
  PlannerTaskV2,
  Project,
} from '../types/v2';

export interface QuickAddDraft {
  taskTitle: string;
  bucketName: string;
  projectName: string;
  selectedBucketId: string | null;
  selectedProjectId: string | null;
}

export interface QuickAddGeneratedValues {
  taskId: string;
  bucketId: string;
  projectId: string;
  timestamp: string;
}

export interface ResolveQuickAddInput {
  data: PlannerDataV2;
  currentProjectId: string;
  draft: QuickAddDraft;
  generated: QuickAddGeneratedValues;
}

export interface QuickAddAddition {
  project?: Project;
  bucket?: BucketV2;
  task?: PlannerTaskV2;
}

export type QuickAddErrorCode =
  | 'NO_MEANINGFUL_INPUT'
  | 'CURRENT_PROJECT_NOT_FOUND'
  | 'INVALID_PROJECT_SELECTION'
  | 'AMBIGUOUS_PROJECT'
  | 'INVALID_BUCKET_SELECTION'
  | 'AMBIGUOUS_BUCKET'
  | 'INVALID_GENERATED_VALUES'
  | 'ID_COLLISION';

export type QuickAddField = 'form' | 'project' | 'bucket' | 'task';

export type QuickAddResult =
  | {
    ok: true;
    addition: QuickAddAddition;
    activationProjectId: string;
  }
  | {
    ok: false;
    code: QuickAddErrorCode;
    field: QuickAddField;
    message: string;
  };

const normalizeName = (value: string): string => value.trim().toLocaleLowerCase();

const errorResult = (
  code: QuickAddErrorCode,
  field: QuickAddField,
  message: string,
): QuickAddResult => ({
  ok: false,
  code,
  field,
  message,
});

const allEntityIds = (data: PlannerDataV2): Set<string> => new Set([
  ...data.projects.map((project) => project.id),
  ...data.buckets.map((bucket) => bucket.id),
  ...data.tasks.map((task) => task.id),
  ...data.templates.map((template) => template.id),
  ...data.templateDefinitions.map((definition) => definition.id),
]);

const validateGeneratedId = (
  id: string,
  entityName: 'project' | 'bucket' | 'task',
  usedIds: Set<string>,
): QuickAddResult | null => {
  if (!id || id !== id.trim()) {
    return errorResult(
      'INVALID_GENERATED_VALUES',
      entityName,
      `The generated ${entityName} ID is invalid.`,
    );
  }

  if (usedIds.has(id)) {
    return errorResult(
      'ID_COLLISION',
      entityName,
      `The generated ${entityName} ID is already in use.`,
    );
  }

  usedIds.add(id);
  return null;
};

export const resolveQuickAdd = ({
  data,
  currentProjectId,
  draft,
  generated,
}: ResolveQuickAddInput): QuickAddResult => {
  const taskTitle = draft.taskTitle.trim();
  const projectName = draft.projectName.trim();
  const bucketName = draft.bucketName.trim();

  if (!taskTitle && !projectName && !bucketName) {
    return errorResult(
      'NO_MEANINGFUL_INPUT',
      'form',
      'Enter a task, project, or bucket to add.',
    );
  }

  let projectToAdd: Project | undefined;
  let targetProject: Project | undefined;

  if (!projectName) {
    targetProject = data.projects.find((project) => project.id === currentProjectId);
    if (!targetProject) {
      return errorResult(
        'CURRENT_PROJECT_NOT_FOUND',
        'project',
        'The current project no longer exists.',
      );
    }
  } else if (draft.selectedProjectId !== null) {
    targetProject = data.projects.find((project) => project.id === draft.selectedProjectId);
    if (!targetProject || normalizeName(targetProject.name) !== normalizeName(projectName)) {
      return errorResult(
        'INVALID_PROJECT_SELECTION',
        'project',
        'Select a project that matches the entered project name.',
      );
    }
  } else {
    const matchingProjects = data.projects.filter(
      (project) => normalizeName(project.name) === normalizeName(projectName),
    );

    if (matchingProjects.length > 1) {
      return errorResult(
        'AMBIGUOUS_PROJECT',
        'project',
        'More than one project has this name. Select the intended project.',
      );
    }

    targetProject = matchingProjects[0];
    if (!targetProject) {
      projectToAdd = {
        id: generated.projectId,
        name: projectName,
        description: '',
        priority: 0,
        pinned: false,
        createdAt: generated.timestamp,
        updatedAt: generated.timestamp,
      };
      targetProject = projectToAdd;
    }
  }

  let bucketToAdd: BucketV2 | undefined;
  let targetBucket: BucketV2 | undefined;

  if (bucketName) {
    if (draft.selectedBucketId !== null) {
      targetBucket = data.buckets.find((bucket) => bucket.id === draft.selectedBucketId);
      if (
        !targetBucket
        || targetBucket.projectId !== targetProject.id
        || normalizeName(targetBucket.name) !== normalizeName(bucketName)
      ) {
        return errorResult(
          'INVALID_BUCKET_SELECTION',
          'bucket',
          'Select a bucket in the chosen project that matches the entered bucket name.',
        );
      }
    } else {
      const matchingBuckets = data.buckets.filter((bucket) => (
        bucket.projectId === targetProject.id
        && normalizeName(bucket.name) === normalizeName(bucketName)
      ));

      if (matchingBuckets.length > 1) {
        return errorResult(
          'AMBIGUOUS_BUCKET',
          'bucket',
          'More than one bucket in this project has this name. Select the intended bucket.',
        );
      }

      targetBucket = matchingBuckets[0];
      if (!targetBucket) {
        bucketToAdd = {
          id: generated.bucketId,
          projectId: targetProject.id,
          name: bucketName,
          description: '',
          templateDefinitionId: null,
          priority: 0,
          pinned: false,
          createdAt: generated.timestamp,
          updatedAt: generated.timestamp,
        };
        targetBucket = bucketToAdd;
      }
    }
  }

  let taskToAdd: PlannerTaskV2 | undefined;
  if (taskTitle) {
    taskToAdd = {
      id: generated.taskId,
      projectId: targetProject.id,
      bucketId: targetBucket?.id ?? null,
      title: taskTitle,
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: generated.timestamp,
      updatedAt: generated.timestamp,
    };
  }

  if ((projectToAdd || bucketToAdd || taskToAdd) && !generated.timestamp.trim()) {
    return errorResult(
      'INVALID_GENERATED_VALUES',
      'form',
      'The generated timestamp is invalid.',
    );
  }

  const usedIds = allEntityIds(data);
  if (projectToAdd) {
    const generatedIdError = validateGeneratedId(projectToAdd.id, 'project', usedIds);
    if (generatedIdError) return generatedIdError;
  }
  if (bucketToAdd) {
    const generatedIdError = validateGeneratedId(bucketToAdd.id, 'bucket', usedIds);
    if (generatedIdError) return generatedIdError;
  }
  if (taskToAdd) {
    const generatedIdError = validateGeneratedId(taskToAdd.id, 'task', usedIds);
    if (generatedIdError) return generatedIdError;
  }

  if (!projectToAdd && !bucketToAdd && !taskToAdd && targetProject.id === currentProjectId) {
    return errorResult(
      'NO_MEANINGFUL_INPUT',
      'form',
      'Enter something new to add, or choose a different project.',
    );
  }

  return {
    ok: true,
    addition: {
      ...(projectToAdd ? { project: projectToAdd } : {}),
      ...(bucketToAdd ? { bucket: bucketToAdd } : {}),
      ...(taskToAdd ? { task: taskToAdd } : {}),
    },
    activationProjectId: targetProject.id,
  };
};
