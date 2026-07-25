import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BucketTaskSelectionState } from '../services/plannerSelection';
import type { BucketV2, PlannerTaskV2 } from '../types/v2';
import { BucketColumn } from './BucketColumn';

const makeBucket = (pinned = false, name = pinned ? 'Pinned bucket' : 'New bucket'): BucketV2 => ({
    id: pinned ? 'bucket-pinned' : 'bucket-new',
    projectId: 'project-1',
    name,
    description: '',
    templateDefinitionId: null,
    priority: 0,
    pinned,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
});

const makeTask = (): PlannerTaskV2 => ({
    id: 'task-1',
    projectId: 'project-1',
    bucketId: 'bucket-new',
    title: 'Nested task',
    description: '',
    priority: 0,
    resourceTags: [],
    pinned: false,
    completed: false,
    archivedAt: null,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
});

interface RenderBucketOptions {
    bucketDropIndex?: number;
    bucketDropSettleFrom?: 'left' | 'right' | null;
    isBucketDragActive?: boolean;
    isBucketDropSettled?: boolean;
    tasks?: PlannerTaskV2[];
    withAllHeaderActions?: boolean;
    canPasteIntoBucket?: boolean;
    canMoveBucketLeft?: boolean;
    canMoveBucketRight?: boolean;
    withSelection?: boolean;
    selectedTaskIds?: ReadonlySet<string>;
    bucketSelectionState?: BucketTaskSelectionState;
}

const renderBucket = (
    bucket: BucketV2,
    isWarpHighlight = false,
    isBucketDragSource = false,
    options: RenderBucketOptions = {},
) => {
    const onBucketDragStart = vi.fn();
    const onBucketDragEnd = vi.fn();
    const onBucketDragHover = vi.fn();
    const onBucketDrop = vi.fn();
    const onBucketDropSettleEnd = vi.fn();
    const onCopyBucketTasks = vi.fn();
    const onPasteIntoBucket = vi.fn();
    const onMoveBucketByOffset = vi.fn();
    const onToggleBucketPin = vi.fn();
    const onRenameBucket = vi.fn();
    const onDeleteBucket = vi.fn();
    const onTaskSelectionChange = vi.fn();
    const onBucketSelectionChange = vi.fn();
    let currentOptions = options;
    const renderColumn = (nextOptions: RenderBucketOptions) => (
        <BucketColumn
            columnIndex={11}
            bucket={bucket}
            tasks={nextOptions.tasks ?? []}
            draggedTaskId={null}
            isBucketDragActive={nextOptions.isBucketDragActive}
            draggedAccentIndex={null}
            highlightedTaskId={null}
            isWarpHighlight={isWarpHighlight}
            isBucketDragSource={isBucketDragSource}
            isBucketDropSettled={nextOptions.isBucketDropSettled}
            bucketDropSettleFrom={nextOptions.bucketDropSettleFrom}
            bucketDropIndex={nextOptions.bucketDropIndex}
            onQuickAddTask={vi.fn()}
            onEditTask={vi.fn()}
            onDeleteTask={vi.fn()}
            onToggleTask={vi.fn()}
            onMoveTask={vi.fn()}
            onToggleTaskPin={vi.fn()}
            onDragStart={vi.fn()}
            onDragEnd={vi.fn()}
            selectedTaskIds={nextOptions.selectedTaskIds}
            bucketSelectionState={nextOptions.bucketSelectionState}
            onTaskSelectionChange={nextOptions.withSelection ? onTaskSelectionChange : undefined}
            onBucketSelectionChange={nextOptions.withSelection ? onBucketSelectionChange : undefined}
            onBucketDragStart={onBucketDragStart}
            onBucketDragEnd={onBucketDragEnd}
            onBucketDragHover={onBucketDragHover}
            onBucketDrop={onBucketDrop}
            onBucketDropSettleEnd={onBucketDropSettleEnd}
            onCopyBucketTasks={nextOptions.withAllHeaderActions ? onCopyBucketTasks : undefined}
            onPasteIntoBucket={nextOptions.withAllHeaderActions ? onPasteIntoBucket : undefined}
            canPasteIntoBucket={nextOptions.canPasteIntoBucket}
            onMoveBucketByOffset={nextOptions.withAllHeaderActions ? onMoveBucketByOffset : undefined}
            canMoveBucketLeft={nextOptions.canMoveBucketLeft}
            canMoveBucketRight={nextOptions.canMoveBucketRight}
            onToggleBucketPin={nextOptions.withAllHeaderActions ? onToggleBucketPin : undefined}
            onRenameBucket={nextOptions.withAllHeaderActions ? onRenameBucket : undefined}
            onDeleteBucket={nextOptions.withAllHeaderActions ? onDeleteBucket : undefined}
        />
    );
    const result = render(renderColumn(currentOptions));
    return {
        ...result,
        rerenderBucket: (nextOptions: RenderBucketOptions) => {
            currentOptions = { ...currentOptions, ...nextOptions };
            result.rerender(renderColumn(currentOptions));
        },
        onBucketDragStart,
        onBucketDragEnd,
        onBucketDragHover,
        onBucketDrop,
        onBucketDropSettleEnd,
        onCopyBucketTasks,
        onPasteIntoBucket,
        onMoveBucketByOffset,
        onToggleBucketPin,
        onRenameBucket,
        onDeleteBucket,
        onTaskSelectionChange,
        onBucketSelectionChange,
    };
};

