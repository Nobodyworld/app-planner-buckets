import { describe, expect, it } from 'vitest';
import type { PlannerData } from '../types';
import type {
  BucketTemplate,
  BucketTemplateDefinition,
  BucketV2,
  PlannerDataV2,
  PlannerTaskV2,
  Project,
  ResourceTag,
} from '../types/v2';
import { isValidPlannerDataV2 } from '../types/validators';
import {
  buildPlannerScopedExchangeEnvelope,
  buildProjectExchangeEnvelope,
} from './plannerExport';
import {
  extractPlannerProjectImportSource,
  importPlannerProject,
  parsePlannerProjectImport,
  resolvePlannerProjectImportSourceProject,
} from './plannerProjectImport';

const SOURCE_TIMESTAMP = '2026-07-20T10:00:00.000Z';
const IMPORT_TIMESTAMP = '2026-07-25T18:30:00.000Z';

const makeProject = (
  id: string,
  name = `Project ${id}`,
  overrides: Partial<Project> = {},
): Project => ({
  id,
  name,
  description: '',
  priority: 0,
  pinned: false,
  createdAt: SOURCE_TIMESTAMP,
  updatedAt: SOURCE_TIMESTAMP,
  ...overrides,
});

const makeTemplate = (
  id: string,
  name = `Template ${id}`,
  overrides: Partial<BucketTemplate> = {},
): BucketTemplate => ({
  id,
  name,
  description: '',
  active: true,
  createdAt: SOURCE_TIMESTAMP,
  updatedAt: SOURCE_TIMESTAMP,
  ...overrides,
});

const makeDefinition = (
  id: string,
  templateId: string,
  name = `Definition ${id}`,
  overrides: Partial<BucketTemplateDefinition> = {},
): BucketTemplateDefinition => ({
  id,
  templateId,
  name,
  description: '',
  priority: 0,
  defaultActive: true,
  position: 0,
  createdAt: SOURCE_TIMESTAMP,
  updatedAt: SOURCE_TIMESTAMP,
  ...overrides,
});

const makeBucket = (
  id: string,
  projectId: string,
  name = `Bucket ${id}`,
  overrides: Partial<BucketV2> = {},
): BucketV2 => ({
  id,
  projectId,
  name,
  description: '',
  templateDefinitionId: null,
  priority: 0,
  pinned: false,
  createdAt: SOURCE_TIMESTAMP,
  updatedAt: SOURCE_TIMESTAMP,
  ...overrides,
});

const makeTask = (
  id: string,
  projectId: string,
  bucketId: string | null,
  title = `Task ${id}`,
  overrides: Partial<PlannerTaskV2> = {},
): PlannerTaskV2 => ({
  id,
  projectId,
  bucketId,
  title,
  description: '',
  priority: 0,
  resourceTags: [],
  pinned: false,
  completed: false,
  archivedAt: null,
  createdAt: SOURCE_TIMESTAMP,
  updatedAt: SOURCE_TIMESTAMP,
  ...overrides,
});

const makeData = (overrides: Partial<PlannerDataV2> = {}): PlannerDataV2 => ({
  version: 2,
  projects: [makeProject('project-default')],
  buckets: [],
  tasks: [],
  templates: [],
  templateDefinitions: [],
  ...overrides,
});

const createSequenceIdFactory = (ids: string[]): (() => string) => {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
};

