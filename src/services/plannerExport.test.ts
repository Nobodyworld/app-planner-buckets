import { describe, expect, it } from 'vitest';
import {
  buildPlannerExportFilename,
  buildProjectExchangeEnvelope,
  buildProjectScopedData,
  buildRawPlannerDataExport,
  isValidProjectExchangeEnvelope,
  sanitizePlannerExportFilenameSegment,
} from './plannerExport';
import { PLANNER_DATA_V2_VERSION, type PlannerDataV2 } from '../types/v2';
import { isValidPlannerDataV2 } from '../types/validators';

const fixture: PlannerDataV2 = {
  version: PLANNER_DATA_V2_VERSION,
  projects: [
    {
      id: 'project-dev',
      name: 'Dev Planner Buckets',
      description: 'Primary project',
      priority: 0,
      pinned: true,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
    {
      id: 'project-other',
      name: 'Other Project',
      description: '',
      priority: 0,
      pinned: false,
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-04T00:00:00.000Z',
    },
  ],
  buckets: [
    {
      id: 'bucket-dev-manual',
      projectId: 'project-dev',
      name: 'Manual',
      description: '',
      templateDefinitionId: null,
      priority: 0,
      pinned: false,
      createdAt: '2026-07-05T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
    },
    {
      id: 'bucket-dev-linked',
      projectId: 'project-dev',
      name: 'Ready',
      description: '',
      templateDefinitionId: 'definition-needed',
      priority: 0,
      pinned: true,
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
    },
    {
      id: 'bucket-other-linked',
      projectId: 'project-other',
      name: 'Other Ready',
      description: '',
      templateDefinitionId: 'definition-other',
      priority: 0,
      pinned: false,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task-dev-linked',
      projectId: 'project-dev',
      bucketId: 'bucket-dev-linked',
      title: 'Linked active',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    },
    {
      id: 'task-dev-linked-archived',
      projectId: 'project-dev',
      bucketId: 'bucket-dev-linked',
      title: 'Linked archived',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: true,
      archivedAt: '2026-07-20T00:00:00.000Z',
      createdAt: '2026-07-09T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    },
    {
      id: 'task-dev-manual-archived',
      projectId: 'project-dev',
      bucketId: 'bucket-dev-manual',
      title: 'Manual archived',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: '2026-07-21T00:00:00.000Z',
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
    {
      id: 'task-dev-unassigned',
      projectId: 'project-dev',
      bucketId: null,
      title: 'Unassigned active',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    },
    {
      id: 'task-dev-unassigned-archived',
      projectId: 'project-dev',
      bucketId: null,
      title: 'Unassigned archived',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: true,
      archivedAt: '2026-07-22T00:00:00.000Z',
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    },
    {
      id: 'task-other',
      projectId: 'project-other',
      bucketId: 'bucket-other-linked',
      title: 'Unrelated task',
      description: '',
      priority: 0,
      resourceTags: [],
      pinned: false,
      completed: false,
      archivedAt: null,
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
  ],
  templates: [
    {
      id: 'template-needed',
      name: 'Needed Template',
      description: '',
      active: true,
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    {
      id: 'template-unused',
      name: 'Unused Template',
      description: '',
      active: true,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    },
    {
      id: 'template-other',
      name: 'Other Template',
      description: '',
      active: true,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  templateDefinitions: [
    {
      id: 'definition-needed',
      templateId: 'template-needed',
      name: 'Ready',
      description: '',
      priority: 0,
      defaultActive: true,
      position: 0,
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    },
    {
      id: 'definition-unused',
      templateId: 'template-unused',
      name: 'Unused',
      description: '',
      priority: 0,
      defaultActive: true,
      position: 0,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    {
      id: 'definition-other',
      templateId: 'template-other',
      name: 'Other Ready',
      description: '',
      priority: 0,
      defaultActive: true,
      position: 0,
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
  ],
};

describe('project-scoped planner export', () => {
  it('builds a tagged envelope with a valid, project-only reference closure', () => {
    const envelope = buildProjectExchangeEnvelope(
      fixture,
      'project-dev',
      '2026-07-25T01:30:00.987Z',
    );

    expect(Object.keys(envelope)).toEqual([
      'format',
      'envelopeVersion',
      'sourceProject',
      'exportedAt',
      'data',
    ]);
    expect(envelope).toMatchObject({
      format: 'bsp-planner-project',
      envelopeVersion: 1,
      sourceProject: {
        id: 'project-dev',
        name: 'Dev Planner Buckets',
      },
      exportedAt: '2026-07-25T01:30:00.987Z',
    });
    expect(envelope.data.projects.map((project) => project.id)).toEqual(['project-dev']);
    expect(envelope.data.buckets.map((bucket) => bucket.id)).toEqual([
      'bucket-dev-manual',
      'bucket-dev-linked',
    ]);
    expect(envelope.data.tasks.map((task) => task.id)).toEqual([
      'task-dev-linked',
      'task-dev-linked-archived',
      'task-dev-manual-archived',
      'task-dev-unassigned',
      'task-dev-unassigned-archived',
    ]);
    expect(envelope.data.templateDefinitions.map((definition) => definition.id)).toEqual([
      'definition-needed',
    ]);
    expect(envelope.data.templates.map((template) => template.id)).toEqual([
      'template-needed',
    ]);
    expect(isValidPlannerDataV2(envelope.data)).toBe(true);
    expect(isValidProjectExchangeEnvelope(envelope)).toBe(true);
  });

  it('rejects missing or ambiguous source projects', () => {
    expect(() => buildProjectScopedData(fixture, 'missing')).toThrow(
      'Project "missing" was not found.',
    );

    const ambiguous: PlannerDataV2 = {
      ...fixture,
      projects: [
        ...fixture.projects,
        { ...fixture.projects[0], name: 'Duplicate ID' },
      ],
    };
    expect(() => buildProjectScopedData(ambiguous, 'project-dev')).toThrow(
      'Project "project-dev" is ambiguous.',
    );
  });

  it('rejects an incomplete required template-reference chain', () => {
    const missingRequiredTemplate: PlannerDataV2 = {
      ...fixture,
      templates: fixture.templates.filter((template) => template.id !== 'template-needed'),
    };
    expect(() => buildProjectScopedData(missingRequiredTemplate, 'project-dev')).toThrow(
      'Scoped export could not produce valid schema-v2 planner data.',
    );
  });

  it('strictly validates envelope keys, source context, timestamp, and exact dependency closure', () => {
    const envelope = buildProjectExchangeEnvelope(
      fixture,
      'project-dev',
      '2026-07-25T01:30:00.000Z',
    );
    expect(isValidProjectExchangeEnvelope({ ...envelope, extra: true })).toBe(false);
    expect(isValidProjectExchangeEnvelope({
      ...envelope,
      sourceProject: { ...envelope.sourceProject, name: 'Wrong name' },
    })).toBe(false);
    expect(isValidProjectExchangeEnvelope({
      ...envelope,
      exportedAt: '2026-07-25T01:30:00Z',
    })).toBe(false);
    expect(isValidProjectExchangeEnvelope({
      ...envelope,
      data: {
        ...envelope.data,
        templates: [...envelope.data.templates, fixture.templates[1]],
        templateDefinitions: [
          ...envelope.data.templateDefinitions,
          fixture.templateDefinitions[1],
        ],
      },
    })).toBe(false);
  });
});

describe('legacy raw schema-v2 export scopes', () => {
  it('keeps all-data exports validator-compatible', () => {
    const exported = buildRawPlannerDataExport(fixture, { kind: 'all' });
    expect(exported).toEqual(fixture);
    expect(isValidPlannerDataV2(exported)).toBe(true);
  });

  it('keeps only one named bucket, all of its tasks including archived, and required dependencies', () => {
    const exported = buildRawPlannerDataExport(fixture, {
      kind: 'bucket',
      projectId: 'project-dev',
      bucketId: 'bucket-dev-linked',
    });

    expect(exported.projects.map((project) => project.id)).toEqual(['project-dev']);
    expect(exported.buckets.map((bucket) => bucket.id)).toEqual(['bucket-dev-linked']);
    expect(exported.tasks.map((task) => task.id)).toEqual([
      'task-dev-linked',
      'task-dev-linked-archived',
    ]);
    expect(exported.templateDefinitions.map((definition) => definition.id)).toEqual([
      'definition-needed',
    ]);
    expect(exported.templates.map((template) => template.id)).toEqual(['template-needed']);
    expect(isValidPlannerDataV2(exported)).toBe(true);
  });

  it('keeps only one project and all Unassigned tasks including archived', () => {
    const exported = buildRawPlannerDataExport(fixture, {
      kind: 'unassigned',
      projectId: 'project-dev',
    });

    expect(exported.projects.map((project) => project.id)).toEqual(['project-dev']);
    expect(exported.buckets).toEqual([]);
    expect(exported.tasks.map((task) => task.id)).toEqual([
      'task-dev-unassigned',
      'task-dev-unassigned-archived',
    ]);
    expect(exported.templates).toEqual([]);
    expect(exported.templateDefinitions).toEqual([]);
    expect(isValidPlannerDataV2(exported)).toBe(true);
  });
});

describe('planner export filenames', () => {
  const timestamp = '2026-07-25T01:30:00.987Z';

  it('maps all, project, bucket, and Unassigned scopes to descriptive UTC-second filenames', () => {
    expect(buildPlannerExportFilename({ kind: 'all' }, timestamp)).toBe(
      'bsp-planner-all-2026-07-25-013000.json',
    );
    expect(buildPlannerExportFilename({
      kind: 'project',
      name: 'Dev Planner Buckets',
    }, timestamp)).toBe(
      'bsp-planner-project-dev-planner-buckets-2026-07-25-013000.json',
    );
    expect(buildPlannerExportFilename({
      kind: 'bucket',
      name: 'Ready / Review',
    }, timestamp)).toBe(
      'bsp-planner-bucket-ready-review-2026-07-25-013000.json',
    );
    expect(buildPlannerExportFilename({ kind: 'unassigned' }, timestamp)).toBe(
      'bsp-planner-unassigned-2026-07-25-013000.json',
    );
  });

  it('removes Windows-invalid characters and collapses repeated separators', () => {
    expect(sanitizePlannerExportFilenameSegment('  Résumé___...--- Roadmap  ')).toBe(
      'resume-roadmap',
    );
    expect(sanitizePlannerExportFilenameSegment('A/B')).toBe('ab');
    expect(sanitizePlannerExportFilenameSegment('Name...   ')).toBe('name');
  });

  it('uses deterministic fallbacks for empty and Windows-reserved segments', () => {
    expect(sanitizePlannerExportFilenameSegment('CON')).toBe('untitled');
    expect(sanitizePlannerExportFilenameSegment('con.txt')).toBe('untitled');
    expect(sanitizePlannerExportFilenameSegment('<>:"/\\|?*\u0000')).toBe('untitled');
    expect(sanitizePlannerExportFilenameSegment('', 'Project backup')).toBe('project-backup');
    expect(buildPlannerExportFilename({ kind: 'bucket', name: 'NUL' }, timestamp)).toContain(
      '-bucket-untitled-',
    );
  });

  it('normalizes offsets to UTC and truncates filename precision to seconds', () => {
    expect(buildPlannerExportFilename(
      { kind: 'project', name: 'Boundary' },
      '2026-07-25T23:59:59.999-05:00',
    )).toBe('bsp-planner-project-boundary-2026-07-26-045959.json');
  });

  it('rejects invalid timestamps', () => {
    expect(() => buildPlannerExportFilename({ kind: 'all' }, 'not-a-date')).toThrow(
      'Export timestamp is invalid.',
    );
  });
});
