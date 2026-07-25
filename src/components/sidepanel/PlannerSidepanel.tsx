import type {
    ChangeEvent,
    ComponentProps,
    FocusEventHandler,
    MouseEventHandler,
    RefObject,
} from 'react';
import { ProjectList } from '../ProjectList';
import { SidebarDisclosure } from '../SidebarDisclosure';
import { TemplateLibrary } from '../TemplateLibrary';
import { ArchivePanel, type ArchiveStats } from './ArchivePanel';
import { CreateBucketPanel } from './CreateBucketPanel';
import { DataPanel } from './DataPanel';
import { QuickTaskPanel } from './QuickTaskPanel';
import type {
    BucketV2 as Bucket,
    PlannerDataV2 as PlannerData,
    PlannerTaskV2 as PlannerTask,
} from '../../types/v2';

type ProjectListProps = ComponentProps<typeof ProjectList>;
type TemplateLibraryProps = ComponentProps<typeof TemplateLibrary>;
type QuickTaskPanelProps = ComponentProps<typeof QuickTaskPanel>;

export interface PlannerSidepanelProps {
    sidepanelRef: RefObject<HTMLElement>;
    sidepanelToggleGroupRef: RefObject<HTMLDivElement>;
    sidepanelToggleButtonRef: RefObject<HTMLButtonElement>;
    sidepanelLockButtonRef: RefObject<HTMLButtonElement>;
    isSidepanelOpen: boolean;
    isSidepanelLocked: boolean;
    sidepanelToggleTitle: string;
    sidepanelToggleIcon: string;
    sidepanelToggleLabel: string;
    sidepanelLockIcon: string;
    sidepanelLockLabel: string;
    onSidepanelMouseEnter: MouseEventHandler<HTMLElement>;
    onSidepanelMouseLeave: MouseEventHandler<HTMLElement>;
    onSidepanelFocusCapture: FocusEventHandler<HTMLElement>;
    onSidepanelBlurCapture: FocusEventHandler<HTMLElement>;
    onSidepanelToggleMouseEnter: MouseEventHandler<HTMLButtonElement>;
    onSidepanelToggleMouseLeave: MouseEventHandler<HTMLButtonElement>;
    onSidepanelLockMouseEnter: MouseEventHandler<HTMLButtonElement>;
    onSidepanelLockMouseLeave: MouseEventHandler<HTMLButtonElement>;
    onToggleSidepanelOpen: MouseEventHandler<HTMLButtonElement>;
    onToggleSidepanelLock: MouseEventHandler<HTMLButtonElement>;

    plannerData: PlannerData;
    activeProjectId: string;
    activeProjectName: string;
    selectedTemplateId: string | null;
    templateMessage: string | null;
    globalBucketGroups: TemplateLibraryProps['globalGroups'];
    onSelectProject: ProjectListProps['onSelectProject'];
    onCreateProject: ProjectListProps['onCreateProject'];
    onRenameProject: ProjectListProps['onRenameProject'];
    onUpdateProjectDescription: ProjectListProps['onUpdateProjectDescription'];
    onToggleProjectPin: ProjectListProps['onToggleProjectPin'];
    onMoveProject: ProjectListProps['onMoveProject'];
    onDeleteProject: ProjectListProps['onDeleteProject'];
    onSelectTemplate: TemplateLibraryProps['onSelectTemplate'];
    onCreateTemplate: TemplateLibraryProps['onCreateTemplate'];
    onRenameTemplate: TemplateLibraryProps['onRenameTemplate'];
    onUpdateTemplateDescription: TemplateLibraryProps['onUpdateTemplateDescription'];
    onSetTemplateActive: TemplateLibraryProps['onSetTemplateActive'];
    onMoveTemplate: TemplateLibraryProps['onMoveTemplate'];
    onDeleteTemplate: TemplateLibraryProps['onDeleteTemplate'];
    onCreateDefinition: TemplateLibraryProps['onCreateDefinition'];
    onRenameDefinition: TemplateLibraryProps['onRenameDefinition'];
    onUpdateDefinitionDescription: TemplateLibraryProps['onUpdateDefinitionDescription'];
    onSetDefinitionDefaultActive: TemplateLibraryProps['onSetDefinitionDefaultActive'];
    onMoveDefinition: TemplateLibraryProps['onMoveDefinition'];
    onDeleteDefinition: TemplateLibraryProps['onDeleteDefinition'];
    onApplyTemplate: TemplateLibraryProps['onApplyTemplate'];

