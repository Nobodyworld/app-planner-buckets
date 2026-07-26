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
export const PLANNER_SCOPED_EXCHANGE_FORMAT = 'bsp-planner-scope' as const;
export const PLANNER_SCOPED_EXCHANGE_ENVELOPE_VERSION = 1 as const;

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

export type PlannerScopedExchangeScope =
  | {
    kind: 'project';
    projectId: string;
    projectName: string;
  }
  | {
    kind: 'bucket';
    projectId: string;
    projectName: string;
    bucketId: string;
    bucketName: string;
  }
  | {
    kind: 'unassigned';
    projectId: string;
    projectName: string;
  };

export interface PlannerScopedExchangeEnvelope {
  format: typeof PLANNER_SCOPED_EXCHANGE_FORMAT;
  envelopeVersion: typeof PLANNER_SCOPED_EXCHANGE_ENVELOPE_VERSION;
  scope: PlannerScopedExchangeScope;
  exportedAt: string;
  data: PlannerDataV2;
}

export type PlannerScopedExchangeBuildScope =
  | { kind: 'project'; projectId: string }
  | { kind: 'bucket'; projectId: string; bucketId: string }
  | { kind: 'unassigned'; projectId: string };

export type RawPlannerExportScope = { kind: 'all' };

type ScopedPlannerDataSelection =
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

const hasExactReferencedTemplateClosure = (data: PlannerDataV2): boolean => {
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
  if (!isRecord(scope) || !hasExactKeys(scope, ['kind']) || scope.kind !== 'all') {
    throw new Error('Raw planner exports are reserved for All data.');
  }
  return validateBuiltPlannerData({
    version: PLANNER_DATA_V2_VERSION,
    projects: [...data.projects],
    buckets: [...data.buckets],
    tasks: [...data.tasks],
    templates: [...data.templates],
    templateDefinitions: [...data.templateDefinitions],
  });
};

const buildScopedPlannerData = (
  data: PlannerDataV2,
  scope: ScopedPlannerDataSelection,
): PlannerDataV2 => {
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

export const buildPlannerScopedExchangeEnvelope = (
  data: PlannerDataV2,
  scope: PlannerScopedExchangeBuildScope,
  exportedAt: PlannerExportTimestamp,
): PlannerScopedExchangeEnvelope => {
  let scopedData: PlannerDataV2;
  let envelopeScope: PlannerScopedExchangeScope;

  if (scope.kind === 'project') {
    scopedData = buildProjectScopedData(data, scope.projectId);
    const project = scopedData.projects[0];
    envelopeScope = {
      kind: 'project',
      projectId: project.id,
      projectName: project.name,
    };
  } else if (scope.kind === 'bucket') {
    scopedData = buildScopedPlannerData(data, scope);
    const project = scopedData.projects[0];
    const bucket = scopedData.buckets[0];
    envelopeScope = {
      kind: 'bucket',
      projectId: project.id,
      projectName: project.name,
      bucketId: bucket.id,
      bucketName: bucket.name,
    };
  } else {
    scopedData = buildScopedPlannerData(data, scope);
    const project = scopedData.projects[0];
    envelopeScope = {
      kind: 'unassigned',
      projectId: project.id,
      projectName: project.name,
    };
  }

  const envelope: PlannerScopedExchangeEnvelope = {
    format: PLANNER_SCOPED_EXCHANGE_FORMAT,
    envelopeVersion: PLANNER_SCOPED_EXCHANGE_ENVELOPE_VERSION,
    scope: envelopeScope,
    exportedAt: normalizePlannerExportTimestamp(exportedAt),
    data: scopedData,
  };
  if (!isValidPlannerScopedExchangeEnvelope(envelope)) {
    throw new Error('Scoped exchange envelope could not be validated.');
  }
  return envelope;
};

export const isPlannerScopedExchangeEnvelopeCandidate = (value: unknown): boolean => (
  isRecord(value)
  && value.format === PLANNER_SCOPED_EXCHANGE_FORMAT
);

export const isValidPlannerScopedExchangeEnvelope = (
  value: unknown,
): value is PlannerScopedExchangeEnvelope => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'format',
    'envelopeVersion',
    'scope',
    'exportedAt',
    'data',
  ])) {
    return false;
  }
  if (
    value.format !== PLANNER_SCOPED_EXCHANGE_FORMAT
    || value.envelopeVersion !== PLANNER_SCOPED_EXCHANGE_ENVELOPE_VERSION
    || typeof value.exportedAt !== 'string'
    || !isRecord(value.scope)
    || !isValidPlannerDataV2(value.data)
  ) {
    return false;
  }

  try {
    if (normalizePlannerExportTimestamp(value.exportedAt) !== value.exportedAt) return false;
  } catch {
    return false;
  }

  const scope = value.scope;
  const data = value.data as PlannerDataV2;
  if (
    data.projects.length !== 1
    || typeof scope.kind !== 'string'
    || typeof scope.projectId !== 'string'
    || typeof scope.projectName !== 'string'
  ) {
    return false;
  }
  const project = data.projects[0];
  if (
    project.id !== scope.projectId
    || project.name !== scope.projectName
    || !hasExactReferencedTemplateClosure(data)
  ) {
    return false;
  }

  if (scope.kind === 'project') {
    return hasExactKeys(scope, ['kind', 'projectId', 'projectName']);
  }

  if (scope.kind === 'bucket') {
    if (
      !hasExactKeys(scope, [
        'kind',
        'projectId',
        'projectName',
        'bucketId',
        'bucketName',
      ])
      || typeof scope.bucketId !== 'string'
      || typeof scope.bucketName !== 'string'
      || data.buckets.length !== 1
    ) {
      return false;
    }
    const bucket = data.buckets[0];
    return bucket.id === scope.bucketId
      && bucket.name === scope.bucketName
      && bucket.projectId === project.id
      && data.tasks.every((task) => task.bucketId === bucket.id);
  }

  return scope.kind === 'unassigned'
    && hasExactKeys(scope, ['kind', 'projectId', 'projectName'])
    && data.buckets.length === 0
    && data.tasks.every((task) => task.bucketId === null)
    && data.templateDefinitions.length === 0
    && data.templates.length === 0;
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

  return hasExactReferencedTemplateClosure(data);
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
