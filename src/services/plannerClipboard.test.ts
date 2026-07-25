import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
    isTauri: vi.fn(() => false),
    writeText: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: tauriMocks.isTauri }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: tauriMocks.writeText }));

import {
    copyTextToClipboard,
    formatBucketForOrderedCopy,
    formatTaskChecklistLabel,
    formatTaskForOrderedCopy,
    formatTaskForSingleCopy,
    formatTaskNoteForCopy,
} from '../services/plannerClipboard';
import type { PlannerTask } from '../types';

describe('plannerClipboard', () => {
    describe('copyTextToClipboard', () => {
        beforeEach(() => {
            tauriMocks.isTauri.mockReturnValue(false);
            tauriMocks.writeText.mockReset();
            Object.defineProperty(navigator, 'clipboard', {
                value: undefined,
                configurable: true,
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
            document.querySelectorAll('textarea').forEach((element) => element.remove());
        });

        it('routes Tauri writes through the native clipboard plugin', async () => {
            tauriMocks.isTauri.mockReturnValue(true);
            tauriMocks.writeText.mockResolvedValue(undefined);
            const browserWrite = vi.fn();
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: browserWrite },
                configurable: true,
            });

            await expect(copyTextToClipboard('native text')).resolves.toBeUndefined();

            expect(tauriMocks.writeText).toHaveBeenCalledWith('native text');
            expect(browserWrite).not.toHaveBeenCalled();
        });

        it('propagates a rejected native write without using browser fallbacks', async () => {
            const nativeError = new Error('native clipboard unavailable');
            tauriMocks.isTauri.mockReturnValue(true);
            tauriMocks.writeText.mockRejectedValue(nativeError);
            const browserWrite = vi.fn();
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: browserWrite },
                configurable: true,
            });
            const execCommand = vi.fn();
            Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

            await expect(copyTextToClipboard('native text')).rejects.toBe(nativeError);

            expect(browserWrite).not.toHaveBeenCalled();
            expect(execCommand).not.toHaveBeenCalled();
        });

        it('uses navigator.clipboard in a browser', async () => {
            const browserWrite = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: browserWrite },
                configurable: true,
            });

            await copyTextToClipboard('browser text');

            expect(browserWrite).toHaveBeenCalledWith('browser text');
            expect(tauriMocks.writeText).not.toHaveBeenCalled();
        });

        it('falls back to execCommand and cleans up its temporary textarea', async () => {
            const execCommand = vi.fn().mockReturnValue(true);
            Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

            await copyTextToClipboard('legacy text');

            expect(execCommand).toHaveBeenCalledWith('copy');
            expect(document.querySelector('textarea')).not.toBeInTheDocument();
        });

        it('cleans up its temporary textarea when execCommand throws', async () => {
            Object.defineProperty(document, 'execCommand', {
                value: vi.fn(() => { throw new Error('legacy failure'); }),
                configurable: true,
            });

            await expect(copyTextToClipboard('legacy text')).rejects.toThrow('legacy failure');
            expect(document.querySelector('textarea')).not.toBeInTheDocument();
        });
    });

    describe('formatTaskChecklistLabel', () => {
        it('formats completed task with [x]', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Test task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: true,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[x] Test task');
        });

        it('formats incomplete task with [ ]', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Test task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[ ] Test task');
        });

        it('handles empty title with fallback', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: '   ',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[ ] Untitled task');
        });

        it('trims whitespace from title', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: '  My Task  ',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskChecklistLabel(task)).toBe('[ ] My Task');
        });
    });

    describe('formatTaskNoteForCopy', () => {
        it('formats single-line note with prefix', () => {
            expect(formatTaskNoteForCopy('Simple note', 'Note: ')).toBe('Note: Simple note');
        });

        it('formats multi-line note', () => {
            expect(formatTaskNoteForCopy('Line 1\nLine 2\nLine 3', 'Note: ')).toBe(
                'Note: Line 1\nNote: Line 2\nNote: Line 3'
            );
        });

        it('trims whitespace and filters empty lines', () => {
            expect(formatTaskNoteForCopy('  Line 1  \n\n  Line 2  \n', 'Note: ')).toBe(
                'Note: Line 1\nNote: Line 2'
            );
        });

        it('handles empty description', () => {
            expect(formatTaskNoteForCopy('', 'Note: ')).toBe('');
        });

        it('uses no prefix when not provided', () => {
            expect(formatTaskNoteForCopy('Note content')).toBe('Note content');
        });
    });

    describe('formatTaskForOrderedCopy', () => {
        it('formats task with index and optional notes', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Buy groceries',
                description: 'Milk\nBread',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForOrderedCopy(task, 0)).toBe(
                '1. [ ] Buy groceries\n   Note: Milk\n   Note: Bread'
            );
        });

        it('handles completed tasks', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Done task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: true,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForOrderedCopy(task, 5)).toBe('6. [x] Done task');
        });

        it('uses correct 1-based indexing', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Third item',
                description: '',
                bucketId: null,
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForOrderedCopy(task, 2)).toMatch(/^3\./);
        });
    });

    describe('formatBucketForOrderedCopy', () => {
        it('keeps the bucket name with its ordered tasks', () => {
            const tasks: PlannerTask[] = [
                {
                    id: 'task-1',
                    title: 'Review PR',
                    description: 'Check tests',
                    bucketId: 'bucket-work',
                    pinned: false,
                    completed: false,
                    archivedAt: null,
                    createdAt: '2026-06-30T00:00:00Z',
                    updatedAt: '2026-06-30T00:00:00Z',
                },
                {
                    id: 'task-2',
                    title: 'Ship release',
                    description: '',
                    bucketId: 'bucket-work',
                    pinned: false,
                    completed: true,
                    archivedAt: null,
                    createdAt: '2026-06-30T00:00:00Z',
                    updatedAt: '2026-06-30T00:00:00Z',
                },
            ];

            expect(formatBucketForOrderedCopy('Work', tasks)).toBe(
                'Bucket: Work\n1. [ ] Review PR\n   Note: Check tests\n2. [x] Ship release'
            );
        });
    });

    describe('formatTaskForSingleCopy', () => {
        it('formats task with bucket name and notes', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Review PR',
                description: 'Check tests',
                bucketId: 'bucket-work',
                pinned: false,
                completed: false,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForSingleCopy(task, 'Work')).toBe(
                '[ ] Review PR\nBucket: Work\nNote: Check tests'
            );
        });

        it('handles tasks without notes', () => {
            const task: PlannerTask = {
                id: 'task-1',
                title: 'Quick task',
                description: '',
                bucketId: null,
                pinned: false,
                completed: true,
                archivedAt: null,
                createdAt: '2026-06-30T00:00:00Z',
                updatedAt: '2026-06-30T00:00:00Z',
            };
            expect(formatTaskForSingleCopy(task, 'Unassigned')).toBe(
                '[x] Quick task\nBucket: Unassigned'
            );
        });
    });
});
