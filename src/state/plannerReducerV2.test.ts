import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePlannerHistory } from '../hooks/usePlannerHistory';
import type { BucketTemplate, BucketTemplateDefinition, BucketV2, PlannerDataV2, PlannerTaskV2, Project } from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import { plannerReducerV2, type PlannerActionV2 } from './plannerReducerV2';

const timestamp = '2026-07-01T00:00:00.000Z';

const project = (id: string, name = id, pinned = false): Project => ({
  id,
  name,
  description: '',
  priority: 0,
  pinned,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const task = (id: string, projectId: string, bucketId: string | null): PlannerTaskV2 => ({
  id,
  projectId,
  bucketId,
  title: id,
  description: '',
  priority: 0,
  resourceTags: [],
  pinned: false,
  completed: false,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const bucket = (id: string, projectId: string, name = id): BucketV2 => ({
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

const template = (id: string, name = id, active = true): BucketTemplate => ({
  id,
  name,
  description: '',
  active,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const definition = (
  id: string,
  templateId: string,
  name = id,
  position = 0,
  defaultActive = true,
): BucketTemplateDefinition => ({
  id,
  templateId,
  name,
  description: '',
  priority: 0,
  defaultActive,
  position,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const bucketFromDefinition = (
  id: string,
  projectId: string,
  sourceDefinition: BucketTemplateDefinition,
): BucketV2 => ({
  id,
  projectId,
  name: sourceDefinition.name,
  description: sourceDefinition.description,
  templateDefinitionId: sourceDefinition.id,
  priority: sourceDefinition.priority,
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const baseState = (): PlannerDataV2 => ({
  version: PLANNER_DATA_V2_VERSION,
  projects: [project('project-a', 'A', true), project('project-b', 'B')],
  buckets: [
    {
      id: 'bucket-a',
      projectId: 'project-a',
      name: 'A Bucket',
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'bucket-b',
      projectId: 'project-b',
      name: 'B Bucket',
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  tasks: [task('task-a', 'project-a', 'bucket-a'), task('task-b', 'project-b', 'bucket-b')],
  templates: [],
  templateDefinitions: [],
});

const stateWithPinnedBuckets = (): PlannerDataV2 => ({
  ...baseState(),
  buckets: [
    { ...bucket('bucket-p1', 'project-a'), pinned: true },
    { ...bucket('bucket-p2', 'project-a'), pinned: true },
    bucket('bucket-u1', 'project-a'),
    bucket('bucket-u2', 'project-a'),
    bucket('bucket-b', 'project-b'),
  ],
  tasks: [
    task('task-a', 'project-a', 'bucket-u1'),
    task('task-b', 'project-b', 'bucket-b'),
  ],
});

const stateWithTemplate = (): PlannerDataV2 => ({
  ...baseState(),
  templates: [template('template-a', 'Launch'), template('template-b', 'Ops')],
  templateDefinitions: [
    definition('definition-a', 'template-a', 'Ready', 0, true),
    definition('definition-b', 'template-a', 'Done', 1, true),
    definition('definition-c', 'template-a', 'Optional', 2, false),
  ],
});

describe('plannerReducerV2', () => {
  it('creates projects with complete action values', () => {
    const next = plannerReducerV2(baseState(), {
      type: 'ADD_PROJECT',
      project: project('project-c', 'C'),
    });

    expect(next.projects.map((item) => item.id)).toContain('project-c');
  });

  it('renames projects and updates descriptions', () => {
    const renamed = plannerReducerV2(baseState(), {
      type: 'RENAME_PROJECT',
      projectId: 'project-a',
      name: ' Renamed ',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    const described = plannerReducerV2(renamed, {
      type: 'UPDATE_PROJECT_DESCRIPTION',
      projectId: 'project-a',
      description: '  Notes  ',
      updatedAt: '2026-07-03T00:00:00.000Z',
    });

    expect(described.projects[0].name).toBe('Renamed');
    expect(described.projects[0].description).toBe('Notes');
  });

  it('pins and reorders projects inside pinned groups', () => {
    const pinned = plannerReducerV2(baseState(), {
      type: 'TOGGLE_PROJECT_PIN',
      projectId: 'project-b',
      updatedAt: timestamp,
    });

    const moved = plannerReducerV2(pinned, {
      type: 'MOVE_PROJECT',
      projectId: 'project-b',
      targetIndex: 0,
    });

    expect(moved.projects.map((item) => item.id)).toEqual(['project-b', 'project-a']);
  });

  it('prevents deleting the final project', () => {
    const onlyProject: PlannerDataV2 = {
      ...baseState(),
      projects: [project('project-a')],
      buckets: [],
      tasks: [],
    };

    expect(plannerReducerV2(onlyProject, { type: 'DELETE_PROJECT', projectId: 'project-a' })).toBe(onlyProject);
  });

  it('deletes a project with its buckets and tasks', () => {
    const next = plannerReducerV2(baseState(), { type: 'DELETE_PROJECT', projectId: 'project-a' });

    expect(next.projects.map((item) => item.id)).toEqual(['project-b']);
    expect(next.buckets.map((item) => item.id)).toEqual(['bucket-b']);
    expect(next.tasks.map((item) => item.id)).toEqual(['task-b']);
  });

  it('restores a deleted project subtree through undo and redo', () => {
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(baseState(), plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'DELETE_PROJECT', projectId: 'project-a' });
    });

    expect(result.current.state.projects.map((item) => item.id)).toEqual(['project-b']);

    act(() => {
      result.current.undo();
    });

    expect(result.current.state.projects.map((item) => item.id)).toEqual(['project-a', 'project-b']);
    expect(result.current.state.buckets.map((item) => item.id)).toContain('bucket-a');
    expect(result.current.state.tasks.map((item) => item.id)).toContain('task-a');

    act(() => {
      result.current.redo();
    });

    expect(result.current.state.projects.map((item) => item.id)).toEqual(['project-b']);
  });

  it('places a pinned bucket at the pinned-group end when dropped beyond unpinned buckets', () => {
    const state = stateWithPinnedBuckets();
    const next = plannerReducerV2(state, {
      type: 'MOVE_BUCKET',
      projectId: 'project-a',
      bucketId: 'bucket-p1',
      targetIndex: 4,
    });

    expect(next.buckets.filter((item) => item.projectId === 'project-a').map((item) => item.id)).toEqual([
      'bucket-p2',
      'bucket-p1',
      'bucket-u1',
      'bucket-u2',
    ]);
    expect(next.buckets.find((item) => item.id === 'bucket-p1')?.pinned).toBe(true);
  });

  it('reorders a pinned bucket only within the pinned group', () => {
    const state = stateWithPinnedBuckets();
    const next = plannerReducerV2(state, {
      type: 'MOVE_BUCKET',
      projectId: 'project-a',
      bucketId: 'bucket-p2',
      targetIndex: 0,
    });

    expect(next.buckets.filter((item) => item.projectId === 'project-a').map((item) => item.id)).toEqual([
      'bucket-p2',
      'bucket-p1',
      'bucket-u1',
      'bucket-u2',
    ]);
    expect(next.buckets.filter((item) => item.projectId === 'project-a' && !item.pinned).map((item) => item.id)).toEqual([
      'bucket-u1',
      'bucket-u2',
    ]);
  });

  it('keeps an unpinned bucket unpinned at the start of its group when dragged toward pinned buckets', () => {
    const state = stateWithPinnedBuckets();
    const next = plannerReducerV2(state, {
      type: 'MOVE_BUCKET',
      projectId: 'project-a',
      bucketId: 'bucket-u2',
      targetIndex: 0,
    });

    expect(next.buckets.filter((item) => item.projectId === 'project-a').map((item) => item.id)).toEqual([
      'bucket-p1',
      'bucket-p2',
      'bucket-u2',
      'bucket-u1',
    ]);
    expect(next.buckets.find((item) => item.id === 'bucket-u2')?.pinned).toBe(false);
  });

  it('returns the same state for invalid or missing bucket moves', () => {
    const state = stateWithPinnedBuckets();
    const invalidActions: PlannerActionV2[] = [
      { type: 'MOVE_BUCKET', projectId: 'project-a', bucketId: 'missing-bucket', targetIndex: 0 },
      { type: 'MOVE_BUCKET', projectId: 'project-a', bucketId: 'bucket-b', targetIndex: 0 },
    ];

    invalidActions.forEach((action) => {
      expect(plannerReducerV2(state, action)).toBe(state);
    });
  });

  it('scopes bucket deletion and task unassignment to one project', () => {
    const next = plannerReducerV2(baseState(), {
      type: 'DELETE_BUCKET',
      projectId: 'project-a',
      bucketId: 'bucket-a',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(next.buckets.map((item) => item.id)).toEqual(['bucket-b']);
    expect(next.tasks.find((item) => item.id === 'task-a')?.bucketId).toBeNull();
    expect(next.tasks.find((item) => item.id === 'task-b')?.bucketId).toBe('bucket-b');
  });

  it('rejects moving a task into a bucket from another project', () => {
    const state = baseState();
    const next = plannerReducerV2(state, {
      type: 'MOVE_TASK',
      projectId: 'project-a',
      taskId: 'task-a',
      bucketId: 'bucket-b',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(next).toBe(state);
  });

  it('keeps unassigned tasks scoped to their own project', () => {
    const next = plannerReducerV2(baseState(), {
      type: 'MOVE_TASK',
      projectId: 'project-a',
      taskId: 'task-a',
      bucketId: null,
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(next.tasks.find((item) => item.id === 'task-a')?.bucketId).toBeNull();
    expect(next.tasks.find((item) => item.id === 'task-a')?.projectId).toBe('project-a');
    expect(next.tasks.find((item) => item.id === 'task-b')?.bucketId).toBe('bucket-b');
  });

  it('returns the same state reference for reducer no-op actions', () => {
    const state = baseState();
    const noOpActions: PlannerActionV2[] = [
      { type: 'RENAME_PROJECT', projectId: 'missing-project', name: 'Name', updatedAt: timestamp },
      { type: 'RENAME_PROJECT', projectId: 'project-a', name: ' A ', updatedAt: timestamp },
      { type: 'UPDATE_PROJECT_DESCRIPTION', projectId: 'project-a', description: '   ', updatedAt: timestamp },
      { type: 'MOVE_PROJECT', projectId: 'project-a', targetIndex: 0 },
      { type: 'DELETE_PROJECT', projectId: 'missing-project' },
      { type: 'RENAME_BUCKET', projectId: 'project-a', bucketId: 'missing-bucket', name: 'Name', updatedAt: timestamp },
      { type: 'RENAME_BUCKET', projectId: 'project-a', bucketId: 'bucket-a', name: ' A Bucket ', updatedAt: timestamp },
      { type: 'MOVE_BUCKET', projectId: 'project-a', bucketId: 'bucket-a', targetIndex: 0 },
      { type: 'DELETE_BUCKET', projectId: 'project-a', bucketId: 'missing-bucket', updatedAt: timestamp },
      { type: 'UPDATE_TASK', projectId: 'project-a', taskId: 'missing-task', draft: { title: 'Task', description: '', bucketId: null }, updatedAt: timestamp },
      { type: 'UPDATE_TASK', projectId: 'project-a', taskId: 'task-a', draft: { title: 'task-a', description: '', bucketId: 'bucket-a' }, updatedAt: timestamp },
      { type: 'MOVE_TASK', projectId: 'project-a', taskId: 'task-a', bucketId: 'bucket-a', targetIndex: 0, updatedAt: timestamp },
      { type: 'MOVE_TASKS', projectId: 'project-a', taskIds: ['task-a'], bucketId: 'bucket-a', targetIndex: 0, updatedAt: timestamp },
      { type: 'DELETE_TASK', projectId: 'project-a', taskId: 'missing-task' },
      { type: 'ARCHIVE_COMPLETED_TASKS', projectId: 'project-a', archivedAt: timestamp },
      { type: 'UNARCHIVE_TASK', projectId: 'project-a', taskId: 'task-a', updatedAt: timestamp },
      { type: 'ADD_TASK_BATCH', tasks: [task('batch-invalid', 'project-a', 'bucket-a'), { ...task('batch-blank', 'project-a', 'bucket-a'), title: '   ' }] },
      { type: 'REPLACE_DATA', data: state },
    ];

    noOpActions.forEach((action) => {
      expect(plannerReducerV2(state, action)).toBe(state);
    });
  });

  it('does not add history for no-op actions', () => {
    const initialState = baseState();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(initialState, plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'DELETE_TASK', projectId: 'project-a', taskId: 'missing-task' });
    });

    expect(result.current.state).toBe(initialState);
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps redo history intact after a no-op action', () => {
    const initialState = baseState();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(initialState, plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'ADD_PROJECT', project: project('project-c', 'C') });
    });

    act(() => {
      result.current.undo();
    });

    const presentAfterUndo = result.current.state;
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.dispatch({ type: 'RENAME_PROJECT', projectId: 'missing-project', name: 'Nope', updatedAt: timestamp });
    });

    expect(result.current.state).toBe(presentAfterUndo);
    expect(result.current.canRedo).toBe(true);
  });

  it('rejects add actions with IDs colliding across any entity type', () => {
    const state: PlannerDataV2 = {
      ...baseState(),
      templates: [
        {
          id: 'template-a',
          name: 'Template',
          description: '',
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      templateDefinitions: [
        {
          id: 'definition-a',
          templateId: 'template-a',
          name: 'Definition',
          description: '',
          priority: 0,
          defaultActive: true,
          position: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    };

    expect(plannerReducerV2(state, { type: 'ADD_PROJECT', project: project('bucket-a', 'Collision') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_BUCKET', bucket: bucket('task-a', 'project-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TASK', task: task('project-a', 'project-a', 'bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TASK', task: task('template-a', 'project-a', 'bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TASK', task: task('definition-a', 'project-a', 'bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, {
      type: 'ADD_TASK_BATCH',
      tasks: [task('batch-task', 'project-a', 'bucket-a'), task('batch-task', 'project-a', 'bucket-a')],
    })).toBe(state);
  });

  it('does not add history for global ID collision rejection', () => {
    const initialState = baseState();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(initialState, plannerReducerV2));

    act(() => {
      result.current.dispatch({ type: 'ADD_TASK', task: task('project-a', 'project-a', 'bucket-a') });
    });

    expect(result.current.state).toBe(initialState);
    expect(result.current.canUndo).toBe(false);
  });

  it('supports template CRUD and ordering with semantic no-ops', () => {
    const created = plannerReducerV2(baseState(), {
      type: 'ADD_TEMPLATE',
      template: template('template-a', ' Launch '),
    });
    expect(created.templates.map((item) => item.name)).toEqual(['Launch']);

    const renamed = plannerReducerV2(created, {
      type: 'RENAME_TEMPLATE',
      templateId: 'template-a',
      name: 'Release',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
    expect(renamed.templates[0].name).toBe('Release');

    const described = plannerReducerV2(renamed, {
      type: 'UPDATE_TEMPLATE_DESCRIPTION',
      templateId: 'template-a',
      description: ' Repeatable setup ',
      updatedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(described.templates[0].description).toBe('Repeatable setup');

    const deactivated = plannerReducerV2(described, {
      type: 'SET_TEMPLATE_ACTIVE',
      templateId: 'template-a',
      active: false,
      updatedAt: '2026-07-04T00:00:00.000Z',
    });
    expect(deactivated.templates[0].active).toBe(false);

    expect(plannerReducerV2(deactivated, {
      type: 'SET_TEMPLATE_ACTIVE',
      templateId: 'template-a',
      active: false,
      updatedAt: timestamp,
    })).toBe(deactivated);

    const withSecond = plannerReducerV2(deactivated, {
      type: 'ADD_TEMPLATE',
      template: template('template-b', 'Ops'),
    });
    const moved = plannerReducerV2(withSecond, {
      type: 'MOVE_TEMPLATE',
      templateId: 'template-b',
      targetIndex: 0,
    });
    expect(moved.templates.map((item) => item.id)).toEqual(['template-b', 'template-a']);
    expect(plannerReducerV2(moved, { type: 'MOVE_TEMPLATE', templateId: 'template-b', targetIndex: 0 })).toBe(moved);
  });

  it('supports definition CRUD, defaultActive, and ordering within one template', () => {
    const state = stateWithTemplate();
    const added = plannerReducerV2(state, {
      type: 'ADD_TEMPLATE_DEFINITION',
      definition: definition('definition-d', 'template-a', ' Verify ', 3, true),
    });
    expect(added.templateDefinitions.find((item) => item.id === 'definition-d')?.name).toBe('Verify');

    const renamed = plannerReducerV2(added, {
      type: 'RENAME_TEMPLATE_DEFINITION',
      definitionId: 'definition-d',
      name: 'Verified',
      updatedAt: timestamp,
    });
    expect(renamed.templateDefinitions.find((item) => item.id === 'definition-d')?.name).toBe('Verified');

    const described = plannerReducerV2(renamed, {
      type: 'UPDATE_TEMPLATE_DEFINITION_DESCRIPTION',
      definitionId: 'definition-d',
      description: ' Checklist ',
      updatedAt: timestamp,
    });
    expect(described.templateDefinitions.find((item) => item.id === 'definition-d')?.description).toBe('Checklist');

    const inactiveDefault = plannerReducerV2(described, {
      type: 'SET_TEMPLATE_DEFINITION_DEFAULT_ACTIVE',
      definitionId: 'definition-d',
      defaultActive: false,
      updatedAt: timestamp,
    });
    expect(inactiveDefault.templateDefinitions.find((item) => item.id === 'definition-d')?.defaultActive).toBe(false);

    const moved = plannerReducerV2(inactiveDefault, {
      type: 'MOVE_TEMPLATE_DEFINITION',
      definitionId: 'definition-d',
      targetIndex: 0,
      updatedAt: '2026-07-05T00:00:00.000Z',
    });
    const orderedDefinitionIds = moved.templateDefinitions
      .filter((item) => item.templateId === 'template-a')
      .sort((left, right) => left.position - right.position)
      .map((item) => item.id);
    expect(orderedDefinitionIds[0]).toBe('definition-d');
    expect(moved.templateDefinitions.find((item) => item.id === 'definition-d')?.position).toBe(0);
  });

  it('rejects referenced definition and template deletion while cascading unreferenced template deletion', () => {
    const state = stateWithTemplate();
    const referencedBucket = bucketFromDefinition('bucket-from-definition', 'project-a', state.templateDefinitions[0]);
    const referencedState: PlannerDataV2 = {
      ...state,
      buckets: [...state.buckets, referencedBucket],
    };

    expect(plannerReducerV2(referencedState, {
      type: 'DELETE_TEMPLATE_DEFINITION',
      definitionId: 'definition-a',
    })).toBe(referencedState);
    expect(plannerReducerV2(referencedState, {
      type: 'DELETE_TEMPLATE',
      templateId: 'template-a',
    })).toBe(referencedState);

    const removedDefinition = plannerReducerV2(state, {
      type: 'DELETE_TEMPLATE_DEFINITION',
      definitionId: 'definition-c',
    });
    expect(removedDefinition.templateDefinitions.some((item) => item.id === 'definition-c')).toBe(false);

    const removedTemplate = plannerReducerV2(state, {
      type: 'DELETE_TEMPLATE',
      templateId: 'template-a',
    });
    expect(removedTemplate.templates.some((item) => item.id === 'template-a')).toBe(false);
    expect(removedTemplate.templateDefinitions.some((item) => item.templateId === 'template-a')).toBe(false);
  });

  it('applies active templates to projects and only creates missing default-active buckets on reapply', () => {
    const state = stateWithTemplate();
    const [definitionA, definitionB] = state.templateDefinitions;
    const applied = plannerReducerV2(state, {
      type: 'APPLY_TEMPLATE',
      projectId: 'project-a',
      templateId: 'template-a',
      buckets: [
        bucketFromDefinition('bucket-from-a', 'project-a', definitionA),
        bucketFromDefinition('bucket-from-b', 'project-a', definitionB),
      ],
    });

    const appliedTemplateBuckets = applied.buckets.filter((item) => item.templateDefinitionId !== null);
    expect(appliedTemplateBuckets.map((item) => item.templateDefinitionId)).toEqual(['definition-a', 'definition-b']);
    expect(appliedTemplateBuckets.map((item) => item.name)).toEqual(['Ready', 'Done']);

    expect(plannerReducerV2(applied, {
      type: 'APPLY_TEMPLATE',
      projectId: 'project-a',
      templateId: 'template-a',
      buckets: [],
    })).toBe(applied);

    const partiallyAppliedState: PlannerDataV2 = {
      ...state,
      buckets: [...state.buckets, bucketFromDefinition('bucket-from-a', 'project-a', definitionA)],
    };
    const partial = plannerReducerV2(partiallyAppliedState, {
      type: 'APPLY_TEMPLATE',
      projectId: 'project-a',
      templateId: 'template-a',
      buckets: [bucketFromDefinition('bucket-from-b', 'project-a', definitionB)],
    });
    expect(partial.buckets.filter((item) => item.templateDefinitionId !== null).map((item) => item.templateDefinitionId)).toEqual(['definition-a', 'definition-b']);
  });

  it('rejects inactive template application and preserves buckets on template or definition lifecycle changes', () => {
    const activeState = stateWithTemplate();
    const referencedBucket = bucketFromDefinition('bucket-from-a', 'project-a', activeState.templateDefinitions[0]);
    const state: PlannerDataV2 = {
      ...activeState,
      buckets: [...activeState.buckets, referencedBucket],
    };
    const inactiveTemplateState = plannerReducerV2(state, {
      type: 'SET_TEMPLATE_ACTIVE',
      templateId: 'template-a',
      active: false,
      updatedAt: timestamp,
    });
    expect(inactiveTemplateState.buckets).toBe(state.buckets);
    expect(plannerReducerV2(inactiveTemplateState, {
      type: 'APPLY_TEMPLATE',
      projectId: 'project-a',
      templateId: 'template-a',
      buckets: [bucketFromDefinition('bucket-from-b', 'project-a', activeState.templateDefinitions[1])],
    })).toBe(inactiveTemplateState);

    const defaultInactive = plannerReducerV2(state, {
      type: 'SET_TEMPLATE_DEFINITION_DEFAULT_ACTIVE',
      definitionId: 'definition-a',
      defaultActive: false,
      updatedAt: timestamp,
    });
    expect(defaultInactive.buckets).toBe(state.buckets);
  });

  it('applies templates as one undoable transition', () => {
    const state = stateWithTemplate();
    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(state, plannerReducerV2));

    act(() => {
      result.current.dispatch({
        type: 'APPLY_TEMPLATE',
        projectId: 'project-a',
        templateId: 'template-a',
        buckets: [
          bucketFromDefinition('bucket-from-a', 'project-a', state.templateDefinitions[0]),
          bucketFromDefinition('bucket-from-b', 'project-a', state.templateDefinitions[1]),
        ],
      });
    });

    expect(result.current.state.buckets.filter((item) => item.templateDefinitionId !== null)).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe(state);

    act(() => {
      result.current.redo();
    });
    expect(result.current.state.buckets.filter((item) => item.templateDefinitionId !== null)).toHaveLength(2);
  });

  it('moves templates downward correctly', () => {
    const state = stateWithTemplate();
    const withSecond = plannerReducerV2(state, {
      type: 'ADD_TEMPLATE',
      template: template('template-b', 'Ops'),
    });
    const withThird = plannerReducerV2(withSecond, {
      type: 'ADD_TEMPLATE',
      template: template('template-c', 'Planning'),
    });

    // Move first template down one position
    const movedDown = plannerReducerV2(withThird, {
      type: 'MOVE_TEMPLATE',
      templateId: 'template-a',
      targetIndex: 1,
    });
    expect(movedDown.templates.map((item) => item.id)).toEqual(['template-b', 'template-a', 'template-c']);
  });

  it('moves templates upward correctly', () => {
    const state = stateWithTemplate();
    const withSecond = plannerReducerV2(state, {
      type: 'ADD_TEMPLATE',
      template: template('template-b', 'Ops'),
    });
    const withThird = plannerReducerV2(withSecond, {
      type: 'ADD_TEMPLATE',
      template: template('template-c', 'Planning'),
    });

    // Move last template up to position 1
    const movedUp = plannerReducerV2(withThird, {
      type: 'MOVE_TEMPLATE',
      templateId: 'template-c',
      targetIndex: 1,
    });
    expect(movedUp.templates.map((item) => item.id)).toEqual(['template-a', 'template-c', 'template-b']);
  });

  it('respects boundary constraints for template movement', () => {
    const state = stateWithTemplate();
    const withSecond = plannerReducerV2(state, {
      type: 'ADD_TEMPLATE',
      template: template('template-b', 'Ops'),
    });

    // Try to move before 0 - should be no-op
    const beforeZero = plannerReducerV2(withSecond, {
      type: 'MOVE_TEMPLATE',
      templateId: 'template-a',
      targetIndex: -5,
    });
    expect(beforeZero).toBe(withSecond);

    // Try to move past end - should be no-op
    const pastEnd = plannerReducerV2(withSecond, {
      type: 'MOVE_TEMPLATE',
      templateId: 'template-b',
      targetIndex: 100,
    });
    expect(pastEnd).toBe(withSecond);

    // Try to move to same position - should be no-op
    const samePos = plannerReducerV2(withSecond, {
      type: 'MOVE_TEMPLATE',
      templateId: 'template-a',
      targetIndex: 0,
    });
    expect(samePos).toBe(withSecond);
  });

  it('moves definitions downward within template', () => {
    const state = stateWithTemplate();

    // Move first definition down to position 1
    const movedDown = plannerReducerV2(state, {
      type: 'MOVE_TEMPLATE_DEFINITION',
      definitionId: 'definition-a',
      targetIndex: 1,
      updatedAt: timestamp,
    });

    const getDefinitionOrder = (s: PlannerDataV2) => s.templateDefinitions
      .filter((item) => item.templateId === 'template-a')
      .sort((left, right) => left.position - right.position)
      .map((item) => item.id);

    expect(getDefinitionOrder(movedDown)).toEqual(['definition-b', 'definition-a', 'definition-c']);
  });

  it('moves definitions upward within template', () => {
    const state = stateWithTemplate();

    // Move last definition up to position 1
    const movedUp = plannerReducerV2(state, {
      type: 'MOVE_TEMPLATE_DEFINITION',
      definitionId: 'definition-c',
      targetIndex: 1,
      updatedAt: timestamp,
    });

    const getDefinitionOrder = (s: PlannerDataV2) => s.templateDefinitions
      .filter((item) => item.templateId === 'template-a')
      .sort((left, right) => left.position - right.position)
      .map((item) => item.id);

    expect(getDefinitionOrder(movedUp)).toEqual(['definition-a', 'definition-c', 'definition-b']);
  });

  it('respects boundary constraints for definition movement', () => {
    const state = stateWithTemplate();

    // Try to move first definition before 0 - should be no-op
    const beforeZero = plannerReducerV2(state, {
      type: 'MOVE_TEMPLATE_DEFINITION',
      definitionId: 'definition-a',
      targetIndex: -5,
      updatedAt: timestamp,
    });
    expect(beforeZero).toBe(state);

    // Try to move last definition past end - should be no-op
    const pastEnd = plannerReducerV2(state, {
      type: 'MOVE_TEMPLATE_DEFINITION',
      definitionId: 'definition-c',
      targetIndex: 100,
      updatedAt: timestamp,
    });
    expect(pastEnd).toBe(state);

    // Try to move missing definition - should be no-op
    const missing = plannerReducerV2(state, {
      type: 'MOVE_TEMPLATE_DEFINITION',
      definitionId: 'missing-definition',
      targetIndex: 0,
      updatedAt: timestamp,
    });
    expect(missing).toBe(state);
  });

  it('undo and redo preserve downward movement of templates', () => {
    const state = stateWithTemplate();
    const withSecond = plannerReducerV2(state, {
      type: 'ADD_TEMPLATE',
      template: template('template-b', 'Ops'),
    });

    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(withSecond, plannerReducerV2));

    act(() => {
      result.current.dispatch({
        type: 'MOVE_TEMPLATE',
        templateId: 'template-a',
        targetIndex: 1,
      });
    });

    expect(result.current.state.templates.map((item) => item.id)).toEqual(['template-b', 'template-a']);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe(withSecond);

    act(() => {
      result.current.redo();
    });
    expect(result.current.state.templates.map((item) => item.id)).toEqual(['template-b', 'template-a']);
  });

  it('undo and redo preserve downward movement of definitions', () => {
    const state = stateWithTemplate();

    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(state, plannerReducerV2));

    const getDefinitionOrder = (s: PlannerDataV2) => s.templateDefinitions
      .filter((item) => item.templateId === 'template-a')
      .sort((left, right) => left.position - right.position)
      .map((item) => item.id);

    act(() => {
      result.current.dispatch({
        type: 'MOVE_TEMPLATE_DEFINITION',
        definitionId: 'definition-a',
        targetIndex: 1,
        updatedAt: timestamp,
      });
    });

    expect(getDefinitionOrder(result.current.state)).toEqual(['definition-b', 'definition-a', 'definition-c']);

    act(() => {
      result.current.undo();
    });
    expect(getDefinitionOrder(result.current.state)).toEqual(['definition-a', 'definition-b', 'definition-c']);

    act(() => {
      result.current.redo();
    });
    expect(getDefinitionOrder(result.current.state)).toEqual(['definition-b', 'definition-a', 'definition-c']);
  });

  it('rejects template and definition global ID collisions without history entries', () => {
    const state = stateWithTemplate();
    expect(plannerReducerV2(state, { type: 'ADD_TEMPLATE', template: template('bucket-a') })).toBe(state);
    expect(plannerReducerV2(state, { type: 'ADD_TEMPLATE_DEFINITION', definition: definition('task-a', 'template-a') })).toBe(state);

    const { result } = renderHook(() => usePlannerHistory<PlannerDataV2, PlannerActionV2>(state, plannerReducerV2));
    act(() => {
      result.current.dispatch({ type: 'ADD_TEMPLATE', template: template('project-a') });
    });
    expect(result.current.state).toBe(state);
    expect(result.current.canUndo).toBe(false);
  });
});