const createDataTransfer = () => ({
    dropEffect: 'none',
    setData: vi.fn(),
    setDragImage: vi.fn(),
    effectAllowed: 'none',
});

const fireBucketDragEvent = (
    type: 'dragover' | 'drop',
    target: HTMLElement,
    clientX: number,
    dataTransfer: ReturnType<typeof createDataTransfer>,
) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    fireEvent(target, event);
    return event;
};

const fireColumnAnimationEnd = (target: HTMLElement, animationName: string) => {
    // JSDOM omits AnimationEvent, so React registers its vendor-prefixed fallback.
    const event = new Event('webkitAnimationEnd', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: animationName });
    fireEvent(target, event);
};

describe('BucketColumn entrance and settle animations', () => {
    it('starts with one-time entrance state and clears it at reveal completion', () => {
        const { container, onBucketDropSettleEnd } = renderBucket(makeBucket());
        const column = container.querySelector('.bucket-column') as HTMLElement;

        expect(column).toHaveClass('bucket-entering');
        fireColumnAnimationEnd(column, 'reveal-column-opacity');

        expect(column).not.toHaveClass('bucket-entering');
        expect(onBucketDropSettleEnd).not.toHaveBeenCalled();
    });

    it('does not restore or accumulate entrance state across repeated settle cycles', () => {
        const { container, rerenderBucket } = renderBucket(makeBucket());
        const column = container.querySelector('.bucket-column') as HTMLElement;
        fireColumnAnimationEnd(column, 'reveal-column-opacity');

        rerenderBucket({
            isBucketDropSettled: true,
            bucketDropSettleFrom: 'left',
        });
        expect(container.querySelector('.bucket-column')).toBe(column);
        expect(column).toHaveClass('bucket-drop-settled', 'bucket-drop-settled-from-left');
        expect(column).not.toHaveClass('bucket-entering');

        rerenderBucket({
            isBucketDropSettled: false,
            bucketDropSettleFrom: null,
        });
        expect(column).not.toHaveClass('bucket-drop-settled', 'bucket-entering');

        rerenderBucket({
            isBucketDropSettled: true,
            bucketDropSettleFrom: 'right',
        });
        expect(column).toHaveClass('bucket-drop-settled', 'bucket-drop-settled-from-right');
        expect(column.className.match(/\bbucket-entering\b/g) ?? []).toHaveLength(0);

        rerenderBucket({
            isBucketDropSettled: false,
            bucketDropSettleFrom: null,
        });
        expect(column).not.toHaveClass('bucket-drop-settled', 'bucket-entering');
    });

    it('runs settle cleanup once only for the column relocation animation', () => {
        const {
            container,
            onBucketDropSettleEnd,
        } = renderBucket(makeBucket(), false, false, {
            isBucketDropSettled: true,
            bucketDropSettleFrom: 'left',
        });
        const column = container.querySelector('.bucket-column') as HTMLElement;

        fireColumnAnimationEnd(column, 'reveal-column-opacity');
        fireColumnAnimationEnd(column, 'bucket-settle-glow-overlay');
        fireColumnAnimationEnd(column, 'bucket-orb-flow');
        expect(onBucketDropSettleEnd).not.toHaveBeenCalled();

        fireColumnAnimationEnd(column, 'bucket-relocate-settle');
        expect(onBucketDropSettleEnd).toHaveBeenCalledOnce();
    });
});

