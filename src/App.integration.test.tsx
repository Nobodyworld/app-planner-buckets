import { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
    BOARD_ZOOM_PERCENTAGES,
    BOARD_ZOOM_STORAGE_KEY,
    LEGACY_BOARD_ZOOM_STORAGE_KEY,
} from './services/boardZoom';
import type { PlannerData } from './types';
import type { PlannerDataV2, PlannerTaskV2 } from './types/v2';
import { PLANNER_DATA_V2_VERSION } from './types/v2';
import { isValidPlannerDataV2 } from './types/validators';
import {
    buildProjectExchangeEnvelope,
    isValidProjectExchangeEnvelope,
    type ProjectExchangeEnvelope,
} from './services/plannerExport';
import { RESTORE_RECOVERY_STORAGE_KEY } from './services/restoreRecovery';

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

const makeSelectionTask = (
    id: string,
    title: string,
    bucketId: string | null,
    completed = false,
): PlannerTaskV2 => ({
    id,
    projectId: 'project-b',
    title,
    description: '',
    bucketId,
    priority: 0,
    resourceTags: [],
    pinned: false,
    completed,
    archivedAt: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
});

const selectionFixture: PlannerDataV2 = {
    ...plannerV2Fixture,
    buckets: [
        ...plannerV2Fixture.buckets,
        {
            id: 'bucket-beta-second',
            projectId: 'project-b',
            name: 'Second Bucket',
            description: '',
            templateDefinitionId: null,
            priority: 0,
            pinned: false,
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z',
        },
    ],
    tasks: [
        makeSelectionTask('task-beta-second', 'Second bucket task', 'bucket-beta-second'),
        ...plannerV2Fixture.tasks,
        makeSelectionTask('task-beta-unassigned', 'Beta unassigned', null),
        makeSelectionTask('task-beta-completed', 'Completed beta task', 'bucket-beta', true),
    ],
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

const expandSidebarSection = (
    name: 'Projects' | 'Templates' | 'Archive / View Options' | 'Data',
) => {
    const toggle = screen.getByRole('button', { name: new RegExp(`^${name}`) });
    if (toggle.getAttribute('aria-expanded') === 'false') {
        fireEvent.click(toggle);
    }
    return toggle;
};

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

const mockBucketColumnGeometry = (
    column: HTMLElement,
    left = 100,
    width = 200,
) => {
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
        x: left,
        y: 120,
        left,
        top: 120,
        right: left + width,
        bottom: 620,
        width,
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

const tallBoardFixture: PlannerDataV2 = {
    ...overflowingBoardFixture,
    tasks: Array.from({ length: 24 }, (_, index) => ({
        id: `task-tall-${index + 1}`,
        projectId: 'project-overflow',
        title: `Tall board task ${index + 1}`,
        description: '',
        bucketId: 'bucket-overflow-1',
        priority: 0,
        resourceTags: [],
        pinned: false,
        completed: false,
        archivedAt: null,
        createdAt: `2026-02-01T00:00:${String(index).padStart(2, '0')}.000Z`,
        updatedAt: `2026-02-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    })),
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

    it('defaults to a visible persisted 90% board zoom', async () => {
        const { container } = render(<App />);

        expect(screen.getByLabelText('Board zoom level')).toHaveTextContent('90%');
        expect(container.querySelector('.board-stage')).toHaveClass('board-zoom-90');
        await waitFor(() => {
            expect(localStorage.getItem(BOARD_ZOOM_STORAGE_KEY)).toBe('90');
        });
    });

    it.each(BOARD_ZOOM_PERCENTAGES)('loads supported board zoom %i%%', (percent) => {
        localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(percent));

        const { container } = render(<App />);

        expect(screen.getByLabelText('Board zoom level')).toHaveTextContent(`${percent}%`);
        expect(container.querySelector('.board-stage')).toHaveClass(`board-zoom-${percent}`);
    });

    it('migrates a legacy zoom index without overwriting the legacy key', async () => {
        localStorage.setItem(LEGACY_BOARD_ZOOM_STORAGE_KEY, '2');

        render(<App />);

        expect(screen.getByLabelText('Board zoom level')).toHaveTextContent('105%');
        await waitFor(() => {
            expect(localStorage.getItem(BOARD_ZOOM_STORAGE_KEY)).toBe('105');
        });
        expect(localStorage.getItem(LEGACY_BOARD_ZOOM_STORAGE_KEY)).toBe('2');
    });

    it('persists zoom steps, preserves horizontal position, and disables endpoint controls', async () => {
        localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, '70');
        const firstRender = render(<App />);
        const { container } = firstRender;
        const frame = container.querySelector('.board-frame') as HTMLElement;
        Object.defineProperty(frame, 'scrollLeft', {
            value: 320,
            writable: true,
            configurable: true,
        });

        expect(screen.getByRole('button', { name: 'Zoom board out' })).toBeDisabled();
        const zoomIn = screen.getByRole('button', { name: 'Zoom board in' });
        fireEvent.click(zoomIn);

        expect(screen.getByLabelText('Board zoom level')).toHaveTextContent('75%');
        expect(container.querySelector('.board-frame')).toBe(frame);
        expect(frame.scrollLeft).toBe(320);
        await waitFor(() => {
            expect(localStorage.getItem(BOARD_ZOOM_STORAGE_KEY)).toBe('75');
        });

        firstRender.unmount();
        localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, '110');
        render(<App />);
        expect(screen.getByRole('button', { name: 'Zoom board in' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Zoom board out' })).toBeEnabled();
    });

    it('keeps a tall board and its entry controls inside the focusable closed-sidepanel viewport', () => {
        localStorage.clear();
        seedPlannerDataV2(tallBoardFixture);
        const { container } = render(<App />);

        expect(container.querySelector('.workspace-layout')).toHaveClass('sidepanel-closed');
        const frame = screen.getByRole('region', { name: 'Overflow board viewport' });
        expect(frame).toHaveAttribute('tabindex', '0');
        frame.focus();
        expect(frame).toHaveFocus();
        expect(frame).toContainElement(screen.getByRole('button', { name: 'Tall board task 24' }));
        expect(frame).toContainElement(screen.getAllByRole('button', { name: '+ Add task' })[0]);
        expect(frame.querySelector('.task-list')).not.toBeNull();
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

    it('orders sidebar cards and keeps each secondary section independently collapsed', () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const controls = screen.getByRole('complementary', { name: 'Planner controls' });
        const cardNames = Array.from(controls.querySelectorAll(':scope > .panel-card')).map((card) => (
            card.getAttribute('aria-label')
            ?? card.querySelector('.sidebar-disclosure-title')?.textContent
        ));
        expect(cardNames).toEqual([
            'Quick add',
            'Create bucket',
            'Projects',
            'Templates',
            'Archive / View Options',
            'Data',
        ]);

        const projectsToggle = screen.getByRole('button', { name: /^Projects/ });
        const templatesToggle = screen.getByRole('button', { name: /^Templates/ });
        const archiveToggle = screen.getByRole('button', { name: /^Archive \/ View Options/ });
        const dataToggle = screen.getByRole('button', { name: /^Data/ });
        [projectsToggle, templatesToggle, archiveToggle, dataToggle].forEach((toggle) => {
            expect(toggle).toHaveAttribute('aria-expanded', 'false');
            expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toHaveAttribute('hidden');
        });

        fireEvent.click(projectsToggle);
        dataToggle.focus();
        fireEvent.click(dataToggle);
        expect(projectsToggle).toHaveAttribute('aria-expanded', 'true');
        expect(dataToggle).toHaveAttribute('aria-expanded', 'true');
        expect(templatesToggle).toHaveAttribute('aria-expanded', 'false');
        expect(archiveToggle).toHaveAttribute('aria-expanded', 'false');
        expect(dataToggle).toHaveFocus();
    });

    it('orders Data actions and exposes project scope with accessible selected context', () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        render(<App />);
        expandSidebarSection('Data');

        const exportButton = screen.getByRole('button', { name: 'Export JSON' });
        const scopeButton = screen.getByRole('button', { name: 'Choose export scope' });
        const importButton = screen.getByRole('button', { name: 'Import project JSON' });
        const restoreButton = screen.getByRole('button', { name: 'Restore from JSON backup' });

        expect(exportButton.compareDocumentPosition(scopeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(scopeButton.compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(importButton.compareDocumentPosition(restoreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole('group', { name: 'Project import' })).toContainElement(importButton);
        expect(screen.getByText(/Selected export scope:/)).toHaveTextContent('Selected export scope: All data');

        fireEvent.click(scopeButton);
        const scopeMenu = screen.getByLabelText('Export scope options');
        expect(within(scopeMenu).getAllByRole('button').map((button) => button.textContent)).toEqual([
            'All data',
            'Project: Beta',
            'Unassigned tasks',
            'Bucket: Beta Bucket',
        ]);
        const projectScope = within(scopeMenu).getByRole('button', { name: 'Project: Beta' });
        expect(projectScope).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(projectScope);
        expect(screen.getByText(/Selected export scope:/)).toHaveTextContent(
            'Selected export scope: Project: Beta',
        );
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

    it('copies a bucket as exact structured JSON', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.change(screen.getByLabelText('Search tasks'), {
            target: { value: 'not present in any task' },
        });
        expect(screen.queryByRole('button', { name: 'Write launch summary' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(1);
        });

        expect(writeText).toHaveBeenCalledWith(JSON.stringify({
            bucket: {
                name: 'To Do',
                pinned: true,
            },
            tasks: [
                {
                    title: 'Write launch summary',
                    description: 'Include blockers',
                    completed: false,
                    pinned: false,
                },
            ],
        }, null, 2));
    });

    it('copies an empty Unassigned document and replaces the latest internal paste buffer', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
        expect(screen.getByRole('button', { name: 'Paste tasks into Unassigned' })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'Copy Unassigned as JSON' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));

        expect(writeText).toHaveBeenLastCalledWith(JSON.stringify({
            bucket: {
                name: 'Unassigned',
                pinned: false,
            },
            tasks: [],
        }, null, 2));
        screen.getAllByRole('button', { name: 'Copy tasks first to paste' }).forEach((button) => {
            expect(button).toBeDisabled();
        });
    });

    it('copies the full active project as Markdown, clears task paste, and preserves selection', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        fireEvent.click(screen.getByRole('button', { name: 'Copy Beta Bucket as JSON' }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Paste tasks into Unassigned' })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: 'Copy project' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));

        expect(writeText).toHaveBeenLastCalledWith(
            '# Beta\n'
            + '\n'
            + '## Bucket: Beta Bucket\n'
            + '\n'
            + '1. [ ] Beta task\n'
            + '2. [x] Completed beta task\n'
            + '\n'
            + '## Bucket: Second Bucket\n'
            + '\n'
            + '1. [ ] Second bucket task\n'
            + '\n'
            + '## Unassigned\n'
            + '\n'
            + '1. [ ] Beta unassigned',
        );
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Deselect "Beta task" for bulk actions',
        })).toBeChecked();
        screen.getAllByRole('button', { name: 'Copy tasks first to paste' }).forEach((button) => {
            expect(button).toBeDisabled();
        });
    });

    it('reports project-copy failure without showing a false success', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        Object.defineProperty(document, 'execCommand', {
            value: vi.fn(() => false),
            configurable: true,
        });

        const { container } = render(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy project' }));

        await waitFor(() => {
            expect(container.querySelector('.search-status')).toHaveTextContent(
                'Could not copy project "Beta"',
            );
        });
        expect(container.querySelector('.search-status')).not.toHaveTextContent(
            'Copied project "Beta"',
        );
    });

    it('pastes copied tasks into another bucket', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
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

    it('offers an accessible latest-paste confirmation and Keep finalizes the tasks', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));

        const notice = screen.getByRole('region', { name: 'Paste confirmation' });
        expect(within(notice).getByRole('status')).toHaveTextContent(
            'Pasted 1 task into Unassigned. Keep it?',
        );
        const keep = within(notice).getByRole('button', { name: 'Keep pasted tasks' });
        keep.focus();
        expect(keep).toHaveFocus();
        fireEvent.click(keep);

        expect(screen.queryByRole('region', {
            name: 'Paste confirmation',
        })).not.toBeInTheDocument();
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(2);
        });
    });

    it('auto-dismisses the paste confirmation after ten seconds without removing tasks', () => {
        vi.useFakeTimers();
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));
        expect(screen.getByRole('region', {
            name: 'Paste confirmation',
        })).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(10000);
        });

        expect(screen.queryByRole('region', {
            name: 'Paste confirmation',
        })).not.toBeInTheDocument();
        expect(readRuntimePlannerData().tasks).toHaveLength(2);
    });

    it('Undo removes only the most recent repeated paste and preserves earlier pasted tasks', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
        const paste = screen.getByRole('button', { name: 'Paste tasks into Unassigned' });
        fireEvent.click(paste);
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(2);
        });
        const firstPastedTaskId = readRuntimePlannerData().tasks.find(
            (task) => task.id !== 'task-1',
        )?.id;

        fireEvent.click(paste);
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(3);
        });
        expect(screen.getAllByRole('region', {
            name: 'Paste confirmation',
        })).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'Undo pasted tasks' }));
        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.tasks).toHaveLength(2);
            expect(saved.tasks.some((task) => task.id === firstPastedTaskId)).toBe(true);
            expect(saved.tasks.filter((task) => (
                task.bucketId === null && task.title === 'Write launch summary'
            ))).toHaveLength(1);
        });
        expect(screen.queryByRole('region', {
            name: 'Paste confirmation',
        })).not.toBeInTheDocument();
    });

    it('Undo remains exact and safe after the pasted destination bucket is deleted', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into To Do' }));
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(2);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Delete bucket' }));
        const deleteDialog = screen.getByRole('dialog', { name: 'Delete bucket' });
        fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete bucket' }));
        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.buckets).toHaveLength(0);
            expect(saved.tasks.every((task) => task.bucketId === null)).toBe(true);
        });

        fireEvent.click(screen.getByRole('button', { name: 'Undo pasted tasks' }));
        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.tasks).toHaveLength(1);
            expect(saved.tasks[0].id).toBe('task-1');
            expect(saved.tasks[0].bucketId).toBeNull();
        });
    });

    it('falls back to Unassigned when a keyboard paste target was deleted', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy To Do as JSON' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete bucket' }));
        const deleteDialog = screen.getByRole('dialog', { name: 'Delete bucket' });
        fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete bucket' }));
        await waitFor(() => {
            expect(readRuntimePlannerData().buckets).toHaveLength(0);
        });

        fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.tasks).toHaveLength(2);
            expect(saved.tasks.every((task) => task.bucketId === null)).toBe(true);
        });
        expect(within(screen.getByRole('region', {
            name: 'Paste confirmation',
        })).getByRole('status')).toHaveTextContent(
            'Pasted 1 task into Unassigned. Keep it?',
        );
    });

    it('clears stale paste confirmation on project switching and destructive Restore', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy Beta Bucket as JSON' }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));
        expect(screen.getByRole('region', {
            name: 'Paste confirmation',
        })).toBeInTheDocument();

        expandSidebarSection('Projects');
        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-a' },
        });
        expect(screen.queryByRole('region', {
            name: 'Paste confirmation',
        })).not.toBeInTheDocument();
        expect(readRuntimePlannerData().tasks.filter((task) => (
            task.projectId === 'project-b' && task.bucketId === null
        ))).toHaveLength(3);

        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-b' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));
        expect(screen.getByRole('region', {
            name: 'Paste confirmation',
        })).toBeInTheDocument();

        expandSidebarSection('Data');
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(plannerFixture)], 'replacement.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        fireEvent.click(await screen.findByRole('button', {
            name: 'Confirm restore',
        }));

        expect(screen.queryByRole('region', {
            name: 'Paste confirmation',
        })).not.toBeInTheDocument();
    });

    it('manages explicit task, named-bucket, and Unassigned selection independently from completion', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        const { container } = render(<App />);

        const copySelected = screen.getByRole('button', { name: 'Copy selected' });
        const clearAll = screen.getByRole('button', { name: 'Clear all' });
        expect(screen.getByText('0 selected')).toHaveAttribute('aria-live', 'polite');
        expect(copySelected).toBeDisabled();
        expect(clearAll).toBeDisabled();

        const betaTaskSelection = screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        });
        betaTaskSelection.focus();
        expect(betaTaskSelection).toHaveFocus();
        fireEvent.click(betaTaskSelection);

        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Deselect "Beta task" for bulk actions',
        })).toBeChecked();

        const betaBucketSelection = screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Beta Bucket',
        });
        await waitFor(() => expect(betaBucketSelection).toHaveProperty('indeterminate', true));

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Mark "Beta task" complete',
        }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Deselect "Beta task" for bulk actions',
        })).toBeChecked();
        expect(screen.getByRole('button', { name: 'Beta task' }).closest('.task-card')).toHaveClass('completed');

        fireEvent.click(betaBucketSelection);
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        const checkedBucketSelection = screen.getByRole('checkbox', {
            name: 'Deselect all visible tasks in Beta Bucket',
        });
        expect(checkedBucketSelection).toBeChecked();

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Deselect "Completed beta task" for bulk actions',
        }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Beta Bucket',
        })).toHaveProperty('indeterminate', true));

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Beta Bucket',
        }));
        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Deselect all visible tasks in Beta Bucket',
        }));
        expect(screen.getByText('0 selected')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select all visible tasks in Unassigned',
        }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Deselect "Beta unassigned" for bulk actions',
        })).toBeChecked();

        fireEvent.click(clearAll);
        expect(screen.getByText('0 selected')).toBeInTheDocument();
        expect(copySelected).toBeDisabled();
        expect(clearAll).toBeDisabled();
        expect(container.querySelectorAll('.task-card.is-selected')).toHaveLength(0);
    });

    it('keeps task and bucket copy independent while copying selected tasks in visible board order', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Second bucket task" for bulk actions',
        }));
        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta unassigned" for bulk actions',
        }));
        expect(screen.getByText('3 selected')).toBeInTheDocument();

        const betaTaskCard = screen.getByRole('button', { name: 'Beta task' }).closest('.task-card') as HTMLElement;
        fireEvent.click(within(betaTaskCard).getByRole('button', { name: 'Copy' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(writeText).toHaveBeenLastCalledWith('[ ] Beta task\nBucket: Beta Bucket');
        expect(screen.getByText('3 selected')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Copy Beta Bucket as JSON' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
        expect(writeText).toHaveBeenLastCalledWith(JSON.stringify({
            bucket: {
                name: 'Beta Bucket',
                pinned: false,
            },
            tasks: [
                {
                    title: 'Beta task',
                    description: '',
                    completed: false,
                    pinned: false,
                },
                {
                    title: 'Completed beta task',
                    description: '',
                    completed: true,
                    pinned: false,
                },
            ],
        }, null, 2));
        expect(screen.getByText('3 selected')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Paste tasks into Unassigned' }));
        await waitFor(() => {
            const pastedUnassignedTitles = readRuntimePlannerData().tasks
                .filter((task) => task.projectId === 'project-b' && task.bucketId === null)
                .map((task) => task.title);
            expect(pastedUnassignedTitles).toEqual([
                'Beta unassigned',
                'Beta task',
                'Completed beta task',
            ]);
        });
        expect(screen.getByText('3 selected')).toBeInTheDocument();
        expect(screen.getAllByRole('checkbox', {
            name: /Deselect ".+" for bulk actions/,
        })).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', { name: 'Copy selected' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
        expect(writeText).toHaveBeenLastCalledWith(
            '1. [ ] Beta unassigned\n2. [ ] Beta task\n3. [ ] Second bucket task',
        );
        expect(screen.getByText('3 selected')).toBeInTheDocument();
        expect(screen.getAllByRole('checkbox', {
            name: /Deselect ".+" for bulk actions/,
        })).toHaveLength(3);
    });

    it('prunes selection after search, completed filtering, and project switches without restoring hidden selections', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Second bucket task" for bulk actions',
        }));
        expect(screen.getByText('2 selected')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search tasks'), {
            target: { value: 'Beta' },
        });
        await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('Search tasks'), {
            target: { value: '' },
        });
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Select "Second bucket task" for bulk actions',
        })).not.toBeChecked();

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Completed beta task" for bulk actions',
        }));
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        expandSidebarSection('Archive / View Options');
        fireEvent.click(screen.getByRole('checkbox', { name: 'Show completed' }));
        await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Completed beta task' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show completed again' }));
        expect(screen.getByRole('checkbox', {
            name: 'Select "Completed beta task" for bulk actions',
        })).not.toBeChecked();
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        expandSidebarSection('Projects');
        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-a' },
        });
        expect(screen.getByText('0 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Select "Alpha task" for bulk actions',
        })).toBeInTheDocument();
    });

    it('keeps selection through a visible move and prunes it after delete and archive', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        const betaTaskCard = screen.getByRole('button', { name: 'Beta task' }).closest('.task-card') as HTMLElement;
        fireEvent.click(within(betaTaskCard).getByRole('button', { name: 'Move task down' }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: 'Deselect "Beta task" for bulk actions',
        })).toBeChecked();

        fireEvent.click(within(betaTaskCard).getByRole('button', { name: 'Delete' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Delete task' }).at(-1)!);
        await waitFor(() => expect(screen.getByText('0 selected')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Beta task' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Completed beta task" for bulk actions',
        }));
        expandSidebarSection('Archive / View Options');
        fireEvent.click(screen.getByRole('button', { name: 'Archive completed (1)' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm archive completed tasks' }));
        await waitFor(() => expect(screen.getByText('0 selected')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Completed beta task' })).not.toBeInTheDocument();
    });

    it('clears selection on restore even when restored data reuses a selected task id', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        expandSidebarSection('Data');
        const restoreFile = new File([JSON.stringify(plannerV2Fixture)], 'selection-restore.json', {
            type: 'application/json',
        });
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: { files: [restoreFile] },
        });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm restore' })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

        await waitFor(() => expect(screen.getByText('0 selected')).toBeInTheDocument());
        expect(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        })).not.toBeChecked();
    });

    it('preserves selected multi-drag and unselected single-drag without mutating explicit selection', () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Completed beta task" for bulk actions',
        }));

        const taskCard = screen.getByRole('button', { name: 'Beta task' }).closest('.task-card') as HTMLElement;
        const dragHandle = taskCard.querySelector('.drag-handle') as HTMLElement;
        const selectedTransfer = createDragDataTransfer();
        fireEvent.dragStart(dragHandle, { dataTransfer: selectedTransfer });

        expect(JSON.parse(selectedTransfer.getData('application/x-planner-task-ids'))).toEqual([
            'task-beta',
            'task-beta-completed',
        ]);
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        fireEvent.dragEnd(dragHandle);

        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
        const unselectedTransfer = createDragDataTransfer();
        fireEvent.dragStart(dragHandle, { dataTransfer: unselectedTransfer });

        expect(JSON.parse(unselectedTransfer.getData('application/x-planner-task-ids'))).toEqual([
            'task-beta',
        ]);
        expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('routes copy, paste, undo, and redo shortcuts through exactly one transaction path', async () => {
        localStorage.clear();
        seedPlannerDataV2(selectionFixture);
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        render(<App />);

        fireEvent.click(screen.getByRole('checkbox', {
            name: 'Select "Beta task" for bulk actions',
        }));
        const originalTaskCount = selectionFixture.tasks.length;

        fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(writeText).toHaveBeenLastCalledWith('1. [ ] Beta task');
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(originalTaskCount + 1);
        });
        expect(readRuntimePlannerData().tasks.filter((task) => (
            task.projectId === 'project-b'
            && task.bucketId === null
            && task.title === 'Beta task'
        ))).toHaveLength(1);

        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(originalTaskCount);
        });

        fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
        await waitFor(() => {
            expect(readRuntimePlannerData().tasks).toHaveLength(originalTaskCount + 1);
        });
        expect(writeText).toHaveBeenCalledTimes(1);
    });

    it('supports undo and redo keyboard shortcuts for planner actions', async () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));
        const titleInput = screen.getByLabelText('Task title');
        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        const projectInput = screen.getByRole('combobox', { name: 'Project' });
        fireEvent.change(titleInput, {
            target: { value: 'Undo target task' },
        });
        fireEvent.keyDown(titleInput, { key: 'Enter' });
        expect(bucketInput).toHaveFocus();
        fireEvent.keyDown(bucketInput, { key: 'Enter' });
        expect(projectInput).toHaveFocus();
        fireEvent.keyDown(projectInput, { key: 'Enter' });

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

        fireEvent.change(screen.getByLabelText('Task title'), {
            target: { value: 'Draft release notes' },
        });
        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        const projectInput = screen.getByRole('combobox', { name: 'Project' });
        fireEvent.change(bucketInput, {
            target: { value: 'Release Prep' },
        });

        fireEvent.keyDown(bucketInput, { key: 'Enter' });
        expect(projectInput).toHaveFocus();
        fireEvent.keyDown(projectInput, { key: 'Enter' });

        expect(screen.getByRole('heading', { name: 'Release Prep' })).toBeInTheDocument();

        const saved = readRuntimePlannerData();
        const createdBucket = saved.buckets.find((bucket) => bucket.name === 'Release Prep');
        const createdTask = saved.tasks.find((task) => task.title === 'Draft release notes');

        expect(createdBucket).toBeTruthy();
        expect(createdTask?.bucketId).toBe(createdBucket?.id);
    });

    it('clears only the task title after submitting to a chosen project and bucket', () => {
        localStorage.clear();
        seedPlannerDataV2();
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const titleInput = screen.getByLabelText('Task title');
        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        const projectInput = screen.getByRole('combobox', { name: 'Project' });
        fireEvent.change(titleInput, { target: { value: 'Retained target task' } });
        fireEvent.change(bucketInput, { target: { value: 'Beta Bucket' } });
        fireEvent.keyDown(bucketInput, { key: 'Enter' });
        fireEvent.keyDown(projectInput, { key: 'Enter' });

        expect(titleInput).toHaveValue('');
        expect(bucketInput).toHaveValue('Beta Bucket');
        expect(projectInput).toHaveValue('Beta');

        const createdTask = readRuntimePlannerData().tasks.find(
            (task) => task.title === 'Retained target task',
        );
        expect(createdTask).toMatchObject({
            projectId: 'project-b',
            bucketId: 'bucket-beta',
        });
    });

    it('scopes bucket suggestions and re-resolves a same-name bucket when Project changes', () => {
        localStorage.clear();
        const scopedQuickAddFixture: PlannerDataV2 = {
            ...plannerV2Fixture,
            buckets: [
                ...plannerV2Fixture.buckets,
                {
                    ...plannerV2Fixture.buckets[0],
                    id: 'bucket-alpha-shared',
                    name: 'Shared',
                },
                {
                    ...plannerV2Fixture.buckets[1],
                    id: 'bucket-beta-shared',
                    name: 'Shared',
                },
            ],
        };
        seedPlannerDataV2(scopedQuickAddFixture);
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const titleInput = screen.getByLabelText('Task title');
        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        const projectInput = screen.getByRole('combobox', { name: 'Project' });
        fireEvent.change(titleInput, { target: { value: 'Project-scoped task' } });
        fireEvent.change(bucketInput, { target: { value: 'Shared' } });
        fireEvent.keyDown(bucketInput, { key: 'Enter' });

        fireEvent.change(projectInput, { target: { value: 'Alpha' } });
        expect(bucketInput).toHaveValue('Shared');

        fireEvent.blur(projectInput);
        fireEvent.focus(bucketInput);
        expect(screen.getByRole('option', { name: 'Shared' })).toHaveAttribute('aria-selected', 'true');

        fireEvent.change(bucketInput, { target: { value: '' } });
        expect(screen.getByRole('option', { name: 'Alpha Bucket' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Shared' })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Beta Bucket' })).not.toBeInTheDocument();

        fireEvent.change(bucketInput, { target: { value: 'Shared' } });
        fireEvent.keyDown(bucketInput, { key: 'Enter' });
        fireEvent.keyDown(projectInput, { key: 'Enter' });

        const saved = readRuntimePlannerData();
        const createdTask = saved.tasks.find((task) => task.title === 'Project-scoped task');
        expect(createdTask).toMatchObject({
            projectId: 'project-a',
            bucketId: 'bucket-alpha-shared',
        });
        expect(saved.buckets.filter((bucket) => (
            bucket.projectId === 'project-a' && bucket.name === 'Shared'
        ))).toHaveLength(1);
    });

    it('activates a newly created project from Quick Add', () => {
        localStorage.clear();
        seedPlannerDataV2();
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const titleInput = screen.getByLabelText('Task title');
        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        const projectInput = screen.getByRole('combobox', { name: 'Project' });
        fireEvent.change(titleInput, { target: { value: 'Kickoff checklist' } });
        fireEvent.change(bucketInput, { target: { value: 'Intake' } });
        fireEvent.change(projectInput, { target: { value: 'Gamma Initiative' } });
        fireEvent.keyDown(projectInput, { key: 'Enter' });

        const saved = readRuntimePlannerData();
        const createdProject = saved.projects.find((project) => project.name === 'Gamma Initiative');
        const createdBucket = saved.buckets.find((bucket) => (
            bucket.projectId === createdProject?.id && bucket.name === 'Intake'
        ));
        const createdTask = saved.tasks.find((task) => task.title === 'Kickoff checklist');

        expect(createdProject).toBeTruthy();
        expect(createdBucket).toBeTruthy();
        expect(createdTask).toMatchObject({
            projectId: createdProject?.id,
            bucketId: createdBucket?.id,
        });
        expect(screen.getByRole('heading', { name: 'Intake' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Beta Bucket' })).not.toBeInTheDocument();
        expect(titleInput).toHaveValue('');
        expect(bucketInput).toHaveValue('Intake');
        expect(projectInput).toHaveValue('Gamma Initiative');
    });

    it('creates a novel bucket name and assigns the quick-added task to it', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Task title'), {
            target: { value: 'Follow up with vendor' },
        });
        fireEvent.change(screen.getByRole('combobox', { name: 'Bucket' }), {
            target: { value: '@@@' },
        });

        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Bucket' }), { key: 'Enter' });
        fireEvent.keyDown(screen.getByRole('combobox', { name: 'Project' }), { key: 'Enter' });

        const saved = readRuntimePlannerData();
        const createdBucket = saved.buckets.find((bucket) => bucket.name === '@@@');
        const createdTask = saved.tasks.find((task) => task.title === 'Follow up with vendor');

        expect(createdBucket).toBeTruthy();
        expect(createdTask?.bucketId).toBe(createdBucket?.id);
    });

    it('accepts a filtered bucket option with Enter and submits from the Project field', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        fireEvent.change(screen.getByLabelText('Task title'), {
            target: { value: 'Call supplier' },
        });

        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        fireEvent.change(bucketInput, {
            target: { value: 'To' },
        });
        expect(screen.getByRole('option', { name: 'To Do' })).toBeInTheDocument();
        fireEvent.keyDown(bucketInput, { key: 'Enter' });

        expect((bucketInput as HTMLInputElement).value).toBe('To Do');
        const projectInput = screen.getByRole('combobox', { name: 'Project' });
        expect(projectInput).toHaveFocus();
        fireEvent.keyDown(projectInput, { key: 'Enter' });

        const saved = readRuntimePlannerData();
        const createdTask = saved.tasks.find((task) => task.title === 'Call supplier');
        expect(createdTask?.bucketId).toBe('bucket-todo');
    });

    it('shows filtered listbox options in the bucket combobox while typing', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: 'Open planner controls' }));

        const bucketInput = screen.getByRole('combobox', { name: 'Bucket' });
        fireEvent.change(bucketInput, {
            target: { value: 'To' },
        });

        expect(bucketInput).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('listbox', { name: 'Bucket suggestions' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'To Do' })).toBeInTheDocument();
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

    it.each([70, 110] as const)(
        'horizontally autoscrolls the board when dragging a task near the right edge at %i%% zoom',
        async (percent) => {
            localStorage.clear();
            seedPlannerDataV2(overflowingBoardFixture);
            localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(percent));
            const animationFrameCallbacks = setupAnimationFrameQueue();
            const { container } = render(<App />);

            expect(container.querySelector('.board-stage')).toHaveClass(`board-zoom-${percent}`);
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
        },
    );

    it('horizontally autoscrolls the board when dragging a bucket near the right edge', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const animationFrameCallbacks = setupAnimationFrameQueue();
        const { container } = render(<App />);

        const frame = container.querySelector('.board-frame') as HTMLElement;
        mockBoardFrameGeometry(frame);

        const bucketDragHandle = screen.getAllByRole('button', { name: 'Drag to move bucket' })[0];
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

        const bucketHandles = screen.getAllByRole('button', { name: 'Drag to move bucket' });
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

    it.each([
        {
            zoomPercent: 70,
            visualColumnWidth: 140,
            beforeMidpointX: 169,
            afterMidpointX: 171,
        },
        {
            zoomPercent: 110,
            visualColumnWidth: 220,
            beforeMidpointX: 209,
            afterMidpointX: 211,
        },
    ] as const)(
        'moves bucket 1 after bucket 9 using viewport midpoint coordinates at $zoomPercent% zoom',
        async ({
            zoomPercent,
            visualColumnWidth,
            beforeMidpointX,
            afterMidpointX,
        }) => {
            localStorage.clear();
            seedPlannerDataV2(overflowingBoardFixture);
            localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(zoomPercent));
            const { container } = render(<App />);
            expect(container.querySelector('.board-stage')).toHaveClass(`board-zoom-${zoomPercent}`);
            const bucketHandles = screen.getAllByRole('button', { name: 'Drag to move bucket' });
            const sourceHandle = bucketHandles[0];
            const targetColumn = bucketHandles[8].closest('.bucket-column') as HTMLElement;
            const dataTransfer = createDragDataTransfer();
            mockBucketColumnGeometry(targetColumn, 100, visualColumnWidth);

            fireEvent.dragStart(sourceHandle, { dataTransfer });
            await waitFor(() => expect(sourceHandle.closest('.bucket-column')).toHaveClass('bucket-drag-source'));

            const slots = Array.from(container.querySelectorAll('.bucket-drop-slot')) as HTMLElement[];
            fireBoardDragOver(targetColumn, beforeMidpointX, dataTransfer);
            await waitFor(() => expect(slots[8]).toHaveClass('active'));

            fireBoardDragOver(targetColumn, afterMidpointX, dataTransfer);
            await waitFor(() => {
                expect(slots[8]).not.toHaveClass('active');
                expect(slots[9]).toHaveClass('active');
            });

            fireBoardDrop(targetColumn, afterMidpointX, dataTransfer);
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
        },
    );

    it('moves bucket 9 before bucket 2 using bucket 2 left-half target', async () => {
        localStorage.clear();
        seedPlannerDataV2(overflowingBoardFixture);
        const { container } = render(<App />);
        const bucketHandles = screen.getAllByRole('button', { name: 'Drag to move bucket' });
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
        const bucketHandles = screen.getAllByRole('button', { name: 'Drag to move bucket' });
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
        const sourceHandle = screen.getAllByRole('button', { name: 'Drag to move bucket' })[4];
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
        expandSidebarSection('Projects');

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
        expandSidebarSection('Projects');

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
        expandSidebarSection('Projects');

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

    it('exports validated all-data v2 JSON with an exact, longer-lived dismissible filename notice', async () => {
        localStorage.clear();
        seedPlannerDataV2();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-25T06:30:00.000Z'));
        let exportedBlob: Blob | null = null;
        let downloadedFilename = '';
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
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            downloadedFilename = this.download;
        });

        render(<App />);
        expandSidebarSection('Data');

        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

        expect(screen.getByRole('status')).toHaveTextContent(
            'Export started — check your default Downloads folder for bsp-planner-all-2026-07-25-063000.json.',
        );
        expect(downloadedFilename).toBe('bsp-planner-all-2026-07-25-063000.json');
        expect(createObjectUrl).toHaveBeenCalledTimes(1);
        expect(exportedBlob).not.toBeNull();
        const exported = JSON.parse(await exportedBlob!.text()) as PlannerDataV2;
        expect(exported.version).toBe(2);
        expect(exported.projects).toHaveLength(2);

        act(() => {
            vi.advanceTimersByTime(5001);
        });
        expect(screen.getByRole('status')).toHaveTextContent(
            'bsp-planner-all-2026-07-25-063000.json',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss export notification' }));
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('exports the active project as a tagged, reference-closed envelope with one timestamped filename', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ScopedExportFixture);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-25T06:30:00.000Z'));
        let exportedBlob: Blob | null = null;
        let downloadedFilename = '';
        Object.defineProperty(URL, 'createObjectURL', {
            value: vi.fn((blob: Blob) => {
                exportedBlob = blob;
                return 'blob:planner-project-export';
            }),
            configurable: true,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            value: vi.fn(),
            configurable: true,
        });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            downloadedFilename = this.download;
        });

        render(<App />);
        expandSidebarSection('Data');
        fireEvent.click(screen.getByRole('button', { name: 'Choose export scope' }));
        fireEvent.click(screen.getByRole('button', { name: 'Project: Beta' }));
        fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));

        expect(downloadedFilename).toBe('bsp-planner-project-beta-2026-07-25-063000.json');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Export started — check your default Downloads folder for bsp-planner-project-beta-2026-07-25-063000.json.',
        );
        expect(exportedBlob).not.toBeNull();
        const envelope = JSON.parse(await exportedBlob!.text()) as ProjectExchangeEnvelope;
        expect(isValidProjectExchangeEnvelope(envelope)).toBe(true);
        expect(envelope).toMatchObject({
            format: 'bsp-planner-project',
            envelopeVersion: 1,
            sourceProject: {
                id: 'project-b',
                name: 'Beta',
            },
            exportedAt: '2026-07-25T06:30:00.000Z',
        });
        expect(envelope.data.projects.map((project) => project.id)).toEqual(['project-b']);
        expect(envelope.data.buckets.map((bucket) => bucket.id)).toEqual([
            'bucket-beta-ready-linked',
            'bucket-beta-manual',
        ]);
        expect(envelope.data.tasks.map((task) => task.id)).toEqual([
            'task-beta-ready-1',
            'task-beta-ready-2',
            'task-beta-manual',
        ]);
        expect(envelope.data.templateDefinitions.map((definition) => definition.id)).toEqual([
            'definition-launch-ready',
        ]);
        expect(envelope.data.templates.map((template) => template.id)).toEqual(['template-launch']);
        expect(JSON.stringify(envelope)).not.toContain('project-a');
        expect(JSON.stringify(envelope)).not.toContain('project-c');
        expect(JSON.stringify(envelope)).not.toContain('template-support');
    });

    it('imports a tagged project export as a new remapped project only after an explicit destination choice', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const envelope = buildProjectExchangeEnvelope(
            plannerV2Fixture,
            'project-a',
            '2026-07-25T06:30:00.000Z',
        );

        render(<App />);
        expandSidebarSection('Data');
        fireEvent.change(screen.getByLabelText('Import a project from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(envelope)], 'alpha-project.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });

        const config = await screen.findByRole('group', { name: 'Configure project import' });
        expect(within(config).getByText(/Source project:/)).toHaveTextContent(
            'Source project: Alpha',
        );
        const confirmImport = within(config).getByRole('button', {
            name: 'Confirm project import',
        });
        expect(confirmImport).toBeDisabled();

        fireEvent.click(within(config).getByRole('radio', {
            name: 'Create as new project',
        }));
        expect(confirmImport).toBeEnabled();
        fireEvent.click(confirmImport);

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            const importedProject = saved.projects.find(
                (project) => project.name === 'Alpha (imported)',
            );
            expect(importedProject).toBeDefined();
            expect(saved.projects.map((project) => project.id)).toEqual(
                expect.arrayContaining(['project-a', 'project-b']),
            );
            expect(
                saved.tasks
                    .filter((task) => task.projectId === importedProject?.id)
                    .map((task) => task.title),
            ).toEqual(['Alpha task', 'Alpha unassigned']);
        });

        expect(screen.getByRole('region', {
            name: 'Alpha (imported) board viewport',
        })).toBeInTheDocument();
        expect(screen.getByText('Alpha task').closest('.task-card')).toHaveClass(
            'uploaded-task-highlight',
        );
        expect(screen.getByRole('status')).toHaveTextContent(
            'Imported "Alpha" into "Alpha (imported)"',
        );
        expect(screen.getByRole('status')).toHaveTextContent('skipped 0 duplicate task(s)');
    });

    it('requires an explicit source for raw multi-project imports and imports only that closure', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);

        render(<App />);
        expandSidebarSection('Data');
        fireEvent.change(screen.getByLabelText('Import a project from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(plannerV2Fixture)], 'all-projects.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });

        const config = await screen.findByRole('group', { name: 'Configure project import' });
        const sourceSelect = within(config).getByLabelText('Source project');
        const confirmImport = within(config).getByRole('button', {
            name: 'Confirm project import',
        });
        expect(sourceSelect).toHaveValue('');

        fireEvent.click(within(config).getByRole('radio', {
            name: 'Create as new project',
        }));
        expect(confirmImport).toBeDisabled();
        fireEvent.change(sourceSelect, { target: { value: 'project-a' } });
        expect(confirmImport).toBeEnabled();
        fireEvent.click(confirmImport);

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            const importedProject = saved.projects.find(
                (project) => project.name === 'Alpha (imported)',
            );
            expect(importedProject).toBeDefined();
            const importedTitles = saved.tasks
                .filter((task) => task.projectId === importedProject?.id)
                .map((task) => task.title);
            expect(importedTitles).toEqual(['Alpha task', 'Alpha unassigned']);
            expect(importedTitles).not.toContain('Beta task');
        });
    });

    it('merges into the explicitly selected existing project, activates it, and reports duplicates', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const envelope = buildProjectExchangeEnvelope(
            plannerV2Fixture,
            'project-b',
            '2026-07-25T06:30:00.000Z',
        );

        render(<App />);
        expandSidebarSection('Projects');
        fireEvent.change(screen.getByLabelText('Active project'), {
            target: { value: 'project-a' },
        });
        expect(screen.getByRole('region', {
            name: 'Alpha board viewport',
        })).toBeInTheDocument();

        expandSidebarSection('Data');
        fireEvent.change(screen.getByLabelText('Import a project from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(envelope)], 'beta-project.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });

        const config = await screen.findByRole('group', { name: 'Configure project import' });
        const confirmImport = within(config).getByRole('button', {
            name: 'Confirm project import',
        });
        fireEvent.click(within(config).getByRole('radio', {
            name: 'Merge into existing project',
        }));
        expect(confirmImport).toBeDisabled();
        fireEvent.change(within(config).getByLabelText('Destination project'), {
            target: { value: 'project-b' },
        });
        expect(confirmImport).toBeEnabled();
        fireEvent.click(confirmImport);

        await waitFor(() => {
            const saved = readRuntimePlannerData();
            expect(saved.projects).toHaveLength(2);
            expect(saved.tasks.filter((task) => task.projectId === 'project-a')).toHaveLength(2);
            expect(saved.tasks.filter((task) => task.projectId === 'project-b')).toHaveLength(1);
        });
        expect(screen.getByRole('region', {
            name: 'Beta board viewport',
        })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Imported "Beta" into "Beta"',
        );
        expect(screen.getByRole('status')).toHaveTextContent('skipped 1 duplicate task(s)');
    });

    it('routes valid and malformed tagged project exports away from destructive Restore', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const envelope = buildProjectExchangeEnvelope(
            plannerV2Fixture,
            'project-a',
            '2026-07-25T06:30:00.000Z',
        );

        render(<App />);
        expandSidebarSection('Data');
        const restoreInput = screen.getByLabelText('Restore planner data from JSON');

        for (const [filename, payload] of [
            ['valid-project.json', envelope],
            ['malformed-project.json', { ...envelope, envelopeVersion: 99 }],
        ] as const) {
            fireEvent.change(restoreInput, {
                target: {
                    files: [
                        new File([JSON.stringify(payload)], filename, {
                            type: 'application/json',
                        }),
                    ],
                },
            });
            await waitFor(() => {
                expect(screen.getByRole('status')).toHaveTextContent(
                    'This is a project export. Use Import project JSON instead',
                );
            });
            expect(screen.queryByRole('button', {
                name: 'Confirm restore',
            })).not.toBeInTheDocument();
        }

        expect(readRuntimePlannerData()).toEqual(plannerV2Fixture);
    });

    it('clears stale pending Restore and import confirmations when a later file is unreadable', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const envelope = buildProjectExchangeEnvelope(
            plannerV2Fixture,
            'project-a',
            '2026-07-25T06:30:00.000Z',
        );

        render(<App />);
        expandSidebarSection('Data');

        const restoreInput = screen.getByLabelText('Restore planner data from JSON');
        fireEvent.change(restoreInput, {
            target: {
                files: [
                    new File([JSON.stringify(plannerFixture)], 'valid-restore.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        expect(await screen.findByRole('button', {
            name: 'Confirm restore',
        })).toBeInTheDocument();
        fireEvent.change(restoreInput, {
            target: {
                files: [
                    new File(['{'], 'invalid-restore.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.queryByRole('button', {
                name: 'Confirm restore',
            })).not.toBeInTheDocument();
        });

        const importInput = screen.getByLabelText('Import a project from JSON');
        fireEvent.change(importInput, {
            target: {
                files: [
                    new File([JSON.stringify(envelope)], 'valid-project.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        expect(await screen.findByRole('group', {
            name: 'Configure project import',
        })).toBeInTheDocument();
        fireEvent.change(importInput, {
            target: {
                files: [
                    new File(['{'], 'invalid-project.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.queryByRole('group', {
                name: 'Configure project import',
            })).not.toBeInTheDocument();
        });
        expect(screen.getByRole('status')).toHaveTextContent(
            'Selected file could not be read as JSON.',
        );
    });

    it('restores valid v1 JSON by migrating it into v2 state', async () => {
        localStorage.clear();
        seedPlannerDataV2();

        render(<App />);
        expandSidebarSection('Data');

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
        expandSidebarSection('Data');

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

    it('persists a validated Restore recovery across remount and Undo restores the exact prior planner', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const { unmount } = render(<App />);
        expandSidebarSection('Data');

        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(plannerFixture)], 'replacement.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        fireEvent.click(await screen.findByRole('button', {
            name: 'Confirm restore',
        }));

        await waitFor(() => {
            expect(localStorage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).not.toBeNull();
            expect(readRuntimePlannerData().projects).toHaveLength(1);
        });

        unmount();
        render(<App />);
        expandSidebarSection('Data');
        fireEvent.click(screen.getByRole('button', { name: 'Undo restore' }));

        await waitFor(() => {
            expect(readRuntimePlannerData()).toEqual(plannerV2Fixture);
            expect(localStorage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();
        });
        expect(screen.queryByRole('button', {
            name: 'Undo restore',
        })).not.toBeInTheDocument();
    });

    it('aborts Restore without changing data when a recovery snapshot cannot be saved', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
        vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
            if (key === RESTORE_RECOVERY_STORAGE_KEY) {
                throw new Error('synthetic storage failure');
            }
            originalSetItem(key, value);
        });

        render(<App />);
        expandSidebarSection('Data');
        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(plannerFixture)], 'replacement.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        fireEvent.click(await screen.findByRole('button', {
            name: 'Confirm restore',
        }));

        expect(screen.getByRole('status')).toHaveTextContent(
            'Restore was not started because a recovery snapshot could not be saved locally.',
        );
        expect(screen.getByRole('button', {
            name: 'Confirm restore',
        })).toBeInTheDocument();
        expect(readRuntimePlannerData()).toEqual(plannerV2Fixture);
        expect(localStorage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();
    });

    it('retires stale Restore recovery after a later planner edit', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2Fixture);
        render(<App />);
        expandSidebarSection('Data');

        fireEvent.change(screen.getByLabelText('Restore planner data from JSON'), {
            target: {
                files: [
                    new File([JSON.stringify(plannerFixture)], 'replacement.json', {
                        type: 'application/json',
                    }),
                ],
            },
        });
        fireEvent.click(await screen.findByRole('button', {
            name: 'Confirm restore',
        }));
        expect(await screen.findByRole('button', {
            name: 'Undo restore',
        })).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText(
            'Mark "Write launch summary" complete',
        ));

        await waitFor(() => {
            expect(localStorage.getItem(RESTORE_RECOVERY_STORAGE_KEY)).toBeNull();
            expect(screen.queryByRole('button', {
                name: 'Undo restore',
            })).not.toBeInTheDocument();
        });
        expect(readRuntimePlannerData().tasks[0].completed).toBe(true);
    });

    it('rejects malformed v2 Restore and project-import payloads with duplicate linked buckets', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2ScopedExportFixture);

        render(<App />);
        expandSidebarSection('Data');

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

        fireEvent.change(screen.getByLabelText('Import a project from JSON'), {
            target: { files: [malformedFile] },
        });

        await waitFor(() => {
            expect(screen.getByText(/not a valid|invalid/i)).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: 'Confirm project import' })).not.toBeInTheDocument();
    });

    it('applies a template to the active project and supports undo and redo', async () => {
        localStorage.clear();
        seedPlannerDataV2(plannerV2TemplateFixture);

        render(<App />);
        expandSidebarSection('Templates');

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
        expandSidebarSection('Templates');

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
        expandSidebarSection('Templates');

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
        expandSidebarSection('Templates');

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
        expandSidebarSection('Projects');
        expandSidebarSection('Data');

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
        expandSidebarSection('Templates');

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
        expandSidebarSection('Templates');

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
        expandSidebarSection('Templates');
        expandSidebarSection('Data');

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
        expandSidebarSection('Templates');

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
        expandSidebarSection('Data');

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
