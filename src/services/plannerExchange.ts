import type {
  BucketV2,
  PlannerDataV2,
  PlannerTaskV2,
  Project,
} from '../types/v2';

export interface StructuredBucketCopyTask {
  title: string;
  description: string;
  completed: boolean;
  pinned: boolean;
}

export interface StructuredBucketCopyDocument {
  bucket: {
    name: string;
    pinned: boolean;
  };
  tasks: StructuredBucketCopyTask[];
}

export interface BucketCopyTarget {
  projectId: string;
  bucketId: string | null;
}

const stablePinnedFirst = <Item extends { pinned: boolean }>(items: Item[]): Item[] => [
  ...items.filter((item) => item.pinned),
  ...items.filter((item) => !item.pinned),
];

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

const normalizeMultilineText = (value: string): string => (
  value.replace(/\r\n?/g, '\n').trim()
);

const formatTaskMarkdown = (task: PlannerTaskV2, index: number): string => {
  const title = task.title.trim() || 'Untitled task';
  const lines = [`${index + 1}. ${task.completed ? '[x]' : '[ ]'} ${title}`];
  const descriptionLines = normalizeMultilineText(task.description)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  descriptionLines.forEach((line) => lines.push(`   Note: ${line}`));
  return lines.join('\n');
};

const formatTaskSection = (tasks: PlannerTaskV2[]): string => {
  if (tasks.length === 0) return '_No active tasks._';
  return stablePinnedFirst(tasks).map(formatTaskMarkdown).join('\n');
};

export const formatProjectMarkdownForCopy = (
  data: PlannerDataV2,
  projectId: string,
): string => {
  const project = findUniqueProject(data, projectId);
  const projectBuckets = stablePinnedFirst(
    data.buckets.filter((bucket) => bucket.projectId === project.id),
  );
  const activeProjectTasks = data.tasks.filter((task) => (
    task.projectId === project.id && task.archivedAt === null
  ));
  const sections = [`# ${project.name.trim() || 'Untitled project'}`];
  const description = normalizeMultilineText(project.description);

  if (description) sections.push(description);

  projectBuckets.forEach((bucket) => {
    const bucketTasks = activeProjectTasks.filter((task) => task.bucketId === bucket.id);
    sections.push(
      `## Bucket: ${bucket.name.trim() || 'Untitled bucket'}\n\n${formatTaskSection(bucketTasks)}`,
    );
  });

  const unassignedTasks = activeProjectTasks.filter((task) => task.bucketId === null);
  sections.push(`## Unassigned\n\n${formatTaskSection(unassignedTasks)}`);

  return sections.join('\n\n');
};

export const buildStructuredBucketCopyDocument = (
  data: PlannerDataV2,
  target: BucketCopyTarget,
): StructuredBucketCopyDocument => {
  findUniqueProject(data, target.projectId);
  const bucket = target.bucketId === null
    ? null
    : findUniqueBucket(data, target.projectId, target.bucketId);
  const tasks = stablePinnedFirst(
    data.tasks.filter((task) => (
      task.projectId === target.projectId
      && task.bucketId === target.bucketId
      && task.archivedAt === null
    )),
  );

  return {
    bucket: {
      name: bucket
        ? (bucket.name.trim() || 'Untitled bucket')
        : 'Unassigned',
      pinned: bucket?.pinned ?? false,
    },
    tasks: tasks.map((task) => ({
      title: task.title.trim(),
      description: task.description.trim(),
      completed: task.completed,
      pinned: task.pinned,
    })),
  };
};

export const formatStructuredBucketCopyJson = (
  data: PlannerDataV2,
  target: BucketCopyTarget,
): string => JSON.stringify(buildStructuredBucketCopyDocument(data, target), null, 2);
