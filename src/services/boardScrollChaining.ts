const SCROLL_EPSILON = 1;
const DEFAULT_LINE_HEIGHT = 16;

const wheelDeltaInPixels = (event: WheelEvent, boardFrame: HTMLElement) => {
  if (event.deltaMode === 1) return event.deltaY * DEFAULT_LINE_HEIGHT;
  if (event.deltaMode === 2) {
    return event.deltaY * Math.max(boardFrame.clientHeight, 1);
  }
  return event.deltaY;
};

export const handoffTaskListWheel = (event: WheelEvent) => {
  if (event.defaultPrevented || event.ctrlKey) return false;
  if (event.deltaY === 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const taskList = target.closest<HTMLElement>('.task-list');
  const boardFrame = taskList?.closest<HTMLElement>('.board-frame');
  if (!taskList || !boardFrame) return false;

  const movingDown = event.deltaY > 0;
  const taskListAtBoundary = movingDown
    ? taskList.scrollTop + taskList.clientHeight >=
      taskList.scrollHeight - SCROLL_EPSILON
    : taskList.scrollTop <= SCROLL_EPSILON;

  if (!taskListAtBoundary) return false;

  const maxBoardScrollTop = Math.max(
    0,
    boardFrame.scrollHeight - boardFrame.clientHeight,
  );
  const nextBoardScrollTop = Math.min(
    maxBoardScrollTop,
    Math.max(
      0,
      boardFrame.scrollTop + wheelDeltaInPixels(event, boardFrame),
    ),
  );

  if (
    Math.abs(nextBoardScrollTop - boardFrame.scrollTop) <= SCROLL_EPSILON
  ) {
    return false;
  }

  event.preventDefault();
  boardFrame.scrollTop = nextBoardScrollTop;
  return true;
};

export const installBoardScrollChaining = (root: Document = document) => {
  const handleWheel = (event: WheelEvent) => {
    handoffTaskListWheel(event);
  };

  root.addEventListener('wheel', handleWheel, { passive: false });
  return () => root.removeEventListener('wheel', handleWheel);
};