describe('parsePlannerProjectImport', () => {
  it('accepts project, bucket, and Unassigned scoped exchange envelopes', () => {
    const source = makeData({
      projects: [makeProject('source-project', 'Scoped project')],
      buckets: [
        makeBucket('source-bucket', 'source-project', 'Ready'),
        makeBucket('other-bucket', 'source-project', 'Other'),
      ],
      tasks: [
        makeTask('source-bucket-task', 'source-project', 'source-bucket'),
        makeTask('source-other-task', 'source-project', 'other-bucket'),
        makeTask('source-unassigned-task', 'source-project', null),
      ],
    });

    const projectEnvelope = buildPlannerScopedExchangeEnvelope(
      source,
      { kind: 'project', projectId: 'source-project' },
      '2026-07-25T18:00:00.000Z',
    );
    const bucketEnvelope = buildPlannerScopedExchangeEnvelope(
      source,
      {
        kind: 'bucket',
        projectId: 'source-project',
        bucketId: 'source-bucket',
      },
      '2026-07-25T18:00:00.000Z',
    );
    const unassignedEnvelope = buildPlannerScopedExchangeEnvelope(
      source,
      { kind: 'unassigned', projectId: 'source-project' },
      '2026-07-25T18:00:00.000Z',
    );

    expect(parsePlannerProjectImport(projectEnvelope)).toMatchObject({
      sourceKind: 'scoped-envelope',
      sourceVersion: 2,
      autoSelectedSourceProjectId: 'source-project',
    });
    expect(parsePlannerProjectImport(bucketEnvelope)).toMatchObject({
      sourceKind: 'scoped-envelope',
      data: {
        buckets: [{ id: 'source-bucket' }],
        tasks: [{ id: 'source-bucket-task' }],
      },
    });
    expect(parsePlannerProjectImport(unassignedEnvelope)).toMatchObject({
      sourceKind: 'scoped-envelope',
      data: {
        buckets: [],
        tasks: [{ id: 'source-unassigned-task' }],
      },
    });
    expect(() => parsePlannerProjectImport({
      ...bucketEnvelope,
      scope: {
        ...bucketEnvelope.scope,
        bucketName: 'Wrong bucket',
      },
    })).toThrow('valid supported planner exchange envelope');
  });

  it('accepts a strict tagged project envelope and rejects a malformed tagged envelope', () => {
    const source = makeData({
      projects: [makeProject('source-project', 'Envelope project')],
      buckets: [makeBucket('source-bucket', 'source-project')],
      tasks: [makeTask('source-task', 'source-project', 'source-bucket')],
    });
    const envelope = buildProjectExchangeEnvelope(
      source,
      'source-project',
      '2026-07-25T18:00:00.000Z',
    );

    expect(parsePlannerProjectImport(envelope)).toMatchObject({
      sourceKind: 'project-envelope',
      sourceVersion: 2,
      autoSelectedSourceProjectId: 'source-project',
      sourceProjectChoices: [{
        projectId: 'source-project',
        name: 'Envelope project',
        label: 'Envelope project',
        sourceIndex: 0,
      }],
    });

    expect(() => parsePlannerProjectImport({
      ...envelope,
      unexpected: true,
    })).toThrow('valid supported planner exchange envelope');
    expect(() => parsePlannerProjectImport({
      ...envelope,
      sourceProject: { id: 'wrong', name: 'Envelope project' },
    })).toThrow('valid supported planner exchange envelope');
  });

  it('coerces raw v1 and raw v2 exports through the existing compatibility boundary', () => {
    const rawV1: PlannerData = {
      version: 1,
      buckets: [{
        id: 'legacy-bucket',
        name: 'Legacy bucket',
        createdAt: '2026-01-01T00:00:00.000Z',
        pinned: true,
      }],
      tasks: [{
        id: 'legacy-task',
        title: 'Legacy task',
        description: 'Legacy notes',
        bucketId: 'legacy-bucket',
        pinned: true,
        completed: true,
        archivedAt: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }],
    };
    const parsedV1 = parsePlannerProjectImport(rawV1);
    expect(parsedV1.sourceKind).toBe('raw-v1');
    expect(parsedV1.sourceVersion).toBe(1);
    expect(parsedV1.autoSelectedSourceProjectId).toBe(parsedV1.data.projects[0].id);
    expect(parsedV1.data.tasks[0]).toMatchObject({
      id: 'legacy-task',
      completed: true,
      pinned: true,
      archivedAt: '2026-02-01T00:00:00.000Z',
    });

    const rawV2 = makeData({
      projects: [makeProject('raw-v2-project', 'Raw v2')],
    });
    expect(parsePlannerProjectImport(rawV2)).toMatchObject({
      sourceKind: 'raw-v2',
      sourceVersion: 2,
      autoSelectedSourceProjectId: 'raw-v2-project',
    });

    const envelopeLikeLegacyMetadata = {
      scope: 'legacy metadata',
      format: 'legacy-raw-backup',
      envelopeVersion: 'legacy metadata',
      sourceProject: 'legacy metadata',
      data: 'legacy metadata',
    };
    expect(parsePlannerProjectImport({
      ...rawV1,
      ...envelopeLikeLegacyMetadata,
    }).sourceKind).toBe('raw-v1');
    expect(parsePlannerProjectImport({
      ...rawV2,
      ...envelopeLikeLegacyMetadata,
    })).toMatchObject({
      sourceKind: 'raw-v2',
      autoSelectedSourceProjectId: 'raw-v2-project',
    });
  });

  it('rejects untagged invalid planner data rather than deriving a partial source', () => {
    expect(() => parsePlannerProjectImport({ version: 2, projects: [] })).toThrow(
      'not a valid planner export',
    );
    expect(() => parsePlannerProjectImport(null)).toThrow('not a valid planner export');
  });
});

describe('project-import source selection and closure', () => {
  it('exposes stable choices, requires an explicit multi-project choice, and extracts only reference closure', () => {
    const source = makeData({
      projects: [
        makeProject('project-a', 'Duplicate name'),
        makeProject('project-b', 'Duplicate name'),
      ],
      templates: [
        makeTemplate('template-a', 'Template A'),
        makeTemplate('template-b', 'Template B'),
        makeTemplate('template-unrelated', 'Unrelated'),
      ],
      templateDefinitions: [
        makeDefinition('definition-a', 'template-a', 'Definition A'),
        makeDefinition('definition-b', 'template-b', 'Definition B'),
      ],
      buckets: [
        makeBucket('bucket-a', 'project-a', 'Bucket A', {
          templateDefinitionId: 'definition-a',
        }),
        makeBucket('bucket-b', 'project-b', 'Bucket B', {
          templateDefinitionId: 'definition-b',
        }),
      ],
      tasks: [
        makeTask('task-a', 'project-a', 'bucket-a'),
        makeTask('task-b', 'project-b', 'bucket-b'),
      ],
    });
    const parsed = parsePlannerProjectImport(source);

    expect(parsed.sourceProjectChoices).toEqual([
      {
        projectId: 'project-a',
        name: 'Duplicate name',
        label: 'Duplicate name (1 of 2)',
        sourceIndex: 0,
      },
      {
        projectId: 'project-b',
        name: 'Duplicate name',
        label: 'Duplicate name (2 of 2)',
        sourceIndex: 1,
      },
    ]);
    expect(parsed.autoSelectedSourceProjectId).toBeNull();
    expect(() => resolvePlannerProjectImportSourceProject(parsed)).toThrow(
      'source is ambiguous',
    );
    expect(() => resolvePlannerProjectImportSourceProject(parsed, 'missing')).toThrow(
      'was not found',
    );

    const scoped = extractPlannerProjectImportSource(parsed, 'project-b');
    expect(scoped.projects.map((project) => project.id)).toEqual(['project-b']);
    expect(scoped.buckets.map((bucket) => bucket.id)).toEqual(['bucket-b']);
    expect(scoped.tasks.map((task) => task.id)).toEqual(['task-b']);
    expect(scoped.templateDefinitions.map((definition) => definition.id)).toEqual([
      'definition-b',
    ]);
    expect(scoped.templates.map((template) => template.id)).toEqual(['template-b']);
    expect(isValidPlannerDataV2(scoped)).toBe(true);
  });

  it('auto-resolves exactly one source project but validates a supplied source ID', () => {
    const parsed = parsePlannerProjectImport(makeData({
      projects: [makeProject('only-project', 'Only project')],
    }));

    expect(resolvePlannerProjectImportSourceProject(parsed).id).toBe('only-project');
    expect(resolvePlannerProjectImportSourceProject(parsed, 'only-project').id).toBe(
      'only-project',
    );
    expect(() => resolvePlannerProjectImportSourceProject(parsed, 'other')).toThrow(
      'was not found',
    );
  });
});

