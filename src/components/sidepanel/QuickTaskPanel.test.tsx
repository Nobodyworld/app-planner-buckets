import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickTaskPanel } from './QuickTaskPanel';
import type { BucketV2, Project } from '../../types/v2';

const timestamp = '2026-07-29T00:00:00.000Z';

const projects: Project[] = [
  {
    id: 'project-main',
    name: 'Main',
    description: '',
    priority: 0,
    pinned: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const buckets: BucketV2[] = [
  {
    id: 'bucket-ready',
    projectId: 'project-main',
    name: 'Ready',
    description: '',
    templateDefinitionId: null,
    priority: 0,
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const renderPanel = (overrides: Partial<Parameters<typeof QuickTaskPanel>[0]> = {}) => {
  const onSubmit = vi.fn();
  render(
    <QuickTaskPanel
      shellRef={createRef<HTMLDivElement>()}
      taskInputRef={createRef<HTMLInputElement>()}
      projectInputRef={createRef<HTMLInputElement>()}
      bucketInputRef={createRef<HTMLInputElement>()}
      title=""
      projectName="Main"
      selectedProjectId="project-main"
      bucketName=""
      selectedBucketId={null}
      projects={projects}
      projectBuckets={buckets}
      message={null}
      onTitleChange={() => undefined}
      onProjectNameChange={() => undefined}
      onProjectSelectionChange={() => undefined}
      onBucketNameChange={() => undefined}
      onBucketSelectionChange={() => undefined}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit };
};

describe('QuickTaskPanel keyboard contract', () => {
  it('submits from Task title on Enter instead of moving to Bucket', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel({ title: 'test' });

    const taskInput = screen.getByLabelText('Task title');
    await user.click(taskInput);
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith();
    expect(screen.getByRole('combobox', { name: 'Bucket' })).not.toHaveFocus();
  });

  it('uses Tab for Task title to Bucket traversal without submitting', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel({ title: 'test' });

    await user.click(screen.getByLabelText('Task title'));
    await user.tab();

    expect(screen.getByRole('combobox', { name: 'Bucket' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits from Bucket Enter and passes the accepted bucket synchronously', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel({ title: 'test', bucketName: 'Re' });

    const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
    await user.click(bucketInput);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      bucketName: 'Ready',
      selectedBucketId: 'bucket-ready',
    });
  });

  it('uses Tab to accept a bucket suggestion and advance without submitting', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel({ bucketName: 'Re' });

    const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
    await user.click(bucketInput);
    await user.tab();

    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits from Project Enter with the accepted project and leaves Tab as traversal', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel({ projectName: 'Ma' });

    const projectInput = screen.getByRole('combobox', { name: 'Project' });
    await user.click(projectInput);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      projectName: 'Main',
      selectedProjectId: 'project-main',
    });
  });
});
