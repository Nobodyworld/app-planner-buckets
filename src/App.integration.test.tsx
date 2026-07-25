import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { PlannerData } from './types';
import type { PlannerDataV2 } from './types/v2';
import { PLANNER_DATA_V2_VERSION } from './types/v2';
import { isValidPlannerDataV2 } from './types/validators';

const V1_STORAGE_KEY = 'planner-buckets:data:v1';
const V2_STORAGE_KEY = 'planner-buckets:data:v2';
const V2_RECOVERY_KEY = 'planner-buckets:data:v2:recovery';

const plannerFixture: PlannerData = {
    version: 1,
    buckets: [
        {
            id: 'bucket-todo',
            name: 'To Do',
            createdAt: '2026-01-01T00:00:00.000Z',
            pinned: true,
        },
    ],
    tasks: [
        {
            id: 'task-1',
            title: 'Write launch summary',
            description: 'Include blockers',
            bucketId: 'bucket-todo',
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ],
};

const plannerV2Fixture: PlannerDataV2 = {
    version: PLANNER_DATA_V2_VERSION,
    projects: [
        {
            id: 'project-a',
            name: 'Alpha',
            description: 'Alpha notes',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'project-b',
            name: 'Beta',
            description: '',
            priority: 0,
            pinned: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
    ],
    buckets: [
        {
            id: 'bucket-alpha',
            projectId: 'project-a',
            name: 'Alpha Bucket',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'bucket-beta',
            projectId: 'project-b',
            name: 'Beta Bucket',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
    ],
    tasks: [
        {
            id: 'task-alpha',
            projectId: 'project-a',
            title: 'Alpha task',
            description: '',
            bucketId: 'bucket-alpha',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'task-beta',
            projectId: 'project-b',
            title: 'Beta task',
            description: '',
            bucketId: 'bucket-beta',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'task-alpha-unassigned',
            projectId: 'project-a',
            title: 'Alpha unassigned',
            description: '',
            bucketId: null,
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ],
    templates: [],
    templateDefinitions: [],
};

const plannerV2TemplateFixture: PlannerDataV2 = {
    ...plannerV2Fixture,
    templates: [
        {
            id: 'template-launch',
            name: 'Launch Template',
            description: '',
            active: true,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
    templateDefinitions: [
        {
            id: 'definition-ready',
            templateId: 'template-launch',
            name: 'Ready',
            description: 'Ready work',
            priority: 0,
            defaultActive: true,
            position: 0,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
        {
            id: 'definition-done',
            templateId: 'template-launch',
            name: 'Done',
            description: 'Done work',
            priority: 0,
            defaultActive: true,
            position: 1,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
};

const plannerV2PartialTemplateFixture: PlannerDataV2 = {
    ...plannerV2TemplateFixture,
    buckets: [
        ...plannerV2TemplateFixture.buckets,
        {
            id: 'bucket-ready-existing',
            projectId: 'project-b',
            name: 'Ready',
            description: 'Ready work',
            templateDefinitionId: 'definition-ready',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-04T00:00:00.000Z',
            updatedAt: '2026-01-04T00:00:00.000Z',
        },
    ],
};

const plannerV2ScopedExportFixture: PlannerDataV2 = {
    version: PLANNER_DATA_V2_VERSION,
    projects: [
        {
            id: 'project-a',
            name: 'Alpha',
            description: 'Alpha board',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'project-b',
            name: 'Beta',
            description: 'Beta board',
            priority: 0,
            pinned: true,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'project-c',
            name: 'Gamma',
            description: 'Gamma board',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
    buckets: [
        {
            id: 'bucket-alpha-backlog',
            projectId: 'project-a',
            name: 'Alpha Backlog',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
            id: 'bucket-beta-ready-linked',
            projectId: 'project-b',
            name: 'Beta Ready Lane',
            description: 'Derived from template',
            templateDefinitionId: 'definition-launch-ready',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'bucket-beta-manual',
            projectId: 'project-b',
            name: 'Beta Manual',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'bucket-gamma-support',
            projectId: 'project-c',
            name: 'Gamma Support',
            description: '',
            templateDefinitionId: 'definition-support-triage',
            priority: 0,
            pinned: false,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
    tasks: [
        {
            id: 'task-beta-ready-1',
            projectId: 'project-b',
            title: 'Validate release checklist',
            description: '',
            bucketId: 'bucket-beta-ready-linked',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'task-beta-ready-2',
            projectId: 'project-b',
            title: 'Prepare rollout owner',
            description: '',
            bucketId: 'bucket-beta-ready-linked',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'task-beta-manual',
            projectId: 'project-b',
            title: 'Manual bucket task',
            description: '',
            bucketId: 'bucket-beta-manual',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
            id: 'task-gamma-support',
            projectId: 'project-c',
            title: 'Gamma support task',
            description: '',
            bucketId: 'bucket-gamma-support',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
    templates: [
        {
            id: 'template-launch',
            name: 'Launch Template',
            description: '',
            active: true,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
        {
            id: 'template-support',
            name: 'Support Template',
            description: '',
            active: true,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
    templateDefinitions: [
        {
            id: 'definition-launch-ready',
            templateId: 'template-launch',
            name: 'Launch Ready',
            description: 'Ready for launch',
            priority: 0,
            defaultActive: true,
            position: 0,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
        {
            id: 'definition-launch-done',
            templateId: 'template-launch',
            name: 'Launch Done',
            description: 'Completed launch work',
            priority: 0,
            defaultActive: true,
            position: 1,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
        {
            id: 'definition-support-triage',
            templateId: 'template-support',
            name: 'Support Triage',
            description: 'Support queue',
            priority: 0,
            defaultActive: true,
            position: 0,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
};

const plannerV2ZeroEligibleTemplateFixture: PlannerDataV2 = {
    ...plannerV2TemplateFixture,
    templateDefinitions: plannerV2TemplateFixture.templateDefinitions.map((definition) => ({
        ...definition,
        defaultActive: false,
    })),
};

const seedPlannerData = (data: PlannerData = plannerFixture) => {
    localStorage.setItem(V1_STORAGE_KEY, JSON.stringify(data));
};

const seedPlannerDataV2 = (data: PlannerDataV2 = plannerV2Fixture) => {
    localStorage.setItem(V2_STORAGE_KEY, JSON.stringify(data));
};

const readRuntimePlannerData = (): PlannerDataV2 => (
    JSON.parse(localStorage.getItem(V2_STORAGE_KEY) ?? '{}') as PlannerDataV2
);

const createDragDataTransfer = (): DataTransfer => {
    const values = new Map<string, string>();
    return {
        dropEffect: 'none',
        effectAllowed: 'all',
        files: [] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: [],
        clearData: vi.fn((type?: string) => {
            if (type) {
                values.delete(type);
                return;
            }
            values.clear();
        }),
        getData: vi.fn((type: string) => values.get(type) ?? ''),
        setData: vi.fn((type: string, value: string) => {
            values.set(type, value);
        }),
        setDragImage: vi.fn(),
    } as unknown as DataTransfer;
};

const mockBoardFrameGeometry = (frame: HTMLElement) => {
    Object.defineProperty(frame, 'clientWidth', { value: 520, configurable: true });
    Object.defineProperty(frame, 'scrollWidth', { value: 2200, configurable: true });
    Object.defineProperty(frame, 'scrollLeft', { value: 0, writable: true, configurable: true });
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
        x: 80,
        y: 120,
        left: 80,
        top: 120,
        right: 600,
        bottom: 620,
        width: 520,
        height: 500,
        toJSON: () => ({}),
    });
};

const fireBoardDragOver = (target: HTMLElement, clientX: number, dataTransfer: DataTransfer) => {
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    fireEvent(target, event);
};

const fireBoardDrop = (target: HTMLElement, clientX: number, dataTransfer: DataTransfer) => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    fireEvent(target, event);
};

const mockBucketColumnGeometry = (column: HTMLElement) => {
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
        x: 100,
        y: 120,
        left: 100,
        top: 120,
        right: 300,
        bottom: 620,
        width: 200,
        height: 500,
        toJSON: () => ({}),
    });
};

const readRenderedBucketOrder = (container: HTMLElement) => (
    Array.from(container.querySelectorAll('.bucket-drag-handle')).map((handle) => (
        handle.closest('.bucket-column')?.querySelector('h2')?.textContent
    ))
);

const setupAnimationFrameQueue = () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        callbacks.push(callback);
        return callbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    return callbacks;
};

const overflowingBoardFixture: PlannerDataV2 = {
    ...plannerV2Fixture,
    projects: [
        {
            id: 'project-overflow',
            name: 'Overflow',
            description: '',
            priority: 0,
            pinned: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ],
    buckets: Array.from({ length: 9 }, (_, index) => ({
        id: `bucket-overflow-${index + 1}`,
        projectId: 'project-overflow',
        name: `Bucket ${index + 1}`,
        description: '',
        templateDefinitionId: null,
        priority: 0,
        pinned: false,
        createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        updatedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    })),
    tasks: [
        {
            id: 'task-overflow-1',
            projectId: 'project-overflow',
            title: 'Overflow task',
            description: '',
            bucketId: 'bucket-overflow-1',
            priority: 0,
            resourceTags: [],
            pinned: false,
            completed: false,
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    ],
    templates: [],
    templateDefinitions: [],
};

describe('App integration', () => {
    beforeEach(() => {
        localStorage.clear();
        seedPlannerData();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('auto-opens the sidepanel when hovering the toggle while unlocked', () => {
        vi.useFakeTimers();
        const { container } = render(<App />);

        const toggleGroup = container.querySelector('.sidepanel-toggle-group');
        expect(toggleGroup).toHaveAttribute('data-expanded', 'false');

        const toggleButton = screen.getByRole('button', { name: 'Open planner controls' });
        fireEvent.mouseEnter(toggleButton);

        act(() => {
            vi.advanceTimersByTime(130);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');
    });

    it('does not auto-open the sidepanel when auto-open lock is enabled', () => {
        vi.useFakeTimers();
        const { container } = render(<App />);

        const toggleGroup = container.querySelector('.sidepanel-toggle-group');
        const lockButton = screen.getByRole('button', { name: 'Disable automatic controls opening' });

        fireEvent.click(lockButton);

        expect(toggleGroup).toHaveAttribute('data-auto-open-locked', 'true');
        expect(toggleGroup).toHaveAttribute('data-expanded', 'false');

        const toggleButton = screen.getByRole('button', { name: 'Open planner controls' });
        fireEvent.mouseEnter(toggleButton);

        act(() => {
            vi.advanceTimersByTime(130);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'false');
    });

    it('keeps an open sidepanel open after locking it', () => {
        vi.useFakeTimers();
        const { container } = render(<App />);

        const toggleGroup = container.querySelector('.sidepanel-toggle-group');
        const toggleButton = screen.getByRole('button', { name: 'Open planner controls' });

        fireEvent.mouseEnter(toggleButton);

        act(() => {
            vi.advanceTimersByTime(130);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');

        const lockButton = screen.getByRole('button', { name: 'Disable automatic controls opening' });
        fireEvent.click(lockButton);

        expect(toggleGroup).toHaveAttribute('data-auto-open-locked', 'true');
        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');

        act(() => {
            vi.advanceTimersByTime(250);
        });

        expect(toggleGroup).toHaveAttribute('data-expanded', 'true');
    });

    it('copies a single task with bucket metadata', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);


        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(1);
        });

        expect(writeText).toHaveBeenCalledWith('[ ] Write launch summary\nBucket: To Do\nNote: Include blockers');
    });

    it('shows failure without a false success status when clipboard writing rejects', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        Object.defineProperty(document, 'execCommand', {
            value: vi.fn(() => false),
            configurable: true,
        });

        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        await waitFor(() => {
            expect(screen.getByText(/Could not copy task/)).toBeInTheDocument();
        });
        expect(screen.queryByText(/Copied "Write launch summary"/)).not.toBeInTheDocument();
    });

    it('copies a bucket name with its ordered task checklist', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy all tasks in To Do' }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(1);
        });

        expect(writeText).toHaveBeenCalledWith('Bucket: To Do\n1. [ ] Write launch summary\n   Note: Include blockers');
    });

    it('pastes copied tasks into another bucket', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy all tasks in To Do' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.tasks.length).toBe(2);
        });

        const saved = readRuntimePlannerData();
        const pastedTask = saved.tasks.find((task) => task.id !== 'task-1');
        expect(pastedTask?.title).toBe('Write launch summary');
        expect(pastedTask?.bucketId).toBeNull();
    });

    it('supports undo and redo keyboard shortcuts for planner actions', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));
        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Undo target task' },
        });
        fireEvent.keyDown(screen.getByLabelText('Quick add task title'), { key: 'Enter' });

        expect(screen.getByRole('button', { name: 'Undo target task' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'Undo target task' })).not.toBeInTheDocument();
        });

        fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Undo target task' })).toBeInTheDocument();
        });
    });

    it('creates a new bucket and task together from quick add', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Draft release notes' },
        });
        fireEvent.change(screen.getByLabelText('Quick add bucket name'), {
            target: { value: 'Release Prep' },
        });

        fireEvent.keyDown(screen.getByLabelText('Quick add bucket name'), { key: 'Enter' });

        expect(screen.getByRole('heading', { name: 'Release Prep' })).toBeInTheDocument();

        const saved = readRuntimePlannerData();
        const createdBucket = saved.buckets.find((bucket) => bucket.name === 'Release Prep');
        const createdTask = saved.tasks.find((task) => task.title === 'Draft release notes');

        expect(createdBucket).toBeTruthy();
        expect(createdTask?.bucketId).toBe(createdBucket?.id);
    });

    it('falls back to Unassigned when quick-add bucket text is invalid', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Follow up with vendor' },
        });
        fireEvent.change(screen.getByLabelText('Quick add bucket name'), {
            target: { value: '@@@' },
        });

        fireEvent.keyDown(screen.getByLabelText('Quick add bucket name'), { key: 'Enter' });

        const saved = readRuntimePlannerData();
        const createdTask = saved.tasks.find((task) => task.title === 'Follow up with vendor');

        expect(createdTask?.bucketId).toBeNull();
        expect(saved.buckets.some((bucket) => bucket.name === '@@@')).toBe(false);
    });

    it('accepts bucket autocomplete with ArrowRight and submits to that bucket', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Quick add task title'), {
            target: { value: 'Call supplier' },
        });

        const bucketInput = screen.getByLabelText('Quick add bucket name');
        fireEvent.change(bucketInput, {
            target: { value: 'To' },
        });
        fireEvent.keyDown(bucketInput, { key: 'ArrowRight' });

        expect((bucketInput as HTMLInputElement).value).toBe('To Do');

        fireEvent.keyDown(bucketInput, { key: 'Enter' });

        const saved = readRuntimePlannerData();
        const createdTask = saved.tasks.find((task) => task.title === 'Call supplier');
        expect(createdTask?.bucketId).toBe('bucket-todo');
    });

    it('shows ghost autocomplete suffix in quick bucket input while typing', () => {
        const { container } = render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const bucketInput = screen.getByLabelText('Quick add bucket name');
        fireEvent.change(bucketInput, {
            target: { value: 'To' },
        });

        const ghostSuffix = container.querySelector('.quick-task-bucket-ghost-suffix');
        expect(ghostSuffix).toBeTruthy();
        expect(ghostSuffix?.textContent).toBe(' Do');
    });

    it('keeps board inline task input open after submitting tasks', () => {
        render(<App />);

        fireEvent.click(screen.getAllByRole('button', { name: '+ Add task' })[0]);

        const input = screen.getByLabelText('Add task in Unassigned');
        fireEvent.change(input, { target: { value: 'Inline board task' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByLabelText('Add task in Unassigned')).toBeInTheDocument();
        expect((screen.getByLabelText('Add task in Unassigned') as HTMLInputElement).value).toBe('');

        const saved = readRuntimePlannerData();
        const createdTask = saved.tasks.find((task) => task.title === 'Inline board task');
        expect(createdTask?.bucketId).toBeNull();
    });

    it('creates a bucket from board inline add bucket entry', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: '+ Add bucket' }));

        const input = screen.getByLabelText('Add bucket in board');
        fireEvent.change(input, { target: { value: 'Board Added Bucket' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByRole('heading', { name: 'Board Added Bucket' })).toBeInTheDocument();
    });

    it('horizontally autoscrolls the board when dragging a task near the right edge', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const animationFrameCallbacks = setupAnimationFrameQueue();
        const { container } = render(<App />);

        const frame = container.querySelector('.board-frame') as HTMLElement;
        mockBoardFrameGeometry(frame);

        const taskCard = screen.getByRole('button', { name: 'Overflow task' }).closest('.task-card') as HTMLElement;
        const dataTransfer = createDragDataTransfer();

        const taskDragHandle = taskCard.querySelector('.drag-handle') as HTMLElement;
        fireEvent.dragStart(taskDragHandle, { dataTransfer });
        await waitFor(() => expect(taskCard).toHaveClass('is-dragging'));
        fireBoardDragOver(frame, 592, dataTransfer);

        await waitFor(() => expect(animationFrameCallbacks.length).toBeGreaterThan(0));
        act(() => {
            animationFrameCallbacks.shift()?.(16);
        });

        expect(frame.scrollLeft).toBeGreaterThan(0);

        fireEvent.dragEnd(taskCard);
    });

    it('horizontally autoscrolls the board when dragging a bucket near the right edge', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const animationFrameCallbacks = setupAnimationFrameQueue();
        const { container } = render(<App />);

        const frame = container.querySelector('.board-frame') as HTMLElement;
        mockBoardFrameGeometry(frame);

        const bucketDragHandle = screen.getAllByRole('img', { name: 'Drag to move bucket' })[0];
        const dataTransfer = createDragDataTransfer();

        fireEvent.dragStart(bucketDragHandle, { dataTransfer });
        await waitFor(() => expect(container.querySelector('.bucket-drop-slot.visible')).not.toBeNull());
        expect(bucketDragHandle.closest('.bucket-column')).toHaveClass('bucket-drag-source');
        fireBoardDragOver(frame, 592, dataTransfer);

        await waitFor(() => expect(animationFrameCallbacks.length).toBeGreaterThan(0));
        expect(container.querySelector('.bucket-drop-slot.active')).not.toBeNull();

        act(() => {
            animationFrameCallbacks.shift()?.(16);
        });

        expect(frame.scrollLeft).toBeGreaterThan(0);

        fireEvent.dragEnd(bucketDragHandle);
        await waitFor(() => expect(container.querySelector('.bucket-drop-slot.visible')).toBeNull());
        expect(bucketDragHandle.closest('.bucket-column')).not.toHaveClass('bucket-drag-source');
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
    });

    it('keeps a later bucket wired through visible, active, and settled zero-footprint drop slots', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);

        const bucketHandles = screen.getAllByRole('img', { name: 'Drag to move bucket' });
        const laterBucketHandle = bucketHandles[8];
        const sourceColumn = laterBucketHandle.closest('.bucket-column') as HTMLElement;
        const beforeOrder = Array.from(container.querySelectorAll('.bucket-column h2')).map((heading) => heading.textContent);
        const dataTransfer = createDragDataTransfer();

        fireEvent.dragStart(laterBucketHandle, { dataTransfer });

        await waitFor(() => expect(sourceColumn).toHaveClass('bucket-drag-source'));
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'bucket-overflow-9');
        expect(dataTransfer.effectAllowed).toBe('move');

        const slots = Array.from(container.querySelectorAll('.bucket-drop-slot')) as HTMLElement[];
        const wrappers = Array.from(container.querySelectorAll('.bucket-drop-slot-wrapper')) as HTMLElement[];
        expect(wrappers).toHaveLength(slots.length);
        expect(slots).toHaveLength(10);
        expect(slots.every((slot) => slot.classList.contains('visible'))).toBe(true);
        expect(Array.from(container.querySelectorAll('.bucket-column h2')).map((heading) => heading.textContent)).toEqual(beforeOrder);

        fireEvent.dragOver(slots[2], { dataTransfer });
        await waitFor(() => expect(slots[2]).toHaveClass('active'));
        expect(sourceColumn).toHaveClass('bucket-drag-source');
        expect(Array.from(container.querySelectorAll('.bucket-column h2')).map((heading) => heading.textContent)).toEqual(beforeOrder);

        fireEvent.drop(slots[2], { dataTransfer });
        await waitFor(() => expect(container.querySelector('.bucket-drop-slot.settled')).not.toBeNull());
        expect(wrappers.every((wrapper) => wrapper.className === 'bucket-drop-slot-wrapper')).toBe(true);
    });

    it('moves bucket 1 after bucket 9 when the pointer crosses bucket 9 midpoint', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);
        const bucketHandles = screen.getAllByRole('img', { name: 'Drag to move bucket' });
        const sourceHandle = bucketHandles[0];
        const targetColumn = bucketHandles[8].closest('.bucket-column') as HTMLElement;
        const dataTransfer = createDragDataTransfer();
        mockBucketColumnGeometry(targetColumn);

        fireEvent.dragStart(sourceHandle, { dataTransfer });
        await waitFor(() => expect(sourceHandle.closest('.bucket-column')).toHaveClass('bucket-drag-source'));

        const slots = Array.from(container.querySelectorAll('.bucket-drop-slot')) as HTMLElement[];
        fireBoardDragOver(targetColumn, 199, dataTransfer);
        await waitFor(() => expect(slots[8]).toHaveClass('active'));

        fireBoardDragOver(targetColumn, 201, dataTransfer);
        await waitFor(() => {
            expect(slots[8]).not.toHaveClass('active');
            expect(slots[9]).toHaveClass('active');
        });

        fireBoardDrop(targetColumn, 201, dataTransfer);
        await waitFor(() => {
            expect(readRenderedBucketOrder(container)).toEqual([
                'Bucket 2',
                'Bucket 3',
                'Bucket 4',
                'Bucket 5',
                'Bucket 6',
                'Bucket 7',
                'Bucket 8',
                'Bucket 9',
                'Bucket 1',
            ]);
        });
    });

    it('moves bucket 9 before bucket 2 using bucket 2 left-half target', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);
        const bucketHandles = screen.getAllByRole('img', { name: 'Drag to move bucket' });
        const sourceHandle = bucketHandles[8];
        const targetColumn = bucketHandles[1].closest('.bucket-column') as HTMLElement;
        const dataTransfer = createDragDataTransfer();
        mockBucketColumnGeometry(targetColumn);

        fireEvent.dragStart(sourceHandle, { dataTransfer });
        await waitFor(() => expect(sourceHandle.closest('.bucket-column')).toHaveClass('bucket-drag-source'));
        fireBoardDragOver(targetColumn, 101, dataTransfer);
        const slots = Array.from(container.querySelectorAll('.bucket-drop-slot')) as HTMLElement[];
        await waitFor(() => expect(slots[1]).toHaveClass('active'));

        fireBoardDrop(targetColumn, 101, dataTransfer);
        await waitFor(() => {
            expect(readRenderedBucketOrder(container)).toEqual([
                'Bucket 1',
                'Bucket 9',
                'Bucket 2',
                'Bucket 3',
                'Bucket 4',
                'Bucket 5',
                'Bucket 6',
                'Bucket 7',
                'Bucket 8',
            ]);
        });
    });

    it.each([
        ['near', 3],
        ['far', 0],
    ])('uses the same bucket 5 left-half boundary for a %s source', async (_distance, sourceIndex) => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);
        const bucketHandles = screen.getAllByRole('img', { name: 'Drag to move bucket' });
        const sourceHandle = bucketHandles[sourceIndex];
        const targetColumn = bucketHandles[4].closest('.bucket-column') as HTMLElement;
        const dataTransfer = createDragDataTransfer();
        mockBucketColumnGeometry(targetColumn);

        fireEvent.dragStart(sourceHandle, { dataTransfer });
        await waitFor(() => expect(sourceHandle.closest('.bucket-column')).toHaveClass('bucket-drag-source'));
        fireBoardDragOver(targetColumn, 101, dataTransfer);

        const slots = Array.from(container.querySelectorAll('.bucket-drop-slot')) as HTMLElement[];
        await waitFor(() => expect(slots[4]).toHaveClass('active'));
        expect(readRenderedBucketOrder(container)).toEqual([
            'Bucket 1',
            'Bucket 2',
            'Bucket 3',
            'Bucket 4',
            'Bucket 5',
            'Bucket 6',
            'Bucket 7',
            'Bucket 8',
            'Bucket 9',
        ]);

        fireEvent.dragEnd(sourceHandle);
    });

    it('leaves bucket order unchanged when a bucket is dropped outside a valid target', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);
        const sourceHandle = screen.getAllByRole('img', { name: 'Drag to move bucket' })[4];
        const beforeOrder = readRenderedBucketOrder(container);
        const beforePersistedOrder = readRuntimePlannerData().buckets.map((bucket) => bucket.id);
        const dataTransfer = createDragDataTransfer();

        fireEvent.dragStart(sourceHandle, { dataTransfer });
        await waitFor(() => expect(container.querySelector('.bucket-drop-slot.visible')).not.toBeNull());

        const invalidDropEvent = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(invalidDropEvent, 'dataTransfer', { value: dataTransfer });
        fireEvent(document.body, invalidDropEvent);

        await waitFor(() => expect(container.querySelector('.bucket-drop-slot.visible')).toBeNull());
        expect(readRenderedBucketOrder(container)).toEqual(beforeOrder);
        expect(readRuntimePlannerData().buckets.map((bucket) => bucket.id)).toEqual(beforePersistedOrder);
    });

    it('keeps right and left arrow movement aligned with bucket insertion boundaries', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);

        fireEvent.click(screen.getAllByRole('button', { name: 'Move bucket right' })[0]);
        await waitFor(() => {
            expect(readRenderedBucketOrder(container).slice(0, 3)).toEqual([
                'Bucket 2',
                'Bucket 1',
                'Bucket 3',
            ]);
        });

        const movedBucketColumn = screen.getByRole('heading', { name: 'Bucket 1' }).closest('.bucket-column') as HTMLElement;
        const moveLeftButton = movedBucketColumn.querySelector('[aria-label="Move bucket left"]') as HTMLButtonElement;
        fireEvent.click(moveLeftButton);

        await waitFor(() => {
            expect(readRenderedBucketOrder(container).slice(0, 3)).toEqual([
                'Bucket 1',
                'Bucket 2',
                'Bucket 3',
            ]);
        });
    });

    it('starts an empty browser storage with the v1 default board buckets', async () => {
        localStorage.clear();

        render(<App />);

        expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument();

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.projects).toHaveLength(1);
            expect(saved.buckets.map((bucket) => bucket.name)).toEqual(['To Do', 'In Progress']);
            expect(saved.buckets.map((bucket) => bucket.pinned)).toEqual([true, false]);
            expect(saved.tasks).toEqual([]);
        });
    });

    it('preserves malformed v2 recovery data during initial App save', async () => {
        const malformedV2 = 'not-json but important';
        localStorage.clear();
        localStorage.setItem(V2_STORAGE_KEY, malformedV2);

        render(<App />);

        await waitFor(() => {
            expect(localStorage.getItem(V2_RECOVERY_KEY)).toBe(malformedV2);
            expect(readRuntimePlannerData().version).toBe(2);
        });
    });

    it('initially selects the first pinned project and renders only that project board', () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        expect(screen.getByRole('heading', { name: 'Beta Bucket' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Beta task' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Alpha Bucket' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Alpha task' })).not.toBeInTheDocument();
    });

    it('switches boards without mixing project-scoped buckets or unassigned tasks', () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-a' },
        });

        expect(screen.getByRole('heading', { name: 'Alpha Bucket' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Alpha task' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Alpha unassigned' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Beta Bucket' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Beta task' })).not.toBeInTheDocument();
    });

    it('creates, renames, and updates project descriptions from the compact project list', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const newProjectInput = screen.getByLabelText('New project name');
        fireEvent.change(newProjectInput, { target: { value: 'Roadmap' } });
        fireEvent.keyDown(newProjectInput, { key: 'Enter' });

        await waitFor(() => {
            expect(readRuntimePlannerData().projects.some((project) => project.name === 'Roadmap')).toBe(true);
        });

        fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Roadmap 2' } });
        fireEvent.blur(screen.getByLabelText('Project name'));

        fireEvent.change(screen.getByLabelText('Project description'), { target: { value: 'Phase 3 notes' } });
        fireEvent.blur(screen.getByLabelText('Project description'));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            const project = saved.projects.find((item) => item.name === 'Roadmap 2');
            expect(project?.description).toBe('Phase 3 notes');
        });
    });

    it('falls back to the nearest remaining project after deleting the active project', async () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete project' }).at(-1)!);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Alpha Bucket' })).toBeInTheDocument();
        });

        const saved = readRuntimePlannerData();
        expect(saved.projects.map((project) => project.id)).toEqual(['project-a']);
        expect(saved.buckets.map((bucket) => bucket.projectId)).toEqual(['project-a']);
        expect(saved.tasks.every((task) => task.projectId === 'project-a')).toBe(true);
    });

    it('searches only within the active project', () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        fireEvent.change(screen.getByLabelText('Search tasks'), {
            target: { value: 'Alpha' },
        });

        expect(screen.queryByRole('button', { name: 'Alpha task' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Beta task' })).not.toBeInTheDocument();
    });

    it('exports validated v2 JSON', async () => {
        localStorage.clear();
        seedPlannerDataV2();
        let exportedBlob: Blob | null = null;
        const createObjectUrl = vi.fn((blob: Blob) => {
            exportedBlob = blob;
            return 'blob:planner-export';
        });
        Object.defineProperty(URL, 'createObjectURL', {
            value: createObjectUrl,
            configurable: true,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

        expect(screen.getByRole('status')).toHaveTextContent(
            /Export started — check your default Downloads folder for bsp-planner-\d{4}-\d{2}-\d{2}\.json\./,
        );
        expect(createObjectUrl).toHaveBeenCalledTimes(1);
        expect(exportedBlob).not.toBeNull();
        const exported = JSON.parse(await exportedBlob!.text()) as PlannerDataV2;
        expect(exported.version).toBe(2);
        expect(exported.projects).toHaveLength(2);
    });

    it('restores valid v1 JSON by migrating it into v2 state', async () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);

        const file = new File([JSON.stringify(plannerFixture)], 'planner-v1.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(screen.getByText('Restore 1 task(s) and 1 bucket(s) and replace current planner?')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.version).toBe(2);
            expect(saved.tasks.find((task) => task.id === 'task-1')?.projectId).toBe(saved.projects[0].id);
        });
    });

    it('restores valid v2 JSON directly', async () => {
        render(<App />);

        const file = new File([JSON.stringify(plannerV2Fixture)], 'planner-v2.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [file] },
        });

        await waitFor(() => {
            expect(screen.getByText('Restore 3 task(s) and 2 bucket(s) and replace current planner?')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.projects.map((project) => project.id)).toEqual(['project-a', 'project-b']);
            expect(saved.tasks.find((task) => task.id === 'task-beta')?.projectId).toBe('project-b');
        });
    });

    it('rejects malformed v2 restore and upload payloads with duplicate linked buckets', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ScopedExportFixture);

        render(<App />);

        const malformed: PlannerDataV2 = {
            ...plannerV2ScopedExportFixture,
            projects: [plannerV2ScopedExportFixture.projects.find((project) => project.id === 'project-b')!],
            buckets: [
                {
                    id: 'malformed-bucket-1',
                    projectId: 'project-b',
                    name: 'Malformed A',
                    description: '',
                    templateDefinitionId: 'definition-launch-ready',
                    priority: 0,
                    pinned: false,
                    createdAt: '2026-01-02T00:00:00.000Z',
                    updatedAt: '2026-01-02T00:00:00.000Z',
                },
                {
                    id: 'malformed-bucket-2',
                    projectId: 'project-b',
                    name: 'Malformed B',
                    description: '',
                    templateDefinitionId: 'definition-launch-ready',
                    priority: 0,
                    pinned: false,
                    createdAt: '2026-01-02T00:00:00.000Z',
                    updatedAt: '2026-01-02T00:00:00.000Z',
                },
            ],
            tasks: [],
        };

        const malformedFile = new File([JSON.stringify(malformed)], 'malformed-v2.json', { type: 'application/json' });

        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [malformedFile] },
        });

        await waitFor(() => {
            expect(screen.getByText(/not a valid/i)).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: 'Confirm restore' })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Upload planner data from JSON'), {
            target: { files: [malformedFile] },
        });

        await waitFor(() => {
            expect(screen.getByText(/not a valid/i)).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: 'Confirm upload' })).not.toBeInTheDocument();
    });

    it('applies a template to the active project and supports undo and redo', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2TemplateFixture);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Apply to Beta' }));

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument();
        });

        let saved = readRuntimePlannerData();
        expect(saved.buckets.filter((bucket) => bucket.projectId === 'project-b' && bucket.templateDefinitionId !== null).map((bucket) => bucket.templateDefinitionId)).toEqual(['definition-ready', 'definition-done']);
        expect(screen.getAllByText('Ready')).toHaveLength(2);
        expect(screen.getAllByText(/0 open \/ 0 complete \/ 0 archived/)).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

        await waitFor(() => {
            saved = readRuntimePlannerData();
            expect(saved.buckets.some((bucket) => bucket.templateDefinitionId === 'definition-ready' && bucket.projectId === 'project-b')).toBe(false);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Redo' }));

        await waitFor(() => {
            saved = readRuntimePlannerData();
            expect(saved.buckets.some((bucket) => bucket.templateDefinitionId === 'definition-ready' && bucket.projectId === 'project-b')).toBe(true);
        });
    });

    it('blocks referenced template deletion and reports complete reapply no-op', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2TemplateFixture);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Apply to Beta' }));
        await waitFor(() => {
            expect(readRuntimePlannerData().buckets.some((bucket) => bucket.templateDefinitionId === 'definition-ready')).toBe(true);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Delete template' }));
        expect(screen.getByText('Template deletion blocked because project buckets still reference one or more definitions.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Apply to Beta' }));
        expect(screen.getByText('No new buckets were created; all active definitions already exist in this project.')).toBeInTheDocument();
    });

    it('reports inactive templates and partial reapplication', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2PartialTemplateFixture);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Apply to Beta' }));
        await waitFor(() => {
            expect(screen.getByText('Applied 1 of 2 eligible bucket definitions to Beta.')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Active' }));
        fireEvent.click(screen.getByRole('button', { name: 'Apply to Beta' }));
        expect(screen.getByText('Inactive templates cannot be applied.')).toBeInTheDocument();
    });

    it('shows zero-eligible template message and does not create history entries', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ZeroEligibleTemplateFixture);

        render(<App />);

        const beforeApplySnapshot = localStorage.getItem(V2_STORAGE_KEY);
        const undoButton = screen.getByRole('button', { name: 'Undo' });
        expect(undoButton).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Apply to Beta' }));

        expect(screen.getByText('No buckets were created because this template has no default-active definitions.')).toBeInTheDocument();
        expect(localStorage.getItem(V2_STORAGE_KEY)).toBe(beforeApplySnapshot);
        expect(readRuntimePlannerData().buckets.some((bucket) => (
            bucket.projectId === 'project-b' && bucket.templateDefinitionId !== null
        ))).toBe(false);
        expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    });

    it('exports scoped template-derived bucket and restores it through UI as valid v2 data', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ScopedExportFixture);
        let exportedBlob: Blob | null = null;

        Object.defineProperty(URL, 'createObjectURL', {
            value: vi.fn((blob: Blob) => {
                exportedBlob = blob;
                return 'blob:planner-scoped-export';
            }),
            configurable: true,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        render(<App />);

        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-b' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Choose export scope' }));
        fireEvent.click(screen.getByRole('button', { name: 'Bucket: Beta Ready Lane' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

        expect(exportedBlob).not.toBeNull();
        const exported = JSON.parse(await exportedBlob!.text()) as PlannerDataV2;

        expect(exported.projects.map((project) => project.id)).toEqual(['project-b']);
        expect(exported.buckets.map((bucket) => bucket.id)).toEqual(['bucket-beta-ready-linked']);
        expect(exported.tasks.map((task) => task.id).sort()).toEqual(['task-beta-ready-1', 'task-beta-ready-2']);
        expect(exported.templateDefinitions.map((definition) => definition.id)).toEqual(['definition-launch-ready']);
        expect(exported.templates.map((template) => template.id)).toEqual(['template-launch']);

        expect(exported.projects.some((project) => project.id === 'project-a')).toBe(false);
        expect(exported.projects.some((project) => project.id === 'project-c')).toBe(false);
        expect(exported.buckets.some((bucket) => bucket.id === 'bucket-beta-manual')).toBe(false);
        expect(exported.tasks.some((task) => task.id === 'task-beta-manual')).toBe(false);
        expect(exported.templates.some((template) => template.id === 'template-support')).toBe(false);
        expect(exported.templateDefinitions.some((definition) => definition.id === 'definition-support-triage')).toBe(false);

        expect(isValidPlannerDataV2(exported)).toBe(true);

        const restoreFile = new File([JSON.stringify(exported)], 'scoped-export.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [restoreFile] },
        });
        await waitFor(() => {
            expect(screen.getByText('Restore 2 task(s) and 1 bucket(s) and replace current planner?')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => {
            const restored = readRuntimePlannerData();
            expect(isValidPlannerDataV2(restored)).toBe(true);
            expect(restored.projects.map((project) => project.id)).toEqual(['project-b']);
            expect(restored.buckets.map((bucket) => bucket.id)).toEqual(['bucket-beta-ready-linked']);
            expect(restored.tasks.map((task) => task.id).sort()).toEqual(['task-beta-ready-1', 'task-beta-ready-2']);
            expect(restored.templateDefinitions.map((definition) => definition.id)).toEqual(['definition-launch-ready']);
            expect(restored.templates.map((template) => template.id)).toEqual(['template-launch']);
        });
    });

    it('syncs definition rename through persistence and undo/redo', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2TemplateFixture);

        render(<App />);

        const definitionInput = screen.getByTestId('template-definition-name-definition-ready');
        fireEvent.change(definitionInput, { target: { value: 'Ready Renamed' } });
        fireEvent.blur(definitionInput);

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.templateDefinitions.find((definition) => definition.id === 'definition-ready')?.name).toBe('Ready Renamed');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

        await waitFor(() => {
            expect((screen.getByTestId('template-definition-name-definition-ready') as HTMLInputElement).value).toBe('Ready');
            const saved = readRuntimePlannerData();
            expect(saved.templateDefinitions.find((definition) => definition.id === 'definition-ready')?.name).toBe('Ready');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Redo' }));

        await waitFor(() => {
            expect((screen.getByTestId('template-definition-name-definition-ready') as HTMLInputElement).value).toBe('Ready Renamed');
            const saved = readRuntimePlannerData();
            expect(saved.templateDefinitions.find((definition) => definition.id === 'definition-ready')?.name).toBe('Ready Renamed');
        });
    });

    it('does not retain stale definition drafts when switching templates', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ScopedExportFixture);

        render(<App />);

        const templateSelect = screen.getByLabelText('Selected template');
        fireEvent.change(templateSelect, { target: { value: 'template-launch' } });

        const launchInput = screen.getByTestId('template-definition-name-definition-launch-ready');
        fireEvent.change(launchInput, { target: { value: 'Transient Launch Name' } });

        fireEvent.change(templateSelect, { target: { value: 'template-support' } });
        expect((screen.getByTestId('template-definition-name-definition-support-triage') as HTMLInputElement).value).toBe('Support Triage');

        fireEvent.change(templateSelect, { target: { value: 'template-launch' } });
        expect((screen.getByTestId('template-definition-name-definition-launch-ready') as HTMLInputElement).value).toBe('Launch Ready');

        const saved = readRuntimePlannerData();
        expect(saved.templateDefinitions.find((definition) => definition.id === 'definition-launch-ready')?.name).toBe('Launch Ready');
    });

    it('replaces template drafts with restored data while template library is open', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ScopedExportFixture);

        render(<App />);

        const draftInput = screen.getByTestId('template-definition-name-definition-launch-ready');
        fireEvent.change(draftInput, { target: { value: 'Unsaved Draft Name' } });

        const restorePayload: PlannerDataV2 = {
            ...plannerV2ScopedExportFixture,
            templateDefinitions: plannerV2ScopedExportFixture.templateDefinitions.map((definition) => (
                definition.id === 'definition-launch-ready'
                    ? { ...definition, name: 'Restored Launch Ready' }
                    : definition
            )),
        };
        const restoreFile = new File([JSON.stringify(restorePayload)], 'template-restore.json', { type: 'application/json' });

        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [restoreFile] },
        });
        await waitFor(() => {
            expect(screen.getByText('Restore 4 task(s) and 4 bucket(s) and replace current planner?')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => {
            expect((screen.getByTestId('template-definition-name-definition-launch-ready') as HTMLInputElement).value).toBe('Restored Launch Ready');
            const saved = readRuntimePlannerData();
            expect(saved.templateDefinitions.find((definition) => definition.id === 'definition-launch-ready')?.name).toBe('Restored Launch Ready');
        });
    });

    it('creates and edits templates and definitions from the Template Library', async () => {
        render(<App />);

        fireEvent.change(screen.getByLabelText('New template name'), { target: { value: 'Ops Template' } });
        fireEvent.keyDown(screen.getByLabelText('New template name'), { key: 'Enter' });

        await waitFor(() => {
            expect(readRuntimePlannerData().templates.some((template) => template.name === 'Ops Template')).toBe(true);
        });

        fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Ops Template 2' } });
        fireEvent.blur(screen.getByLabelText('Template name'));
        fireEvent.change(screen.getByLabelText('Template description'), { target: { value: 'Ops notes' } });
        fireEvent.blur(screen.getByLabelText('Template description'));

        fireEvent.change(screen.getByLabelText('New template definition name'), { target: { value: 'Follow Up' } });
        fireEvent.keyDown(screen.getByLabelText('New template definition name'), { key: 'Enter' });

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.templates.find((template) => template.name === 'Ops Template 2')?.description).toBe('Ops notes');
            expect(saved.templateDefinitions.some((definition) => definition.name === 'Follow Up')).toBe(true);
        });
    });

    it('exports and restores full v2 JSON with templates', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2TemplateFixture);
        let exportedBlob: Blob | null = null;
        Object.defineProperty(URL, 'createObjectURL', {
            value: vi.fn((blob: Blob) => {
                exportedBlob = blob;
                return 'blob:planner-template-export';
            }),
            configurable: true,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
        const exported = JSON.parse(await exportedBlob!.text()) as PlannerDataV2;
        expect(exported.templates.map((template) => template.id)).toEqual(['template-launch']);
        expect(exported.templateDefinitions.map((definition) => definition.id)).toEqual(['definition-ready', 'definition-done']);

        const restoreFile = new File([JSON.stringify(plannerV2TemplateFixture)], 'templates.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [restoreFile] },
        });
        await waitFor(() => {
            expect(screen.getByText('Restore 3 task(s) and 2 bucket(s) and replace current planner?')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
        await waitFor(() => {
            expect(readRuntimePlannerData().templates.map((template) => template.id)).toEqual(['template-launch']);
        });
    });
});