describe('BucketColumn drag handle', () => {
    it.each([false, true])('renders an enabled draggable handle when pinned is %s', (pinned) => {
        renderBucket(makeBucket(pinned));
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });
        expect(handle).toHaveAttribute('draggable', 'true');
        expect(handle.tagName).toBe('SPAN');
        expect(handle).toHaveAttribute('tabindex', '0');
    });

    it('keeps a newly highlighted bucket draggable at a high stagger index', () => {
        const { onBucketDragStart } = renderBucket(makeBucket(), true);
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });
        const dataTransfer = createDataTransfer();

        expect(handle.closest('.bucket-column')).toHaveClass('warp-highlight', 'column-stagger-11');
        fireEvent.dragStart(handle, { dataTransfer });
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'bucket-new');
        expect(dataTransfer.effectAllowed).toBe('move');
        expect(dataTransfer.setDragImage).toHaveBeenCalledWith(expect.any(HTMLElement), 28, 22);
        expect(onBucketDragStart).toHaveBeenCalledWith('bucket-new');
    });

    it('creates a named translucent preview and removes it on drag end', () => {
        const { onBucketDragEnd } = renderBucket(makeBucket());
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });

        fireEvent.dragStart(handle, { dataTransfer: createDataTransfer() });
        expect(document.querySelector('.bucket-drag-preview')).toHaveTextContent('New bucket');

        fireEvent.dragEnd(handle);
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
        expect(onBucketDragEnd).toHaveBeenCalledOnce();
    });

    it('keeps bucket drag active when only the optional preview setup fails', () => {
        const { unmount, onBucketDragStart } = renderBucket(makeBucket());
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });
        const failedTransfer = createDataTransfer();
        failedTransfer.setDragImage.mockImplementation(() => { throw new Error('drag image failed'); });

        fireEvent.dragStart(handle, { dataTransfer: failedTransfer });
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
        expect(failedTransfer.setData).toHaveBeenCalledWith('text/plain', 'bucket-new');
        expect(failedTransfer.effectAllowed).toBe('move');
        expect(onBucketDragStart).toHaveBeenCalledWith('bucket-new');

        fireEvent.dragStart(handle, { dataTransfer: createDataTransfer() });
        unmount();
        expect(document.querySelector('.bucket-drag-preview')).not.toBeInTheDocument();
    });

    it('marks only the active bucket as the drag source', () => {
        renderBucket(makeBucket(), false, true);
        expect(screen.getByRole('img', { name: 'Drag to move bucket' }).closest('.bucket-column')).toHaveClass('bucket-drag-source');
    });

    it('does not remove drag functionality when reduced motion is requested', () => {
        vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
        const { onBucketDragStart } = renderBucket(makeBucket());
        const handle = screen.getByRole('img', { name: 'Drag to move bucket' });

        fireEvent.dragStart(handle, { dataTransfer: createDataTransfer() });
        expect(handle).toHaveAttribute('draggable', 'true');
        expect(onBucketDragStart).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });
});