describe('importPlannerProject destinations', () => {
  it('creates a fresh project, activates it, remaps children, and leaves inputs immutable', () => {
    const current = makeData({
      projects: [makeProject('current-project', 'Launch')],
    });
    const source = makeData({
      projects: [makeProject('source-project', ' Launch ', {
        description: 'Source description',
        priority: 3,
        pinned: true,
      })],
      buckets: [makeBucket('source-bucket', 'source-project', 'Ready', {
        description: 'Bucket details',
        priority: 2,
        pinned: true,
      })],
      tasks: [makeTask('source-task', 'source-project', 'source-bucket', 'Ship', {
        description: 'Task details',
        priority: 1,
        pinned: true,
      })],
    });
    const currentBefore = JSON.stringify(current);
    const sourceBefore = JSON.stringify(source);

    const result = importPlannerProject(
      current,
      parsePlannerProjectImport(source),
      {
        destination: { kind: 'new' },
        createUniqueId: createSequenceIdFactory([
          'new-project',
          'new-bucket',
          'new-task',
        ]),
        importedAt: IMPORT_TIMESTAMP,
      },
    );

    expect(result.activationProjectId).toBe('new-project');
    expect(result.sourceProjectId).toBe('source-project');
    expect(result.data.projects.map((project) => project.id)).toEqual([
      'new-project',
      'current-project',
    ]);
    expect(result.summary).toMatchObject({
      projectCreatedCount: 1,
      projectMergedCount: 0,
      bucketCreatedCount: 1,
      taskCreatedCount: 1,
    });
    expect(result.uploadedTaskIds).toEqual(['new-task']);
    expect(result.data.projects.find((project) => project.id === 'new-project')).toMatchObject({
      name: 'Launch (imported)',
      description: 'Source description',
      priority: 3,
      pinned: true,
      createdAt: IMPORT_TIMESTAMP,
      updatedAt: IMPORT_TIMESTAMP,
    });
    expect(result.data.buckets.find((bucket) => bucket.id === 'new-bucket')).toMatchObject({
      projectId: 'new-project',
      name: 'Ready',
      description: 'Bucket details',
      priority: 2,
      pinned: true,
      createdAt: IMPORT_TIMESTAMP,
      updatedAt: IMPORT_TIMESTAMP,
    });
    expect(result.data.tasks.find((task) => task.id === 'new-task')).toMatchObject({
      projectId: 'new-project',
      bucketId: 'new-bucket',
      title: 'Ship',
      description: 'Task details',
      priority: 1,
      pinned: true,
      createdAt: IMPORT_TIMESTAMP,
      updatedAt: IMPORT_TIMESTAMP,
    });
    expect(JSON.stringify(current)).toBe(currentBefore);
    expect(JSON.stringify(source)).toBe(sourceBefore);
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('normalizes only destination buckets pinned-first while preserving unrelated bucket slots', () => {
    const unrelatedBucket = makeBucket('other-bucket', 'other-project', 'Other');
    const current = makeData({
      projects: [
        makeProject('destination-project', 'Destination'),
        makeProject('other-project', 'Other'),
      ],
      buckets: [
        makeBucket('destination-unpinned', 'destination-project', 'Existing'),
        unrelatedBucket,
      ],
    });
    const source = makeData({
      projects: [makeProject('source-project', 'Source')],
      buckets: [makeBucket('source-pinned', 'source-project', 'Imported pinned', {
        pinned: true,
      })],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory(['created-pinned-bucket']),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.data.buckets.map((bucket) => bucket.id)).toEqual([
      'created-pinned-bucket',
      'other-bucket',
      'destination-unpinned',
    ]);
    expect(result.data.buckets[1]).toBe(unrelatedBucket);
    expect(result.data.buckets
      .filter((bucket) => bucket.projectId === 'destination-project')
      .map((bucket) => bucket.pinned)).toEqual([true, false]);
  });

  it('uses deterministic numbered suffixes for duplicate imported project names', () => {
    const current = makeData({
      projects: [
        makeProject('project-launch', 'Launch'),
        makeProject('project-imported', 'Launch (imported)'),
        makeProject('project-imported-2', ' launch (IMPORTED 2) '),
      ],
    });
    const source = makeData({
      projects: [makeProject('source-project', 'Launch')],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'new' },
      createUniqueId: createSequenceIdFactory(['new-project']),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.data.projects.at(-1)?.name).toBe('Launch (imported 3)');
  });

  it('merges only into an explicit valid existing project and returns it as activation target', () => {
    const current = makeData({
      projects: [
        makeProject('destination-project', 'Destination'),
        makeProject('other-project', 'Other'),
      ],
      buckets: [makeBucket('destination-bucket', 'destination-project', 'Ready')],
    });
    const source = makeData({
      projects: [makeProject('source-project', 'Source')],
      buckets: [makeBucket('source-bucket', 'source-project', ' ready ')],
      tasks: [makeTask('source-task', 'source-project', 'source-bucket', 'Imported task')],
    });
    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory(['new-task']),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.activationProjectId).toBe('destination-project');
    expect(result.data.projects).toEqual(current.projects);
    expect(result.summary).toMatchObject({
      projectCreatedCount: 0,
      projectMergedCount: 1,
      bucketCreatedCount: 0,
      bucketReusedCount: 1,
      taskCreatedCount: 1,
    });
    expect(result.data.tasks.at(-1)).toMatchObject({
      id: 'new-task',
      projectId: 'destination-project',
      bucketId: 'destination-bucket',
    });

    expect(() => importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: '' },
      createUniqueId: createSequenceIdFactory([]),
      importedAt: IMPORT_TIMESTAMP,
    })).toThrow('selected explicitly');
    expect(() => importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'missing' },
      createUniqueId: createSequenceIdFactory([]),
      importedAt: IMPORT_TIMESTAMP,
    })).toThrow('was not found');
  });

  it('rejects invalid current data, destination, source selection, timestamp, and ID dependencies', () => {
    const current = makeData();
    const parsed = parsePlannerProjectImport(makeData({
      projects: [makeProject('source-project')],
    }));

    expect(() => importPlannerProject({
      ...current,
      projects: [],
    }, parsed, {
      destination: { kind: 'new' },
      createUniqueId: createSequenceIdFactory(['new-project']),
      importedAt: IMPORT_TIMESTAMP,
    })).toThrow('Current planner data is invalid');

    expect(() => importPlannerProject(current, parsed, {
      destination: { kind: 'invalid' } as never,
      createUniqueId: createSequenceIdFactory(['new-project']),
      importedAt: IMPORT_TIMESTAMP,
    })).toThrow('destination is invalid');

    expect(() => importPlannerProject(current, parsed, {
      sourceProjectId: 'missing',
      destination: { kind: 'new' },
      createUniqueId: createSequenceIdFactory(['new-project']),
      importedAt: IMPORT_TIMESTAMP,
    })).toThrow('was not found');

    expect(() => importPlannerProject(current, parsed, {
      destination: { kind: 'new' },
      createUniqueId: createSequenceIdFactory(['new-project']),
      importedAt: 'not-a-date',
    })).toThrow('timestamp is invalid');

    expect(() => importPlannerProject(current, parsed, {
      destination: { kind: 'new' },
      createUniqueId: null as never,
      importedAt: IMPORT_TIMESTAMP,
    })).toThrow('requires an ID generator');
  });
});

