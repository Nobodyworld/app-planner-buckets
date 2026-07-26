import type {
  BucketTemplate,
  BucketTemplateDefinition,
  BucketV2,
  PlannerDataV2,
  PlannerTaskV2,
  Project,
} from '../types/v2';
import { PLANNER_DATA_V2_VERSION } from '../types/v2';
import { normalizeResourceTags } from '../types/migration';
import { isValidPlannerDataV2 } from '../types/validators';
import {
  isPlannerScopedExchangeEnvelopeCandidate,
  isValidPlannerScopedExchangeEnvelope,
  isValidProjectExchangeEnvelope,
  PLANNER_SCOPED_EXCHANGE_FORMAT,
  PROJECT_EXCHANGE_FORMAT,
} from './plannerExport';
import { coercePlannerDataToV2 } from './plannerImport';

export type PlannerProjectImportSourceKind =
  | 'scoped-envelope'
  | 'project-envelope'
  | 'raw-v1'
  | 'raw-v2';

export interface PlannerProjectImportSourceChoice {
  projectId: string;
  name: string;
  label: string;
  sourceIndex: number;
}

export interface ParsedPlannerProjectImport {
  sourceKind: PlannerProjectImportSourceKind;
  sourceVersion: 1 | 2;
  data: PlannerDataV2;
  sourceProjectChoices: PlannerProjectImportSourceChoice[];
  autoSelectedSourceProjectId: string | null;
}

export type PlannerProjectImportDestination =
  | { kind: 'new' }
  | { kind: 'existing'; projectId: string };

export interface PlannerProjectImportOptions {
  sourceProjectId?: string;
  destination: PlannerProjectImportDestination;
  createUniqueId: () => string;
  importedAt: string;
}

export type PlannerProjectImportAmbiguityEntity =
  | 'template'
  | 'template-definition'
  | 'bucket';

export interface PlannerProjectImportAmbiguity {
  entity: PlannerProjectImportAmbiguityEntity;
  sourceId: string;
  matchBy:
    | 'normalized-name'
    | 'template-definition'
    | 'template-definition-conflict';
  normalizedName: string;
  candidateIds: string[];
  resolution: 'created-new';
}

export interface PlannerProjectImportSummary {
  projectCreatedCount: number;
  projectMergedCount: number;
  dependencyCreatedCount: number;
  dependencyReusedCount: number;
  templateCreatedCount: number;
  templateReusedCount: number;
  templateAmbiguousMatchCount: number;
  templateDefinitionCreatedCount: number;
  templateDefinitionReusedCount: number;
  templateDefinitionAmbiguousMatchCount: number;
  bucketCreatedCount: number;
  bucketReusedCount: number;
  bucketAmbiguousMatchCount: number;
  taskCreatedCount: number;
  taskSkippedDuplicateCount: number;
}