describe('BucketColumn header actions', () => {
    it.each([false, true])('keeps the complete accessible action set inside a populated bucket when pinned is %s', (pinned) => {
        const bucket = makeBucket(pinned);
        const { container } = renderBucket(bucket, false, false, {
            tasks: [{ ...makeTask(), bucketId: bucket.id }],
            withAllHeaderActions: true,
            canPasteIntoBucket: true,
            canMoveBucketLeft: true,
            canMoveBucketRight: true,
        });
        const column = container.querySelector('.bucket-column') as HTMLElement;
        const header = column.querySelector('.bucket-header') as HTMLElement;
        const actions = header.querySelector('.bucket-actions') as HTMLElement;
        const actionQueries = [
            ['button', `Copy all tasks in ${bucket.name}`],
            ['button', `Paste tasks into ${bucket.name}`],
            ['img', 'Drag to move bucket'],
            ['button', 'Move bucket left'],
            ['button', 'Move bucket right'],
            ['button', pinned ? `Unpin ${bucket.name}` : `Pin ${bucket.name} to the left group`],
            ['button', 'Rename bucket'],
            ['button', 'Delete bucket'],
        ] as const;

        expect(actions).toBeInTheDocument();
        expect(actions.children).toHaveLength(8);
        expect(within(actions).getAllByRole('button')).toHaveLength(7);

        for (const [role, name] of actionQueries) {
            const control = within(actions).getByRole(role, { name });
            expect(header).toContainElement(control);
            expect(column).toContainElement(control);
            expect(control).toHaveAttribute('aria-label', name);
            expect(control.tabIndex).toBe(0);
            control.focus();
            expect(control).toHaveFocus();
        }
    });

    it('renders named bucket and task selection as keyboard-operable, controlled checkboxes', () => {
        const bucket = makeBucket();
        const task = makeTask();
        const result = renderBucket(bucket, false, false, {
            tasks: [task],
            withSelection: true,
            selectedTaskIds: new Set(),
            bucketSelectionState: 'unchecked',
        });

        const bucketCheckbox = screen.getByRole('checkbox', {
            name: `Select all visible tasks in ${bucket.name}`,
        });
        const taskCheckbox = screen.getByRole('checkbox', {
            name: `Select "${task.title}" for bulk actions`,
        });

        bucketCheckbox.focus();
        expect(bucketCheckbox).toHaveFocus();
        fireEvent.click(bucketCheckbox);
        expect(result.onBucketSelectionChange).toHaveBeenCalledWith(true);

        fireEvent.click(taskCheckbox);
        expect(result.onTaskSelectionChange).toHaveBeenCalledWith(task.id, true);

        result.rerenderBucket({
            selectedTaskIds: new Set([task.id]),
            bucketSelectionState: 'indeterminate',
        });
        expect(bucketCheckbox).toHaveProperty('indeterminate', true);
        expect(screen.getByRole('checkbox', {
            name: `Deselect "${task.title}" for bulk actions`,
        })).toBeChecked();
    });

    it('uses the Unassigned label and disables bucket selection when no tasks are visible', () => {
        const onBucketSelectionChange = vi.fn();
        render(
            <BucketColumn
                columnIndex={0}
                bucket={null}
                tasks={[]}
                draggedTaskId={null}
                draggedAccentIndex={null}
                highlightedTaskId={null}
                onQuickAddTask={vi.fn()}
                onEditTask={vi.fn()}
                onDeleteTask={vi.fn()}
                onToggleTask={vi.fn()}
                onMoveTask={vi.fn()}
                onToggleTaskPin={vi.fn()}
                onDragStart={vi.fn()}
                onDragEnd={vi.fn()}
                onBucketSelectionChange={onBucketSelectionChange}
            />,
        );

        const checkbox = screen.getByRole('checkbox', {
            name: 'No visible tasks to select in Unassigned',
        });
        expect(checkbox).toBeDisabled();
        fireEvent.click(checkbox);
        expect(onBucketSelectionChange).not.toHaveBeenCalled();
    });

    it.each([
        {
            label: 'empty',
            tasks: [] as PlannerTaskV2[],
            countLabel: '0 tasks',
            copyLabel: 'No tasks to copy from New bucket',
            copyDisabled: true,
        },
        {
            label: 'populated',
            tasks: [makeTask()],
            countLabel: '1 task',
            copyLabel: 'Copy all tasks in New bucket',
            copyDisabled: false,
        },
    ])('keeps all actions in the header for an $label bucket', ({ tasks, countLabel, copyLabel, copyDisabled }) => {
        const { container } = renderBucket(makeBucket(), false, false, {
            tasks,
            withAllHeaderActions: true,
            canPasteIntoBucket: true,
            canMoveBucketLeft: true,
            canMoveBucketRight: true,
        });
        const header = container.querySelector('.bucket-header') as HTMLElement;
        const titleBlock = header.querySelector('.bucket-title-block') as HTMLElement;
        const actions = header.querySelector('.bucket-actions') as HTMLElement;
        const copyButton = within(actions).getByRole('button', { name: copyLabel });

        expect(titleBlock).toHaveTextContent(countLabel);
        expect(actions.children).toHaveLength(8);
        expect(copyButton).toHaveProperty('disabled', copyDisabled);
    });

    it.each([
        'QuarterlyRoadmapDependenciesAndLaunchReadinessWithoutAnyBreakCharacters',
        'Quarterly roadmap dependencies and launch readiness across every delivery group',
    ])('keeps a long bucket name in the named title block alongside its actions: %s', (name) => {
        const bucket = makeBucket(false, name);
        const { container } = renderBucket(bucket, false, false, {
            tasks: [{ ...makeTask(), bucketId: bucket.id }],
            withAllHeaderActions: true,
            canPasteIntoBucket: true,
            canMoveBucketLeft: true,
            canMoveBucketRight: true,
        });
        const header = container.querySelector('.bucket-header') as HTMLElement;
        const titleBlock = header.querySelector('.bucket-title-block') as HTMLElement;
        const title = within(titleBlock).getByRole('heading', { level: 2 });
        const actions = header.querySelector('.bucket-actions') as HTMLElement;

        expect(title.textContent).toBe(name);
        expect(titleBlock.nextElementSibling).toBe(actions);
        expect(header).toContainElement(actions);
        expect(actions.children).toHaveLength(8);
    });
});