describe('project-import dependency and duplicate resolution', () => {
  it('reuses unique normalized template, definition, and definition-linked bucket matches', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      templates: [makeTemplate('existing-template', ' Workflow ')],
      templateDefinitions: [
        makeDefinition('existing-definition', 'existing-template', 'Ready'),
      ],
      buckets: [makeBucket('existing-bucket', 'destination-project', 'Current ready', {
        templateDefinitionId: 'existing-definition',
      })],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      templates: [makeTemplate('source-template', 'workflow')],
      templateDefinitions: [
        makeDefinition('source-definition', 'source-template', ' ready '),
      ],
      buckets: [makeBucket('source-bucket', 'source-project', 'Different name', {
        templateDefinitionId: 'source-definition',
      })],
      tasks: [makeTask('source-task', 'source-project', 'source-bucket')],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory(['created-task']),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      dependencyCreatedCount: 0,
      dependencyReusedCount: 2,
      templateCreatedCount: 0,
      templateReusedCount: 1,
      templateDefinitionCreatedCount: 0,
      templateDefinitionReusedCount: 1,
      bucketCreatedCount: 0,
      bucketReusedCount: 1,
    });
    expect(result.data.tasks.at(-1)).toMatchObject({
      id: 'created-task',
      bucketId: 'existing-bucket',
    });
    expect(result.ambiguities).toEqual([]);
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('creates missing dependencies in order and preserves their meaningful fields', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      templates: [makeTemplate('source-template', 'Workflow', {
        description: 'Template notes',
        active: false,
      })],
      templateDefinitions: [
        makeDefinition('source-definition', 'source-template', 'Ready', {
          description: 'Definition notes',
          priority: 3,
          defaultActive: false,
          position: 7,
        }),
      ],
      buckets: [makeBucket('source-bucket', 'source-project', 'Ready bucket', {
        templateDefinitionId: 'source-definition',
      })],
    });
    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-template',
        'created-definition',
        'created-bucket',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      dependencyCreatedCount: 2,
      dependencyReusedCount: 0,
      templateCreatedCount: 1,
      templateDefinitionCreatedCount: 1,
      bucketCreatedCount: 1,
    });
    expect(result.data.templates.at(-1)).toMatchObject({
      id: 'created-template',
      name: 'Workflow',
      description: 'Template notes',
      active: false,
      createdAt: IMPORT_TIMESTAMP,
      updatedAt: IMPORT_TIMESTAMP,
    });
    expect(result.data.templateDefinitions.at(-1)).toMatchObject({
      id: 'created-definition',
      templateId: 'created-template',
      description: 'Definition notes',
      priority: 3,
      defaultActive: false,
      position: 7,
      createdAt: IMPORT_TIMESTAMP,
      updatedAt: IMPORT_TIMESTAMP,
    });
    expect(result.data.buckets.at(-1)).toMatchObject({
      id: 'created-bucket',
      templateDefinitionId: 'created-definition',
    });
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('preserves duplicate-named source templates, definitions, buckets, and task mappings', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      templates: [
        makeTemplate('source-template-a', 'Workflow', {
          description: 'First template',
          active: true,
        }),
        makeTemplate('source-template-b', ' workflow ', {
          description: 'Second template',
          active: false,
        }),
      ],
      templateDefinitions: [
        makeDefinition('source-definition-a1', 'source-template-a', 'Stage', {
          description: 'First stage',
          priority: 1,
          position: 1,
          defaultActive: true,
        }),
        makeDefinition('source-definition-a2', 'source-template-a', ' stage ', {
          description: 'Second stage',
          priority: 2,
          position: 2,
          defaultActive: false,
        }),
        makeDefinition('source-definition-b1', 'source-template-b', 'Stage', {
          description: 'Third stage',
          priority: 3,
          position: 3,
          defaultActive: true,
        }),
      ],
      buckets: [
        makeBucket('source-bucket-a1', 'source-project', 'Ready', {
          templateDefinitionId: 'source-definition-a1',
        }),
        makeBucket('source-bucket-a2', 'source-project', ' ready ', {
          templateDefinitionId: 'source-definition-a2',
        }),
        makeBucket('source-bucket-b1', 'source-project', 'READY', {
          templateDefinitionId: 'source-definition-b1',
        }),
      ],
      tasks: [
        makeTask(
          'source-task-a1',
          'source-project',
          'source-bucket-a1',
          'Task A1',
        ),
        makeTask(
          'source-task-a2',
          'source-project',
          'source-bucket-a2',
          'Task A2',
        ),
        makeTask(
          'source-task-b1',
          'source-project',
          'source-bucket-b1',
          'Task B1',
        ),
      ],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-template-a',
        'created-template-b',
        'created-definition-a1',
        'created-definition-a2',
        'created-definition-b1',
        'created-bucket-a1',
        'created-bucket-a2',
        'created-bucket-b1',
        'created-task-a1',
        'created-task-a2',
        'created-task-b1',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      templateCreatedCount: 2,
      templateReusedCount: 0,
      templateDefinitionCreatedCount: 3,
      templateDefinitionReusedCount: 0,
      bucketCreatedCount: 3,
      bucketReusedCount: 0,
      taskCreatedCount: 3,
    });
    expect(result.ambiguities).toEqual([]);
    expect(result.data.templates.filter(
      (template) => template.name.toLowerCase().trim() === 'workflow',
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'created-template-a',
        description: 'First template',
        active: true,
      }),
      expect.objectContaining({
        id: 'created-template-b',
        description: 'Second template',
        active: false,
      }),
    ]));
    expect(result.data.templateDefinitions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'created-definition-a1',
        templateId: 'created-template-a',
        description: 'First stage',
        priority: 1,
        position: 1,
        defaultActive: true,
      }),
      expect.objectContaining({
        id: 'created-definition-a2',
        templateId: 'created-template-a',
        description: 'Second stage',
        priority: 2,
        position: 2,
        defaultActive: false,
      }),
      expect.objectContaining({
        id: 'created-definition-b1',
        templateId: 'created-template-b',
        description: 'Third stage',
        priority: 3,
        position: 3,
      }),
    ]));
    expect(result.data.buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'created-bucket-a1',
        templateDefinitionId: 'created-definition-a1',
      }),
      expect.objectContaining({
        id: 'created-bucket-a2',
        templateDefinitionId: 'created-definition-a2',
      }),
      expect.objectContaining({
        id: 'created-bucket-b1',
        templateDefinitionId: 'created-definition-b1',
      }),
    ]));
    expect(result.data.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'created-task-a1',
        title: 'Task A1',
        bucketId: 'created-bucket-a1',
      }),
      expect.objectContaining({
        id: 'created-task-a2',
        title: 'Task A2',
        bucketId: 'created-bucket-a2',
      }),
      expect.objectContaining({
        id: 'created-task-b1',
        title: 'Task B1',
        bucketId: 'created-bucket-b1',
      }),
    ]));
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('consumes each reusable destination template, definition, and bucket at most once', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      templates: [
        makeTemplate('destination-template', 'Workflow', {
          description: 'Shared template',
        }),
      ],
      templateDefinitions: [
        makeDefinition(
          'destination-definition',
          'destination-template',
          'Stage',
          { description: 'Shared definition' },
        ),
      ],
      buckets: [
        makeBucket('destination-linked', 'destination-project', 'Linked', {
          templateDefinitionId: 'destination-definition',
        }),
        makeBucket('destination-loose', 'destination-project', 'Loose'),
      ],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      templates: [
        makeTemplate('source-template-a', ' workflow ', {
          description: 'Shared template',
        }),
        makeTemplate('source-template-b', 'WORKFLOW', {
          description: 'Shared template',
        }),
      ],
      templateDefinitions: [
        makeDefinition('source-definition-a1', 'source-template-a', ' stage ', {
          description: 'Shared definition',
        }),
        makeDefinition('source-definition-a2', 'source-template-a', 'STAGE', {
          description: 'Shared definition',
        }),
        makeDefinition('source-definition-b1', 'source-template-b', 'Other'),
      ],
      buckets: [
        makeBucket('source-linked-a1', 'source-project', 'Linked', {
          templateDefinitionId: 'source-definition-a1',
        }),
        makeBucket('source-linked-a2', 'source-project', 'Linked', {
          templateDefinitionId: 'source-definition-a2',
        }),
        makeBucket('source-linked-b1', 'source-project', 'Other', {
          templateDefinitionId: 'source-definition-b1',
        }),
        makeBucket('source-loose-a', 'source-project', ' loose '),
        makeBucket('source-loose-b', 'source-project', 'LOOSE'),
      ],
      tasks: [
        makeTask('task-linked-a1', 'source-project', 'source-linked-a1'),
        makeTask('task-linked-a2', 'source-project', 'source-linked-a2'),
        makeTask('task-linked-b1', 'source-project', 'source-linked-b1'),
        makeTask('task-loose-a', 'source-project', 'source-loose-a'),
        makeTask('task-loose-b', 'source-project', 'source-loose-b'),
      ],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-template-b',
        'created-definition-a2',
        'created-definition-b1',
        'created-linked-a2',
        'created-linked-b1',
        'created-loose-b',
        'created-task-linked-a1',
        'created-task-linked-a2',
        'created-task-linked-b1',
        'created-task-loose-a',
        'created-task-loose-b',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      templateReusedCount: 1,
      templateCreatedCount: 1,
      templateDefinitionReusedCount: 1,
      templateDefinitionCreatedCount: 2,
      bucketReusedCount: 2,
      bucketCreatedCount: 3,
      taskCreatedCount: 5,
    });
    expect(result.data.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'created-task-linked-a1',
        bucketId: 'destination-linked',
      }),
      expect.objectContaining({
        id: 'created-task-linked-a2',
        bucketId: 'created-linked-a2',
      }),
      expect.objectContaining({
        id: 'created-task-linked-b1',
        bucketId: 'created-linked-b1',
      }),
      expect.objectContaining({
        id: 'created-task-loose-a',
        bucketId: 'destination-loose',
      }),
      expect.objectContaining({
        id: 'created-task-loose-b',
        bucketId: 'created-loose-b',
      }),
    ]));
    expect(result.ambiguities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity: 'template',
        sourceId: 'source-template-b',
        candidateIds: ['destination-template'],
      }),
      expect.objectContaining({
        entity: 'template-definition',
        sourceId: 'source-definition-a2',
        candidateIds: ['destination-definition'],
      }),
      expect.objectContaining({
        entity: 'bucket',
        sourceId: 'source-loose-b',
        candidateIds: ['destination-loose'],
      }),
    ]));
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('creates and reports new records instead of silently choosing ambiguous normalized matches', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      templates: [
        makeTemplate('flow-b', ' flow '),
        makeTemplate('flow-a', 'Flow'),
        makeTemplate('unique-template', 'Unique'),
      ],
      templateDefinitions: [
        makeDefinition('stage-b', 'unique-template', ' stage '),
        makeDefinition('stage-a', 'unique-template', 'Stage'),
      ],
      buckets: [
        makeBucket('loose-b', 'destination-project', ' loose '),
        makeBucket('loose-a', 'destination-project', 'Loose'),
      ],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      templates: [
        makeTemplate('source-flow', 'FLOW'),
        makeTemplate('source-unique', 'unique'),
      ],
      templateDefinitions: [
        makeDefinition('source-flow-definition', 'source-flow', 'Flow stage'),
        makeDefinition('source-stage', 'source-unique', 'STAGE'),
      ],
      buckets: [
        makeBucket('source-flow-bucket', 'source-project', 'Flow bucket', {
          templateDefinitionId: 'source-flow-definition',
        }),
        makeBucket('source-stage-bucket', 'source-project', 'Stage bucket', {
          templateDefinitionId: 'source-stage',
        }),
        makeBucket('source-loose-bucket', 'source-project', 'LOOSE'),
      ],
    });
    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-flow-template',
        'created-flow-definition',
        'created-stage-definition',
        'created-flow-bucket',
        'created-stage-bucket',
        'created-loose-bucket',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      templateCreatedCount: 1,
      templateReusedCount: 1,
      templateAmbiguousMatchCount: 1,
      templateDefinitionCreatedCount: 2,
      templateDefinitionAmbiguousMatchCount: 1,
      bucketCreatedCount: 3,
      bucketAmbiguousMatchCount: 1,
    });
    expect(result.ambiguities.map((ambiguity) => ({
      entity: ambiguity.entity,
      sourceId: ambiguity.sourceId,
      matchBy: ambiguity.matchBy,
      resolution: ambiguity.resolution,
    }))).toEqual([
      {
        entity: 'template',
        sourceId: 'source-flow',
        matchBy: 'normalized-name',
        resolution: 'created-new',
      },
      {
        entity: 'template-definition',
        sourceId: 'source-stage',
        matchBy: 'normalized-name',
        resolution: 'created-new',
      },
      {
        entity: 'bucket',
        sourceId: 'source-loose-bucket',
        matchBy: 'normalized-name',
        resolution: 'created-new',
      },
    ]);
    expect(result.data.buckets.find((bucket) => bucket.id === 'created-loose-bucket')).toBeTruthy();
    expect(result.ambiguities.find(
      (ambiguity) => ambiguity.sourceId === 'source-flow',
    )?.candidateIds).toEqual(['flow-a', 'flow-b']);
    expect(result.ambiguities.find(
      (ambiguity) => ambiguity.sourceId === 'source-stage',
    )?.candidateIds).toEqual(['stage-a', 'stage-b']);
    expect(result.ambiguities.find(
      (ambiguity) => ambiguity.sourceId === 'source-loose-bucket',
    )?.candidateIds).toEqual(['loose-a', 'loose-b']);
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('creates a bucket instead of reusing a same-name bucket with a conflicting template definition', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      templates: [makeTemplate('destination-template', 'Destination workflow')],
      templateDefinitions: [
        makeDefinition(
          'destination-definition',
          'destination-template',
          'Destination ready',
        ),
      ],
      buckets: [makeBucket(
        'destination-bucket',
        'destination-project',
        'Ready',
        { templateDefinitionId: 'destination-definition' },
      )],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      templates: [makeTemplate('source-template', 'Source workflow')],
      templateDefinitions: [
        makeDefinition('source-definition', 'source-template', 'Source ready'),
      ],
      buckets: [makeBucket('source-bucket', 'source-project', ' ready ', {
        templateDefinitionId: 'source-definition',
      })],
      tasks: [makeTask('source-task', 'source-project', 'source-bucket')],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-template',
        'created-definition',
        'created-bucket',
        'created-task',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      dependencyCreatedCount: 2,
      bucketCreatedCount: 1,
      bucketReusedCount: 0,
      bucketAmbiguousMatchCount: 1,
      taskCreatedCount: 1,
    });
    expect(result.ambiguities).toContainEqual({
      entity: 'bucket',
      sourceId: 'source-bucket',
      matchBy: 'template-definition-conflict',
      normalizedName: 'ready',
      candidateIds: ['destination-bucket'],
      resolution: 'created-new',
    });
    expect(result.data.buckets.find((bucket) => bucket.id === 'created-bucket')).toMatchObject({
      projectId: 'destination-project',
      templateDefinitionId: 'created-definition',
    });
    expect(result.data.tasks.find((task) => task.id === 'created-task')).toMatchObject({
      bucketId: 'created-bucket',
    });
    expect(result.data.templateDefinitions.find(
      (definition) => definition.id === 'created-definition',
    )).toBeTruthy();
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('skips destination and within-import exact semantic task duplicates', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      buckets: [makeBucket('destination-bucket', 'destination-project', 'Ready')],
      tasks: [makeTask(
        'existing-task',
        'destination-project',
        'destination-bucket',
        ' Ship ',
        { description: ' NOW ' },
      )],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      buckets: [makeBucket('source-bucket', 'source-project', ' ready ')],
      tasks: [
        makeTask('source-duplicate', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
        }),
        makeTask('source-new', 'source-project', 'source-bucket', 'Review', {
          description: 'Notes',
        }),
        makeTask('source-new-duplicate', 'source-project', 'source-bucket', ' review ', {
          description: ' notes ',
        }),
      ],
    });
    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory(['created-task']),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      bucketReusedCount: 1,
      taskCreatedCount: 1,
      taskSkippedDuplicateCount: 2,
    });
    expect(result.uploadedTaskIds).toEqual(['created-task']);
    expect(result.data.tasks.at(-1)).toMatchObject({
      id: 'created-task',
      title: 'Review',
      description: 'Notes',
      bucketId: 'destination-bucket',
    });
  });

  it('imports tasks that differ in completion, pin, priority, tags, or archive state', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      buckets: [makeBucket('destination-bucket', 'destination-project', 'Ready')],
      tasks: [makeTask(
        'existing-task',
        'destination-project',
        'destination-bucket',
        ' Ship ',
        {
          description: ' NOW ',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      )],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      buckets: [makeBucket('source-bucket', 'source-project', ' ready ')],
      tasks: [
        makeTask('source-exact-destination', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-02T00:00:00.000Z',
        }),
        makeTask('source-completed', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          completed: true,
        }),
        makeTask('source-completed-exact', 'source-project', 'source-bucket', ' SHIP ', {
          description: ' NOW ',
          completed: true,
          createdAt: '2031-01-01T00:00:00.000Z',
          updatedAt: '2031-01-02T00:00:00.000Z',
        }),
        makeTask('source-pinned', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          pinned: true,
        }),
        makeTask('source-priority', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          priority: 3,
        }),
        makeTask('source-tags', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          resourceTags: ['alpha' as ResourceTag],
        }),
        makeTask('source-archived-a', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          archivedAt: '2026-07-20T10:00:00-05:00',
        }),
        makeTask(
          'source-archived-a-equivalent',
          'source-project',
          'source-bucket',
          'ship',
          {
            description: 'now',
            archivedAt: '2026-07-20T15:00:00.000Z',
          },
        ),
        makeTask('source-archived-b', 'source-project', 'source-bucket', 'ship', {
          description: 'now',
          archivedAt: '2026-07-20T16:00:00.000Z',
        }),
      ],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-completed',
        'created-pinned',
        'created-priority',
        'created-tags',
        'created-archived-a',
        'created-archived-b',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      bucketReusedCount: 1,
      taskCreatedCount: 6,
      taskSkippedDuplicateCount: 3,
    });
    expect(result.uploadedTaskIds).toEqual([
      'created-completed',
      'created-pinned',
      'created-priority',
      'created-tags',
      'created-archived-a',
      'created-archived-b',
    ]);
    expect(result.data.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'created-completed', completed: true }),
      expect.objectContaining({ id: 'created-pinned', pinned: true }),
      expect.objectContaining({ id: 'created-priority', priority: 3 }),
      expect.objectContaining({
        id: 'created-tags',
        resourceTags: ['alpha'],
      }),
      expect.objectContaining({
        id: 'created-archived-a',
        archivedAt: '2026-07-20T10:00:00-05:00',
      }),
      expect.objectContaining({
        id: 'created-archived-b',
        archivedAt: '2026-07-20T16:00:00.000Z',
      }),
    ]));
  });

  it('keeps duplicate keys collision-safe for delimiters and null versus literal bucket IDs', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
      buckets: [makeBucket('unassigned', 'destination-project', 'Literal bucket')],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      buckets: [makeBucket(
        'source-literal-bucket',
        'source-project',
        ' literal bucket ',
      )],
      tasks: [
        makeTask(
          'source-literal-task',
          'source-project',
          'source-literal-bucket',
          'Same',
          { description: 'Text' },
        ),
        makeTask(
          'source-unassigned-task',
          'source-project',
          null,
          'Same',
          { description: 'Text' },
        ),
        makeTask(
          'source-delimiter-title',
          'source-project',
          null,
          'Alpha::Beta',
          { description: 'Gamma' },
        ),
        makeTask(
          'source-delimiter-description',
          'source-project',
          null,
          'Alpha',
          { description: 'Beta::Gamma' },
        ),
      ],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory([
        'created-literal-task',
        'created-unassigned-task',
        'created-delimiter-title',
        'created-delimiter-description',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.summary).toMatchObject({
      bucketReusedCount: 1,
      taskCreatedCount: 4,
      taskSkippedDuplicateCount: 0,
    });
    expect(result.uploadedTaskIds).toEqual([
      'created-literal-task',
      'created-unassigned-task',
      'created-delimiter-title',
      'created-delimiter-description',
    ]);
    expect(result.data.tasks.slice(-4).map((task) => ({
      bucketId: task.bucketId,
      title: task.title,
      description: task.description,
    }))).toEqual([
      { bucketId: 'unassigned', title: 'Same', description: 'Text' },
      { bucketId: null, title: 'Same', description: 'Text' },
      { bucketId: null, title: 'Alpha::Beta', description: 'Gamma' },
      { bucketId: null, title: 'Alpha', description: 'Beta::Gamma' },
    ]);
  });
});

