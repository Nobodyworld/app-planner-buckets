import type { PlannerTask } from '../types';
import { isTauri } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

// Pure utility functions for task formatting (no side effects)

/**
 * Format task notes for display with a prefix.
 * Trims, splits by newlines, filters empty lines, and adds prefix to each.
 * Pure function: no side effects.
 */
export const formatTaskNoteForCopy = (description: string, prefix = ''): string => {
    return description
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `${prefix}${line}`)
        .join('\n');
};

/**
 * Format a task's checkbox state and title.
 * Example: "[x] Task title" or "[ ] Task title"
 */
export const formatTaskChecklistLabel = (task: PlannerTask): string => {
    return `${task.completed ? '[x]' : '[ ]'} ${task.title.trim() || 'Untitled task'}`;
};

/**
 * Format a single task in an ordered list for copying.
 * Includes index, title, and notes.
 * Example:
 *   1. [ ] Task title
 *      Note: task notes
 */
export const formatTaskForOrderedCopy = (task: PlannerTask, index: number): string => {
    const lines = [`${index + 1}. ${formatTaskChecklistLabel(task)}`];
    const note = formatTaskNoteForCopy(task.description, '   Note: ');

    if (note) {
        lines.push(note);
    }

    return lines.join('\n');
};

/**
 * Format a bucket as plain text for copying.
 * Keeps the bucket label with the ordered task checklist without introducing
 * a structured export format.
 */
export const formatBucketForOrderedCopy = (bucketName: string, tasks: PlannerTask[]): string => {
    return [`Bucket: ${bucketName}`, ...tasks.map(formatTaskForOrderedCopy)].join('\n');
};

/**
 * Format a single task with bucket name for copying.
 * Example:
 *   [ ] Task title
 *   Bucket: Bucket Name
 *   Note: task notes
 */
export const formatTaskForSingleCopy = (task: PlannerTask, bucketName: string): string => {
    const lines = [formatTaskChecklistLabel(task), `Bucket: ${bucketName}`];
    const note = formatTaskNoteForCopy(task.description, 'Note: ');

    if (note) {
        lines.push(note);
    }

    return lines.join('\n');
};

/**
 * Browser adapter: Copy text to system clipboard.
 * Intentional side effects: accesses browser clipboard API, manipulates DOM (legacy fallback).
 * Uses modern navigator.clipboard API with fallback to legacy execCommand.
 * Throws if both methods fail.
 */
export const copyTextToClipboard = async (text: string): Promise<void> => {
    if (isTauri()) {
        await writeText(text);
        return;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
    } catch {
        // Fall through to the legacy clipboard path below.
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', 'true');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);

    let copied = false;
    try {
        textArea.select();
        copied = document.execCommand('copy');
    } finally {
        textArea.remove();
    }

    if (!copied) {
        throw new Error('Clipboard copy failed');
    }
};
