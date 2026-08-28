import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PasteUndoNotice } from './PasteUndoNotice';

describe('PasteUndoNotice', () => {
  it.each([
    [1, 'task'],
    [3, 'tasks'],
  ] as const)('announces %i pasted %s with its destination', (taskCount, taskLabel) => {
    render(
      <PasteUndoNotice
        taskCount={taskCount}
        destinationName={'Synthetic <Inbox>'}
        onKeep={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Paste confirmation' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      `Pasted ${taskCount} ${taskLabel} into Synthetic <Inbox>. Keep it?`,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('exposes keyboard-focusable Keep and Undo actions', () => {
    const onKeep = vi.fn();
    const onUndo = vi.fn();
    render(
      <PasteUndoNotice
        taskCount={2}
        destinationName="Ready"
        onKeep={onKeep}
        onUndo={onUndo}
      />,
    );

    const keep = screen.getByRole('button', { name: 'Keep pasted tasks' });
    const undo = screen.getByRole('button', { name: 'Undo pasted tasks' });
    keep.focus();
    expect(keep).toHaveFocus();

    fireEvent.click(keep);
    fireEvent.click(undo);
    expect(onKeep).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
