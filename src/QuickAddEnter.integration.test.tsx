import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import type { PlannerDataV2 } from './types/v2';

const V2_STORAGE_KEY = 'planner-buckets:data:v2';
const timestamp = '2026-07-29T00:00:00.000Z';

const fixture: PlannerDataV2 = {
  version: 2,
  projects: [
    {
      id: 'project-main',
      name: 'Main',
      description: '',
      priority: 0,
      pinned: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  buckets: [
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
  ],
  tasks: [],
  templates: [],
  templateDefinitions: [],
};

const seed = () => {
  localStorage.clear();
  localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(fixture));
};

const readPlanner = (): PlannerDataV2 => (
  JSON.parse(localStorage.getItem(V2_STORAGE_KEY) ?? '{}') as PlannerDataV2
);

describe('Quick Add Enter integration', () => {
  beforeEach(() => {
    seed();
  });

  it('adds a task to Unassigned/current project when Enter is pressed in Task title', async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText('Task title');
    await user.type(taskInput, 'test');
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'test' })).toBeInTheDocument();
    expect(taskInput).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('Main');
    expect(screen.getByRole('combobox', { name: 'Bucket' })).toHaveValue('');

    await waitFor(() => {
      const task = readPlanner().tasks.find((candidate) => candidate.title === 'test');
      expect(task).toMatchObject({
        projectId: 'project-main',
        bucketId: null,
        title: 'test',
      });
    });
  });

  it('uses Tab for traversal without submitting', async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText('Task title');
    await user.type(taskInput, 'tab-only');
    await user.tab();

    expect(screen.getByRole('combobox', { name: 'Bucket' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'tab-only' })).not.toBeInTheDocument();
    expect(readPlanner().tasks).toHaveLength(0);
  });

  it('submits immediately from a highlighted Bucket suggestion using the accepted bucket', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Task title'), 'bucketed');
    const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
    await user.type(bucketInput, 'Re');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByRole('button', { name: 'bucketed' })).toBeInTheDocument();
    await waitFor(() => {
      const task = readPlanner().tasks.find((candidate) => candidate.title === 'bucketed');
      expect(task).toMatchObject({
        projectId: 'project-main',
        bucketId: 'bucket-ready',
      });
    });
  });
});
