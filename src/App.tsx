import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { BucketColumn } from './components/BucketColumn';
import { ProjectBoard } from './components/ProjectBoard';
import { PasteUndoNotice } from './components/PasteUndoNotice';
import { SelectionActions } from './components/SelectionControls';
import { TaskEditor } from './components/TaskEditor';
import { PlannerSidepanel } from './components/sidepanel/PlannerSidepanel';
import { getGlobalBucketView } from './selectors/globalBucketView';
import { createId } from './storage/plannerStorage';
import type { TaskDraft } from './types';
import type { BucketTemplate, BucketTemplateDefinition, BucketV2 as Bucket, PlannerDataV2 as PlannerData, PlannerTaskV2 as PlannerTask, Project } from './types/v2';
import { usePlannerHistory } from './hooks/usePlannerHistory';
import { usePlannerKeyboardShortcuts } from './hooks/usePlannerKeyboardShortcuts';
import {
  BOARD_ZOOM_PERCENTAGES,
  loadBoardZoomPreference,
  saveBoardZoomPreference,
  stepBoardZoom,
} from './services/boardZoom';
import { resolveQuickAdd } from './services/quickAdd';
import {
  getBucketTaskSelectionState,
  getSelectedTaskCount,
  getSelectedTasksInVisibleOrder,
  pruneTaskSelection,
  setVisibleBucketTaskSelection,
  toggleTaskSelection,
} from './services/plannerSelection';
import { savePlannerDataV2ToLocalStorage, loadPlannerDataV2FromLocalStorage } from './services/plannerPersistence';
import { plannerReducerV2, type PlannerActionV2 } from './state/plannerReducerV2';
import {
  copyTextToClipboard,
  formatTaskChecklistLabel,
  formatTaskForOrderedCopy,
  formatTaskForSingleCopy,
} from './services/plannerClipboard';
import { coercePlannerDataToV2 } from './services/plannerImport';
import {
  buildStructuredBucketCopyDocument,
  formatProjectMarkdownForCopy,
  type StructuredBucketCopyTask,
} from './services/plannerExchange';
import {
  buildPlannerExportFilename,
  buildPlannerScopedExchangeEnvelope,
  buildRawPlannerDataExport,
  isValidPlannerScopedExchangeEnvelope,
  isValidProjectExchangeEnvelope,
  type PlannerExportFilenameScope,
} from './services/plannerExport';
import {
  importPlannerProject,
  isProjectExchangeEnvelopeCandidate,
  parsePlannerProjectImport,
  type ParsedPlannerProjectImport,
  type PlannerProjectImportSummary,
} from './services/plannerProjectImport';
import {
  clearRestoreRecoverySnapshot,
  loadRestoreRecoverySnapshot,
  saveRestoreRecoverySnapshot,
} from './services/restoreRecovery';

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
const EXPORT_NOTICE_DURATION_MS = 10000;
const PASTE_UNDO_DURATION_MS = 10000;
const DROP_SETTLE_DURATION_MS = 1500;
const BOARD_EDGE_AUTOSCROLL_ZONE_PX = 96;
const BOARD_EDGE_AUTOSCROLL_MAX_SPEED_PX = 24;

interface PasteUndoState {
  projectId: string;
  taskIds: string[];
  destinationName: string;
}

const formatProjectImportSummary = (
  summary: PlannerProjectImportSummary,
  sourceProjectName: string,
  destinationProjectName: string,
): string => {
  const destinationSummary = summary.projectCreatedCount > 0
    ? 'created 1 project'
    : 'merged into 1 existing project';
  const ambiguitySummary = (
    summary.templateAmbiguousMatchCount
    + summary.templateDefinitionAmbiguousMatchCount
    + summary.bucketAmbiguousMatchCount
  );

  return [
    `Imported "${sourceProjectName}" into "${destinationProjectName}"`,
    destinationSummary,
    `created ${summary.bucketCreatedCount} bucket(s)`,
    `reused ${summary.bucketReusedCount} bucket(s)`,
    `created ${summary.taskCreatedCount} task(s)`,
    `skipped ${summary.taskSkippedDuplicateCount} exact semantic duplicate task(s)`,
    `created ${summary.dependencyCreatedCount} template record(s)`,
    `reused ${summary.dependencyReusedCount} template record(s)`,
    `resolved ${ambiguitySummary} ambiguous/conflicting match(es) by creating new records`,
  ].join('; ') + '.';
};

const normalizeQuickAddName = (name: string) => name.trim().toLocaleLowerCase();

const now = (): string => new Date().toISOString();

const selectInitialProjectId = (projects: Project[]): string => (
  projects.find((project) => project.pinned)?.id ?? projects[0]?.id ?? ''
);