describe('project-import identity and state preservation', () => {
  it('preserves Unassigned, archived, completion, pin, priority, and tag state with fresh timestamps', () => {
    const current = makeData({
      projects: [makeProject('destination-project')],
    });
    const source = makeData({
      projects: [makeProject('source-project')],
      tasks: [makeTask('source-task', 'source-project', null, 'Archived task', {
        description: 'Keep this state',
        priority: 3,
        resourceTags: ['alpha', 'urgent'] as ResourceTag[],
        pinned: true,
        completed: true,
        archivedAt: '2026-07-21T12:00:00.000Z',
      })],
    });

    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'existing', projectId: 'destination-project' },
      createUniqueId: createSequenceIdFactory(['created-task']),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.data.tasks.at(-1)).toEqual({
      ...source.tasks[0],
      id: 'created-task',
      projectId: 'destination-project',
      bucketId: null,
      resourceTags: ['alpha', 'urgent'],
      createdAt: IMPORT_TIMESTAMP,
      updatedAt: IMPORT_TIMESTAMP,
    });
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('remaps all five entity kinds away from current and incoming ID collisions', () => {
    const current = makeData({
      projects: [makeProject('current-project', 'Current')],
    });
    const source = makeData({
      projects: [makeProject('source-project', 'Imported')],
      templates: [makeTemplate('source-template')],
      templateDefinitions: [
        makeDefinition('source-definition', 'source-template'),
      ],
      buckets: [makeBucket('source-bucket', 'source-project', 'Imported bucket', {
        templateDefinitionId: 'source-definition',
      })],
      tasks: [makeTask('source-task', 'source-project', 'source-bucket')],
    });
    const result = importPlannerProject(current, parsePlannerProjectImport(source), {
      destination: { kind: 'new' },
      createUniqueId: createSequenceIdFactory([
        'current-project',
        'source-project',
        'source-template',
        'source-definition',
        'source-bucket',
        'source-task',
        '',
        'fresh-project',
        'fresh-template',
        'fresh-definition',
        'fresh-bucket',
        'fresh-task',
      ]),
      importedAt: IMPORT_TIMESTAMP,
    });

    expect(result.activationProjectId).toBe('fresh-project');
    expect(result.data.projects.at(-1)?.id).toBe('fresh-project');
    expect(result.data.templates.at(-1)?.id).toBe('fresh-template');
    expect(result.data.templateDefinitions.at(-1)).toMatchObject({
      id: 'fresh-definition',
      templateId: 'fresh-template',
    });
    expect(result.data.buckets.at(-1)).toMatchObject({
      id: 'fresh-bucket',
      projectId: 'fresh-project',
      templateDefinitionId: 'fresh-definition',
    });
    expect(result.data.tasks.at(-1)).toMatchObject({
      id: 'fresh-task',
      projectId: 'fresh-project',
      bucketId: 'fresh-bucket',
    });
    expect(result.uploadedTaskIds).toEqual(['fresh-task']);

    const allIds = [
      ...result.data.projects.map((project) => project.id),
      ...result.data.templates.map((template) => template.id),
      ...result.data.templateDefinitions.map((definition) => definition.id),
      ...result.data.buckets.map((bucket) => bucket.id),
      ...result.data.tasks.map((task) => task.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).not.toContain('source-project');
    expect(allIds).not.toContain('source-template');
    expect(allIds).not.toContain('source-definition');
    expect(allIds).not.toContain('source-bucket');
    expect(allIds).not.toContain('source-task');
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });

  it('imports a migrated raw-v1 project with fresh IDs while retaining legacy task state', () => {
    const rawV1: PlannerData = {
      version: 1,
      buckets: [{
        id: 'legacy-bucket',
        name: 'Legacy',
        createdAt: '2026-01-01T00:00:00.000Z',
        pinned: true,
      }],
      tasks: [{
        id: 'legacy-task',
        title: 'Legacy archived',
        description: 'Notes',
        bucketId: 'legacy-bucket',
        pinned: true,
        completed: true,
        archivedAt: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }],
    };
    const result = importPlannerProject(
      makeData({ projects: [makeProject('current-project', 'Current')] }),
      parsePlannerProjectImport(rawV1),
      {
        destination: { kind: 'new' },
        createUniqueId: createSequenceIdFactory([
          'created-project',
          'created-bucket',
          'created-task',
        ]),
        importedAt: IMPORT_TIMESTAMP,
      },
    );

    expect(result.data.tasks.at(-1)).toMatchObject({
      id: 'created-task',
      projectId: 'created-project',
      bucketId: 'created-bucket',
      pinned: true,
      completed: true,
      archivedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(result.summary).toMatchObject({
      projectCreatedCount: 1,
      bucketCreatedCount: 1,
      taskCreatedCount: 1,
    });
    expect(isValidPlannerDataV2(result.data)).toBe(true);
  });
});
