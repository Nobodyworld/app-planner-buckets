import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { BucketColumn } from './components/BucketColumn';
import { ProjectBoard } from './components/ProjectBoard';
import { TaskEditor } from './components/TaskEditor';
import { PlannerSidepanel } from './components/sidepanel/PlannerSidepanel';
import { getGlobalBucketView } from './selectors/globalBucketView';
import { createId } from './storage/plannerStorage';
import type { TaskDraft } from './types';
import type { BucketTemplate, BucketTemplateDefinition, BucketV2 as Bucket, PlannerDataV2 as PlannerData, PlannerTaskV2 as PlannerTask, Project } from './types/v2';
import { usePlannerHistory } from './hooks/usePlannerHistory';
import { usePlannerKeyboardShortcuts } from './hooks/usePlannerKeyboardShortcuts';
import { savePlannerDataV2ToLocalStorage, loadPlannerDataV2FromLocalStorage } from './services/plannerPersistence';
import { plannerReducerV2, type PlannerActionV2 } from './state/plannerReducerV2';
import {
  copyTextToClipboard,
  formatBucketForOrderedCopy,
  formatTaskChecklistLabel,
  formatTaskForOrderedCopy,
  formatTaskForSingleCopy,
} from './services/plannerClipboard';
import { coercePlannerDataToV2, mergeUploadedPlannerDataV2 } from './services/plannerImport';
import { isValidPlannerDataV2 } from './types/validators';

const accentIndexFromBucket = (bucketId: string | null) => {
  if (!bucketId) return 0;
  const hash = bucketId
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (hash % 8) + 1;
};

