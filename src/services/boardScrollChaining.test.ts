import { afterEach, describe, expect, it } from 'vitest';
import { installBoardScrollChaining } from './boardScrollChaining';

interface ScrollState {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

const defineScrollState = (element: HTMLElement, state: ScrollState) => {
  Object.defineProperties(element, {
    scrollTop: {
      configurable: true,
      writable: true,
      value: state.scrollTop,
    },
    clientHeight: {
      configurable: true,
      value: state.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      value: state.scrollHeight,
    },
  });
};

const setupScrollers = (
  taskListState: ScrollState,
  boardState: ScrollState,
) => {
  document.body.innerHTML = `
    <div class="board-frame">
      <div class="task-list">
        <button type="button">Task</button>
      </div>
    </div>
  `;
  const boardFrame = document.querySelector('.board-frame') as HTMLElement;
  const taskList = document.querySelector('.task-list') as HTMLElement;
  const target = taskList.querySelector('button') as HTMLButtonElement;

  defineScrollState(taskList, taskListState);
  defineScrollState(boardFrame, boardState);

  return { boardFrame, target };
};

const dispatchWheel = (
  target: Element,
  deltaY: number,
  deltaX = 0,
) => {
  const event = new Event('wheel', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    deltaY: { value: deltaY },
    deltaX: { value: deltaX },
    deltaMode: { value: 0 },
    ctrlKey: { value: false },
  });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('board scroll chaining', () => {
  it('hands downward wheel input to the board at the task-list bottom', () => {
    const { boardFrame, target } = setupScrollers(
      { scrollTop: 200, clientHeight: 100, scrollHeight: 300 },
      { scrollTop: 0, clientHeight: 200, scrollHeight: 600 },
    );
    const uninstall = installBoardScrollChaining();

    const event = dispatchWheel(target, 80);

    expect(event.defaultPrevented).toBe(true);
    expect(boardFrame.scrollTop).toBe(80);
    uninstall();
  });

  it('keeps wheel input in the task list while it still has room', () => {
    const { boardFrame, target } = setupScrollers(
      { scrollTop: 100, clientHeight: 100, scrollHeight: 300 },
      { scrollTop: 0, clientHeight: 200, scrollHeight: 600 },
    );
    const uninstall = installBoardScrollChaining();

    const event = dispatchWheel(target, 80);

    expect(event.defaultPrevented).toBe(false);
    expect(boardFrame.scrollTop).toBe(0);
    uninstall();
  });

  it('hands upward wheel input to the board at the task-list top', () => {
    const { boardFrame, target } = setupScrollers(
      { scrollTop: 0, clientHeight: 100, scrollHeight: 300 },
      { scrollTop: 120, clientHeight: 200, scrollHeight: 600 },
    );
    const uninstall = installBoardScrollChaining();

    const event = dispatchWheel(target, -50);

    expect(event.defaultPrevented).toBe(true);
    expect(boardFrame.scrollTop).toBe(70);
    uninstall();
  });

  it('does not intercept after the board also reaches its boundary', () => {
    const { boardFrame, target } = setupScrollers(
      { scrollTop: 200, clientHeight: 100, scrollHeight: 300 },
      { scrollTop: 400, clientHeight: 200, scrollHeight: 600 },
    );
    const uninstall = installBoardScrollChaining();

    const event = dispatchWheel(target, 80);

    expect(event.defaultPrevented).toBe(false);
    expect(boardFrame.scrollTop).toBe(400);
    uninstall();
  });

  it('ignores horizontal-dominant gestures and removes its listener cleanly', () => {
    const { boardFrame, target } = setupScrollers(
      { scrollTop: 200, clientHeight: 100, scrollHeight: 300 },
      { scrollTop: 0, clientHeight: 200, scrollHeight: 600 },
    );
    const uninstall = installBoardScrollChaining();

    expect(dispatchWheel(target, 20, 80).defaultPrevented).toBe(false);
    expect(boardFrame.scrollTop).toBe(0);

    uninstall();
    expect(dispatchWheel(target, 80).defaultPrevented).toBe(false);
    expect(boardFrame.scrollTop).toBe(0);
  });
});
