import { describe, expect, it } from 'vitest';
import type { BucketV2, PlannerDataV2, Project } from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import {
  resolveQuickAdd,
  type QuickAddDraft,
  type QuickAddGeneratedValues,
  type QuickAddResult,
} from './quickAdd';

const timestamp = '2026-07-25T12:00:00.000Z';

const project = (id: string, name: string): Project => ({
  id,
  name,
  description: '',
  priority: 0,
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const bucket = (id: string, projectId: string, name: string): BucketV2 => ({
  id,
  projectId,
  name,
  description: '',
  templateDefinitionId: null,
  priority: 0,
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const baseData = (): PlannerDataV2 => ({
  version: PLANNER_DATA_V2_VERSION,
  projects: [
    project('project-current', 'Roadmap'),
    project('project-other', 'Operations'),
  ],
  buckets: [
    bucket('bucket-inbox', 'project-current', 'Inbox'),
    bucket('bucket-other', 'project-other', 'Inbox'),
  ],
  tasks: [],
  templates: [],
  templateDefinitions: [],
});

const blankDraft = (): QuickAddDraft => ({
  taskTitle: '',
  bucketName: '',
  projectName: '',
  selectedBucketId: null,
  selectedProjectId: null,
});

const generated = (overrides: Partial<QuickAddGeneratedValues> = {}): QuickAddGeneratedValues => ({
  taskId: 'task-generated',
  bucketId: 'bucket-generated',
  projectId: 'project-generated',
  timestamp,
  ...overrides,
});

const resolve = (
  draft: Partial<QuickAddDraft>,
  data: PlannerDataV2 = baseData(),
  generatedValues: QuickAddGeneratedValues = generated(),
): QuickAddResult => resolveQuickAdd({
  data,
  currentProjectId: 'project-current',
  draft: { ...blankDraft(), ...draft },
  generated: generatedValues,
});

const expectSuccess = (result: QuickAddResult): Extract<QuickAddResult, { ok: true }> => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result;
};

describe('resolveQuickAdd', () => {
  it('rejects whitespace-only input as not meaningful', () => {
    expect(resolve({
      taskTitle: '  ',
      projectName: '\t',
      bucketName: '\n',
    })).toMatchObject({
      ok: false,
      code: 'NO_MEANINGFUL_INPUT',
      field: 'form',
    });
  });

  it('defaults a blank project to the current project and a blank bucket to Unassigned', () => {
    const result = expectSuccess(resolve({
      taskTitle: '  Write launch brief  ',
      projectName: '  ',
      bucketName: '\t',
    }));

    expect(result.addition.project).toBeUndefined();
    expect(result.addition.bucket).toBeUndefined();
    expect(result.addition.task).toMatchObject({
      id: 'task-generated',
      projectId: 'project-current',
      bucketId: null,
      title: 'Write launch brief',
    });
    expect(result.activationProjectId).toBe('project-current');
  });

  it('creates a complete project for project-only input', () => {
    const result = expectSuccess(resolve({ projectName: '  New Initiative  ' }));

    expect(result.addition).toEqual({
      project: {
        id: 'project-generated',
        name: 'New Initiative',
        description: '',
        priority: 0,
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    expect(result.activationProjectId).toBe('project-generated');
  });

  it('creates a complete bucket in the current project for bucket-only input', () => {
    const result = expectSuccess(resolve({ bucketName: '  Next Up  ' }));

    expect(result.addition).toEqual({
      bucket: {
        id: 'bucket-generated',
        projectId: 'project-current',
        name: 'Next Up',
        description: '',
        templateDefinitionId: null,
        priority: 0,
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    expect(result.activationProjectId).toBe('project-current');
  });

  it('creates a project, bucket, and task with internally consistent references', () => {
    const result = expectSuccess(resolve({
      taskTitle: 'First task',
      projectName: 'New Initiative',
      bucketName: 'Planning',
    }));

    expect(result.addition.project?.id).toBe('project-generated');
    expect(result.addition.bucket).toMatchObject({
      id: 'bucket-generated',
      projectId: 'project-generated',
    });
    expect(result.addition.task).toMatchObject({
      id: 'task-generated',
      projectId: 'project-generated',
      bucketId: 'bucket-generated',
    });
  });

  it('reuses case-insensitive trimmed exact project and bucket matches', () => {
    const result = expectSuccess(resolve({
      taskTitle: 'Review plan',
      projectName: '  rOaDmAp ',
      bucketName: ' INBOX  ',
    }));

    expect(result.addition.project).toBeUndefined();
    expect(result.addition.bucket).toBeUndefined();
    expect(result.addition.task).toMatchObject({
      projectId: 'project-current',
      bucketId: 'bucket-inbox',
    });
  });

  it('rejects existing-only reuse when it adds nothing and stays on the current project', () => {
    expect(resolve({ projectName: 'roadmap' })).toMatchObject({
      ok: false,
      code: 'NO_MEANINGFUL_INPUT',
    });
    expect(resolve({ bucketName: 'inbox' })).toMatchObject({
      ok: false,
      code: 'NO_MEANINGFUL_INPUT',
    });
  });

  it('treats selecting a different existing project alone as a meaningful activation', () => {
    const result = expectSuccess(resolve({
      projectName: 'Operations',
      selectedProjectId: 'project-other',
    }));

    expect(result.addition).toEqual({});
    expect(result.activationProjectId).toBe('project-other');
  });

  it('requires an explicit project selection when normalized duplicate names are ambiguous', () => {
    const data = baseData();
    data.projects.push(project('project-duplicate', '  ROADMAP  '));

    expect(resolve({
      taskTitle: 'Review plan',
      projectName: 'roadmap',
    }, data)).toMatchObject({
      ok: false,
      code: 'AMBIGUOUS_PROJECT',
      field: 'project',
    });

    const selected = expectSuccess(resolve({
      taskTitle: 'Review plan',
      projectName: 'roadmap',
      selectedProjectId: 'project-duplicate',
    }, data));
    expect(selected.addition.task?.projectId).toBe('project-duplicate');
  });

  it('requires an explicit bucket selection when project-scoped normalized names are ambiguous', () => {
    const data = baseData();
    data.buckets.push(bucket('bucket-duplicate', 'project-current', ' INBOX '));

    expect(resolve({
      taskTitle: 'Review plan',
      bucketName: 'inbox',
    }, data)).toMatchObject({
      ok: false,
      code: 'AMBIGUOUS_BUCKET',
      field: 'bucket',
    });

    const selected = expectSuccess(resolve({
      taskTitle: 'Review plan',
      bucketName: 'inbox',
      selectedBucketId: 'bucket-duplicate',
    }, data));
    expect(selected.addition.task?.bucketId).toBe('bucket-duplicate');
  });

  it('rejects stale, mismatched, and cross-project explicit selections', () => {
    expect(resolve({
      taskTitle: 'Task',
      projectName: 'Roadmap',
      selectedProjectId: 'missing-project',
    })).toMatchObject({
      ok: false,
      code: 'INVALID_PROJECT_SELECTION',
    });

    expect(resolve({
      taskTitle: 'Task',
      projectName: 'Roadmap',
      selectedProjectId: 'project-other',
    })).toMatchObject({
      ok: false,
      code: 'INVALID_PROJECT_SELECTION',
    });

    expect(resolve({
      taskTitle: 'Task',
      bucketName: 'Inbox',
      selectedBucketId: 'bucket-other',
    })).toMatchObject({
      ok: false,
      code: 'INVALID_BUCKET_SELECTION',
    });
  });

  it('rejects a missing current project when a blank project needs the default', () => {
    const data = baseData();
    data.projects = data.projects.filter((item) => item.id !== 'project-current');

    expect(resolve({ taskTitle: 'Task' }, data)).toMatchObject({
      ok: false,
      code: 'CURRENT_PROJECT_NOT_FOUND',
      field: 'project',
    });
  });

  it('rejects generated ID collisions, including collisions between incoming entities', () => {
    expect(resolve(
      { projectName: 'New Initiative' },
      baseData(),
      generated({ projectId: 'bucket-inbox' }),
    )).toMatchObject({
      ok: false,
      code: 'ID_COLLISION',
      field: 'project',
    });

    expect(resolve(
      {
        taskTitle: 'Task',
        projectName: 'New Initiative',
        bucketName: 'Planning',
      },
      baseData(),
      generated({ projectId: 'same-id', bucketId: 'same-id' }),
    )).toMatchObject({
      ok: false,
      code: 'ID_COLLISION',
      field: 'bucket',
    });
  });

  it('rejects invalid generated values only when an entity would be created', () => {
    expect(resolve(
      { bucketName: 'New Bucket' },
      baseData(),
      generated({ timestamp: '   ' }),
    )).toMatchObject({
      ok: false,
      code: 'INVALID_GENERATED_VALUES',
      field: 'form',
    });

    expect(resolve(
      {
        projectName: 'Operations',
        selectedProjectId: 'project-other',
      },
      baseData(),
      generated({ timestamp: '', projectId: '' }),
    )).toMatchObject({
      ok: true,
      addition: {},
      activationProjectId: 'project-other',
    });
  });
});