    quickTaskShellRef: RefObject<HTMLDivElement>;
    quickTaskInputRef: RefObject<HTMLInputElement>;
    quickTaskProjectInputRef: RefObject<HTMLInputElement>;
    quickTaskBucketInputRef: RefObject<HTMLInputElement>;
    quickTaskTitle: string;
    quickTaskProjectName: string;
    quickTaskProjectId: string | null;
    quickTaskBucketName: string;
    quickTaskBucketId: string | null;
    quickTaskProjectBuckets: Bucket[];
    quickTaskMessage: string | null;
    activeBuckets: Bucket[];
    onQuickTaskTitleChange: (value: string) => void;
    onQuickTaskProjectNameChange: (value: string) => void;
    onQuickTaskProjectIdChange: (projectId: string | null) => void;
    onQuickTaskBucketNameChange: (value: string) => void;
    onQuickTaskBucketIdChange: (bucketId: string | null) => void;
    onSubmitQuickTask: QuickTaskPanelProps['onSubmit'];

    bucketName: string;
    onBucketNameChange: (value: string) => void;
    onAddBucket: () => void;

    archivedTasks: PlannerTask[];
    stats: ArchiveStats;
    showArchive: boolean;
    showCompleted: boolean;
    showArchiveConfirm: boolean;
    triageRecommendation: string;
    openAdvancedSectionsInTests: boolean;
    onToggleArchive: () => void;
    onShowCompletedChange: (showCompleted: boolean) => void;
    onArchiveCompletedTasks: () => void;
    onConfirmArchiveCompletedTasks: () => void;
    onCancelArchiveCompletedTasks: () => void;
    onEditArchivedTask: (task: PlannerTask) => void;
    onDeleteArchivedTask: (task: PlannerTask) => void;
    onToggleArchivedTask: (task: PlannerTask) => void;
    onToggleArchivedTaskPin: (task: PlannerTask) => void;
    onCopyArchivedTask: (task: PlannerTask) => void;
    onUnarchiveTask: (task: PlannerTask) => void;
    getBucketName: (bucketId: string | null) => string;