export interface PlannerProjectImportResult {
  data: PlannerDataV2;
  activationProjectId: string;
  sourceProjectId: string;
  sourceProjectName: string;
  uploadedTaskIds: string[];
  summary: PlannerProjectImportSummary;
  ambiguities: PlannerProjectImportAmbiguity[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const isProjectExchangeEnvelopeCandidate = (value: unknown): boolean => (
  isRecord(value)
  && (
    value.format === PROJECT_EXCHANGE_FORMAT
    || isPlannerScopedExchangeEnvelopeCandidate(value)
  )
);

const canonicalName = (value: string, fallback: string): string => (
  value.trim() || fallback
);

const normalizeName = (value: string, fallback: string): string => (
  canonicalName(value, fallback).toLowerCase()
);

const normalizeDescription = (value: string): string => value.trim().toLowerCase();
const canonicalDescription = (value: string): string => value.trim();

const normalizeTimestamp = (value: string): string => {
  if (typeof value !== 'string') {
    throw new Error('Project import requires an import timestamp.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Project import timestamp is invalid.');
  }
  return date.toISOString();
};

const collectPlannerIds = (data: PlannerDataV2): Set<string> => new Set([
  ...data.projects.map((project) => project.id),
  ...data.templates.map((template) => template.id),
  ...data.templateDefinitions.map((definition) => definition.id),
  ...data.buckets.map((bucket) => bucket.id),
  ...data.tasks.map((task) => task.id),
]);

const createIdAllocator = (
  current: PlannerDataV2,
  source: PlannerDataV2,
  createUniqueId: () => string,
): (() => string) => {
  if (typeof createUniqueId !== 'function') {
    throw new Error('Project import requires an ID generator.');
  }

  const reservedIds = collectPlannerIds(current);
  collectPlannerIds(source).forEach((id) => reservedIds.add(id));

  return () => {
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const candidate = createUniqueId();
      if (typeof candidate !== 'string' || !candidate.trim() || reservedIds.has(candidate)) {
        continue;
      }
      reservedIds.add(candidate);
      return candidate;
    }
    throw new Error('Project import could not generate a collision-safe ID.');
  };
};

const buildSourceChoices = (
  data: PlannerDataV2,
): PlannerProjectImportSourceChoice[] => {
  const normalizedNameCounts = new Map<string, number>();
  data.projects.forEach((project) => {
    const normalizedName = normalizeName(project.name, 'Untitled project');
    normalizedNameCounts.set(
      normalizedName,
      (normalizedNameCounts.get(normalizedName) ?? 0) + 1,
    );
  });

  const normalizedNameOrdinals = new Map<string, number>();
  return data.projects.map((project, sourceIndex) => {
    const baseLabel = canonicalName(project.name, 'Untitled project');
    const normalizedName = normalizeName(baseLabel, 'Untitled project');
    const duplicateCount = normalizedNameCounts.get(normalizedName) ?? 1;
    const duplicateOrdinal = (normalizedNameOrdinals.get(normalizedName) ?? 0) + 1;
    normalizedNameOrdinals.set(normalizedName, duplicateOrdinal);

    return {
      projectId: project.id,
      name: project.name,
      label: duplicateCount > 1
        ? `${baseLabel} (${duplicateOrdinal} of ${duplicateCount})`
        : baseLabel,
      sourceIndex,
    };
  });
};

export const parsePlannerProjectImport = (
  value: unknown,
): ParsedPlannerProjectImport => {
  if (isValidPlannerScopedExchangeEnvelope(value)) {
    const data = value.data;
    const sourceProjectChoices = buildSourceChoices(data);
    return {
      sourceKind: 'scoped-envelope',
      sourceVersion: 2,
      data,
      sourceProjectChoices,
      autoSelectedSourceProjectId: sourceProjectChoices[0]?.projectId ?? null,
    };
  }

  if (isValidProjectExchangeEnvelope(value)) {
    const data = value.data;
    const sourceProjectChoices = buildSourceChoices(data);
    return {
      sourceKind: 'project-envelope',
      sourceVersion: 2,
      data,
      sourceProjectChoices,
      autoSelectedSourceProjectId: sourceProjectChoices[0]?.projectId ?? null,
    };
  }

  if (
    isProjectExchangeEnvelopeCandidate(value)
    || (
      isRecord(value)
      && (
        value.format === PROJECT_EXCHANGE_FORMAT
        || value.format === PLANNER_SCOPED_EXCHANGE_FORMAT
      )
    )
  ) {
    throw new Error('Selected file is not a valid supported planner exchange envelope.');
  }

  const coerced = coercePlannerDataToV2(value);
  const sourceProjectChoices = buildSourceChoices(coerced.data);
  return {
    sourceKind: coerced.sourceVersion === 1 ? 'raw-v1' : 'raw-v2',
    sourceVersion: coerced.sourceVersion,
    data: coerced.data,
    sourceProjectChoices,
    autoSelectedSourceProjectId: sourceProjectChoices.length === 1
      ? sourceProjectChoices[0].projectId
      : null,
  };
};

const assertValidParsedSource = (
  parsed: ParsedPlannerProjectImport,
): PlannerDataV2 => {
  if (!parsed || !isValidPlannerDataV2(parsed.data)) {
    throw new Error('Project import source is invalid.');
  }
  return parsed.data;
};

export const resolvePlannerProjectImportSourceProject = (
  parsed: ParsedPlannerProjectImport,
  sourceProjectId?: string,
): Project => {
  const data = assertValidParsedSource(parsed);
  const requestedSourceProjectId = sourceProjectId?.trim() || null;

  if (!requestedSourceProjectId) {
    if (data.projects.length !== 1) {
      throw new Error('Project import source is ambiguous; choose a source project explicitly.');
    }
    return data.projects[0];
  }

  const matches = data.projects.filter((project) => project.id === requestedSourceProjectId);
  if (matches.length === 0) {
    throw new Error(`Project import source "${requestedSourceProjectId}" was not found.`);
  }
  if (matches.length > 1) {
    throw new Error(`Project import source "${requestedSourceProjectId}" is ambiguous.`);
  }
  return matches[0];
};

export const extractPlannerProjectImportSource = (
  parsed: ParsedPlannerProjectImport,
  sourceProjectId?: string,
): PlannerDataV2 => {
  const data = assertValidParsedSource(parsed);
  const project = resolvePlannerProjectImportSourceProject(parsed, sourceProjectId);
  const buckets = data.buckets.filter((bucket) => bucket.projectId === project.id);
  const tasks = data.tasks.filter((task) => task.projectId === project.id);
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

  const scopedData: PlannerDataV2 = {
    version: PLANNER_DATA_V2_VERSION,
    projects: [project],
    buckets,
    tasks,
    templates,
    templateDefinitions,
  };

  if (!isValidPlannerDataV2(scopedData)) {
    throw new Error('Project import could not extract a valid source-project closure.');
  }
  return scopedData;
};

const createUniqueImportedProjectName = (
  sourceName: string,
  currentProjects: readonly Project[],
): string => {
  const baseName = canonicalName(sourceName, 'Untitled project');
  const existingNames = new Set(
    currentProjects.map((project) => normalizeName(project.name, 'Untitled project')),
  );
  if (!existingNames.has(normalizeName(baseName, 'Untitled project'))) {
    return baseName;
  }

  const importedName = `${baseName} (imported)`;
  if (!existingNames.has(normalizeName(importedName, 'Untitled project'))) {
    return importedName;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const numberedName = `${baseName} (imported ${suffix})`;
    if (!existingNames.has(normalizeName(numberedName, 'Untitled project'))) {
      return numberedName;
    }
  }

  throw new Error('Project import could not create a unique project name.');
};

type TaskSemanticFingerprintFields = Pick<
  PlannerTaskV2,
  | 'title'
  | 'description'
  | 'completed'
  | 'pinned'
  | 'priority'
  | 'resourceTags'
  | 'archivedAt'
>;

const normalizeArchivedAtForFingerprint = (
  archivedAt: string | null,
): string | null => {
  if (archivedAt === null) return null;
  const parsed = new Date(archivedAt);
  return Number.isNaN(parsed.getTime())
    ? archivedAt.trim()
    : parsed.toISOString();
};

const taskSemanticFingerprint = (
  task: TaskSemanticFingerprintFields,
  bucketId: string | null,
): string => JSON.stringify([
  bucketId,
  normalizeName(task.title, 'Untitled task'),
  normalizeDescription(task.description),
  task.completed,
  task.pinned,
  task.priority,
  normalizeResourceTags([...task.resourceTags]),
  normalizeArchivedAtForFingerprint(task.archivedAt),
]);

const areTemplatesCompatible = (
  source: BucketTemplate,
  destination: BucketTemplate,
): boolean => (
  normalizeName(source.name, 'Untitled template')
    === normalizeName(destination.name, 'Untitled template')
  && canonicalDescription(source.description)
    === canonicalDescription(destination.description)
  && source.active === destination.active
);

const areTemplateDefinitionsCompatible = (
  source: BucketTemplateDefinition,
  destination: BucketTemplateDefinition,
): boolean => (
  normalizeName(source.name, 'Untitled definition')
    === normalizeName(destination.name, 'Untitled definition')
  && canonicalDescription(source.description)
    === canonicalDescription(destination.description)
  && source.priority === destination.priority
  && source.defaultActive === destination.defaultActive
  && source.position === destination.position
);

const areBucketsCompatibleForNameReuse = (
  source: BucketV2,
  destination: BucketV2,
  mappedDefinitionId: string | null,
): boolean => (
  normalizeName(source.name, 'Untitled bucket')
    === normalizeName(destination.name, 'Untitled bucket')
  && destination.templateDefinitionId === mappedDefinitionId
  && canonicalDescription(source.description)
    === canonicalDescription(destination.description)
  && source.priority === destination.priority
  && source.pinned === destination.pinned
);

const normalizePinnedOrder = <Item extends { pinned: boolean }>(
  items: readonly Item[],
): Item[] => [
  ...items.filter((item) => item.pinned),
  ...items.filter((item) => !item.pinned),
];

const normalizeDestinationProjectBucketOrder = (
  buckets: readonly BucketV2[],
  destinationProjectId: string,
): BucketV2[] => {
  const normalizedDestinationBuckets = normalizePinnedOrder(
    buckets.filter((bucket) => bucket.projectId === destinationProjectId),
  );
  let destinationBucketIndex = 0;

  return buckets.map((bucket) => {
    if (bucket.projectId !== destinationProjectId) return bucket;
    const normalizedBucket = normalizedDestinationBuckets[destinationBucketIndex];
    destinationBucketIndex += 1;
    return normalizedBucket;
  });
};

const createInitialSummary = (
  destination: PlannerProjectImportDestination,
): PlannerProjectImportSummary => ({
  projectCreatedCount: destination.kind === 'new' ? 1 : 0,
  projectMergedCount: destination.kind === 'existing' ? 1 : 0,
  dependencyCreatedCount: 0,
  dependencyReusedCount: 0,
  templateCreatedCount: 0,
  templateReusedCount: 0,
  templateAmbiguousMatchCount: 0,
  templateDefinitionCreatedCount: 0,
  templateDefinitionReusedCount: 0,
  templateDefinitionAmbiguousMatchCount: 0,
  bucketCreatedCount: 0,
  bucketReusedCount: 0,
  bucketAmbiguousMatchCount: 0,
  taskCreatedCount: 0,
  taskSkippedDuplicateCount: 0,
});

const recordAmbiguity = (
  ambiguities: PlannerProjectImportAmbiguity[],
  ambiguity: Omit<PlannerProjectImportAmbiguity, 'resolution'>,
): void => {
  ambiguities.push({
    ...ambiguity,
    candidateIds: [...ambiguity.candidateIds].sort((left, right) => {
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    }),
    resolution: 'created-new',
  });
};

const selectExistingDestination = (
  current: PlannerDataV2,
  destination: Extract<PlannerProjectImportDestination, { kind: 'existing' }>,
): Project => {
  const projectId = typeof destination.projectId === 'string'
    ? destination.projectId.trim()
    : '';
  if (!projectId) {
    throw new Error('Merge destination must be selected explicitly.');
  }

  const matches = current.projects.filter((project) => project.id === projectId);
  if (matches.length === 0) {
    throw new Error(`Merge destination project "${projectId}" was not found.`);
  }
  if (matches.length > 1) {
    throw new Error(`Merge destination project "${projectId}" is ambiguous.`);
  }
  return matches[0];
};

export const importPlannerProject = (
  current: PlannerDataV2,
  parsed: ParsedPlannerProjectImport,
  options: PlannerProjectImportOptions,
): PlannerProjectImportResult => {
  if (!isValidPlannerDataV2(current)) {
    throw new Error('Current planner data is invalid.');
  }
  if (!options || (options.destination?.kind !== 'new' && options.destination?.kind !== 'existing')) {
    throw new Error('Project import destination is invalid.');
  }

  const sourceData = extractPlannerProjectImportSource(parsed, options.sourceProjectId);
  const sourceProject = sourceData.projects[0];
  const importedAt = normalizeTimestamp(options.importedAt);
  const allocateId = createIdAllocator(current, sourceData, options.createUniqueId);
  const summary = createInitialSummary(options.destination);
  const ambiguities: PlannerProjectImportAmbiguity[] = [];

  const mergedProjects = [...current.projects];
  let destinationProject: Project;

  if (options.destination.kind === 'existing') {
    destinationProject = selectExistingDestination(current, options.destination);
  } else {
    destinationProject = {
      ...sourceProject,
      id: allocateId(),
      name: createUniqueImportedProjectName(sourceProject.name, current.projects),
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    mergedProjects.push(destinationProject);
  }

  const destinationTemplates = [...current.templates];
  const destinationTemplateDefinitions = [...current.templateDefinitions];
  const destinationBuckets = current.buckets.filter(
    (bucket) => bucket.projectId === destinationProject.id,
  );
  const destinationTasks = current.tasks.filter(
    (task) => task.projectId === destinationProject.id,
  );
  const consumedTemplateIds = new Set<string>();
  const consumedDefinitionIds = new Set<string>();
  const consumedBucketIds = new Set<string>();

  const mergedTemplates = [...current.templates];
  const templateIdMap = new Map<string, string>();

  for (const sourceTemplate of sourceData.templates) {
    const name = canonicalName(sourceTemplate.name, 'Untitled template');
    const normalizedName = normalizeName(name, 'Untitled template');
    const nameMatches = destinationTemplates.filter(
      (template) => normalizeName(template.name, 'Untitled template') === normalizedName,
    );
    const compatibleMatches = nameMatches.filter((template) => (
      areTemplatesCompatible(sourceTemplate, template)
    ));
    const reusableMatches = compatibleMatches.filter(
      (template) => !consumedTemplateIds.has(template.id),
    );

    if (compatibleMatches.length === 1 && reusableMatches.length === 1) {
      const reusableTemplate = reusableMatches[0];
      templateIdMap.set(sourceTemplate.id, reusableTemplate.id);
      consumedTemplateIds.add(reusableTemplate.id);
      summary.templateReusedCount += 1;
      continue;
    }

    if (nameMatches.length > 0) {
      const reportMatches = compatibleMatches.length > 0
        ? compatibleMatches
        : nameMatches;
      recordAmbiguity(ambiguities, {
        entity: 'template',
        sourceId: sourceTemplate.id,
        matchBy: 'normalized-name',
        normalizedName,
        candidateIds: reportMatches.map((template) => template.id),
      });
      summary.templateAmbiguousMatchCount += 1;
    }

    const createdTemplate: BucketTemplate = {
      ...sourceTemplate,
      id: allocateId(),
      name,
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    mergedTemplates.push(createdTemplate);
    templateIdMap.set(sourceTemplate.id, createdTemplate.id);
    summary.templateCreatedCount += 1;
  }

  const mergedTemplateDefinitions = [...current.templateDefinitions];
  const templateDefinitionIdMap = new Map<string, string>();

  for (const sourceDefinition of sourceData.templateDefinitions) {
    const mappedTemplateId = templateIdMap.get(sourceDefinition.templateId);
    if (!mappedTemplateId) {
      throw new Error(`Project import template mapping is missing for "${sourceDefinition.templateId}".`);
    }

    const name = canonicalName(sourceDefinition.name, 'Untitled definition');
    const normalizedName = normalizeName(name, 'Untitled definition');
    const nameMatches = destinationTemplateDefinitions.filter((definition) => (
      definition.templateId === mappedTemplateId
      && normalizeName(definition.name, 'Untitled definition') === normalizedName
    ));
    const compatibleMatches = nameMatches.filter((definition) => (
      areTemplateDefinitionsCompatible(sourceDefinition, definition)
    ));
    const reusableMatches = compatibleMatches.filter(
      (definition) => !consumedDefinitionIds.has(definition.id),
    );

    if (compatibleMatches.length === 1 && reusableMatches.length === 1) {
      const reusableDefinition = reusableMatches[0];
      templateDefinitionIdMap.set(sourceDefinition.id, reusableDefinition.id);
      consumedDefinitionIds.add(reusableDefinition.id);
      summary.templateDefinitionReusedCount += 1;
      continue;
    }

    if (nameMatches.length > 0) {
      const reportMatches = compatibleMatches.length > 0
        ? compatibleMatches
        : nameMatches;
      recordAmbiguity(ambiguities, {
        entity: 'template-definition',
        sourceId: sourceDefinition.id,
        matchBy: 'normalized-name',
        normalizedName,
        candidateIds: reportMatches.map((definition) => definition.id),
      });
      summary.templateDefinitionAmbiguousMatchCount += 1;
    }

    const createdDefinition: BucketTemplateDefinition = {
      ...sourceDefinition,
      id: allocateId(),
      templateId: mappedTemplateId,
      name,
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    mergedTemplateDefinitions.push(createdDefinition);
    templateDefinitionIdMap.set(sourceDefinition.id, createdDefinition.id);
    summary.templateDefinitionCreatedCount += 1;
  }

  const mergedBuckets = [...current.buckets];
  const bucketIdMap = new Map<string, string>();

  for (const sourceBucket of sourceData.buckets) {
    const mappedDefinitionId = sourceBucket.templateDefinitionId === null
      ? null
      : templateDefinitionIdMap.get(sourceBucket.templateDefinitionId);
    if (sourceBucket.templateDefinitionId !== null && !mappedDefinitionId) {
      throw new Error(
        `Project import template-definition mapping is missing for "${sourceBucket.templateDefinitionId}".`,
      );
    }

    if (mappedDefinitionId) {
      const definitionMatches = destinationBuckets.filter((bucket) => (
        bucket.templateDefinitionId === mappedDefinitionId
      ));
      const reusableDefinitionMatches = definitionMatches.filter(
        (bucket) => !consumedBucketIds.has(bucket.id),
      );
      if (
        definitionMatches.length === 1
        && reusableDefinitionMatches.length === 1
      ) {
        const reusableBucket = reusableDefinitionMatches[0];
        bucketIdMap.set(sourceBucket.id, reusableBucket.id);
        consumedBucketIds.add(reusableBucket.id);
        summary.bucketReusedCount += 1;
        continue;
      }
      if (definitionMatches.length > 0) {
        recordAmbiguity(ambiguities, {
          entity: 'bucket',
          sourceId: sourceBucket.id,
          matchBy: 'template-definition',
          normalizedName: normalizeName(sourceBucket.name, 'Untitled bucket'),
          candidateIds: definitionMatches.map((bucket) => bucket.id),
        });
        summary.bucketAmbiguousMatchCount += 1;
        if (definitionMatches.length > 1) {
          throw new Error(
            `Destination project has ambiguous buckets for template definition "${mappedDefinitionId}".`,
          );
        }
      }
    }

    const name = canonicalName(sourceBucket.name, 'Untitled bucket');
    const normalizedName = normalizeName(name, 'Untitled bucket');
    const nameMatches = destinationBuckets.filter((bucket) => (
      normalizeName(bucket.name, 'Untitled bucket') === normalizedName
    ));
    const compatibleNameMatches = nameMatches.filter((bucket) => (
      areBucketsCompatibleForNameReuse(
        sourceBucket,
        bucket,
        mappedDefinitionId ?? null,
      )
    ));
    const reusableNameMatches = compatibleNameMatches.filter(
      (bucket) => !consumedBucketIds.has(bucket.id),
    );

    if (compatibleNameMatches.length === 1 && reusableNameMatches.length === 1) {
      const reusableBucket = reusableNameMatches[0];
      bucketIdMap.set(sourceBucket.id, reusableBucket.id);
      consumedBucketIds.add(reusableBucket.id);
      summary.bucketReusedCount += 1;
      continue;
    }

    if (nameMatches.length > 0) {
      const reportMatches = compatibleNameMatches.length > 0
        ? compatibleNameMatches
        : nameMatches;
      const hasTemplateDefinitionConflict = (
        compatibleNameMatches.length === 0
        && reportMatches.some((bucket) => (
          bucket.templateDefinitionId !== (mappedDefinitionId ?? null)
        ))
      );
      recordAmbiguity(ambiguities, {
        entity: 'bucket',
        sourceId: sourceBucket.id,
        matchBy: hasTemplateDefinitionConflict
          ? 'template-definition-conflict'
          : 'normalized-name',
        normalizedName,
        candidateIds: reportMatches.map((bucket) => bucket.id),
      });
      summary.bucketAmbiguousMatchCount += 1;
    }

    const createdBucket: BucketV2 = {
      ...sourceBucket,
      id: allocateId(),
      projectId: destinationProject.id,
      name,
      templateDefinitionId: mappedDefinitionId ?? null,
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    mergedBuckets.push(createdBucket);
    bucketIdMap.set(sourceBucket.id, createdBucket.id);
    summary.bucketCreatedCount += 1;
  }

  const mergedTasks = [...current.tasks];
  const destinationTaskFingerprints = new Set(
    destinationTasks.map((task) => (
      taskSemanticFingerprint(task, task.bucketId)
    )),
  );
  const sourceTaskFingerprints = new Set<string>();
  const uploadedTaskIds: string[] = [];

  for (const sourceTask of sourceData.tasks) {
    const mappedBucketId = sourceTask.bucketId === null
      ? null
      : bucketIdMap.get(sourceTask.bucketId);
    if (sourceTask.bucketId !== null && !mappedBucketId) {
      throw new Error(`Project import bucket mapping is missing for "${sourceTask.bucketId}".`);
    }

    const title = canonicalName(sourceTask.title, 'Untitled task');
    const description = sourceTask.description.trim();
    const duplicateFingerprint = taskSemanticFingerprint(
      {
        ...sourceTask,
        title,
        description,
      },
      mappedBucketId ?? null,
    );
    if (
      destinationTaskFingerprints.has(duplicateFingerprint)
      || sourceTaskFingerprints.has(duplicateFingerprint)
    ) {
      summary.taskSkippedDuplicateCount += 1;
      continue;
    }

    const createdTask: PlannerTaskV2 = {
      ...sourceTask,
      id: allocateId(),
      projectId: destinationProject.id,
      bucketId: mappedBucketId ?? null,
      title,
      description,
      resourceTags: [...sourceTask.resourceTags],
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    mergedTasks.push(createdTask);
    uploadedTaskIds.push(createdTask.id);
    sourceTaskFingerprints.add(duplicateFingerprint);
    summary.taskCreatedCount += 1;
  }

  summary.dependencyCreatedCount = (
    summary.templateCreatedCount + summary.templateDefinitionCreatedCount
  );
  summary.dependencyReusedCount = (
    summary.templateReusedCount + summary.templateDefinitionReusedCount
  );

  const data: PlannerDataV2 = {
    version: PLANNER_DATA_V2_VERSION,
    projects: normalizePinnedOrder(mergedProjects),
    buckets: normalizeDestinationProjectBucketOrder(
      mergedBuckets,
      destinationProject.id,
    ),
    tasks: mergedTasks,
    templates: mergedTemplates,
    templateDefinitions: mergedTemplateDefinitions,
  };

  if (!isValidPlannerDataV2(data)) {
    throw new Error('Project import produced invalid planner data.');
  }

  return {
    data,
    activationProjectId: destinationProject.id,
    sourceProjectId: sourceProject.id,
    sourceProjectName: sourceProject.name,
    uploadedTaskIds,
    summary,
    ambiguities,
  };
};