const ensureScrollableTargetInView = (
  container: HTMLElement | null,
  target: HTMLElement | null,
  margin = 12,
) => {
  if (!container || !target) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const fullyVisible =
    targetRect.top >= containerRect.top + margin &&
    targetRect.bottom <= containerRect.bottom - margin;

  if (!fullyVisible) {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

const UPLOAD_HALO_DURATION_MS = 120000;
const DROP_SETTLE_DURATION_MS = 1500;
const QUICK_TASK_BUCKET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;
const BOARD_EDGE_AUTOSCROLL_ZONE_PX = 96;
const BOARD_EDGE_AUTOSCROLL_MAX_SPEED_PX = 24;

const normalizeBucketName = (name: string) => name.trim().toLowerCase();

const now = (): string => new Date().toISOString();

const selectInitialProjectId = (projects: Project[]): string => (
  projects.find((project) => project.pinned)?.id ?? projects[0]?.id ?? ''
);

const selectNearestProjectIdAfterDeletion = (projects: Project[], deletedProjectId: string): string => {
  const sourceIndex = projects.findIndex((project) => project.id === deletedProjectId);
  const remainingProjects = projects.filter((project) => project.id !== deletedProjectId);
  if (remainingProjects.length === 0) return '';
  if (sourceIndex < 0) return selectInitialProjectId(remainingProjects);
  const targetIndex = Math.max(0, Math.min(sourceIndex, remainingProjects.length - 1));
  return remainingProjects[targetIndex]?.id ?? remainingProjects[0].id;
};

const createProject = (name: string): Project => {
  const timestamp = now();
  return {
    id: createId(),
    name: name.trim(),
    description: '',
    priority: 0,
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const createBucket = (projectId: string, name: string, id = createId()): Bucket => {
  const timestamp = now();
  return {
    id,
    projectId,
    name: name.trim(),
    description: '',
    templateDefinitionId: null,
    priority: 0,
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const createTask = (projectId: string, draft: TaskDraft, id = createId(), timestamp = now()): PlannerTask => ({
  id,
  projectId,
  title: draft.title.trim(),
  description: draft.description.trim(),
  bucketId: draft.bucketId,
  priority: 0,
  resourceTags: [],
  pinned: false,
  completed: false,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const plannerHasId = (data: PlannerData, id: string): boolean => (
  data.projects.some((project) => project.id === id) ||
  data.buckets.some((bucket) => bucket.id === id) ||
  data.tasks.some((task) => task.id === id) ||
  data.templates.some((template) => template.id === id) ||
  data.templateDefinitions.some((definition) => definition.id === id)
);

const createUniquePlannerId = (data: PlannerData, reservedIds = new Set<string>()): string => {
  let id = createId();
  while (plannerHasId(data, id) || reservedIds.has(id)) {
    id = createId();
  }
  reservedIds.add(id);
  return id;
};

const createTemplate = (data: PlannerData, name: string): BucketTemplate => {
  const timestamp = now();
  return {
    id: createUniquePlannerId(data),
    name: name.trim(),
    description: '',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const createTemplateDefinition = (
  data: PlannerData,
  templateId: string,
  name: string,
  position: number,
): BucketTemplateDefinition => {
  const timestamp = now();
  return {
    id: createUniquePlannerId(data),
    templateId,
    name: name.trim(),
    description: '',
    priority: 0,
    defaultActive: true,
    position,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const createBucketFromDefinition = (
  projectId: string,
  definition: BucketTemplateDefinition,
  id: string,
): Bucket => {
  const timestamp = now();
  return {
    id,
    projectId,
    name: definition.name,
    description: definition.description,
    templateDefinitionId: definition.id,
    priority: definition.priority,
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};


interface EditorState {
  task: PlannerTask | null;
  defaultBucketId: string | null;
}

type ConfirmDialogAction =
  | { type: 'delete-task'; taskId: string }
  | { type: 'delete-bucket'; bucketId: string }
  | { type: 'delete-project'; projectId: string };

interface ConfirmDialogState {
  title: string;
  targetLabel: string;
  detail?: string;
  confirmLabel: string;
  action: ConfirmDialogAction;
}

interface RenameDialogState {
  bucketId: string;
  initialName: string;
  value: string;
}

type ThemeMode = 'light' | 'dark';
type VisualMode = 'calm' | 'balanced' | 'energetic';
const BOARD_ZOOM_STORAGE_KEY = 'planner-buckets:board-zoom-index';
const THEME_STORAGE_KEY = 'planner-buckets:theme';
const VISUAL_MODE_STORAGE_KEY = 'planner-buckets:visual-mode';
const MIN_BOARD_ZOOM_INDEX = 0;
const MAX_BOARD_ZOOM_INDEX = 4;
const APP_NAME = 'Planner Buckets';
const APP_BANNER = 'Local-First Task Planning';
const APP_ICON_TEXT = 'PB';

export default function App() {
  const openAdvancedSectionsInTests = /jsdom/i.test(window.navigator.userAgent);
  const [initialLoadResult] = useState(() => loadPlannerDataV2FromLocalStorage());
  const { state, dispatch: dispatchPlanner, canUndo, canRedo, undo, redo } = usePlannerHistory<PlannerData, PlannerActionV2>(
    initialLoadResult.data,
    plannerReducerV2,
  );
  const [activeProjectId, setActiveProjectId] = useState(() => selectInitialProjectId(initialLoadResult.data.projects));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => initialLoadResult.data.templates[0]?.id ?? null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [bucketName, setBucketName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [exportScope, setExportScope] = useState<string>('all');
  const [showExportScopeMenu, setShowExportScopeMenu] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [renameDialogError, setRenameDialogError] = useState<string | null>(null);
  const [pendingRestoreData, setPendingRestoreData] = useState<PlannerData | null>(null);
  const [pendingUploadData, setPendingUploadData] = useState<PlannerData | null>(null);
  const [lastRestoreBackup, setLastRestoreBackup] = useState<PlannerData | null>(null);
  const [pendingBucketWarp, setPendingBucketWarp] = useState(false);
  const [highlightedBucketId, setHighlightedBucketId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedTaskBucketId, setHighlightedTaskBucketId] = useState<string | null>(null);
  const [uploadedTaskIds, setUploadedTaskIds] = useState<string[]>([]);
  const [pendingTaskSurge, setPendingTaskSurge] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(true);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskBucketName, setQuickTaskBucketName] = useState('');
  const [quickTaskBucketId, setQuickTaskBucketId] = useState<string | null>(null);
  const [boardBucketAddOpen, setBoardBucketAddOpen] = useState(false);
  const [boardBucketNameDraft, setBoardBucketNameDraft] = useState('');
  const [hideRestoreUndoCard, setHideRestoreUndoCard] = useState(false);
  const [isRestoreUndoClosing, setIsRestoreUndoClosing] = useState(false);
  const [dataActionMessage, setDataActionMessage] = useState<string | null>(initialLoadResult.warning);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSearchStatus, setShowSearchStatus] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  });
  const [visualMode, setVisualMode] = useState<VisualMode>(() => {
    const stored = localStorage.getItem(VISUAL_MODE_STORAGE_KEY);
    if (stored === 'calm' || stored === 'energetic' || stored === 'balanced') {
      return stored;
    }
    return 'balanced';
  });
  const [boardZoomIndex, setBoardZoomIndex] = useState(() => {
    const stored = Number(localStorage.getItem(BOARD_ZOOM_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= MIN_BOARD_ZOOM_INDEX && stored <= MAX_BOARD_ZOOM_INDEX) {
      return stored;
    }
    return 3;
  });
  const [isSidepanelOpen, setIsSidepanelOpen] = useState(false);
  const [isSidepanelLocked, setIsSidepanelLocked] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskIds, setDraggedTaskIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectionAnchorTaskId, setSelectionAnchorTaskId] = useState<string | null>(null);
  const [taskClipboard, setTaskClipboard] = useState<Array<Pick<PlannerTask, 'title' | 'description'>>>([]);
  const [activePasteBucketId, setActivePasteBucketId] = useState<string | null>(null);
  const [draggedBucketId, setDraggedBucketId] = useState<string | null>(null);
  const [activeBucketDropIndex, setActiveBucketDropIndex] = useState<number | null>(null);
  const [settledBucketDropIndex, setSettledBucketDropIndex] = useState<number | null>(null);
  const [settledBucketId, setSettledBucketId] = useState<string | null>(null);
  const [settledBucketFrom, setSettledBucketFrom] = useState<'left' | 'right' | null>(null);
  const [status, setStatus] = useState('Saved locally');
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const quickTaskInputRef = useRef<HTMLInputElement>(null);
  const quickTaskBucketInputRef = useRef<HTMLInputElement>(null);
  const quickTaskShellRef = useRef<HTMLDivElement>(null);
  const boardBucketInputRef = useRef<HTMLInputElement>(null);
  const sidepanelRef = useRef<HTMLElement>(null);
  const sidepanelToggleGroupRef = useRef<HTMLDivElement>(null);
  const sidepanelToggleButtonRef = useRef<HTMLButtonElement>(null);
  const sidepanelLockButtonRef = useRef<HTMLButtonElement>(null);
  const boardFrameRef = useRef<HTMLDivElement>(null);
  const boardDragPointerXRef = useRef<number | null>(null);
  const boardAutoscrollFrameRef = useRef<number | null>(null);
  const bucketElementRefs = useRef<Record<string, HTMLElement | null>>({});
  const restoreConfirmRef = useRef<HTMLDivElement>(null);
  const uploadConfirmRef = useRef<HTMLDivElement>(null);
  const exportScopeMenuRef = useRef<HTMLDivElement>(null);
  const restoreUndoCloseTimeoutRef = useRef<number | null>(null);
  const bucketHighlightTimeoutRef = useRef<number | null>(null);
  const taskSurgeTimeoutRef = useRef<number | null>(null);
  const uploadHaloTimeoutRef = useRef<number | null>(null);
  const bucketDropSettleTimeoutRef = useRef<number | null>(null);
  const hideSearchStatusTimeoutRef = useRef<number | null>(null);
  const sidepanelCloseTimeoutRef = useRef<number | null>(null);
  const sidepanelOpenTimeoutRef = useRef<number | null>(null);
  const sidepanelHoveringRef = useRef(false);
  const sidepanelToggleHoveringRef = useRef(false);
  const sidepanelLockHoveringRef = useRef(false);
  const sidepanelToggleLabel = isSidepanelOpen ? 'Hide controls' : 'Show controls';
  const sidepanelToggleIcon = isSidepanelOpen ? '▴' : '▾';
  const sidepanelLockIcon = isSidepanelLocked ? '🔒' : '🔓';
  const sidepanelLockLabel = isSidepanelLocked
    ? 'Enable automatic controls opening'
    : 'Disable automatic controls opening';
  const sidepanelToggleTitle = isSidepanelOpen
    ? 'Click to collapse controls'
    : 'Click to open controls';

  const cancelBoardEdgeAutoscroll = () => {
    boardDragPointerXRef.current = null;
    if (boardAutoscrollFrameRef.current !== null) {
      window.cancelAnimationFrame(boardAutoscrollFrameRef.current);
      boardAutoscrollFrameRef.current = null;
    }
  };

  const clearActiveDrag = () => {
    document.querySelectorAll('.bucket-drag-preview').forEach((preview) => preview.remove());
    setDraggedTaskId(null);
    setDraggedTaskIds([]);
    setDraggedBucketId(null);
    setActiveBucketDropIndex(null);
    cancelBoardEdgeAutoscroll();
  };

  const updateBoardDragPointer = (event: ReactDragEvent<HTMLElement>) => {
    if (!draggedTaskId && !draggedBucketId) return;
    boardDragPointerXRef.current = event.clientX;
  };

  const handleBoardDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    boardDragPointerXRef.current = null;
  };

  const activeProject = useMemo(
    () => state.projects.find((project) => project.id === activeProjectId)
      ?? state.projects.find((project) => project.pinned)
      ?? state.projects[0],
    [activeProjectId, state.projects],
  );
  const effectiveActiveProjectId = activeProject?.id ?? '';
  const activeBuckets = useMemo(
    () => state.buckets.filter((bucket) => bucket.projectId === effectiveActiveProjectId),
    [effectiveActiveProjectId, state.buckets],
  );
  const activeTasks = useMemo(
    () => state.tasks.filter((task) => task.projectId === effectiveActiveProjectId),
    [effectiveActiveProjectId, state.tasks],
  );
  const globalBucketGroups = useMemo(() => getGlobalBucketView(state), [state]);

  useEffect(() => {
    if (state.projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(selectInitialProjectId(state.projects));
  }, [activeProjectId, state.projects]);

  useEffect(() => {
    if (selectedTemplateId && state.templates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId(state.templates[0]?.id ?? null);
  }, [selectedTemplateId, state.templates]);

  useEffect(() => {
    try {
      savePlannerDataV2ToLocalStorage(state);
      setStatus('Saved locally');
    } catch {
      setStatus('Could not save locally');
    }
  }, [state]);

  useEffect(() => {
    if (!exportNotice) return;

    const timeoutId = window.setTimeout(() => {
      setExportNotice(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [exportNotice]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-visual-mode', visualMode);
    localStorage.setItem(VISUAL_MODE_STORAGE_KEY, visualMode);
  }, [visualMode]);

  useEffect(() => {
    localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(boardZoomIndex));
  }, [boardZoomIndex]);

  useEffect(() => {
    return () => {
      if (hideSearchStatusTimeoutRef.current !== null) {
        window.clearTimeout(hideSearchStatusTimeoutRef.current);
      }
      if (restoreUndoCloseTimeoutRef.current !== null) {
        window.clearTimeout(restoreUndoCloseTimeoutRef.current);
      }
      if (bucketHighlightTimeoutRef.current !== null) {
        window.clearTimeout(bucketHighlightTimeoutRef.current);
      }
      if (taskSurgeTimeoutRef.current !== null) {
        window.clearTimeout(taskSurgeTimeoutRef.current);
      }
      if (uploadHaloTimeoutRef.current !== null) {
        window.clearTimeout(uploadHaloTimeoutRef.current);
      }
      if (bucketDropSettleTimeoutRef.current !== null) {
        window.clearTimeout(bucketDropSettleTimeoutRef.current);
      }
      if (sidepanelCloseTimeoutRef.current !== null) {
        window.clearTimeout(sidepanelCloseTimeoutRef.current);
      }
      if (sidepanelOpenTimeoutRef.current !== null) {
        window.clearTimeout(sidepanelOpenTimeoutRef.current);
      }
      cancelBoardEdgeAutoscroll();
    };
  }, []);

  const tasksByBucket = useMemo(() => {
    const map = new Map<string | null, PlannerTask[]>();
    map.set(null, []);
    activeBuckets.forEach((bucket) => map.set(bucket.id, []));

    activeTasks
      .filter((task) => !task.archivedAt)
      .forEach((task) => {
        const key = map.has(task.bucketId) ? task.bucketId : null;
        map.get(key)?.push(task);
      });

    map.forEach((tasks) => {
      tasks.sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        return 0;
      });
    });

    return map;
  }, [activeBuckets, activeTasks]);

  const saveTask = (draft: TaskDraft) => {
    if (!editor || !effectiveActiveProjectId) return;

    const updatedAt = now();

    if (editor.task) {
      dispatchPlanner({ type: 'UPDATE_TASK', projectId: editor.task.projectId, taskId: editor.task.id, draft, updatedAt });
    } else {
      dispatchPlanner({ type: 'ADD_TASK', task: createTask(effectiveActiveProjectId, draft, createId(), updatedAt) });
    }
    setEditor(null);
  };

  const filteredTasksByBucket = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = new Map<string | null, PlannerTask[]>();

    tasksByBucket.forEach((tasks, key) => {
      filtered.set(
        key,
        tasks.filter((task) => {
          if (!showCompleted && task.completed) return false;
          if (!query) return true;
          return (
            task.title.toLowerCase().includes(query) ||
            task.description.toLowerCase().includes(query)
          );
        }),
      );
    });

    return filtered;
  }, [tasksByBucket, searchQuery, showCompleted]);

  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);

  const orderedVisibleTaskIds = useMemo(() => {
    const ordered: string[] = [];
    (filteredTasksByBucket.get(null) ?? []).forEach((task) => ordered.push(task.id));
    activeBuckets.forEach((bucket) => {
      (filteredTasksByBucket.get(bucket.id) ?? []).forEach((task) => ordered.push(task.id));
    });
    return ordered;
  }, [activeBuckets, filteredTasksByBucket]);

  const visibleTaskIndexById = useMemo(() => {
    const map = new Map<string, number>();
    orderedVisibleTaskIds.forEach((taskId, index) => {
      map.set(taskId, index);
    });
    return map;
  }, [orderedVisibleTaskIds]);

  useEffect(() => {
    const activeTaskIdSet = new Set(
      activeTasks
        .filter((task) => !task.archivedAt)
        .map((task) => task.id),
    );

    setSelectedTaskIds((current) => current.filter((taskId) => activeTaskIdSet.has(taskId)));
    if (selectionAnchorTaskId && !activeTaskIdSet.has(selectionAnchorTaskId)) {
      setSelectionAnchorTaskId(null);
    }
  }, [activeTasks, selectionAnchorTaskId]);

  const stats = useMemo(() => {
    const archived = activeTasks.filter((task) => task.archivedAt !== null).length;
    const activeTotal = activeTasks.length - archived;
    const completed = activeTasks.filter((task) => task.completed && !task.archivedAt).length;
    const open = activeTotal - completed;
    const visible = Array.from(filteredTasksByBucket.values()).reduce(
      (count, tasks) => count + tasks.length,
      0,
    );
    return { activeTotal, archived, completed, open, visible };
  }, [activeTasks, filteredTasksByBucket]);

  const archivedTasks = useMemo(
    () => activeTasks.filter((task) => task.archivedAt !== null),
    [activeTasks],
  );

  const bucketNameById = useMemo(() => {
    const map = new Map<string, string>();
    activeBuckets.forEach((bucket) => map.set(bucket.id, bucket.name));
    return map;
  }, [activeBuckets]);

  const bucketIdByNormalizedName = useMemo(() => {
    const map = new Map<string, string>();
    activeBuckets.forEach((bucket) => map.set(normalizeBucketName(bucket.name), bucket.id));
    return map;
  }, [activeBuckets]);

  const selectProject = (projectId: string) => {
    if (!state.projects.some((project) => project.id === projectId)) return;
    setActiveProjectId(projectId);
    setSelectedTaskIds([]);
    setSelectionAnchorTaskId(null);
    setActivePasteBucketId(null);
    setEditor(null);
    setSearchQuery('');
  };

  const addProject = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const project = createProject(trimmedName);
    dispatchPlanner({ type: 'ADD_PROJECT', project });
    setActiveProjectId(project.id);
  };

  const renameProject = (projectId: string, name: string) => {
    dispatchPlanner({ type: 'RENAME_PROJECT', projectId, name, updatedAt: now() });
  };

  const updateProjectDescription = (projectId: string, description: string) => {
    dispatchPlanner({ type: 'UPDATE_PROJECT_DESCRIPTION', projectId, description, updatedAt: now() });
  };

  const toggleProjectPin = (projectId: string) => {
    dispatchPlanner({ type: 'TOGGLE_PROJECT_PIN', projectId, updatedAt: now() });
  };

  const moveProjectByOffset = (projectId: string, offset: -1 | 1) => {
    const sourceIndex = state.projects.findIndex((project) => project.id === projectId);
    if (sourceIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(state.projects.length - 1, sourceIndex + offset));
    if (targetIndex === sourceIndex) return;
    dispatchPlanner({ type: 'MOVE_PROJECT', projectId, targetIndex });
  };

  const deleteProject = (project: Project) => {
    setConfirmDialog({
      title: 'Delete project',
      targetLabel: project.name,
      detail: 'Buckets and tasks in this project will be deleted together.',
      confirmLabel: 'Delete project',
      action: { type: 'delete-project', projectId: project.id },
    });
  };

  const getDefinitionsForTemplate = (templateId: string) => state.templateDefinitions
    .filter((definition) => definition.templateId === templateId)
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));

  const templateDefinitionIsReferenced = (definitionId: string) => (
    state.buckets.some((bucket) => bucket.templateDefinitionId === definitionId)
  );

  const templateHasReferencedDefinitions = (templateId: string) => {
    const definitionIds = new Set(getDefinitionsForTemplate(templateId).map((definition) => definition.id));
    return state.buckets.some((bucket) => (
      bucket.templateDefinitionId !== null && definitionIds.has(bucket.templateDefinitionId)
    ));
  };

  const addTemplate = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const template = createTemplate(state, trimmedName);
    dispatchPlanner({ type: 'ADD_TEMPLATE', template });
    setSelectedTemplateId(template.id);
    setTemplateMessage(`Created template ${template.name}.`);
  };

  const renameTemplate = (templateId: string, name: string) => {
    dispatchPlanner({ type: 'RENAME_TEMPLATE', templateId, name, updatedAt: now() });
  };

  const updateTemplateDescription = (templateId: string, description: string) => {
    dispatchPlanner({ type: 'UPDATE_TEMPLATE_DESCRIPTION', templateId, description, updatedAt: now() });
  };

  const setTemplateActive = (templateId: string, active: boolean) => {
    dispatchPlanner({ type: 'SET_TEMPLATE_ACTIVE', templateId, active, updatedAt: now() });
    setTemplateMessage(active ? 'Template activated.' : 'Template deactivated. Existing project buckets were unchanged.');
  };

  const moveTemplateByOffset = (templateId: string, offset: -1 | 1) => {
    const sourceIndex = state.templates.findIndex((template) => template.id === templateId);
    if (sourceIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(state.templates.length - 1, sourceIndex + offset));
    dispatchPlanner({ type: 'MOVE_TEMPLATE', templateId, targetIndex });
  };

  const deleteTemplate = (templateId: string) => {
    if (templateHasReferencedDefinitions(templateId)) {
      setTemplateMessage('Template deletion blocked because project buckets still reference one or more definitions.');
      return;
    }
    dispatchPlanner({ type: 'DELETE_TEMPLATE', templateId });
    setTemplateMessage('Template deleted.');
  };

  const addTemplateDefinition = (templateId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const existingDefinitions = getDefinitionsForTemplate(templateId);
    const nextPosition = existingDefinitions.length === 0
      ? 0
      : Math.max(...existingDefinitions.map((definition) => definition.position)) + 1;
    dispatchPlanner({
      type: 'ADD_TEMPLATE_DEFINITION',
      definition: createTemplateDefinition(state, templateId, trimmedName, nextPosition),
    });
    setTemplateMessage('Definition added.');
  };

  const renameTemplateDefinition = (definitionId: string, name: string) => {
    dispatchPlanner({ type: 'RENAME_TEMPLATE_DEFINITION', definitionId, name, updatedAt: now() });
  };

  const updateTemplateDefinitionDescription = (definitionId: string, description: string) => {
    dispatchPlanner({ type: 'UPDATE_TEMPLATE_DEFINITION_DESCRIPTION', definitionId, description, updatedAt: now() });
  };

  const setTemplateDefinitionDefaultActive = (definitionId: string, defaultActive: boolean) => {
    dispatchPlanner({ type: 'SET_TEMPLATE_DEFINITION_DEFAULT_ACTIVE', definitionId, defaultActive, updatedAt: now() });
    setTemplateMessage('Definition default changed. Existing project buckets were unchanged.');
  };

  const moveTemplateDefinitionByOffset = (definitionId: string, offset: -1 | 1) => {
    const definition = state.templateDefinitions.find((item) => item.id === definitionId);
    if (!definition) return;
    const definitions = getDefinitionsForTemplate(definition.templateId);
    const sourceIndex = definitions.findIndex((item) => item.id === definitionId);
    if (sourceIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(definitions.length - 1, sourceIndex + offset));
    dispatchPlanner({ type: 'MOVE_TEMPLATE_DEFINITION', definitionId, targetIndex, updatedAt: now() });
  };

  const deleteTemplateDefinition = (definitionId: string) => {
    if (templateDefinitionIsReferenced(definitionId)) {
      setTemplateMessage('Definition deletion blocked because project buckets still reference it.');
      return;
    }
    dispatchPlanner({ type: 'DELETE_TEMPLATE_DEFINITION', definitionId });
    setTemplateMessage('Definition deleted.');
  };

  const applyTemplateToActiveProject = (templateId: string) => {
    if (!effectiveActiveProjectId) return;
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) return;
    if (!template.active) {
      setTemplateMessage('Inactive templates cannot be applied.');
      return;
    }

    const eligibleDefinitions = getDefinitionsForTemplate(templateId).filter((definition) => definition.defaultActive);

    if (eligibleDefinitions.length === 0) {
      setTemplateMessage('No buckets were created because this template has no default-active definitions.');
      return;
    }

    const missingDefinitions = eligibleDefinitions.filter((definition) => (
      !state.buckets.some((bucket) => (
        bucket.projectId === effectiveActiveProjectId && bucket.templateDefinitionId === definition.id
      ))
    ));

    if (missingDefinitions.length === 0) {
      setTemplateMessage('No new buckets were created; all active definitions already exist in this project.');
      dispatchPlanner({ type: 'APPLY_TEMPLATE', projectId: effectiveActiveProjectId, templateId, buckets: [] });
      return;
    }

    const reservedIds = new Set<string>();
    const buckets = missingDefinitions.map((definition) => (
      createBucketFromDefinition(effectiveActiveProjectId, definition, createUniquePlannerId(state, reservedIds))
    ));

    dispatchPlanner({ type: 'APPLY_TEMPLATE', projectId: effectiveActiveProjectId, templateId, buckets });
    setPendingBucketWarp(true);
    setTemplateMessage(
      missingDefinitions.length === eligibleDefinitions.length
        ? `Applied ${missingDefinitions.length} bucket definition${missingDefinitions.length === 1 ? '' : 's'} to ${activeProject.name}.`
        : `Applied ${missingDefinitions.length} of ${eligibleDefinitions.length} eligible bucket definitions to ${activeProject.name}.`,
    );
  };

  const addBucket = () => {
    const name = bucketName.trim();
    if (!name || !effectiveActiveProjectId) return;
    dispatchPlanner({ type: 'ADD_BUCKET', bucket: createBucket(effectiveActiveProjectId, name) });
    setBucketName('');
    setPendingBucketWarp(true);
  };

  const addTaskFromBoard = (bucketId: string | null, title: string) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !effectiveActiveProjectId) return;
    dispatchPlanner({
      type: 'ADD_TASK',
      task: createTask(effectiveActiveProjectId, {
        title: normalizedTitle,
        description: '',
        bucketId,
      }),
    });
    setPendingTaskSurge(true);
  };

  const openBoardBucketAdd = () => {
    setBoardBucketAddOpen(true);
    window.requestAnimationFrame(() => {
      boardBucketInputRef.current?.focus();
    });
  };

  const submitBoardBucketAdd = () => {
    const name = boardBucketNameDraft.trim();
    if (!name || !effectiveActiveProjectId) return;
    dispatchPlanner({ type: 'ADD_BUCKET', bucket: createBucket(effectiveActiveProjectId, name) });
    setBoardBucketNameDraft('');
    setPendingBucketWarp(true);
    window.requestAnimationFrame(() => {
      boardBucketInputRef.current?.focus();
    });
  };

  const handleBoardBucketKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitBoardBucketAdd();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setBoardBucketNameDraft('');
      setBoardBucketAddOpen(false);
    }
  };

  const bucketHotkeyTargets = useMemo(
    () => [null, ...activeBuckets.map((bucket) => bucket.id)],
    [activeBuckets],
  );

  const openQuickTaskComposer = (defaultBucketId: string | null = null) => {
    setQuickTaskOpen(true);
    setQuickTaskBucketId(defaultBucketId);
    setQuickTaskBucketName(defaultBucketId ? bucketNameById.get(defaultBucketId) ?? '' : '');
    window.requestAnimationFrame(() => {
      quickTaskInputRef.current?.focus();
    });
  };

  const closeQuickTaskComposer = () => {
    setQuickTaskOpen(false);
    setQuickTaskTitle('');
    setQuickTaskBucketName('');
    setQuickTaskBucketId(null);
  };

  const submitQuickTask = () => {
    const title = quickTaskTitle.trim();
    if (!title || !effectiveActiveProjectId) return;

    const candidateBucketName = quickTaskBucketName.trim();
    const hasValidBucketName = candidateBucketName
      ? QUICK_TASK_BUCKET_NAME_PATTERN.test(candidateBucketName)
      : false;

    let targetBucketId: string | null = null;
    let createdBucketName: string | null = null;

    if (candidateBucketName && hasValidBucketName) {
      const existingBucketId = bucketIdByNormalizedName.get(normalizeBucketName(candidateBucketName)) ?? null;
      if (existingBucketId) {
        targetBucketId = existingBucketId;
      } else {
        const newBucketId = createId();
        dispatchPlanner({ type: 'ADD_BUCKET', bucket: createBucket(effectiveActiveProjectId, candidateBucketName, newBucketId) });
        targetBucketId = newBucketId;
        createdBucketName = candidateBucketName;
        setPendingBucketWarp(true);
      }
    }

    dispatchPlanner({
      type: 'ADD_TASK',
      task: createTask(effectiveActiveProjectId, {
        title,
        description: '',
        bucketId: targetBucketId,
      }),
    });

    setQuickTaskTitle('');
    if (targetBucketId) {
      const normalized = normalizeBucketName(createdBucketName ?? candidateBucketName);
      const stableName = activeBuckets.find((bucket) => normalizeBucketName(bucket.name) === normalized)?.name
        ?? createdBucketName
        ?? candidateBucketName;
      setQuickTaskBucketId(targetBucketId);
      setQuickTaskBucketName(stableName);
    } else {
      setQuickTaskBucketId(null);
      setQuickTaskBucketName('');
    }
    setPendingTaskSurge(true);
    quickTaskInputRef.current?.focus();
  };

  const cycleQuickTaskBucket = () => {
    setQuickTaskBucketId((current) => {
      const currentIndex = Math.max(0, bucketHotkeyTargets.findIndex((value) => value === current));
      const nextIndex = (currentIndex + 1) % bucketHotkeyTargets.length;
      const nextBucketId = bucketHotkeyTargets[nextIndex] ?? null;
      setQuickTaskBucketName(nextBucketId ? bucketNameById.get(nextBucketId) ?? '' : '');
      return nextBucketId;
    });
  };

  const quickTaskBucketSuggestion = useMemo(() => {
    const typedValue = quickTaskBucketName.trim();
    if (!typedValue) return null;

    const typedLower = typedValue.toLowerCase();
    const match = activeBuckets.find((bucket) => {
      const name = bucket.name.trim();
      const lower = name.toLowerCase();
      return lower.startsWith(typedLower) && lower !== typedLower;
    });

    return match?.name ?? null;
  }, [quickTaskBucketName, activeBuckets]);

  const quickTaskBucketSuggestionSuffix = useMemo(() => {
    if (!quickTaskBucketSuggestion) return '';
    const typedValue = quickTaskBucketName.trim();
    if (!typedValue) return '';
    return quickTaskBucketSuggestion.slice(typedValue.length);
  }, [quickTaskBucketName, quickTaskBucketSuggestion]);

  const handleQuickTaskTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickTaskComposer();
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      const digit = Number(event.key);
      const bucketTarget = digit === 0 ? null : activeBuckets[digit - 1]?.id;
      if (digit === 0 || bucketTarget) {
        event.preventDefault();
        setQuickTaskBucketId(bucketTarget ?? null);
        setQuickTaskBucketName(bucketTarget ? bucketNameById.get(bucketTarget) ?? '' : '');
      }
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitQuickTask();
  };

  const handleQuickTaskBucketKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickTaskComposer();
      return;
    }

    if (event.key === 'ArrowRight' && quickTaskBucketSuggestion) {
      const input = event.currentTarget;
      const cursorAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (cursorAtEnd) {
        event.preventDefault();
        setQuickTaskBucketName(quickTaskBucketSuggestion);
        const bucketId = bucketIdByNormalizedName.get(normalizeBucketName(quickTaskBucketSuggestion)) ?? null;
        setQuickTaskBucketId(bucketId);
      }
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    submitQuickTask();
  };

  const registerBucketElement = (bucketId: string, element: HTMLElement | null) => {
    bucketElementRefs.current[bucketId] = element;
  };

  const renameBucket = (bucket: Bucket) => {
    setRenameDialog({
      bucketId: bucket.id,
      initialName: bucket.name,
      value: bucket.name,
    });
    setRenameDialogError(null);
  };

  const deleteBucket = (bucket: Bucket) => {
    setConfirmDialog({
      title: 'Delete bucket',
      targetLabel: bucket.name,
      detail: 'Tasks in this bucket will move to Unassigned.',
      confirmLabel: 'Delete bucket',
      action: { type: 'delete-bucket', bucketId: bucket.id },
    });
  };

  const toggleBucketPin = (bucket: Bucket) => {
    dispatchPlanner({ type: 'TOGGLE_BUCKET_PIN', projectId: bucket.projectId, bucketId: bucket.id, updatedAt: now() });
  };

  const moveBucketByOffset = (bucketId: string, offset: -1 | 1) => {
    const sourceIndex = activeBuckets.findIndex((bucket) => bucket.id === bucketId);
    if (sourceIndex < 0) return;
    const targetBoundary = sourceIndex + (offset < 0 ? -1 : 2);
    const targetIndex = Math.max(0, Math.min(activeBuckets.length, targetBoundary));
    if (targetIndex === sourceIndex) return;
    dispatchPlanner({ type: 'MOVE_BUCKET', projectId: effectiveActiveProjectId, bucketId, targetIndex });
  };

  const dropBucketAt = (targetIndex: number) => {
    if (!draggedBucketId || !effectiveActiveProjectId) return;
    const sourceIndex = activeBuckets.findIndex((bucket) => bucket.id === draggedBucketId);
    const settledFrom = sourceIndex >= 0 && targetIndex < sourceIndex ? 'right' : 'left';
    dispatchPlanner({ type: 'MOVE_BUCKET', projectId: effectiveActiveProjectId, bucketId: draggedBucketId, targetIndex });
    setSettledBucketDropIndex(targetIndex);
    setSettledBucketId(draggedBucketId);
    setSettledBucketFrom(settledFrom);
    const clearSettledBucketState = () => {
      setSettledBucketDropIndex(null);
      setSettledBucketId(null);
      setSettledBucketFrom(null);
      bucketDropSettleTimeoutRef.current = null;
    };
    if (bucketDropSettleTimeoutRef.current !== null) {
      window.clearTimeout(bucketDropSettleTimeoutRef.current);
    }
    bucketDropSettleTimeoutRef.current = window.setTimeout(() => {
      clearSettledBucketState();
    }, DROP_SETTLE_DURATION_MS);
    clearActiveDrag();
  };

  const deleteTask = (task: PlannerTask) => {
    setConfirmDialog({
      title: 'Delete task',
      targetLabel: task.title,
      confirmLabel: 'Delete task',
      action: { type: 'delete-task', taskId: task.id },
    });
  };

  const confirmDialogAction = () => {
    if (!confirmDialog) return;
    if (confirmDialog.action.type === 'delete-task') {
      dispatchPlanner({ type: 'DELETE_TASK', projectId: effectiveActiveProjectId, taskId: confirmDialog.action.taskId });
    }
    if (confirmDialog.action.type === 'delete-bucket') {
      dispatchPlanner({ type: 'DELETE_BUCKET', projectId: effectiveActiveProjectId, bucketId: confirmDialog.action.bucketId, updatedAt: now() });
    }
    if (confirmDialog.action.type === 'delete-project') {
      const fallbackProjectId = activeProjectId === confirmDialog.action.projectId
        ? selectNearestProjectIdAfterDeletion(state.projects, confirmDialog.action.projectId)
        : activeProjectId;
      dispatchPlanner({ type: 'DELETE_PROJECT', projectId: confirmDialog.action.projectId });
      setActiveProjectId(fallbackProjectId);
      setSelectedTaskIds([]);
      setSelectionAnchorTaskId(null);
      setActivePasteBucketId(null);
    }
    setConfirmDialog(null);
  };

  const submitRenameDialog = () => {
    if (!renameDialog) return;
    const name = renameDialog.value.trim();
    if (!name) {
      setRenameDialogError('Bucket name cannot be empty.');
      return;
    }
    if (name !== renameDialog.initialName) {
      dispatchPlanner({ type: 'RENAME_BUCKET', projectId: effectiveActiveProjectId, bucketId: renameDialog.bucketId, name, updatedAt: now() });
    }
    setRenameDialog(null);
    setRenameDialogError(null);
  };

  const archiveCompletedTasks = () => {
    if (stats.completed === 0) return;
    setShowArchiveConfirm(true);
  };

  const confirmArchiveCompletedTasks = () => {
    dispatchPlanner({ type: 'ARCHIVE_COMPLETED_TASKS', projectId: effectiveActiveProjectId, archivedAt: now() });
    setShowArchiveConfirm(false);
  };

  const cancelArchiveCompletedTasks = () => {
    setShowArchiveConfirm(false);
  };

  const exportData = () => {
    if (!activeProject) return;
    setShowExportScopeMenu(false);
    let dataToExport: PlannerData = state;
    if (exportScope === 'unassigned') {
      dataToExport = {
        ...state,
        projects: [activeProject],
        buckets: [],
        tasks: activeTasks.filter((task) => task.bucketId === null),
        templates: [],
        templateDefinitions: [],
      };
    } else if (exportScope.startsWith('bucket:')) {
      const bucketId = exportScope.slice('bucket:'.length);
      const bucket = activeBuckets.find((item) => item.id === bucketId) ?? null;

      // Collect template/definition for template-derived buckets
      const templates: BucketTemplate[] = [];
      const templateDefinitions: BucketTemplateDefinition[] = [];

      if (bucket && bucket.templateDefinitionId !== null) {
        const definition = state.templateDefinitions.find((d) => d.id === bucket.templateDefinitionId);
        if (definition) {
          templateDefinitions.push(definition);
          const template = state.templates.find((t) => t.id === definition.templateId);
          if (template) {
            templates.push(template);
          }
        }
      }

      dataToExport = {
        ...state,
        projects: [activeProject],
        buckets: bucket ? [bucket] : [],
        tasks: activeTasks.filter((task) => task.bucketId === bucketId),
        templates,
        templateDefinitions,
      };
    }

    if (!isValidPlannerDataV2(dataToExport)) {
      setDataActionMessage('Current planner data could not be validated for export.');
      return;
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bsp-planner-${new Date().toISOString().slice(0, 10)}.json`;
    link.style.display = 'none';
    document.body.appendChild(link);

    try {
      link.click();
      setDataActionMessage(null);
      setExportNotice(`Export started — check your default Downloads folder for ${link.download}.`);
    } catch {
      setExportNotice(null);
      link.remove();
      URL.revokeObjectURL(url);
      setDataActionMessage('Export could not be started.');
      return;
    }

    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const readPlannerDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return null;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = coercePlannerDataToV2(parsed);
      setDataActionMessage(null);
      return result.data;
    } catch (error) {
      if (error instanceof SyntaxError) {
        setDataActionMessage('Selected file could not be read as JSON.');
        return null;
      }
      setDataActionMessage(`Selected file is not a valid ${APP_NAME} export.`);
      return null;
    }
  };

  const restoreDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const parsedData = await readPlannerDataFromFile(event);
    if (!parsedData) return;
    setPendingUploadData(null);
    setPendingRestoreData(parsedData);
  };

  const mergeDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const parsedData = await readPlannerDataFromFile(event);
    if (!parsedData) return;
    setPendingRestoreData(null);
    setPendingUploadData(parsedData);
  };

  const confirmRestoreData = () => {
    if (!pendingRestoreData) return;
    setLastRestoreBackup(state);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
    dispatchPlanner({ type: 'REPLACE_DATA', data: pendingRestoreData });
    setPendingRestoreData(null);
    setDataActionMessage(null);
  };

  const confirmUploadData = () => {
    if (!pendingUploadData || !effectiveActiveProjectId) return;
    const mergedUpload = mergeUploadedPlannerDataV2(state, pendingUploadData, { targetProjectId: effectiveActiveProjectId });
    dispatchPlanner({ type: 'REPLACE_DATA', data: mergedUpload.data });
    if (uploadHaloTimeoutRef.current !== null) {
      window.clearTimeout(uploadHaloTimeoutRef.current);
    }
    setUploadedTaskIds((current) => Array.from(new Set([...current, ...mergedUpload.uploadedTaskIds])));
    uploadHaloTimeoutRef.current = window.setTimeout(() => {
      setUploadedTaskIds([]);
      uploadHaloTimeoutRef.current = null;
    }, UPLOAD_HALO_DURATION_MS);
    setPendingUploadData(null);
    setDataActionMessage(
      `Uploaded ${mergedUpload.uploadedTaskIds.length} task(s); merged into ${mergedUpload.mergedIntoExistingBucketCount} existing bucket(s); created ${mergedUpload.createdBucketCount} bucket(s); skipped ${mergedUpload.skippedDuplicateCount} duplicate task(s).`,
    );
  };

  const undoRestoreData = () => {
    if (!lastRestoreBackup) return;
    dispatchPlanner({ type: 'REPLACE_DATA', data: lastRestoreBackup });
    setLastRestoreBackup(null);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
    setDataActionMessage(null);
  };

  const dismissRestoreUndoCard = () => {
    if (isRestoreUndoClosing) return;
    setIsRestoreUndoClosing(true);
    if (restoreUndoCloseTimeoutRef.current !== null) {
      window.clearTimeout(restoreUndoCloseTimeoutRef.current);
    }
    restoreUndoCloseTimeoutRef.current = window.setTimeout(() => {
      setHideRestoreUndoCard(true);
      setIsRestoreUndoClosing(false);
      restoreUndoCloseTimeoutRef.current = null;
    }, 420);
  };

  const pendingRestoreSummary = pendingRestoreData
    ? `${pendingRestoreData.tasks.length} task(s) and ${pendingRestoreData.buckets.length} bucket(s)`
    : '';
  const pendingUploadSummary = pendingUploadData
    ? `${pendingUploadData.tasks.length} task(s) and ${pendingUploadData.buckets.length} bucket(s)`
    : '';
  const exportScopeOptionCount = 2 + activeBuckets.length;

  useEffect(() => {
    if (exportScope.startsWith('bucket:')) {
      const bucketId = exportScope.slice('bucket:'.length);
      const exists = activeBuckets.some((bucket) => bucket.id === bucketId);
      if (!exists) {
        setExportScope('all');
      }
    }
  }, [activeBuckets, exportScope]);

  const clearSearchStatusTimer = () => {
    if (hideSearchStatusTimeoutRef.current !== null) {
      window.clearTimeout(hideSearchStatusTimeoutRef.current);
      hideSearchStatusTimeoutRef.current = null;
    }
  };

  const scheduleSearchStatusHide = (delayMs = 700) => {
    clearSearchStatusTimer();
    hideSearchStatusTimeoutRef.current = window.setTimeout(() => {
      setShowSearchStatus(false);
      hideSearchStatusTimeoutRef.current = null;
    }, delayMs);
  };

  const showTemporaryStatus = (message: string) => {
    setStatus(message);
    setShowSearchStatus(true);
    scheduleSearchStatusHide(1600);
  };

  const applyTaskSelection = (
    taskId: string,
    options: {
      shift: boolean;
      toggle: boolean;
    },
  ) => {
    if (options.shift && selectionAnchorTaskId) {
      const anchorIndex = visibleTaskIndexById.get(selectionAnchorTaskId);
      const targetIndex = visibleTaskIndexById.get(taskId);
      if (anchorIndex !== undefined && targetIndex !== undefined) {
        const [start, end] = anchorIndex < targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
        const rangeIds = orderedVisibleTaskIds.slice(start, end + 1);
        setSelectedTaskIds((current) => {
          if (options.toggle) {
            return Array.from(new Set([...current, ...rangeIds]));
          }
          return rangeIds;
        });
        setActivePasteBucketId(activeTasks.find((task) => task.id === taskId)?.bucketId ?? null);
        return;
      }
    }

    if (options.toggle) {
      setSelectedTaskIds((current) => {
        const exists = current.includes(taskId);
        if (exists) {
          return current.filter((item) => item !== taskId);
        }
        return [...current, taskId];
      });
      setSelectionAnchorTaskId(taskId);
      setActivePasteBucketId(activeTasks.find((task) => task.id === taskId)?.bucketId ?? null);
      return;
    }

    setSelectedTaskIds([taskId]);
    setSelectionAnchorTaskId(taskId);
    setActivePasteBucketId(activeTasks.find((task) => task.id === taskId)?.bucketId ?? null);
  };

  const handleTaskCardSelection = (taskId: string, event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, label, textarea, select, a')) return;

    applyTaskSelection(taskId, {
      shift: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    });
  };

  const setClipboardFromTasks = (tasks: PlannerTask[]) => {
    setTaskClipboard(
      tasks.map((task) => ({
        title: task.title,
        description: task.description,
      })),
    );
  };

  const copyTaskToClipboard = (task: PlannerTask, bucketName: string) => {
    setClipboardFromTasks([task]);
    setSelectedTaskIds([task.id]);
    setSelectionAnchorTaskId(task.id);
    setActivePasteBucketId(task.bucketId);

    void (async () => {
      try {
        await copyTextToClipboard(formatTaskForSingleCopy(task, bucketName));
        showTemporaryStatus(`Copied "${task.title}"`);
      } catch {
        showTemporaryStatus('Could not copy task');
      }
    })();
  };

  const copyBucketTasksToClipboard = (bucketId: string | null) => {
    const bucketName = bucketId ? bucketNameById.get(bucketId) ?? 'Unassigned' : 'Unassigned';
    const tasks = tasksByBucket.get(bucketId) ?? [];

    if (tasks.length === 0) {
      showTemporaryStatus(`No tasks to copy from ${bucketName}`);
      return;
    }

    setClipboardFromTasks(tasks);
    setSelectedTaskIds(tasks.map((task) => task.id));
    setSelectionAnchorTaskId(tasks[0]?.id ?? null);
    setActivePasteBucketId(bucketId);

    void (async () => {
      try {
        await copyTextToClipboard(formatBucketForOrderedCopy(bucketName, tasks));
        showTemporaryStatus(`Copied ${bucketName} and ${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
      } catch {
        showTemporaryStatus(`Could not copy ${bucketName}`);
      }
    })();
  };

  const copySelectedTasks = () => {
    const tasks = activeTasks.filter(
      (task) => selectedTaskIdSet.has(task.id) && !task.archivedAt,
    );
    if (tasks.length === 0) {
      showTemporaryStatus('Select tasks to copy first');
      return;
    }

    setClipboardFromTasks(tasks);

    void (async () => {
      try {
        await copyTextToClipboard(tasks.map(formatTaskForOrderedCopy).join('\n'));
        showTemporaryStatus(`Copied ${tasks.length} selected task${tasks.length === 1 ? '' : 's'}`);
      } catch {
        showTemporaryStatus('Could not copy selected tasks');
      }
    })();
  };

  const pasteTasksIntoBucket = (bucketId: string | null) => {
    if (!effectiveActiveProjectId) return;
    if (taskClipboard.length === 0) {
      showTemporaryStatus('Copy tasks first to paste');
      return;
    }

    dispatchPlanner({
      type: 'ADD_TASK_BATCH',
      tasks: taskClipboard.map((task) => createTask(effectiveActiveProjectId, {
        title: task.title,
        description: task.description,
        bucketId,
      })),
    });

    setPendingTaskSurge(true);
    setActivePasteBucketId(bucketId);
    const bucketName = bucketId ? bucketNameById.get(bucketId) ?? 'Unassigned' : 'Unassigned';
    showTemporaryStatus(`Pasted ${taskClipboard.length} task${taskClipboard.length === 1 ? '' : 's'} into ${bucketName}`);
  };

  const handleTaskDragStart = (taskId: string, taskIds: string[]) => {
    setDraggedTaskId(taskId);
    setDraggedTaskIds(taskIds);
    setSelectedTaskIds(taskIds);
    setSelectionAnchorTaskId(taskId);
    setActivePasteBucketId(activeTasks.find((task) => task.id === taskId)?.bucketId ?? null);
  };

  const handleTaskDragEnd = () => {
    clearActiveDrag();
  };

  const moveTasksToBucket = (taskIds: string[], bucketId: string | null, targetIndex?: number) => {
    if (taskIds.length === 0 || !effectiveActiveProjectId) return;

    const updatedAt = now();

    if (taskIds.length === 1) {
      dispatchPlanner({
        type: 'MOVE_TASK',
        projectId: effectiveActiveProjectId,
        taskId: taskIds[0],
        bucketId,
        targetIndex,
        updatedAt,
      });
      return;
    }

    dispatchPlanner({
      type: 'MOVE_TASKS',
      projectId: effectiveActiveProjectId,
      taskIds,
      bucketId,
      targetIndex,
      updatedAt,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;

      const withMeta = event.ctrlKey || event.metaKey;
      if (!withMeta) return;

      const key = event.key.toLowerCase();

      if (key === 'c' && selectedTaskIds.length > 0) {
        event.preventDefault();
        copySelectedTasks();
        return;
      }

      if (key === 'v' && taskClipboard.length > 0) {
        event.preventDefault();
        pasteTasksIntoBucket(activePasteBucketId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activePasteBucketId, activeTasks, selectedTaskIds.length, taskClipboard, selectedTaskIdSet]);

  // Keyboard shortcuts for undo/redo, copy/paste
  usePlannerKeyboardShortcuts({
    onUndo: () => {
      if (!canUndo) return;
      undo();
      showTemporaryStatus('Undo');
    },
    onRedo: () => {
      if (!canRedo) return;
      redo();
      showTemporaryStatus('Redo');
    },
    onCopy: () => {
      if (selectedTaskIds.length === 0) return;
      copySelectedTasks();
    },
    onPaste: () => {
      if (taskClipboard.length === 0) return;
      pasteTasksIntoBucket(activePasteBucketId);
    },
  });

  useEffect(() => {
    if (isSearchFocused || searchQuery.trim()) {
      clearSearchStatusTimer();
      setShowSearchStatus(true);
      return;
    }
    scheduleSearchStatusHide();
  }, [isSearchFocused, searchQuery]);

  useEffect(() => {
    if (!pendingRestoreData) return;
    ensureScrollableTargetInView(sidepanelRef.current, restoreConfirmRef.current);
  }, [pendingRestoreData]);

  useEffect(() => {
    if (!pendingUploadData) return;
    ensureScrollableTargetInView(sidepanelRef.current, uploadConfirmRef.current);
  }, [pendingUploadData]);

  useEffect(() => {
    if (!draggedTaskId && !draggedBucketId) {
      cancelBoardEdgeAutoscroll();
      return;
    }

    const step = () => {
      const frame = boardFrameRef.current;
      const pointerX = boardDragPointerXRef.current;

      if (frame && pointerX !== null) {
        const rect = frame.getBoundingClientRect();
        const distanceFromLeft = pointerX - rect.left;
        const distanceFromRight = rect.right - pointerX;
        let scrollDelta = 0;

        if (distanceFromLeft >= 0 && distanceFromLeft < BOARD_EDGE_AUTOSCROLL_ZONE_PX) {
          const intensity = 1 - (distanceFromLeft / BOARD_EDGE_AUTOSCROLL_ZONE_PX);
          scrollDelta = -Math.ceil(intensity * BOARD_EDGE_AUTOSCROLL_MAX_SPEED_PX);
        } else if (distanceFromRight >= 0 && distanceFromRight < BOARD_EDGE_AUTOSCROLL_ZONE_PX) {
          const intensity = 1 - (distanceFromRight / BOARD_EDGE_AUTOSCROLL_ZONE_PX);
          scrollDelta = Math.ceil(intensity * BOARD_EDGE_AUTOSCROLL_MAX_SPEED_PX);
        }

        if (scrollDelta !== 0) {
          frame.scrollLeft += scrollDelta;
        }
      }

      boardAutoscrollFrameRef.current = window.requestAnimationFrame(step);
    };

    boardAutoscrollFrameRef.current = window.requestAnimationFrame(step);

    const stopDrag = () => clearActiveDrag();
    const stopDragOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stopDrag();
    };

    window.addEventListener('dragend', stopDrag);
    window.addEventListener('drop', stopDrag);
    window.addEventListener('keydown', stopDragOnEscape);

    return () => {
      window.removeEventListener('dragend', stopDrag);
      window.removeEventListener('drop', stopDrag);
      window.removeEventListener('keydown', stopDragOnEscape);
      cancelBoardEdgeAutoscroll();
    };
  }, [draggedBucketId, draggedTaskId]);

  useEffect(() => {
    if (!pendingBucketWarp || activeBuckets.length === 0) return;

    const latestBucket = activeBuckets.reduce((latest, current) => (
      current.createdAt > latest.createdAt ? current : latest
    ));

    const target = bucketElementRefs.current[latestBucket.id];
    const frame = boardFrameRef.current;
    if (!target || !frame) return;

    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const fullyVisible =
      targetRect.left >= frameRect.left + 12 &&
      targetRect.right <= frameRect.right - 12;

    if (!fullyVisible) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    setHighlightedBucketId(latestBucket.id);
    if (bucketHighlightTimeoutRef.current !== null) {
      window.clearTimeout(bucketHighlightTimeoutRef.current);
    }
    bucketHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedBucketId(null);
      bucketHighlightTimeoutRef.current = null;
    }, 2600);
    setPendingBucketWarp(false);
  }, [activeBuckets, pendingBucketWarp]);

  useEffect(() => {
    if (!pendingTaskSurge || activeTasks.length === 0) return;

    const latestTask = activeTasks.reduce((latest, current) => (
      current.createdAt > latest.createdAt ? current : latest
    ));

    setHighlightedTaskId(latestTask.id);
    setHighlightedTaskBucketId(latestTask.bucketId);

    if (taskSurgeTimeoutRef.current !== null) {
      window.clearTimeout(taskSurgeTimeoutRef.current);
    }
    taskSurgeTimeoutRef.current = window.setTimeout(() => {
      setHighlightedTaskId(null);
      setHighlightedTaskBucketId(null);
      taskSurgeTimeoutRef.current = null;
    }, 2200);

    setPendingTaskSurge(false);
  }, [activeTasks, pendingTaskSurge]);

  const draggedTaskAccentIndex = useMemo(() => {
    const leadTaskId = draggedTaskIds[0] ?? draggedTaskId;
    if (!leadTaskId) return null;
    const draggedTask = activeTasks.find((task) => task.id === leadTaskId) ?? null;
    if (!draggedTask) return null;
    return accentIndexFromBucket(draggedTask.bucketId);
  }, [activeTasks, draggedTaskId, draggedTaskIds]);

  const uploadedTaskIdSet = useMemo(() => new Set(uploadedTaskIds), [uploadedTaskIds]);

  const triageRecommendation = 'Recommendation: Unassigned stays fixed on the far left. Pin your triage buckets nearby for faster planning.';

  useEffect(() => {
    if (!showExportScopeMenu) return;
    ensureScrollableTargetInView(sidepanelRef.current, exportScopeMenuRef.current);
  }, [showExportScopeMenu]);

  useEffect(() => {
    if (!quickTaskOpen) return;
    ensureScrollableTargetInView(sidepanelRef.current, quickTaskShellRef.current, 16);
  }, [quickTaskOpen]);

  const clearSidepanelCloseTimer = () => {
    if (sidepanelCloseTimeoutRef.current !== null) {
      window.clearTimeout(sidepanelCloseTimeoutRef.current);
      sidepanelCloseTimeoutRef.current = null;
    }
  };

  const clearSidepanelOpenTimer = () => {
    if (sidepanelOpenTimeoutRef.current !== null) {
      window.clearTimeout(sidepanelOpenTimeoutRef.current);
      sidepanelOpenTimeoutRef.current = null;
    }
  };

  const hasSidepanelInteractionTarget = () => {
    const activeElement = document.activeElement;
    const focusInPanel = Boolean(
      activeElement &&
      (sidepanelRef.current?.contains(activeElement) || sidepanelToggleGroupRef.current?.contains(activeElement)),
    );
    const hoverInPanel = Boolean(sidepanelRef.current?.matches(':hover'));
    const hoverInToggle = Boolean(sidepanelToggleButtonRef.current?.matches(':hover'));
    const hoverInLock = Boolean(sidepanelLockButtonRef.current?.matches(':hover'));

    if (!hoverInPanel) sidepanelHoveringRef.current = false;
    if (!hoverInToggle) sidepanelToggleHoveringRef.current = false;
    if (!hoverInLock) sidepanelLockHoveringRef.current = false;

    return hoverInPanel || hoverInToggle || hoverInLock || focusInPanel;
  };

  const openSidepanelForInteraction = () => {
    clearSidepanelCloseTimer();
    clearSidepanelOpenTimer();
    if (isSidepanelLocked) return;
    setIsSidepanelOpen(true);
  };

  const scheduleSidepanelClose = (delayMs = 220) => {
    if (isSidepanelLocked) return;
    clearSidepanelCloseTimer();
    sidepanelCloseTimeoutRef.current = window.setTimeout(() => {
      if (isSidepanelLocked) return;
      if (hasSidepanelInteractionTarget()) return;
      setIsSidepanelOpen(false);
      sidepanelCloseTimeoutRef.current = null;
    }, delayMs);
  };

  const handleSidepanelToggleMouseEnter = () => {
    sidepanelToggleHoveringRef.current = true;
    clearSidepanelCloseTimer();
    if (isSidepanelOpen || isSidepanelLocked) return;
    clearSidepanelOpenTimer();
    sidepanelOpenTimeoutRef.current = window.setTimeout(() => {
      setIsSidepanelOpen(true);
      sidepanelOpenTimeoutRef.current = null;
    }, 120);
  };

  const handleSidepanelToggleMouseLeave = () => {
    sidepanelToggleHoveringRef.current = false;
    clearSidepanelOpenTimer();
    scheduleSidepanelClose(180);
  };

  const handleSidepanelLockMouseEnter = () => {
    sidepanelLockHoveringRef.current = true;
    clearSidepanelOpenTimer();
    clearSidepanelCloseTimer();
  };

  const handleSidepanelLockMouseLeave = () => {
    sidepanelLockHoveringRef.current = false;
    scheduleSidepanelClose(180);
  };

  const handleSidepanelMouseEnter = () => {
    sidepanelHoveringRef.current = true;
    clearSidepanelCloseTimer();
  };

  const handleSidepanelMouseLeave = () => {
    sidepanelHoveringRef.current = false;
    scheduleSidepanelClose(220);
  };

  const handleSidepanelFocusCapture = (event: ReactFocusEvent<HTMLElement>) => {
    if (sidepanelLockButtonRef.current?.contains(event.target as Node)) {
      clearSidepanelCloseTimer();
      clearSidepanelOpenTimer();
      return;
    }
    openSidepanelForInteraction();
  };

  const handleSidepanelBlurCapture = () => {
    window.setTimeout(() => {
      scheduleSidepanelClose(120);
    }, 0);
  };

  const toggleSidepanelOpen = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    clearSidepanelCloseTimer();
    clearSidepanelOpenTimer();
    setIsSidepanelOpen((current) => !current);
  };

  const toggleSidepanelLock = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    clearSidepanelOpenTimer();
    clearSidepanelCloseTimer();
    setIsSidepanelLocked((current) => {
      return !current;
    });
  };

  return (
    <main className="app-shell">
      {exportNotice && (
        <div
          className="app-notification-banner"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{exportNotice}</span>
          <button
            type="button"
            className="icon-button app-notification-dismiss"
            onClick={() => setExportNotice(null)}
            aria-label="Dismiss export notification"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <header className="app-header">
        <div className="brand-block">
          <span className="brand-icon" aria-hidden="true">{APP_ICON_TEXT}</span>
          <div>
            <p className="eyebrow">{APP_BANNER}</p>
            <h1>{APP_NAME}</h1>
            <p className="subtitle">Organize tasks into buckets with drag-and-drop ordering and a clean workspace.</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-search-stack">
            <div className="header-search">
              <label className="visually-hidden" htmlFor="task-search-input">
                Search tasks
              </label>
              <input
                id="task-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search tasks"
                aria-label="Search tasks"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setSearchQuery('')}
                >
                  Clear
                </button>
              )}
            </div>
            <span className={`save-status search-status${showSearchStatus ? ' visible' : ''}`}>
              {status} · {stats.open} open / {stats.activeTotal} active · {stats.archived} archived
            </span>
          </div>
          <div className="visual-mode-toggle" role="group" aria-label="Visual mode">
            <button
              type="button"
              className={`mode-button${visualMode === 'calm' ? ' active' : ''}`}
              onClick={() => setVisualMode('calm')}
            >
              Calm
            </button>
            <button
              type="button"
              className={`mode-button${visualMode === 'balanced' ? ' active' : ''}`}
              onClick={() => setVisualMode('balanced')}
            >
              Balanced
            </button>
            <button
              type="button"
              className={`mode-button${visualMode === 'energetic' ? ' active' : ''}`}
              onClick={() => setVisualMode('energetic')}
            >
              Energetic
            </button>
          </div>
          <div className="theme-toggle" role="group" aria-label="Theme mode">
            <button
              type="button"
              className={`theme-button${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={`theme-button${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
          </div>
        </div>
      </header>

      <div className={`workspace-layout ${isSidepanelOpen ? 'sidepanel-open' : 'sidepanel-closed'}`}>
        <section
          className={`board-stage board-zoom-${boardZoomIndex}`}
          aria-label="Planner board"
        >
          <div className="board-stage-toolbar">
            <div className="board-zoom-toggle" role="group" aria-label="Board zoom">
              <button
                type="button"
                className="zoom-button"
                onClick={() => setBoardZoomIndex((current) => Math.max(MIN_BOARD_ZOOM_INDEX, current - 1))}
                disabled={boardZoomIndex === MIN_BOARD_ZOOM_INDEX}
              >
                -
              </button>
              <span className="zoom-status">View</span>
              <button
                type="button"
                className="zoom-button"
                onClick={() => setBoardZoomIndex((current) => Math.min(MAX_BOARD_ZOOM_INDEX, current + 1))}
                disabled={boardZoomIndex === MAX_BOARD_ZOOM_INDEX}
              >
                +
              </button>
            </div>
            <div className="board-actions" role="group" aria-label="Board actions">
              <button
                type="button"
                className="secondary-button"
                onClick={copySelectedTasks}
                disabled={selectedTaskIds.length === 0}
                title={selectedTaskIds.length === 0 ? 'Select task cards to copy' : 'Copy selected tasks'}
              >
                Copy selected ({selectedTaskIds.length})
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo"
                title="Undo (Ctrl/Cmd+Z)"
              >
                ↶
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo"
                title="Redo (Ctrl/Cmd+Y)"
              >
                ↷
              </button>
            </div>
          </div>
          <PlannerSidepanel
            sidepanelRef={sidepanelRef}
            sidepanelToggleGroupRef={sidepanelToggleGroupRef}
            sidepanelToggleButtonRef={sidepanelToggleButtonRef}
            sidepanelLockButtonRef={sidepanelLockButtonRef}
            isSidepanelOpen={isSidepanelOpen}
            isSidepanelLocked={isSidepanelLocked}
            sidepanelToggleTitle={sidepanelToggleTitle}
            sidepanelToggleIcon={sidepanelToggleIcon}
            sidepanelToggleLabel={sidepanelToggleLabel}
            sidepanelLockIcon={sidepanelLockIcon}
            sidepanelLockLabel={sidepanelLockLabel}
            onSidepanelMouseEnter={handleSidepanelMouseEnter}
            onSidepanelMouseLeave={handleSidepanelMouseLeave}
            onSidepanelFocusCapture={handleSidepanelFocusCapture}
            onSidepanelBlurCapture={handleSidepanelBlurCapture}
            onSidepanelToggleMouseEnter={handleSidepanelToggleMouseEnter}
            onSidepanelToggleMouseLeave={handleSidepanelToggleMouseLeave}
            onSidepanelLockMouseEnter={handleSidepanelLockMouseEnter}
            onSidepanelLockMouseLeave={handleSidepanelLockMouseLeave}
            onToggleSidepanelOpen={toggleSidepanelOpen}
            onToggleSidepanelLock={toggleSidepanelLock}
            plannerData={state}
            activeProjectId={effectiveActiveProjectId}
            activeProjectName={activeProject.name}
            selectedTemplateId={selectedTemplateId}
            templateMessage={templateMessage}
            globalBucketGroups={globalBucketGroups}
            onSelectProject={selectProject}
            onCreateProject={addProject}
            onRenameProject={renameProject}
            onUpdateProjectDescription={updateProjectDescription}
            onToggleProjectPin={toggleProjectPin}
            onMoveProject={moveProjectByOffset}
            onDeleteProject={deleteProject}
            onSelectTemplate={setSelectedTemplateId}
            onCreateTemplate={addTemplate}
            onRenameTemplate={renameTemplate}
            onUpdateTemplateDescription={updateTemplateDescription}
            onSetTemplateActive={setTemplateActive}
            onMoveTemplate={moveTemplateByOffset}
            onDeleteTemplate={deleteTemplate}
            onCreateDefinition={addTemplateDefinition}
            onRenameDefinition={renameTemplateDefinition}
            onUpdateDefinitionDescription={updateTemplateDefinitionDescription}
            onSetDefinitionDefaultActive={setTemplateDefinitionDefaultActive}
            onMoveDefinition={moveTemplateDefinitionByOffset}
            onDeleteDefinition={deleteTemplateDefinition}
            onApplyTemplate={applyTemplateToActiveProject}
            quickTaskShellRef={quickTaskShellRef}
            quickTaskInputRef={quickTaskInputRef}
            quickTaskBucketInputRef={quickTaskBucketInputRef}
            quickTaskOpen={quickTaskOpen}
            quickTaskTitle={quickTaskTitle}
            quickTaskBucketName={quickTaskBucketName}
            quickTaskBucketSuggestionSuffix={quickTaskBucketSuggestionSuffix}
            activeBuckets={activeBuckets}
            bucketIdByNormalizedName={bucketIdByNormalizedName}
            normalizeBucketName={normalizeBucketName}
            onQuickTaskTitleChange={setQuickTaskTitle}
            onQuickTaskBucketNameChange={setQuickTaskBucketName}
            onQuickTaskBucketIdChange={setQuickTaskBucketId}
            onQuickTaskTitleKeyDown={handleQuickTaskTitleKeyDown}
            onQuickTaskBucketKeyDown={handleQuickTaskBucketKeyDown}
            onSubmitQuickTask={submitQuickTask}
            bucketName={bucketName}
            onBucketNameChange={setBucketName}
            onAddBucket={addBucket}
            archivedTasks={archivedTasks}
            stats={stats}
            showArchive={showArchive}
            showCompleted={showCompleted}
            showArchiveConfirm={showArchiveConfirm}
            triageRecommendation={triageRecommendation}
            openAdvancedSectionsInTests={openAdvancedSectionsInTests}
            onToggleArchive={() => setShowArchive((current) => !current)}
            onShowCompletedChange={setShowCompleted}
            onArchiveCompletedTasks={archiveCompletedTasks}
            onConfirmArchiveCompletedTasks={confirmArchiveCompletedTasks}
            onCancelArchiveCompletedTasks={cancelArchiveCompletedTasks}
            onEditArchivedTask={(task) => setEditor({ task, defaultBucketId: task.bucketId })}
            onDeleteArchivedTask={deleteTask}
            onToggleArchivedTask={(task) => dispatchPlanner({ type: 'TOGGLE_TASK', projectId: task.projectId, taskId: task.id, updatedAt: now() })}
            onToggleArchivedTaskPin={(task) => dispatchPlanner({ type: 'TOGGLE_TASK_PIN', projectId: task.projectId, taskId: task.id, updatedAt: now() })}
            onCopyArchivedTask={(task) => copyTaskToClipboard(
              task,
              task.bucketId ? bucketNameById.get(task.bucketId) ?? 'Unassigned' : 'Unassigned',
            )}
            onUnarchiveTask={(task) => dispatchPlanner({ type: 'UNARCHIVE_TASK', projectId: task.projectId, taskId: task.id, updatedAt: now() })}
            getBucketName={(bucketId) => (bucketId ? bucketNameById.get(bucketId) ?? 'Unassigned' : 'Unassigned')}
            uploadInputRef={uploadInputRef}
            restoreInputRef={restoreInputRef}
            uploadConfirmRef={uploadConfirmRef}
            restoreConfirmRef={restoreConfirmRef}
            exportScopeMenuRef={exportScopeMenuRef}
            hasPendingUploadData={Boolean(pendingUploadData)}
            pendingUploadSummary={pendingUploadSummary}
            hasPendingRestoreData={Boolean(pendingRestoreData)}
            pendingRestoreSummary={pendingRestoreSummary}
            hasLastRestoreBackup={Boolean(lastRestoreBackup)}
            hideRestoreUndoCard={hideRestoreUndoCard}
            isRestoreUndoClosing={isRestoreUndoClosing}
            dataActionMessage={dataActionMessage}
            showExportScopeMenu={showExportScopeMenu}
            exportScope={exportScope}
            exportScopeOptionCount={exportScopeOptionCount}
            onConfirmUploadData={confirmUploadData}
            onCancelUploadData={() => setPendingUploadData(null)}
            onToggleExportScopeMenu={() => setShowExportScopeMenu((current) => !current)}
            onSelectExportScope={(scope) => {
              setExportScope(scope);
              setShowExportScopeMenu(false);
            }}
            onExportData={exportData}
            onConfirmRestoreData={confirmRestoreData}
            onCancelRestoreData={() => setPendingRestoreData(null)}
            onDismissRestoreUndoCard={dismissRestoreUndoCard}
            onUndoRestoreData={undoRestoreData}
            onRestoreFileChange={restoreDataFromFile}
            onUploadFileChange={mergeDataFromFile}
          />
          <div
            ref={boardFrameRef}
            className="board-frame"
            onDragEnterCapture={updateBoardDragPointer}
            onDragOverCapture={updateBoardDragPointer}
            onDragLeaveCapture={handleBoardDragLeave}
          >
            <ProjectBoard project={activeProject}>
              <BucketColumn
                columnIndex={0}
                bucket={null}
                tasks={filteredTasksByBucket.get(null) ?? []}
                draggedTaskId={draggedTaskId}
                isBucketDragActive={Boolean(draggedBucketId)}
                nudgeFromRightGap={Boolean(draggedBucketId) && activeBucketDropIndex === 0}
                isBucketDropSettled={false}
                bucketDropSettleFrom={null}
                draggedAccentIndex={draggedTaskAccentIndex}
                highlightedTaskId={highlightedTaskId}
                uploadedTaskIdSet={uploadedTaskIdSet}
                copyTaskCount={tasksByBucket.get(null)?.length ?? 0}
                isWarpHighlight={highlightedTaskBucketId === null}
                onCopyBucketTasks={copyBucketTasksToClipboard}
                onCopyTask={copyTaskToClipboard}
                onQuickAddTask={addTaskFromBoard}
                onEditTask={(task) => setEditor({ task, defaultBucketId: task.bucketId })}
                onDeleteTask={deleteTask}
                onToggleTask={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK', projectId: effectiveActiveProjectId, taskId, updatedAt: now() })}
                onToggleTaskPin={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK_PIN', projectId: effectiveActiveProjectId, taskId, updatedAt: now() })}
                onMoveTask={(taskId, bucketId, targetIndex) => moveTasksToBucket([taskId], bucketId, targetIndex)}
                onMoveTasks={moveTasksToBucket}
                selectedTaskIds={selectedTaskIdSet}
                onSelectTask={handleTaskCardSelection}
                onPasteIntoBucket={pasteTasksIntoBucket}
                canPasteIntoBucket={taskClipboard.length > 0}
                onDragStart={handleTaskDragStart}
                onDragEnd={handleTaskDragEnd}
                onBucketDropSettleEnd={() => {
                  if (bucketDropSettleTimeoutRef.current !== null) {
                    window.clearTimeout(bucketDropSettleTimeoutRef.current);
                    bucketDropSettleTimeoutRef.current = null;
                  }
                  setSettledBucketDropIndex(null);
                  setSettledBucketId(null);
                  setSettledBucketFrom(null);
                }}
              />

              {activeBuckets.map((bucket, index) => (
                <Fragment key={bucket.id}>
                  <div className="bucket-drop-slot-wrapper">
                    <div
                      className={`bucket-drop-slot interaction-drop-slot interaction-bucket-drop-slot bucket-accent-${accentIndexFromBucket(bucket.id)}${draggedBucketId ? ' visible' : ''}${activeBucketDropIndex === index ? ' active' : ''}${settledBucketDropIndex === index ? ' settled' : ''}`}
                      onDragOver={(event) => {
                        if (!draggedBucketId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setActiveBucketDropIndex(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropBucketAt(index);
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <BucketColumn
                    columnIndex={index + 1}
                    bucket={bucket}
                    tasks={filteredTasksByBucket.get(bucket.id) ?? []}
                    draggedTaskId={draggedTaskId}
                    isBucketDragActive={Boolean(draggedBucketId)}
                    isBucketDragSource={draggedBucketId === bucket.id}
                    nudgeFromLeftGap={Boolean(draggedBucketId) && activeBucketDropIndex === index}
                    nudgeFromRightGap={Boolean(draggedBucketId) && activeBucketDropIndex === index + 1}
                    isBucketDropSettled={settledBucketId === bucket.id}
                    bucketDropSettleFrom={settledBucketId === bucket.id ? settledBucketFrom : null}
                    draggedAccentIndex={draggedTaskAccentIndex}
                    highlightedTaskId={highlightedTaskId}
                    uploadedTaskIdSet={uploadedTaskIdSet}
                    copyTaskCount={tasksByBucket.get(bucket.id)?.length ?? 0}
                    registerColumnRef={registerBucketElement}
                    isWarpHighlight={highlightedBucketId === bucket.id || highlightedTaskBucketId === bucket.id}
                    onCopyBucketTasks={copyBucketTasksToClipboard}
                    onCopyTask={copyTaskToClipboard}
                    onQuickAddTask={addTaskFromBoard}
                    onEditTask={(task) => setEditor({ task, defaultBucketId: task.bucketId })}
                    onDeleteTask={deleteTask}
                    onToggleTask={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK', projectId: effectiveActiveProjectId, taskId, updatedAt: now() })}
                    onToggleTaskPin={(taskId) => dispatchPlanner({ type: 'TOGGLE_TASK_PIN', projectId: effectiveActiveProjectId, taskId, updatedAt: now() })}
                    onMoveTask={(taskId, bucketId, targetIndex) => moveTasksToBucket([taskId], bucketId, targetIndex)}
                    onMoveTasks={moveTasksToBucket}
                    selectedTaskIds={selectedTaskIdSet}
                    onSelectTask={handleTaskCardSelection}
                    onPasteIntoBucket={pasteTasksIntoBucket}
                    canPasteIntoBucket={taskClipboard.length > 0}
                    onDragStart={handleTaskDragStart}
                    onDragEnd={handleTaskDragEnd}
                    onToggleBucketPin={toggleBucketPin}
                    onBucketDragStart={(bucketId) => {
                      setDraggedBucketId(bucketId);
                      setActiveBucketDropIndex(index);
                    }}
                    onBucketDragEnd={() => {
                      clearActiveDrag();
                    }}
                    bucketDropIndex={index}
                    onBucketDragHover={setActiveBucketDropIndex}
                    onBucketDrop={dropBucketAt}
                    onMoveBucketByOffset={moveBucketByOffset}
                    canMoveBucketLeft={index > 0}
                    canMoveBucketRight={index < activeBuckets.length - 1}
                    onBucketDropSettleEnd={() => {
                      if (bucketDropSettleTimeoutRef.current !== null) {
                        window.clearTimeout(bucketDropSettleTimeoutRef.current);
                        bucketDropSettleTimeoutRef.current = null;
                      }
                      setSettledBucketDropIndex(null);
                      setSettledBucketId(null);
                      setSettledBucketFrom(null);
                    }}
                    onRenameBucket={renameBucket}
                    onDeleteBucket={deleteBucket}
                  />
                </Fragment>
              ))}

              {activeBuckets.length > 0 && (
                <div className="bucket-drop-slot-wrapper">
                  <div
                    className={`bucket-drop-slot interaction-drop-slot interaction-bucket-drop-slot bucket-accent-${accentIndexFromBucket(activeBuckets[activeBuckets.length - 1]?.id ?? null)}${draggedBucketId ? ' visible' : ''}${activeBucketDropIndex === activeBuckets.length ? ' active' : ''}${settledBucketDropIndex === activeBuckets.length ? ' settled' : ''}`}
                    onDragOver={(event) => {
                      if (!draggedBucketId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setActiveBucketDropIndex(activeBuckets.length);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropBucketAt(activeBuckets.length);
                    }}
                    aria-hidden="true"
                  />
                </div>
              )}

              <section className="bucket-column board-add-bucket-column" aria-label="Board add bucket">
                {boardBucketAddOpen ? (
                  <input
                    ref={boardBucketInputRef}
                    className="add-bucket-inline-input"
                    value={boardBucketNameDraft}
                    onChange={(event) => setBoardBucketNameDraft(event.target.value)}
                    onKeyDown={handleBoardBucketKeyDown}
                    placeholder="Add bucket"
                    maxLength={80}
                    aria-label="Add bucket in board"
                  />
                ) : (
                  <button type="button" className="add-bucket-inline-button" onClick={openBoardBucketAdd}>
                    + Add bucket
                  </button>
                )}
              </section>
            </ProjectBoard>
          </div>
        </section>
      </div>

      {editor && (
        <TaskEditor
          buckets={activeBuckets}
          task={editor.task}
          defaultBucketId={editor.defaultBucketId}
          onSave={saveTask}
          onClose={() => setEditor(null)}
        />
      )}

      {confirmDialog && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal modal-compact confirm-modal" role="dialog" aria-modal="true" aria-label={confirmDialog.title}>
            <div className="modal-header">
              <h2>{confirmDialog.title}</h2>
              <button type="button" className="icon-button" onClick={() => setConfirmDialog(null)} aria-label="Close confirmation">×</button>
            </div>
            <p className="confirm-message">
              <span className="confirm-action">Delete</span>{' '}
              <span className="confirm-target">{confirmDialog.targetLabel}</span>
              <span className="confirm-question" aria-hidden="true">?</span>
            </p>
            {confirmDialog.detail && <p className="confirm-detail">{confirmDialog.detail}</p>}
            <div className="modal-actions confirm-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={confirmDialogAction}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameDialog && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal modal-compact" role="dialog" aria-modal="true" aria-label="Rename bucket">
            <div className="modal-header">
              <h2>Rename bucket</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setRenameDialog(null);
                  setRenameDialogError(null);
                }}
                aria-label="Close rename bucket"
              >
                ×
              </button>
            </div>
            <label>
              Bucket name
              <input
                value={renameDialog.value}
                onChange={(event) => {
                  setRenameDialog((current) => current ? { ...current, value: event.target.value } : current);
                  if (renameDialogError) setRenameDialogError(null);
                }}
                maxLength={80}
                autoFocus
              />
            </label>
            {renameDialogError && <p className="data-message">{renameDialogError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setRenameDialog(null);
                  setRenameDialogError(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={submitRenameDialog}>
                Save name
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
