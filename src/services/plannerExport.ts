import {
  PLANNER_DATA_V2_VERSION,
  type BucketTemplate,
  type BucketTemplateDefinition,
  type BucketV2,
  type PlannerDataV2,
  type Project,
} from '../types/v2';
import { isValidPlannerDataV2 } from '../types/validators';

export const PROJECT_EXCHANGE_FORMAT = 'bsp-planner-project' as const;
export const PROJECT_EXCHANGE_ENVELOPE_VERSION = 1 as const;

export interface ProjectExchangeEnvelope {
  format: typeof PROJECT_EXCHANGE_FORMAT;
  envelopeVersion: typeof PROJECT_EXCHANGE_ENVELOPE_VERSION;
  sourceProject: {
    id: string;
    name: string;
  };
  exportedAt: string;
  data: PlannerDataV2;
}

export type RawPlannerExportScope =
  | { kind: 'all' }
  | { kind: 'bucket'; projectId: string; bucketId: string }
  | { kind: 'unassigned'; projectId: string };

export type PlannerExportFilenameScope =
  | { kind: 'all' }
  | { kind: 'project'; name: string }
  | { kind: 'bucket'; name: string }
  | { kind: 'unassigned' };

export type PlannerExportTimestamp = string | Date;

interface ReferencedTemplateRecords {
  templates: BucketTemplate[];
  templateDefinitions: BucketTemplateDefinition[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasExactKeys = (value: Record<string, unknown>, expectedKeys: string[]): boolean => {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
};

const findUniqueProject = (data: PlannerDataV2, projectId: string): Project => {
  const matches = data.projects.filter((project) => project.id === projectId);
  if (matches.length === 0) {
    throw new Error(`Project "${projectId}" was not found.`);
  }
  if (matches.length > 1) {
    throw new Error(`Project "${projectId}" is ambiguous.`);
  }
  return matches[0];
};

const findUniqueBucket = (
  data: PlannerDataV2,
  projectId: string,
  bucketId: string,
): BucketV2 => {
  const matches = data.buckets.filter((bucket) => (
    bucket.id === bucketId && bucket.projectId === projectId
  ));
  if (matches.length === 0) {
    throw new Error(`Bucket "${bucketId}" was not found in project "${projectId}".`);
  }
  if (matches.length > 1) {
    throw new Error(`Bucket "${bucketId}" is ambiguous in project "${projectId}".`);
  }
  return matches[0];
};

const collectReferencedTemplateRecords = (
  data: PlannerDataV2,
  buckets: BucketV2[],
): ReferencedTemplateRecords => {
  const definitionIds = new Set(
    buckets.flatMap((bucket) => (
      bucket.templateDefinitionId === null ? [] : [bucket.templateDefinitionId]
    )),
  );
  const templateDefinitions = data.templateDefinitions.filter(
    (definition) => definitionIds.has(definition.id),
  );
  const templateIds = new Set(
    templateDefinitions.map((definition) => definition.templateId),
  );
  const templates = data.templates.filter((template) => templateIds.has(template.id));

  return { templates, templateDefinitions };
};

const validateBuiltPlannerData = (data: PlannerDataV2): PlannerDataV2 => {
  if (!isValidPlannerDataV2(data)) {
    throw new Error('Scoped export could not produce valid schema-v2 planner data.');
  }
  return data;
};

export const normalizePlannerExportTimestamp = (
  timestamp: PlannerExportTimestamp,
): string => {
  const date = timestamp instanceof Date
    ? new Date(timestamp.getTime())
    : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Export timestamp is invalid.');
  }
  return date.toISOString();
};

export const buildProjectScopedData = (
  data: PlannerDataV2,
  projectId: string,
): PlannerDataV2 => {
  const project = findUniqueProject(data, projectId);
  const buckets = data.buckets.filter((bucket) => bucket.projectId === project.id);
  const tasks = data.tasks.filter((task) => task.projectId === project.id);
  const { templates, templateDefinitions } = collectReferencedTemplateRecords(data, buckets);

  return validateBuiltPlannerData({
    version: PLANNER_DATA_V2_VERSION,
    projects: [project],
    buckets,
    tasks,
    templates,
    templateDefinitions,
  });
};

export const buildRawPlannerDataExport = (
  data: PlannerDataV2,
  scope: RawPlannerExportScope,
): PlannerDataV2 => {
  if (scope.kind === 'all') {
    return validateBuiltPlannerData({
      version: PLANNER_DATA_V2_VERSION,
      projects: [...data.projects],
      buckets: [...data.buckets],
      tasks: [...data.tasks],
      templates: [...data.templates],
      templateDefinitions: [...data.templateDefinitions],
    });
  }

  const project = findUniqueProject(data, scope.projectId);
  if (scope.kind === 'unassigned') {
    return validateBuiltPlannerData({
      version: PLANNER_DATA_V2_VERSION,
      projects: [project],
      buckets: [],
      tasks: data.tasks.filter((task) => (
        task.projectId === project.id && task.bucketId === null
      )),
      templates: [],
      templateDefinitions: [],
    });
  }

  const bucket = findUniqueBucket(data, project.id, scope.bucketId);
  const { templates, templateDefinitions } = collectReferencedTemplateRecords(data, [bucket]);
  return validateBuiltPlannerData({
    version: PLANNER_DATA_V2_VERSION,
    projects: [project],
    buckets: [bucket],
    tasks: data.tasks.filter((task) => (
      task.projectId === project.id && task.bucketId === bucket.id
    )),
    templates,
    templateDefinitions,
  });
};

export const buildProjectExchangeEnvelope = (
  data: PlannerDataV2,
  projectId: string,
  exportedAt: PlannerExportTimestamp,
): ProjectExchangeEnvelope => {
  const scopedData = buildProjectScopedData(data, projectId);
  const project = scopedData.projects[0];
  const envelope: ProjectExchangeEnvelope = {
    format: PROJECT_EXCHANGE_FORMAT,
    envelopeVersion: PROJECT_EXCHANGE_ENVELOPE_VERSION,
    sourceProject: {
      id: project.id,
      name: project.name,
    },
    exportedAt: normalizePlannerExportTimestamp(exportedAt),
    data: scopedData,
  };

  if (!isValidProjectExchangeEnvelope(envelope)) {
    throw new Error('Project exchange envelope could not be validated.');
  }
  return envelope;
};

export const isValidProjectExchangeEnvelope = (
  value: unknown,
): value is ProjectExchangeEnvelope => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'format',
    'envelopeVersion',
    'sourceProject',
    'exportedAt',
    'data',
  ])) {
    return false;
  }
  if (
    value.format !== PROJECT_EXCHANGE_FORMAT
    || value.envelopeVersion !== PROJECT_EXCHANGE_ENVELOPE_VERSION
    || typeof value.exportedAt !== 'string'
  ) {
    return false;
  }

  try {
    if (normalizePlannerExportTimestamp(value.exportedAt) !== value.exportedAt) return false;
  } catch {
    return false;
  }

  if (
    !isRecord(value.sourceProject)
    || !hasExactKeys(value.sourceProject, ['id', 'name'])
    || typeof value.sourceProject.id !== 'string'
    || typeof value.sourceProject.name !== 'string'
    || !isValidPlannerDataV2(value.data)
  ) {
    return false;
  }

  const data = value.data as PlannerDataV2;
  if (data.projects.length !== 1) return false;
  const project = data.projects[0];
  if (
    project.id !== value.sourceProject.id
    || project.name !== value.sourceProject.name
  ) {
    return false;
  }

  const referencedDefinitionIds = new Set(
    data.buckets.flatMap((bucket) => (
      bucket.templateDefinitionId === null ? [] : [bucket.templateDefinitionId]
    )),
  );
  if (
    data.templateDefinitions.length !== referencedDefinitionIds.size
    || data.templateDefinitions.some(
      (definition) => !referencedDefinitionIds.has(definition.id),
    )
  ) {
    return false;
  }

  const referencedTemplateIds = new Set(
    data.templateDefinitions.map((definition) => definition.templateId),
  );
  return data.templates.length === referencedTemplateIds.size
    && data.templates.every((template) => referencedTemplateIds.has(template.id));
};