describe('BucketColumn midpoint bucket targets', () => {
    it('chooses the boundary before or after the hovered bucket and updates when crossing its midpoint', () => {
        const {
            container,
            onBucketDragHover,
        } = renderBucket(makeBucket(), false, false, {
            bucketDropIndex: 8,
            isBucketDragActive: true,
        });
        const column = container.querySelector('.bucket-column') as HTMLElement;
        vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
            x: 100,
            y: 40,
            left: 100,
            top: 40,
            right: 300,
            bottom: 440,
            width: 200,
            height: 400,
            toJSON: () => ({}),
        });
        const dataTransfer = createDataTransfer();

        const leftHalfEvent = fireBucketDragEvent('dragover', column, 199, dataTransfer);
        expect(leftHalfEvent.defaultPrevented).toBe(true);
        expect(dataTransfer.dropEffect).toBe('move');
        expect(onBucketDragHover).toHaveBeenLastCalledWith(8);

        fireBucketDragEvent('dragover', column, 201, dataTransfer);
        expect(onBucketDragHover).toHaveBeenLastCalledWith(9);
        expect(onBucketDragHover.mock.calls).toEqual([[8], [9]]);
    });

    it('uses the after-bucket boundary at the exact midpoint and on drop', () => {
        const {
            container,
            onBucketDrop,
        } = renderBucket(makeBucket(), false, false, {
            bucketDropIndex: 3,
            isBucketDragActive: true,
        });
        const column = container.querySelector('.bucket-column') as HTMLElement;
        vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
            x: 20,
            y: 40,
            left: 20,
            top: 40,
            right: 220,
            bottom: 440,
            width: 200,
            height: 400,
            toJSON: () => ({}),
        });
        const dataTransfer = createDataTransfer();

        const dropEvent = fireBucketDragEvent('drop', column, 120, dataTransfer);

        expect(dropEvent.defaultPrevented).toBe(true);
        expect(onBucketDrop).toHaveBeenCalledWith(4);
    });

    it.each(['.task-row', '.interaction-task-drop-slot'])(
        'lets bucket drag events from nested task content bubble to the column target through %s',
        (selector) => {
            const {
                container,
                onBucketDragHover,
                onBucketDrop,
            } = renderBucket(makeBucket(), false, false, {
                bucketDropIndex: 5,
                isBucketDragActive: true,
                tasks: [makeTask()],
            });
            const column = container.querySelector('.bucket-column') as HTMLElement;
            const nestedTarget = container.querySelector(selector) as HTMLElement;
            vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({
                x: 400,
                y: 40,
                left: 400,
                top: 40,
                right: 700,
                bottom: 440,
                width: 300,
                height: 400,
                toJSON: () => ({}),
            });
            const dataTransfer = createDataTransfer();

            fireBucketDragEvent('dragover', nestedTarget, 401, dataTransfer);
            expect(onBucketDragHover).toHaveBeenCalledWith(5);

            fireBucketDragEvent('drop', nestedTarget, 699, dataTransfer);
            expect(onBucketDrop).toHaveBeenCalledWith(6);
        },
    );
});