    uploadInputRef: RefObject<HTMLInputElement>;
    restoreInputRef: RefObject<HTMLInputElement>;
    uploadConfirmRef: RefObject<HTMLDivElement>;
    restoreConfirmRef: RefObject<HTMLDivElement>;
    exportScopeMenuRef: RefObject<HTMLDivElement>;
    hasPendingUploadData: boolean;
    pendingUploadSummary: string;
    hasPendingRestoreData: boolean;
    pendingRestoreSummary: string;
    hasLastRestoreBackup: boolean;
    hideRestoreUndoCard: boolean;
    isRestoreUndoClosing: boolean;
    dataActionMessage: string | null;
    showExportScopeMenu: boolean;
    exportScope: string;
    exportScopeOptionCount: number;
    onConfirmUploadData: () => void;
    onCancelUploadData: () => void;
    onToggleExportScopeMenu: () => void;
    onSelectExportScope: (scope: string) => void;
    onExportData: () => void;
    onConfirmRestoreData: () => void;
    onCancelRestoreData: () => void;
    onDismissRestoreUndoCard: () => void;
    onUndoRestoreData: () => void;
    onRestoreFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onUploadFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function PlannerSidepanel({
    sidepanelRef,
    sidepanelToggleGroupRef,
    sidepanelToggleButtonRef,
    sidepanelLockButtonRef,
    isSidepanelOpen,
    isSidepanelLocked,
    sidepanelToggleTitle,
    sidepanelToggleIcon,
    sidepanelToggleLabel,
    sidepanelLockIcon,
    sidepanelLockLabel,
    onSidepanelMouseEnter,
    onSidepanelMouseLeave,
    onSidepanelFocusCapture,
    onSidepanelBlurCapture,
    onSidepanelToggleMouseEnter,
    onSidepanelToggleMouseLeave,
    onSidepanelLockMouseEnter,
    onSidepanelLockMouseLeave,
    onToggleSidepanelOpen,
    onToggleSidepanelLock,
    plannerData,
    activeProjectId,
    activeProjectName,
    selectedTemplateId,
    templateMessage,
    globalBucketGroups,
    onSelectProject,
    onCreateProject,
    onRenameProject,
    onUpdateProjectDescription,
    onToggleProjectPin,
    onMoveProject,
    onDeleteProject,
    onSelectTemplate,
    onCreateTemplate,
    onRenameTemplate,
    onUpdateTemplateDescription,
    onSetTemplateActive,
    onMoveTemplate,
    onDeleteTemplate,
    onCreateDefinition,
    onRenameDefinition,
    onUpdateDefinitionDescription,
    onSetDefinitionDefaultActive,
    onMoveDefinition,
    onDeleteDefinition,
    onApplyTemplate,
    quickTaskShellRef,
    quickTaskInputRef,
    quickTaskProjectInputRef,
    quickTaskBucketInputRef,
    quickTaskTitle,
    quickTaskProjectName,
    quickTaskProjectId,
    quickTaskBucketName,
    quickTaskBucketId,
    quickTaskProjectBuckets,
    quickTaskMessage,
    activeBuckets,
    onQuickTaskTitleChange,
    onQuickTaskProjectNameChange,
    onQuickTaskProjectIdChange,
    onQuickTaskBucketNameChange,
    onQuickTaskBucketIdChange,
    onSubmitQuickTask,
    bucketName,
    onBucketNameChange,
    onAddBucket,
    archivedTasks,
    stats,
    showArchive,
    showCompleted,
    showArchiveConfirm,
    triageRecommendation,
    openAdvancedSectionsInTests,
    onToggleArchive,
    onShowCompletedChange,
    onArchiveCompletedTasks,
    onConfirmArchiveCompletedTasks,
    onCancelArchiveCompletedTasks,
    onEditArchivedTask,
    onDeleteArchivedTask,
    onToggleArchivedTask,
    onToggleArchivedTaskPin,
    onCopyArchivedTask,
    onUnarchiveTask,
    getBucketName,
    uploadInputRef,
    restoreInputRef,
    uploadConfirmRef,
    restoreConfirmRef,
    exportScopeMenuRef,
    hasPendingUploadData,
    pendingUploadSummary,
    hasPendingRestoreData,
    pendingRestoreSummary,
    hasLastRestoreBackup,
    hideRestoreUndoCard,
    isRestoreUndoClosing,
    dataActionMessage,
    showExportScopeMenu,
    exportScope,
    exportScopeOptionCount,
    onConfirmUploadData,
    onCancelUploadData,
    onToggleExportScopeMenu,
    onSelectExportScope,
    onExportData,
    onConfirmRestoreData,
    onCancelRestoreData,
    onDismissRestoreUndoCard,
    onUndoRestoreData,
    onRestoreFileChange,
    onUploadFileChange,
}: PlannerSidepanelProps) {
    return (
        <aside
            ref={sidepanelRef}
            className={`sidepanel ${isSidepanelOpen ? 'open' : 'collapsed'}`}
            aria-label="Planner controls"
            onMouseEnter={onSidepanelMouseEnter}
            onMouseLeave={onSidepanelMouseLeave}
            onFocusCapture={onSidepanelFocusCapture}
            onBlurCapture={onSidepanelBlurCapture}
        >
            <div
                ref={sidepanelToggleGroupRef}
                className="sidepanel-toggle-group"
                data-expanded={isSidepanelOpen ? 'true' : 'false'}
                data-auto-open-locked={isSidepanelLocked ? 'true' : 'false'}
                onFocusCapture={onSidepanelFocusCapture}
                onBlurCapture={onSidepanelBlurCapture}
            >
                <button
                    ref={sidepanelToggleButtonRef}
                    type="button"
                    className="sidepanel-toggle"
                    onClick={onToggleSidepanelOpen}
                    onMouseEnter={onSidepanelToggleMouseEnter}
                    onMouseLeave={onSidepanelToggleMouseLeave}
                    title={sidepanelToggleTitle}
                    aria-label={isSidepanelOpen ? 'Close planner controls' : 'Open planner controls'}
                >
                    <span className="sidepanel-toggle-icon" aria-hidden="true">
                        {sidepanelToggleIcon}
                    </span>
                    <span className="sidepanel-toggle-label">{sidepanelToggleLabel}</span>
                </button>
                <button
                    ref={sidepanelLockButtonRef}
                    type="button"
                    className="sidepanel-lock-toggle"
                    onClick={onToggleSidepanelLock}
                    onMouseEnter={onSidepanelLockMouseEnter}
                    onMouseLeave={onSidepanelLockMouseLeave}
                    title={sidepanelLockLabel}
                    aria-label={sidepanelLockLabel}
                >
                    {sidepanelLockIcon}
                </button>
            </div>

            <QuickTaskPanel
                shellRef={quickTaskShellRef}
                taskInputRef={quickTaskInputRef}
                projectInputRef={quickTaskProjectInputRef}
                bucketInputRef={quickTaskBucketInputRef}
                title={quickTaskTitle}
                projectName={quickTaskProjectName}
                selectedProjectId={quickTaskProjectId}
                bucketName={quickTaskBucketName}
                selectedBucketId={quickTaskBucketId}
                projects={plannerData.projects}
                projectBuckets={quickTaskProjectBuckets}
                message={quickTaskMessage}
                onTitleChange={onQuickTaskTitleChange}
                onProjectNameChange={onQuickTaskProjectNameChange}
                onProjectSelectionChange={onQuickTaskProjectIdChange}
                onBucketNameChange={onQuickTaskBucketNameChange}
                onBucketSelectionChange={onQuickTaskBucketIdChange}
                onSubmit={onSubmitQuickTask}
            />

            <CreateBucketPanel
                bucketName={bucketName}
                onBucketNameChange={onBucketNameChange}
                onAddBucket={onAddBucket}
            />

            <SidebarDisclosure title="Projects" meta={plannerData.projects.length}>
                <ProjectList
                    embedded
                    projects={plannerData.projects}
                    activeProjectId={activeProjectId}
                    onSelectProject={onSelectProject}
                    onCreateProject={onCreateProject}
                    onRenameProject={onRenameProject}
                    onUpdateProjectDescription={onUpdateProjectDescription}
                    onToggleProjectPin={onToggleProjectPin}
                    onMoveProject={onMoveProject}
                    onDeleteProject={onDeleteProject}
                />
            </SidebarDisclosure>

            <SidebarDisclosure title="Templates" meta={plannerData.templates.length}>
                <TemplateLibrary
                    embedded
                    templates={plannerData.templates}
                    definitions={plannerData.templateDefinitions}
                    selectedTemplateId={selectedTemplateId}
                    activeProjectName={activeProjectName}
                    message={templateMessage}
                    globalGroups={globalBucketGroups}
                    onSelectTemplate={onSelectTemplate}
                    onCreateTemplate={onCreateTemplate}
                    onRenameTemplate={onRenameTemplate}
                    onUpdateTemplateDescription={onUpdateTemplateDescription}
                    onSetTemplateActive={onSetTemplateActive}
                    onMoveTemplate={onMoveTemplate}
                    onDeleteTemplate={onDeleteTemplate}
                    onCreateDefinition={onCreateDefinition}
                    onRenameDefinition={onRenameDefinition}
                    onUpdateDefinitionDescription={onUpdateDefinitionDescription}
                    onSetDefinitionDefaultActive={onSetDefinitionDefaultActive}
                    onMoveDefinition={onMoveDefinition}
                    onDeleteDefinition={onDeleteDefinition}
                    onApplyTemplate={onApplyTemplate}
                />
            </SidebarDisclosure>

            <SidebarDisclosure title="Archive / View Options" meta={`${stats.visible} visible`}>
                <ArchivePanel
                    embedded
                    archivedTasks={archivedTasks}
                    stats={stats}
                    showArchive={showArchive}
                    showCompleted={showCompleted}
                    showArchiveConfirm={showArchiveConfirm}
                    triageRecommendation={triageRecommendation}
                    openAdvancedSectionsInTests={openAdvancedSectionsInTests}
                    onToggleArchive={onToggleArchive}
                    onShowCompletedChange={onShowCompletedChange}
                    onArchiveCompletedTasks={onArchiveCompletedTasks}
                    onConfirmArchiveCompletedTasks={onConfirmArchiveCompletedTasks}
                    onCancelArchiveCompletedTasks={onCancelArchiveCompletedTasks}
                    onEditTask={onEditArchivedTask}
                    onDeleteTask={onDeleteArchivedTask}
                    onToggleTask={onToggleArchivedTask}
                    onToggleTaskPin={onToggleArchivedTaskPin}
                    onCopyTask={onCopyArchivedTask}
                    onUnarchiveTask={onUnarchiveTask}
                    getBucketName={getBucketName}
                />
            </SidebarDisclosure>

            <SidebarDisclosure title="Data" className="data-panel">
                <DataPanel
                    embedded
                    uploadInputRef={uploadInputRef}
                    restoreInputRef={restoreInputRef}
                    uploadConfirmRef={uploadConfirmRef}
                    restoreConfirmRef={restoreConfirmRef}
                    exportScopeMenuRef={exportScopeMenuRef}
                    hasPendingUploadData={hasPendingUploadData}
                    pendingUploadSummary={pendingUploadSummary}
                    hasPendingRestoreData={hasPendingRestoreData}
                    pendingRestoreSummary={pendingRestoreSummary}
                    hasLastRestoreBackup={hasLastRestoreBackup}
                    hideRestoreUndoCard={hideRestoreUndoCard}
                    isRestoreUndoClosing={isRestoreUndoClosing}
                    dataActionMessage={dataActionMessage}
                    showExportScopeMenu={showExportScopeMenu}
                    exportScope={exportScope}
                    exportScopeOptionCount={exportScopeOptionCount}
                    activeBuckets={activeBuckets}
                    openAdvancedSectionsInTests={openAdvancedSectionsInTests}
                    onConfirmUploadData={onConfirmUploadData}
                    onCancelUploadData={onCancelUploadData}
                    onToggleExportScopeMenu={onToggleExportScopeMenu}
                    onSelectExportScope={onSelectExportScope}
                    onExportData={onExportData}
                    onConfirmRestoreData={onConfirmRestoreData}
                    onCancelRestoreData={onCancelRestoreData}
                    onDismissRestoreUndoCard={onDismissRestoreUndoCard}
                    onUndoRestoreData={onUndoRestoreData}
                    onRestoreFileChange={onRestoreFileChange}
                    onUploadFileChange={onUploadFileChange}
                />
            </SidebarDisclosure>
        </aside>
    );
}