const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]/g;

const sanitizeSegmentWithoutFallback = (value: string): string => {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(WINDOWS_INVALID_FILENAME_CHARACTERS, '')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!normalized || WINDOWS_RESERVED_SEGMENT.test(normalized)) return '';

  const slug = normalized
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug && !WINDOWS_RESERVED_SEGMENT.test(slug) ? slug : '';
};

export const sanitizePlannerExportFilenameSegment = (
  value: string,
  fallback = 'untitled',
): string => (
  sanitizeSegmentWithoutFallback(value)
  || sanitizeSegmentWithoutFallback(fallback)
  || 'untitled'
);

export const buildPlannerExportFilename = (
  scope: PlannerExportFilenameScope,
  timestamp: PlannerExportTimestamp,
): string => {
  const exportedAt = normalizePlannerExportTimestamp(timestamp);
  const timestampSegment = `${exportedAt.slice(0, 10)}-${exportedAt.slice(11, 19).replace(/:/g, '')}`;
  const scopeSegments = scope.kind === 'project' || scope.kind === 'bucket'
    ? [scope.kind, sanitizePlannerExportFilenameSegment(scope.name)]
    : [scope.kind];

  return ['bsp', 'planner', ...scopeSegments, timestampSegment].join('-') + '.json';
};