const buildProjectChoiceOptions = (
  projects: readonly Project[],
): Array<{ projectId: string; label: string }> => {
  const counts = new Map<string, number>();
  projects.forEach((project) => {
    const label = project.name.trim() || 'Untitled project';
    const key = label.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const ordinals = new Map<string, number>();
  return projects.map((project) => {
    const baseLabel = project.name.trim() || 'Untitled project';
    const key = baseLabel.toLocaleLowerCase();
    const count = counts.get(key) ?? 1;
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);
    return {
      projectId: project.id,
      label: count > 1 ? `${baseLabel} (${ordinal} of ${count})` : baseLabel,
    };
  });
};

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
const THEME_STORAGE_KEY = 'planner-buckets:theme';
const VISUAL_MODE_STORAGE_KEY = 'planner-buckets:visual-mode';
const APP_NAME = 'Planner Buckets';
const APP_BANNER = 'Local-First Task Planning';
const APP_ICON_TEXT = 'PB';

export default function App() {
  const openAdvancedSectionsInTests = /jsdom/i.test(window.navigator.userAgent);
  const [initialLoadResult] = useState(() => loadPlannerDataV2FromLocalStorage());
  const initialProjectId = selectInitialProjectId(initialLoadResult.data.projects);
  const initialProjectName = initialLoadResult.data.projects.find((project) => project.id === initialProjectId)?.name ?? '';
  const { state, dispatch: dispatchPlanner, canUndo, canRedo, undo, redo } = usePlannerHistory<PlannerData, PlannerActionV2>(
    initialLoadResult.data,
    plannerReducerV2,
  );
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
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
  const [pendingProjectImport, setPendingProjectImport] = useState<ParsedPlannerProjectImport | null>(null);
  const [selectedProjectImportSourceId, setSelectedProjectImportSourceId] = useState('');
  const [projectImportDestinationKind, setProjectImportDestinationKind] = useState<'new' | 'existing' | null>(null);
  const [selectedProjectImportDestinationId, setSelectedProjectImportDestinationId] = useState('');
  const [lastRestoreBackup, setLastRestoreBackup] = useState<PlannerData | null>(() => (
    loadRestoreRecoverySnapshot(localStorage, initialLoadResult.data)?.previousData ?? null
  ));
  const [pendingBucketWarp, setPendingBucketWarp] = useState(false);
  const [highlightedBucketId, setHighlightedBucketId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedTaskBucketId, setHighlightedTaskBucketId] = useState<string | null>(null);
  const [uploadedTaskIds, setUploadedTaskIds] = useState<string[]>([]);
  const [pendingTaskSurge, setPendingTaskSurge] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskProjectName, setQuickTaskProjectName] = useState(initialProjectName);
  const [quickTaskProjectId, setQuickTaskProjectId] = useState<string | null>(initialProjectId || null);
  const [quickTaskBucketName, setQuickTaskBucketName] = useState('');
  const [quickTaskBucketId, setQuickTaskBucketId] = useState<string | null>(null);
  const [quickTaskMessage, setQuickTaskMessage] = useState<string | null>(null);
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
  const [boardZoomPercent, setBoardZoomPercent] = useState(() => loadBoardZoomPreference());
  const [isSidepanelOpen, setIsSidepanelOpen] = useState(false);
  const [isSidepanelLocked, setIsSidepanelLocked] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskIds, setDraggedTaskIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());
  const [taskClipboard, setTaskClipboard] = useState<StructuredBucketCopyTask[]>([]);
  const [activePasteBucketId, setActivePasteBucketId] = useState<string | null>(null);
  const [latestPasteUndo, setLatestPasteUndo] = useState<PasteUndoState | null>(null);
  const [draggedBucketId, setDraggedBucketId] = useState<string | null>(null);
  const [activeBucketDropIndex, setActiveBucketDropIndex] = useState<number | null>(null);
  const [settledBucketDropIndex, setSettledBucketDropIndex] = useState<number | null>(null);
  const [settledBucketId, setSettledBucketId] = useState<string | null>(null);
  const [settledBucketFrom, setSettledBucketFrom] = useState<'left' | 'right' | null>(null);
  const [status, setStatus] = useState('Saved locally');
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const quickTaskInputRef = useRef<HTMLInputElement>(null);
  const quickTaskBucketInputRef = useRef<HTMLInputElement>(null);
  const quickTaskProjectInputRef = useRef<HTMLInputElement>(null);
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
  const projectImportConfirmRef = useRef<HTMLDivElement>(null);
  const exportScopeMenuRef = useRef<HTMLDivElement>(null);
  const restoreUndoCloseTimeoutRef = useRef<number | null>(null);
  const pasteUndoTimeoutRef = useRef<number | null>(null);
  const restoreFileReadSequenceRef = useRef(0);
  const projectImportFileReadSequenceRef = useRef(0);
  const previousActiveProjectIdRef = useRef(initialProjectId);
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
  const clearLatestPasteUndo = () => {
    if (pasteUndoTimeoutRef.current !== null) {
      window.clearTimeout(pasteUndoTimeoutRef.current);
      pasteUndoTimeoutRef.current = null;
    }
    setLatestPasteUndo(null);
  };
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
  const quickTaskTargetProjectId = useMemo(() => {
    if (
      quickTaskProjectId
      && state.projects.some((project) => project.id === quickTaskProjectId)
    ) {
      return quickTaskProjectId;
    }

    const normalizedProjectName = normalizeQuickAddName(quickTaskProjectName);
    if (!normalizedProjectName) return effectiveActiveProjectId || null;

    const matchingProjects = state.projects.filter(
      (project) => normalizeQuickAddName(project.name) === normalizedProjectName,
    );
    return matchingProjects.length === 1 ? matchingProjects[0].id : null;
  }, [
    effectiveActiveProjectId,
    quickTaskProjectId,
    quickTaskProjectName,
    state.projects,
  ]);
  const quickTaskProjectBuckets = useMemo(
    () => quickTaskTargetProjectId
      ? state.buckets.filter((bucket) => bucket.projectId === quickTaskTargetProjectId)
      : [],
    [quickTaskTargetProjectId, state.buckets],
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
    if (previousActiveProjectIdRef.current === effectiveActiveProjectId) return;
    previousActiveProjectIdRef.current = effectiveActiveProjectId;
    clearLatestPasteUndo();
  }, [effectiveActiveProjectId]);

  useEffect(() => {
    if (!latestPasteUndo) return;
    const hasRemainingPastedTask = state.tasks.some((task) => (
      task.projectId === latestPasteUndo.projectId
      && latestPasteUndo.taskIds.includes(task.id)
    ));
    if (!hasRemainingPastedTask) {
      clearLatestPasteUndo();
    }
  }, [latestPasteUndo, state.tasks]);

  useEffect(() => {
    if (!quickTaskProjectId) return;
    const selectedProject = state.projects.find((project) => project.id === quickTaskProjectId);
    if (!selectedProject) {
      setQuickTaskProjectId(null);
      setQuickTaskBucketId(null);
      return;
    }
    setQuickTaskProjectName(selectedProject.name);
  }, [quickTaskProjectId, state.projects]);

  useEffect(() => {
    if (selectedTemplateId && state.templates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId(state.templates[0]?.id ?? null);
  }, [selectedTemplateId, state.templates]);

  useEffect(() => {
    if (
      projectImportDestinationKind !== 'existing'
      || !selectedProjectImportDestinationId
      || state.projects.some(
        (project) => project.id === selectedProjectImportDestinationId,
      )
    ) {
      return;
    }
    setSelectedProjectImportDestinationId('');
  }, [
    projectImportDestinationKind,
    selectedProjectImportDestinationId,
    state.projects,
  ]);

  useEffect(() => {
    try {
      savePlannerDataV2ToLocalStorage(state);
      setStatus('Saved locally');
    } catch {
      setStatus('Could not save locally');
    }
  }, [state]);

  useEffect(() => {
    if (!lastRestoreBackup) return;
    const recoverySnapshot = loadRestoreRecoverySnapshot(localStorage, state);
    if (recoverySnapshot) return;
    setLastRestoreBackup(null);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
  }, [lastRestoreBackup, state]);

  useEffect(() => {
    if (!exportNotice) return;

    const timeoutId = window.setTimeout(() => {
      setExportNotice(null);
    }, EXPORT_NOTICE_DURATION_MS);

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
    saveBoardZoomPreference(boardZoomPercent);
  }, [boardZoomPercent]);

  useEffect(() => {
    return () => {
      if (hideSearchStatusTimeoutRef.current !== null) {
        window.clearTimeout(hideSearchStatusTimeoutRef.current);
      }
      if (restoreUndoCloseTimeoutRef.current !== null) {
        window.clearTimeout(restoreUndoCloseTimeoutRef.current);
      }
      if (pasteUndoTimeoutRef.current !== null) {
        window.clearTimeout(pasteUndoTimeoutRef.current);
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

  const orderedVisibleTasks = useMemo(() => {
    const ordered: PlannerTask[] = [];
    ordered.push(...(filteredTasksByBucket.get(null) ?? []));
    activeBuckets.forEach((bucket) => {
      ordered.push(...(filteredTasksByBucket.get(bucket.id) ?? []));
    });
    return ordered;
  }, [activeBuckets, filteredTasksByBucket]);

  const visibleTaskIdSet = useMemo(
    () => new Set(orderedVisibleTasks.map((task) => task.id)),
    [orderedVisibleTasks],
  );

  useEffect(() => {
    setSelectedTaskIds((current) => {
      const nextSelection = pruneTaskSelection(current, visibleTaskIdSet);
      return nextSelection.size === current.size ? current : nextSelection;
    });
  }, [visibleTaskIdSet]);

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

  const findUniqueQuickTaskBucketId = (projectId: string | null, name: string): string | null => {
    if (!projectId || !name.trim()) return null;
    const normalizedName = normalizeQuickAddName(name);
    const matchingBuckets = state.buckets.filter((bucket) => (
      bucket.projectId === projectId
      && normalizeQuickAddName(bucket.name) === normalizedName
    ));
    return matchingBuckets.length === 1 ? matchingBuckets[0].id : null;
  };

  const setQuickTaskProjectTarget = (project: Project, clearBucket = false) => {
    setQuickTaskProjectId(project.id);
    setQuickTaskProjectName(project.name);
    if (clearBucket) {
      setQuickTaskBucketId(null);
      setQuickTaskBucketName('');
    } else {
      setQuickTaskBucketId(findUniqueQuickTaskBucketId(project.id, quickTaskBucketName));
    }
    setQuickTaskMessage(null);
  };

  const selectProject = (projectId: string) => {
    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    setActiveProjectId(projectId);
    setQuickTaskProjectTarget(project);
    setSelectedTaskIds(new Set());
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
    setQuickTaskProjectTarget(project, true);
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

  const handleQuickTaskTitleChange = (value: string) => {
    setQuickTaskTitle(value);
    setQuickTaskMessage(null);
  };

  const handleQuickTaskBucketNameChange = (value: string) => {
    setQuickTaskBucketName(value);
    setQuickTaskBucketId(null);
    setQuickTaskMessage(null);
  };

  const handleQuickTaskBucketSelectionChange = (bucketId: string | null) => {
    setQuickTaskBucketId(bucketId);
    setQuickTaskMessage(null);
  };

  const handleQuickTaskProjectNameChange = (value: string) => {
    const normalizedProjectName = normalizeQuickAddName(value);
    const matchingProjects = normalizedProjectName
      ? state.projects.filter(
        (project) => normalizeQuickAddName(project.name) === normalizedProjectName,
      )
      : [];
    const targetProjectId = normalizedProjectName
      ? (matchingProjects.length === 1 ? matchingProjects[0].id : null)
      : (effectiveActiveProjectId || null);

    setQuickTaskProjectName(value);
    setQuickTaskProjectId(null);
    setQuickTaskBucketId(findUniqueQuickTaskBucketId(targetProjectId, quickTaskBucketName));
    setQuickTaskMessage(null);
  };

  const handleQuickTaskProjectSelectionChange = (projectId: string | null) => {
    if (!projectId) {
      setQuickTaskProjectId(null);
      return;
    }

    const project = state.projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      setQuickTaskProjectId(null);
      setQuickTaskBucketId(null);
      return;
    }

    setQuickTaskProjectId(project.id);
    setQuickTaskProjectName(project.name);
    setQuickTaskBucketId(findUniqueQuickTaskBucketId(project.id, quickTaskBucketName));
    setQuickTaskMessage(null);
  };

  const submitQuickTask = (override?: {
    projectName?: string;
    selectedProjectId?: string | null;
  }) => {
    const reservedIds = new Set<string>();
    const projectName = override?.projectName ?? quickTaskProjectName;
    const selectedProjectId = override?.selectedProjectId === undefined
      ? quickTaskProjectId
      : override.selectedProjectId;
    const result = resolveQuickAdd({
      data: state,
      currentProjectId: effectiveActiveProjectId,
      draft: {
        taskTitle: quickTaskTitle,
        bucketName: quickTaskBucketName,
        projectName,
        selectedBucketId: quickTaskBucketId,
        selectedProjectId,
      },
      generated: {
        projectId: createUniquePlannerId(state, reservedIds),
        bucketId: createUniquePlannerId(state, reservedIds),
        taskId: createUniquePlannerId(state, reservedIds),
        timestamp: now(),
      },
    });

    if (!result.ok) {
      setQuickTaskMessage(result.message);
      window.requestAnimationFrame(() => {
        if (result.field === 'project') quickTaskProjectInputRef.current?.focus();
        else if (result.field === 'bucket') quickTaskBucketInputRef.current?.focus();
        else quickTaskInputRef.current?.focus();
      });
      return;
    }

    const { addition, activationProjectId } = result;
    if (addition.project || addition.bucket || addition.task) {
      dispatchPlanner({ type: 'APPLY_QUICK_ADD', addition });
    }

    const targetProject = addition.project
      ?? state.projects.find((project) => project.id === activationProjectId);
    const targetBucket = addition.bucket
      ?? (
        addition.task?.bucketId
          ? state.buckets.find((bucket) => bucket.id === addition.task?.bucketId)
          : undefined
      )
      ?? (
        quickTaskBucketName.trim()
          ? state.buckets.find((bucket) => (
            bucket.id === findUniqueQuickTaskBucketId(activationProjectId, quickTaskBucketName)
          ))
          : undefined
      );

    setActiveProjectId(activationProjectId);
    if (activationProjectId !== effectiveActiveProjectId) {
      setSelectedTaskIds(new Set());
      setActivePasteBucketId(null);
      setEditor(null);
      setSearchQuery('');
    }
    if (targetProject) {
      setQuickTaskProjectId(targetProject.id);
      setQuickTaskProjectName(targetProject.name);
    }
    if (targetBucket) {
      setQuickTaskBucketId(targetBucket.id);
      setQuickTaskBucketName(targetBucket.name);
    } else {
      setQuickTaskBucketId(null);
      setQuickTaskBucketName('');
    }

    const addedEntities = [
      addition.project ? 'project' : null,
      addition.bucket ? 'bucket' : null,
      addition.task ? 'task' : null,
    ].filter((entity): entity is string => entity !== null);
    setQuickTaskMessage(
      addedEntities.length > 0
        ? `Added ${addedEntities.join(', ')}.`
        : `Switched to ${targetProject?.name ?? 'the selected project'}.`,
    );

    if (addition.task) {
      setQuickTaskTitle('');
      setPendingTaskSurge(true);
    }
    if (addition.bucket) setPendingBucketWarp(true);

    window.requestAnimationFrame(() => {
      quickTaskInputRef.current?.focus();
    });
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
      const fallbackProject = state.projects.find((project) => project.id === fallbackProjectId);
      dispatchPlanner({ type: 'DELETE_PROJECT', projectId: confirmDialog.action.projectId });
      setActiveProjectId(fallbackProjectId);
      if (quickTaskProjectId === confirmDialog.action.projectId) {
        if (fallbackProject) {
          setQuickTaskProjectTarget(fallbackProject);
        } else {
          setQuickTaskProjectId(null);
          setQuickTaskProjectName('');
          setQuickTaskBucketId(null);
        }
      }
      setSelectedTaskIds(new Set());
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
    const exportedAt = new Date();
    let payload: PlannerData | ReturnType<typeof buildPlannerScopedExchangeEnvelope>;
    let filenameScope: PlannerExportFilenameScope;

    try {
      if (exportScope === 'project') {
        payload = buildPlannerScopedExchangeEnvelope(
          state,
          { kind: 'project', projectId: effectiveActiveProjectId },
          exportedAt,
        );
        filenameScope = { kind: 'project', name: activeProject.name };
      } else if (exportScope === 'unassigned') {
        payload = buildPlannerScopedExchangeEnvelope(
          state,
          {
            kind: 'unassigned',
            projectId: effectiveActiveProjectId,
          },
          exportedAt,
        );
        filenameScope = { kind: 'unassigned' };
      } else if (exportScope.startsWith('bucket:')) {
        const bucketId = exportScope.slice('bucket:'.length);
        const bucket = activeBuckets.find((item) => item.id === bucketId);
        if (!bucket) {
          throw new Error('The selected export bucket no longer exists.');
        }
        payload = buildPlannerScopedExchangeEnvelope(
          state,
          {
            kind: 'bucket',
            projectId: effectiveActiveProjectId,
            bucketId,
          },
          exportedAt,
        );
        filenameScope = { kind: 'bucket', name: bucket.name };
      } else {
        payload = buildRawPlannerDataExport(state, { kind: 'all' });
        filenameScope = { kind: 'all' };
      }
    } catch {
      setDataActionMessage('Current planner data could not be validated for export.');
      return;
    }

    const filename = buildPlannerExportFilename(filenameScope, exportedAt);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);

    try {
      link.click();
      setDataActionMessage(null);
      setExportNotice(`Export started — check your default Downloads folder for ${filename}.`);
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

  const readJsonFromFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<
    | { ok: true; value: unknown }
    | { ok: false; message: string }
    | null
  > => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return null;

    try {
      return { ok: true, value: JSON.parse(await file.text()) as unknown };
    } catch (error) {
      if (error instanceof SyntaxError) {
        return { ok: false, message: 'Selected file could not be read as JSON.' };
      }
      return { ok: false, message: 'Selected file could not be read.' };
    }
  };

  const restoreDataFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const readSequence = ++restoreFileReadSequenceRef.current;
    projectImportFileReadSequenceRef.current += 1;
    setPendingRestoreData(null);
    setPendingProjectImport(null);
    setSelectedProjectImportSourceId('');
    setProjectImportDestinationKind(null);
    setSelectedProjectImportDestinationId('');
    const fileResult = await readJsonFromFile(event);
    if (readSequence !== restoreFileReadSequenceRef.current || !fileResult) return;
    if (!fileResult.ok) {
      setDataActionMessage(fileResult.message);
      return;
    }

    if (
      isValidPlannerScopedExchangeEnvelope(fileResult.value)
      || isValidProjectExchangeEnvelope(fileResult.value)
      || isProjectExchangeEnvelopeCandidate(fileResult.value)
    ) {
      setPendingRestoreData(null);
      setDataActionMessage(
        'Scoped exchange files cannot be restored. Use Import project JSON instead; Restore accepts All data and legacy raw v1/v2 backups.',
      );
      return;
    }

    try {
      const result = coercePlannerDataToV2(fileResult.value);
      setPendingProjectImport(null);
      setSelectedProjectImportSourceId('');
      setProjectImportDestinationKind(null);
      setSelectedProjectImportDestinationId('');
      setPendingRestoreData(result.data);
      setDataActionMessage(null);
    } catch {
      setPendingRestoreData(null);
      setDataActionMessage(`Selected file is not a valid ${APP_NAME} full-data backup.`);
    }
  };

  const clearPendingProjectImport = () => {
    projectImportFileReadSequenceRef.current += 1;
    setPendingProjectImport(null);
    setSelectedProjectImportSourceId('');
    setProjectImportDestinationKind(null);
    setSelectedProjectImportDestinationId('');
  };

  const clearWorkspaceTransientState = (clearClipboard: boolean) => {
    setSelectedTaskIds(new Set());
    clearLatestPasteUndo();
    setActivePasteBucketId(null);
    if (clearClipboard) {
      setTaskClipboard([]);
    }
    setEditor(null);
    setSearchQuery('');
    setConfirmDialog(null);
    setRenameDialog(null);
    setRenameDialogError(null);
    setShowArchiveConfirm(false);
    setBoardBucketAddOpen(false);
    setBoardBucketNameDraft('');
    setPendingBucketWarp(false);
    setHighlightedBucketId(null);
    setHighlightedTaskId(null);
    setHighlightedTaskBucketId(null);
    setUploadedTaskIds([]);
    setPendingTaskSurge(false);
    setDraggedTaskId(null);
    setDraggedTaskIds([]);
    setDraggedBucketId(null);
    setActiveBucketDropIndex(null);
    setSettledBucketDropIndex(null);
    setSettledBucketId(null);
    setSettledBucketFrom(null);
    cancelBoardEdgeAutoscroll();

    if (bucketHighlightTimeoutRef.current !== null) {
      window.clearTimeout(bucketHighlightTimeoutRef.current);
      bucketHighlightTimeoutRef.current = null;
    }
    if (taskSurgeTimeoutRef.current !== null) {
      window.clearTimeout(taskSurgeTimeoutRef.current);
      taskSurgeTimeoutRef.current = null;
    }
    if (uploadHaloTimeoutRef.current !== null) {
      window.clearTimeout(uploadHaloTimeoutRef.current);
      uploadHaloTimeoutRef.current = null;
    }
    if (bucketDropSettleTimeoutRef.current !== null) {
      window.clearTimeout(bucketDropSettleTimeoutRef.current);
      bucketDropSettleTimeoutRef.current = null;
    }
  };

  const importProjectFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const readSequence = ++projectImportFileReadSequenceRef.current;
    restoreFileReadSequenceRef.current += 1;
    setPendingProjectImport(null);
    setSelectedProjectImportSourceId('');
    setProjectImportDestinationKind(null);
    setSelectedProjectImportDestinationId('');
    setPendingRestoreData(null);
    const fileResult = await readJsonFromFile(event);
    if (readSequence !== projectImportFileReadSequenceRef.current || !fileResult) return;
    if (!fileResult.ok) {
      setDataActionMessage(fileResult.message);
      return;
    }

    try {
      const parsed = parsePlannerProjectImport(fileResult.value);
      setPendingProjectImport(parsed);
      setSelectedProjectImportSourceId(parsed.autoSelectedSourceProjectId ?? '');
      setProjectImportDestinationKind(null);
      setSelectedProjectImportDestinationId('');
      setDataActionMessage(null);
    } catch (error) {
      clearPendingProjectImport();
      setDataActionMessage(
        error instanceof Error
          ? error.message
          : `Selected file is not a valid ${APP_NAME} project import.`,
      );
    }
  };

  const confirmProjectImport = () => {
    if (!pendingProjectImport || !selectedProjectImportSourceId || !projectImportDestinationKind) {
      return;
    }
    if (projectImportDestinationKind === 'existing' && !selectedProjectImportDestinationId) {
      return;
    }

    try {
      const result = importPlannerProject(state, pendingProjectImport, {
        sourceProjectId: selectedProjectImportSourceId,
        destination: projectImportDestinationKind === 'new'
          ? { kind: 'new' }
          : { kind: 'existing', projectId: selectedProjectImportDestinationId },
        createUniqueId: createId,
        importedAt: now(),
      });
      const destinationProject = result.data.projects.find(
        (project) => project.id === result.activationProjectId,
      );

      clearRestoreRecoverySnapshot(localStorage);
      setLastRestoreBackup(null);
      setHideRestoreUndoCard(false);
      setIsRestoreUndoClosing(false);
      clearWorkspaceTransientState(false);
      dispatchPlanner({ type: 'REPLACE_DATA', data: result.data });
      setActiveProjectId(result.activationProjectId);
      setQuickTaskProjectId(result.activationProjectId);
      setQuickTaskProjectName(destinationProject?.name ?? '');
      setQuickTaskBucketId(null);
      setQuickTaskBucketName('');
      setQuickTaskMessage(null);

      setUploadedTaskIds(result.uploadedTaskIds);
      uploadHaloTimeoutRef.current = window.setTimeout(() => {
        setUploadedTaskIds([]);
        uploadHaloTimeoutRef.current = null;
      }, UPLOAD_HALO_DURATION_MS);

      clearPendingProjectImport();
      setDataActionMessage(formatProjectImportSummary(
        result.summary,
        result.sourceProjectName,
        destinationProject?.name ?? 'Untitled project',
      ));
    } catch (error) {
      setDataActionMessage(
        error instanceof Error
          ? `Project import could not be completed: ${error.message}`
          : 'Project import could not be completed.',
      );
    }
  };

  const confirmRestoreData = () => {
    if (!pendingRestoreData) return;
    const recoveryResult = saveRestoreRecoverySnapshot(
      localStorage,
      state,
      pendingRestoreData,
      now(),
    );
    if (!recoveryResult.ok) {
      setDataActionMessage(
        'Restore was not started because a recovery snapshot could not be saved locally.',
      );
      return;
    }

    const restoredProjectId = selectInitialProjectId(pendingRestoreData.projects);
    const restoredProject = pendingRestoreData.projects.find(
      (project) => project.id === restoredProjectId,
    );
    setLastRestoreBackup(recoveryResult.snapshot.previousData);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
    clearWorkspaceTransientState(true);
    dispatchPlanner({ type: 'REPLACE_DATA', data: pendingRestoreData });
    setActiveProjectId(restoredProjectId);
    setQuickTaskProjectId(restoredProjectId || null);
    setQuickTaskProjectName(restoredProject?.name ?? '');
    setQuickTaskBucketId(null);
    setQuickTaskBucketName('');
    setQuickTaskMessage(null);
    clearPendingProjectImport();
    setPendingRestoreData(null);
    setDataActionMessage(null);
  };

  const undoRestoreData = () => {
    if (!lastRestoreBackup) return;
    const restoredProjectId = selectInitialProjectId(lastRestoreBackup.projects);
    const restoredProject = lastRestoreBackup.projects.find(
      (project) => project.id === restoredProjectId,
    );
    clearRestoreRecoverySnapshot(localStorage);
    clearWorkspaceTransientState(true);
    dispatchPlanner({ type: 'REPLACE_DATA', data: lastRestoreBackup });
    setActiveProjectId(restoredProjectId);
    setQuickTaskProjectId(restoredProjectId || null);
    setQuickTaskProjectName(restoredProject?.name ?? '');
    setQuickTaskBucketId(null);
    setQuickTaskBucketName('');
    setQuickTaskMessage(null);
    setLastRestoreBackup(null);
    setHideRestoreUndoCard(false);
    setIsRestoreUndoClosing(false);
    setDataActionMessage('Restore undone.');
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
      setLastRestoreBackup(null);
      clearRestoreRecoverySnapshot(localStorage);
      restoreUndoCloseTimeoutRef.current = null;
    }, 420);
  };

  const pendingRestoreSummary = pendingRestoreData
    ? `${pendingRestoreData.tasks.length} task(s) and ${pendingRestoreData.buckets.length} bucket(s)`
    : '';
  const projectImportSourceOptions = pendingProjectImport?.sourceProjectChoices.map((choice) => ({
    projectId: choice.projectId,
    label: choice.label,
  })) ?? [];
  const projectImportDestinationProjects = buildProjectChoiceOptions(state.projects);
  const projectImportSourceKindLabel = pendingProjectImport
    ? pendingProjectImport.sourceKind === 'scoped-envelope'
      ? 'Scoped exchange export ready to import.'
      : pendingProjectImport.sourceKind === 'project-envelope'
        ? 'Legacy project export ready to import.'
      : pendingProjectImport.sourceKind === 'raw-v1'
        ? 'Legacy planner export ready; choose one source project.'
        : 'Planner backup ready; choose one source project.'
    : '';
  const canConfirmProjectImport = Boolean(
    pendingProjectImport
    && projectImportSourceOptions.some(
      (option) => option.projectId === selectedProjectImportSourceId,
    )
    && projectImportDestinationKind
    && (
      projectImportDestinationKind === 'new'
      || projectImportDestinationProjects.some(
        (project) => project.projectId === selectedProjectImportDestinationId,
      )
    ),
  );
  const exportScopeOptionCount = 3 + activeBuckets.length;

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

  const setTaskSelection = (taskId: string, shouldSelect: boolean) => {
    setSelectedTaskIds((current) => {
      if (current.has(taskId) === shouldSelect) return current;
      return toggleTaskSelection(current, taskId);
    });
  };

  const setBucketSelection = (bucketId: string | null, shouldSelect: boolean) => {
    setSelectedTaskIds((current) => (
      setVisibleBucketTaskSelection(current, orderedVisibleTasks, bucketId, shouldSelect)
    ));
  };

  const setClipboardFromTasks = (tasks: PlannerTask[]) => {
    setTaskClipboard(
      tasks.map((task) => ({
        title: task.title,
        description: task.description,
        completed: task.completed,
        pinned: task.pinned,
      })),
    );
  };

  const copyTextWithStatus = (
    text: string,
    successMessage: string,
    failureMessage: string,
  ) => {
    void (async () => {
      try {
        await copyTextToClipboard(text);
        showTemporaryStatus(successMessage);
      } catch {
        showTemporaryStatus(failureMessage);
      }
    })();
  };

  const copyTaskToClipboard = (task: PlannerTask, bucketName: string) => {
    setClipboardFromTasks([task]);
    setActivePasteBucketId(task.bucketId);
    copyTextWithStatus(
      formatTaskForSingleCopy(task, bucketName),
      `Copied "${task.title}"`,
      'Could not copy task',
    );
  };

  const copyBucketTasksToClipboard = (bucketId: string | null) => {
    let copyDocument: ReturnType<typeof buildStructuredBucketCopyDocument>;
    try {
      copyDocument = buildStructuredBucketCopyDocument(state, {
        projectId: effectiveActiveProjectId,
        bucketId,
      });
    } catch {
      showTemporaryStatus('Could not copy bucket');
      return;
    }

    setTaskClipboard(copyDocument.tasks);
    setActivePasteBucketId(bucketId);
    copyTextWithStatus(
      JSON.stringify(copyDocument, null, 2),
      `Copied ${copyDocument.bucket.name} as JSON with ${copyDocument.tasks.length} task${copyDocument.tasks.length === 1 ? '' : 's'}`,
      `Could not copy ${copyDocument.bucket.name}`,
    );
  };

  const copyActiveProjectToClipboard = () => {
    setTaskClipboard([]);
    setActivePasteBucketId(null);
    try {
      copyTextWithStatus(
        formatProjectMarkdownForCopy(state, effectiveActiveProjectId),
        `Copied project "${activeProject.name}"`,
        `Could not copy project "${activeProject.name}"`,
      );
    } catch {
      showTemporaryStatus(`Could not copy project "${activeProject.name}"`);
    }
  };

  const copySelectedTasks = () => {
    const tasks = getSelectedTasksInVisibleOrder(selectedTaskIds, orderedVisibleTasks);
    if (tasks.length === 0) {
      showTemporaryStatus('Select tasks to copy first');
      return;
    }

    setClipboardFromTasks(tasks);

    copyTextWithStatus(
      tasks.map(formatTaskForOrderedCopy).join('\n'),
      `Copied ${tasks.length} selected task${tasks.length === 1 ? '' : 's'}`,
      'Could not copy selected tasks',
    );
  };

  const pasteTasksIntoBucket = (bucketId: string | null) => {
    if (!effectiveActiveProjectId) return;
    if (taskClipboard.length === 0) {
      showTemporaryStatus('Copy tasks first to paste');
      return;
    }

    const destinationBucketId = (
      bucketId !== null
      && activeBuckets.some((bucket) => bucket.id === bucketId)
    )
      ? bucketId
      : null;
    const pastedTasks = taskClipboard.map((task) => createTask(effectiveActiveProjectId, {
      title: task.title,
      description: task.description,
      bucketId: destinationBucketId,
    }));
    const bucketName = destinationBucketId
      ? bucketNameById.get(destinationBucketId) ?? 'Unassigned'
      : 'Unassigned';

    clearLatestPasteUndo();
    dispatchPlanner({
      type: 'ADD_TASK_BATCH',
      tasks: pastedTasks,
    });
    setLatestPasteUndo({
      projectId: effectiveActiveProjectId,
      taskIds: pastedTasks.map((task) => task.id),
      destinationName: bucketName,
    });
    pasteUndoTimeoutRef.current = window.setTimeout(() => {
      setLatestPasteUndo(null);
      pasteUndoTimeoutRef.current = null;
    }, PASTE_UNDO_DURATION_MS);

    setPendingTaskSurge(true);
    setActivePasteBucketId(destinationBucketId);
    showTemporaryStatus(`Pasted ${taskClipboard.length} task${taskClipboard.length === 1 ? '' : 's'} into ${bucketName}`);
  };

  const keepLatestPaste = () => {
    if (!latestPasteUndo) return;
    const taskCount = latestPasteUndo.taskIds.length;
    clearLatestPasteUndo();
    showTemporaryStatus(`Kept ${taskCount} pasted task${taskCount === 1 ? '' : 's'}`);
  };

  const undoLatestPaste = () => {
    if (!latestPasteUndo) return;
    const taskCount = latestPasteUndo.taskIds.length;
    dispatchPlanner({
      type: 'DELETE_TASKS_EXACT',
      projectId: latestPasteUndo.projectId,
      taskIds: latestPasteUndo.taskIds,
    });
    clearLatestPasteUndo();
    showTemporaryStatus(`Undid ${taskCount} pasted task${taskCount === 1 ? '' : 's'}`);
  };

  const handleTaskDragStart = (taskId: string, taskIds: string[]) => {
    setDraggedTaskId(taskId);
    setDraggedTaskIds(taskIds);
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
      if (selectedTaskIds.size === 0) return;
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
    if (!pendingProjectImport) return;
    ensureScrollableTargetInView(sidepanelRef.current, projectImportConfirmRef.current);
  }, [pendingProjectImport]);

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

      {latestPasteUndo && (
        <PasteUndoNotice
          taskCount={latestPasteUndo.taskIds.length}
          destinationName={latestPasteUndo.destinationName}
          onKeep={keepLatestPaste}
          onUndo={undoLatestPaste}
        />
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
          className={`board-stage board-zoom-${boardZoomPercent}`}
          aria-label="Planner board"
        >
          <div className="board-stage-toolbar">
            <div className="board-zoom-toggle" role="group" aria-label="Board zoom">
              <button
                type="button"
                className="zoom-button"
                onClick={() => setBoardZoomPercent((current) => stepBoardZoom(current, -1))}
                disabled={boardZoomPercent === BOARD_ZOOM_PERCENTAGES[0]}
                aria-label="Zoom board out"
                title="Zoom board out"
              >
                -
              </button>
              <span
                className="zoom-status"
                aria-label="Board zoom level"
                aria-live="polite"
                aria-atomic="true"
              >
                {boardZoomPercent}%
              </span>
              <button
                type="button"
                className="zoom-button"
                onClick={() => setBoardZoomPercent((current) => stepBoardZoom(current, 1))}
                disabled={boardZoomPercent === BOARD_ZOOM_PERCENTAGES[BOARD_ZOOM_PERCENTAGES.length - 1]}
                aria-label="Zoom board in"
                title="Zoom board in"
              >
                +
              </button>
            </div>
            <div className="board-actions" role="group" aria-label="Board actions">
              <button
                type="button"
                className="secondary-button project-copy-button"
                onClick={copyActiveProjectToClipboard}
              >
                Copy project
              </button>
              <SelectionActions
                selectedCount={getSelectedTaskCount(selectedTaskIds)}
                onCopySelected={copySelectedTasks}
                onClearAll={() => setSelectedTaskIds(new Set())}
              />
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
            quickTaskProjectInputRef={quickTaskProjectInputRef}
            quickTaskBucketInputRef={quickTaskBucketInputRef}
            quickTaskTitle={quickTaskTitle}
            quickTaskProjectName={quickTaskProjectName}
            quickTaskProjectId={quickTaskProjectId}
            quickTaskBucketName={quickTaskBucketName}
            quickTaskBucketId={quickTaskBucketId}
            quickTaskProjectBuckets={quickTaskProjectBuckets}
            quickTaskMessage={quickTaskMessage}
            activeBuckets={activeBuckets}
            onQuickTaskTitleChange={handleQuickTaskTitleChange}
            onQuickTaskProjectNameChange={handleQuickTaskProjectNameChange}
            onQuickTaskProjectIdChange={handleQuickTaskProjectSelectionChange}
            onQuickTaskBucketNameChange={handleQuickTaskBucketNameChange}
            onQuickTaskBucketIdChange={handleQuickTaskBucketSelectionChange}
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
            projectImportInputRef={projectImportInputRef}
            restoreInputRef={restoreInputRef}
            projectImportConfirmRef={projectImportConfirmRef}
            restoreConfirmRef={restoreConfirmRef}
            exportScopeMenuRef={exportScopeMenuRef}
            hasPendingProjectImport={Boolean(pendingProjectImport)}
            projectImportSourceKindLabel={projectImportSourceKindLabel}
            projectImportSourceOptions={projectImportSourceOptions}
            selectedProjectImportSourceId={selectedProjectImportSourceId}
            projectImportDestinationKind={projectImportDestinationKind}
            selectedProjectImportDestinationId={selectedProjectImportDestinationId}
            projectImportDestinationProjects={projectImportDestinationProjects}
            canConfirmProjectImport={canConfirmProjectImport}
            hasPendingRestoreData={Boolean(pendingRestoreData)}
            pendingRestoreSummary={pendingRestoreSummary}
            hasLastRestoreBackup={Boolean(lastRestoreBackup)}
            hideRestoreUndoCard={hideRestoreUndoCard}
            isRestoreUndoClosing={isRestoreUndoClosing}
            dataActionMessage={dataActionMessage}
            showExportScopeMenu={showExportScopeMenu}
            exportScope={exportScope}
            exportScopeOptionCount={exportScopeOptionCount}
            onConfirmProjectImport={confirmProjectImport}
            onCancelProjectImport={clearPendingProjectImport}
            onProjectImportSourceChange={setSelectedProjectImportSourceId}
            onProjectImportDestinationKindChange={(kind) => {
              setProjectImportDestinationKind(kind);
              if (kind === 'new') {
                setSelectedProjectImportDestinationId('');
              }
            }}
            onProjectImportDestinationChange={setSelectedProjectImportDestinationId}
            onToggleExportScopeMenu={() => setShowExportScopeMenu((current) => !current)}
            onSelectExportScope={(scope) => {
              setExportScope(scope);
              setShowExportScopeMenu(false);
            }}
            onExportData={exportData}
            onConfirmRestoreData={confirmRestoreData}
            onCancelRestoreData={() => {
              restoreFileReadSequenceRef.current += 1;
              setPendingRestoreData(null);
            }}
            onDismissRestoreUndoCard={dismissRestoreUndoCard}
            onUndoRestoreData={undoRestoreData}
            onRestoreFileChange={restoreDataFromFile}
            onProjectImportFileChange={importProjectFromFile}
          />
          <div
            ref={boardFrameRef}
            className="board-frame"
            role="region"
            aria-label={`${activeProject.name} board viewport`}
            tabIndex={0}
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
                selectedTaskIds={selectedTaskIds}
                bucketSelectionState={getBucketTaskSelectionState(selectedTaskIds, orderedVisibleTasks, null)}
                onTaskSelectionChange={setTaskSelection}
                onBucketSelectionChange={(shouldSelect) => setBucketSelection(null, shouldSelect)}
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
                    selectedTaskIds={selectedTaskIds}
                    bucketSelectionState={getBucketTaskSelectionState(selectedTaskIds, orderedVisibleTasks, bucket.id)}
                    onTaskSelectionChange={setTaskSelection}
                    onBucketSelectionChange={(shouldSelect) => setBucketSelection(bucket.id, shouldSelect)}
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
