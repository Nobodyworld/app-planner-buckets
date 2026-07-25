import { describe, expect, it } from 'vitest';
import type {
  BucketTemplate,
  BucketTemplateDefinition,
  BucketV2,
  PlannerDataV2,
  PlannerTaskV2,
  Project,
} from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import {
  buildStructuredBucketCopyDocument,
  formatProjectMarkdownForCopy,
  formatStructuredBucketCopyJson,
} from './plannerExchange';

const timestamp = '2026-07-25T06:30:00.000Z';

const createProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-main',
  name: '  Project Atlas  ',
  description: '  Coordinated launch.\r\nSecond paragraph.  ',
  priority: 3,
  pinned: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const createBucket = (overrides: Partial<BucketV2> = {}): BucketV2 => ({
  id: 'bucket-work',
  projectId: 'project-main',
  name: 'Workstream',
  description: 'Internal bucket description',
  templateDefinitionId: null,
  priority: 2,
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const createTask = (overrides: Partial<PlannerTaskV2> = {}): PlannerTaskV2 => ({
  id: 'task-default',
  projectId: 'project-main',
  bucketId: 'bucket-work',
  title: 'Default task',
  description: '',
  priority: 1,
  resourceTags: [],
  pinned: false,
  completed: false,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const exchangeTemplate: BucketTemplate = {
  id: 'template-internal',
  name: 'Template Metadata',
  description: 'Must not appear in clipboard text',
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const exchangeDefinition: BucketTemplateDefinition = {
  id: 'definition-internal',
  templateId: exchangeTemplate.id,
  name: 'Definition Metadata',
  description: 'Must not appear in clipboard text',
  priority: 2,
  defaultActive: true,
  position: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const createExchangeFixture = (): PlannerDataV2 => ({
  version: PLANNER_DATA_V2_VERSION,
  projects: [
    createProject(),
    createProject({
      id: 'project-other',
      name: 'Other Project',
      description: 'Unrelated project description',
      pinned: false,
    }),
  ],
  buckets: [
    createBucket(),
    createBucket({
      id: 'bucket-ready',
      name: 'Ready',
      pinned: true,
      templateDefinitionId: exchangeDefinition.id,
    }),
    createBucket({
      id: 'bucket-empty',
      name: 'Empty Lane',
    }),
    createBucket({
      id: 'bucket-review',
      name: 'Review',
      pinned: true,
    }),
    createBucket({
      id: 'bucket-other',
      projectId: 'project-other',
      name: 'Unrelated Bucket',
    }),
  ],
  tasks: [
    createTask({
      id: 'task-ready-later',
      bucketId: 'bucket-ready',
      title: '  Ready later  ',
      description: '  Review copy\r\n Confirm owner  ',
    }),
    createTask({
      id: 'task-ready-ship',
      bucketId: 'bucket-ready',
      title: '  Ship release  ',
      description: '  Notify stakeholders  ',
      completed: true,
      pinned: true,
    }),
    createTask({
      id: 'task-ready-archived',
      bucketId: 'bucket-ready',
      title: 'Archived ready task must not appear',
      pinned: true,
      archivedAt: timestamp,
    }),
    createTask({
      id: 'task-ready-confirm',
      bucketId: 'bucket-ready',
      title: ' Confirm rollout ',
      description: '   ',
      pinned: true,
    }),
    createTask({
      id: 'task-review-regular',
      bucketId: 'bucket-review',
      title: 'Regular review',
      completed: true,
    }),
    createTask({
      id: 'task-review-pinned',
      bucketId: 'bucket-review',
      title: 'Pinned review',
      pinned: true,
    }),
    createTask({
      id: 'task-work-draft',
      title: 'Draft brief',
    }),
    createTask({
      id: 'task-work-direction',
      title: 'Set direction',
      pinned: true,
    }),
    createTask({
      id: 'task-unassigned-close',
      bucketId: null,
      title: 'Close notes',
      description: 'Capture learnings',
      completed: true,
    }),
    createTask({
      id: 'task-unassigned-archived',
      bucketId: null,
      title: 'Archived unassigned task must not appear',
      archivedAt: timestamp,
    }),
    createTask({
      id: 'task-unassigned-triage',
      bucketId: null,
      title: 'Triage intake',
      pinned: true,
    }),
    createTask({
      id: 'task-other',
      projectId: 'project-other',
      bucketId: 'bucket-other',
      title: 'Unrelated task must not appear',
      pinned: true,
    }),
  ],
  templates: [exchangeTemplate],
  templateDefinitions: [exchangeDefinition],
});

describe('plannerExchange', () => {
  describe('formatProjectMarkdownForCopy', () => {
    it('formats the complete active project deterministically in pinned-first stored order', () => {
      const markdown = formatProjectMarkdownForCopy(createExchangeFixture(), 'project-main');

      expect(markdown).toBe(
        '# Project Atlas\n'
        + '\n'
        + 'Coordinated launch.\n'
        + 'Second paragraph.\n'
        + '\n'
        + '## Bucket: Ready\n'
        + '\n'
        + '1. [x] Ship release\n'
        + '   Note: Notify stakeholders\n'
        + '2. [ ] Confirm rollout\n'
        + '3. [ ] Ready later\n'
        + '   Note: Review copy\n'
        + '   Note: Confirm owner\n'
        + '\n'
        + '## Bucket: Review\n'
        + '\n'
        + '1. [ ] Pinned review\n'
        + '2. [x] Regular review\n'
        + '\n'
        + '## Bucket: Workstream\n'
        + '\n'
        + '1. [ ] Set direction\n'
        + '2. [ ] Draft brief\n'
        + '\n'
        + '## Bucket: Empty Lane\n'
        + '\n'
        + '_No active tasks._\n'
        + '\n'
        + '## Unassigned\n'
        + '\n'
        + '1. [ ] Triage intake\n'
        + '2. [x] Close notes\n'
        + '   Note: Capture learnings',
      );
    });

    it('omits unrelated records and internal IDs, timestamps, and template metadata', () => {
      const markdown = formatProjectMarkdownForCopy(createExchangeFixture(), 'project-main');

      expect(markdown).not.toContain('Unrelated Project');
      expect(markdown).not.toContain('Unrelated Bucket');
      expect(markdown).not.toContain('Unrelated task must not appear');
      expect(markdown).not.toContain('Archived ready task must not appear');
      expect(markdown).not.toContain('Archived unassigned task must not appear');
      expect(markdown).not.toContain('project-main');
      expect(markdown).not.toContain('bucket-ready');
      expect(markdown).not.toContain('task-ready-ship');
      expect(markdown).not.toContain(timestamp);
      expect(markdown).not.toContain(exchangeTemplate.name);
      expect(markdown).not.toContain(exchangeDefinition.name);
    });

    it('omits a blank project description and keeps an empty Unassigned section last', () => {
      const fixture = createExchangeFixture();
      const data: PlannerDataV2 = {
        ...fixture,
        projects: fixture.projects.map((project) => (
          project.id === 'project-main'
            ? { ...project, description: ' \r\n  ' }
            : project
        )),
        buckets: fixture.buckets.filter((bucket) => bucket.id === 'bucket-empty'),
        tasks: [],
        templates: [],
        templateDefinitions: [],
      };

      expect(formatProjectMarkdownForCopy(data, 'project-main')).toBe(
        '# Project Atlas\n'
        + '\n'
        + '## Bucket: Empty Lane\n'
        + '\n'
        + '_No active tasks._\n'
        + '\n'
        + '## Unassigned\n'
        + '\n'
        + '_No active tasks._',
      );
    });
  });

  describe('structured bucket copy', () => {
    it('builds and formats the exact JSON document with active tasks in stable pinned-first order', () => {
      const data = createExchangeFixture();
      const target = { projectId: 'project-main', bucketId: 'bucket-ready' };
      const document = buildStructuredBucketCopyDocument(data, target);
      const json = formatStructuredBucketCopyJson(data, target);

      expect(document).toEqual({
        bucket: {
          name: 'Ready',
          pinned: true,
        },
        tasks: [
          {
            title: 'Ship release',
            description: 'Notify stakeholders',
            completed: true,
            pinned: true,
          },
          {
            title: 'Confirm rollout',
            description: '',
            completed: false,
            pinned: true,
          },
          {
            title: 'Ready later',
            description: 'Review copy\r\n Confirm owner',
            completed: false,
            pinned: false,
          },
        ],
      });
      expect(json).toBe(
        '{\n'
        + '  "bucket": {\n'
        + '    "name": "Ready",\n'
        + '    "pinned": true\n'
        + '  },\n'
        + '  "tasks": [\n'
        + '    {\n'
        + '      "title": "Ship release",\n'
        + '      "description": "Notify stakeholders",\n'
        + '      "completed": true,\n'
        + '      "pinned": true\n'
        + '    },\n'
        + '    {\n'
        + '      "title": "Confirm rollout",\n'
        + '      "description": "",\n'
        + '      "completed": false,\n'
        + '      "pinned": true\n'
        + '    },\n'
        + '    {\n'
        + '      "title": "Ready later",\n'
        + '      "description": "Review copy\\r\\n Confirm owner",\n'
        + '      "completed": false,\n'
        + '      "pinned": false\n'
        + '    }\n'
        + '  ]\n'
        + '}',
      );
      expect(Object.keys(JSON.parse(json))).toEqual(['bucket', 'tasks']);
      expect(json.endsWith('\n')).toBe(false);
      expect(json).not.toContain('task-ready-ship');
      expect(json).not.toContain('task-ready-archived');
      expect(json).not.toContain(timestamp);
    });

    it('formats empty Unassigned explicitly and omits archived Unassigned tasks', () => {
      const fixture = createExchangeFixture();
      const data: PlannerDataV2 = {
        ...fixture,
        tasks: fixture.tasks.filter((task) => (
          task.bucketId !== null || task.archivedAt !== null
        )),
      };

      expect(formatStructuredBucketCopyJson(data, {
        projectId: 'project-main',
        bucketId: null,
      })).toBe(
        '{\n'
        + '  "bucket": {\n'
        + '    "name": "Unassigned",\n'
        + '    "pinned": false\n'
        + '  },\n'
        + '  "tasks": []\n'
        + '}',
      );
    });

    it('uses the Untitled bucket fallback for a blank named bucket', () => {
      const fixture = createExchangeFixture();
      const data: PlannerDataV2 = {
        ...fixture,
        buckets: fixture.buckets.map((bucket) => (
          bucket.id === 'bucket-empty'
            ? { ...bucket, name: ' \r\n ' }
            : bucket
        )),
      };

      expect(formatStructuredBucketCopyJson(data, {
        projectId: 'project-main',
        bucketId: 'bucket-empty',
      })).toBe(
        '{\n'
        + '  "bucket": {\n'
        + '    "name": "Untitled bucket",\n'
        + '    "pinned": false\n'
        + '  },\n'
        + '  "tasks": []\n'
        + '}',
      );
    });
  });

  describe('target resolution', () => {
    it('throws for a missing or ambiguous project', () => {
      const data = createExchangeFixture();
      const duplicateProjectData: PlannerDataV2 = {
        ...data,
        projects: [
          ...data.projects,
          createProject({ name: 'Duplicate project record' }),
        ],
      };

      expect(() => formatProjectMarkdownForCopy(data, 'project-missing')).toThrow(
        'Project "project-missing" was not found.',
      );
      expect(() => formatProjectMarkdownForCopy(duplicateProjectData, 'project-main')).toThrow(
        'Project "project-main" is ambiguous.',
      );
      expect(() => buildStructuredBucketCopyDocument(data, {
        projectId: 'project-missing',
        bucketId: null,
      })).toThrow('Project "project-missing" was not found.');
      expect(() => buildStructuredBucketCopyDocument(duplicateProjectData, {
        projectId: 'project-main',
        bucketId: null,
      })).toThrow('Project "project-main" is ambiguous.');
    });

    it('throws for a missing or ambiguous named bucket within the target project', () => {
      const data = createExchangeFixture();
      const duplicateBucketData: PlannerDataV2 = {
        ...data,
        buckets: [
          ...data.buckets,
          createBucket({
            id: 'bucket-ready',
            name: 'Duplicate ready record',
            pinned: true,
          }),
        ],
      };

      expect(() => buildStructuredBucketCopyDocument(data, {
        projectId: 'project-main',
        bucketId: 'bucket-missing',
      })).toThrow('Bucket "bucket-missing" was not found in project "project-main".');
      expect(() => formatStructuredBucketCopyJson(duplicateBucketData, {
        projectId: 'project-main',
        bucketId: 'bucket-ready',
      })).toThrow('Bucket "bucket-ready" is ambiguous in project "project-main".');
      expect(() => buildStructuredBucketCopyDocument(data, {
        projectId: 'project-main',
        bucketId: 'bucket-other',
      })).toThrow('Bucket "bucket-other" was not found in project "project-main".');
    });
  });
});
