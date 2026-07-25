import { useMemo, type KeyboardEvent, type RefObject } from 'react';
import {
    QuickAddCombobox,
    type QuickAddComboboxOption,
} from '../QuickAddCombobox';
import type { BucketV2 as Bucket, Project } from '../../types/v2';

interface QuickAddTargetOverride {
    projectName?: string;
    selectedProjectId?: string | null;
}

export interface QuickTaskPanelProps {
    shellRef: RefObject<HTMLDivElement>;
    taskInputRef: RefObject<HTMLInputElement>;
    projectInputRef: RefObject<HTMLInputElement>;
    bucketInputRef: RefObject<HTMLInputElement>;
    title: string;
    projectName: string;
    selectedProjectId: string | null;
    bucketName: string;
    selectedBucketId: string | null;
    projects: Project[];
    projectBuckets: Bucket[];
    message: string | null;
    onTitleChange: (value: string) => void;
    onProjectNameChange: (value: string) => void;
    onProjectSelectionChange: (projectId: string | null) => void;
    onBucketNameChange: (value: string) => void;
    onBucketSelectionChange: (bucketId: string | null) => void;
    onSubmit: (override?: QuickAddTargetOverride) => void;
}

const normalizeOptionLabel = (label: string): string => label.trim().toLocaleLowerCase();

const buildOptions = (
    items: Array<{ id: string; name: string }>,
    entityLabel: string,
): QuickAddComboboxOption[] => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
        const normalized = normalizeOptionLabel(item.name);
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });

    const ordinals = new Map<string, number>();
    return items.map((item) => {
        const normalized = normalizeOptionLabel(item.name);
        const count = counts.get(normalized) ?? 1;
        const ordinal = (ordinals.get(normalized) ?? 0) + 1;
        ordinals.set(normalized, ordinal);
        return {
            id: item.id,
            label: item.name,
            description: count > 1 ? `${entityLabel} ${ordinal} of ${count} with this name` : undefined,
        };
    });
};

export function QuickTaskPanel({
    shellRef,
    taskInputRef,
    projectInputRef,
    bucketInputRef,
    title,
    projectName,
    selectedProjectId,
    bucketName,
    selectedBucketId,
    projects,
    projectBuckets,
    message,
    onTitleChange,
    onProjectNameChange,
    onProjectSelectionChange,
    onBucketNameChange,
    onBucketSelectionChange,
    onSubmit,
}: QuickTaskPanelProps) {
    const projectOptions = useMemo(() => buildOptions(projects, 'Project'), [projects]);
    const bucketOptions = useMemo(() => buildOptions(projectBuckets, 'Bucket'), [projectBuckets]);

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        bucketInputRef.current?.focus();
    };

    return (
        <section className="panel-card" aria-label="Quick add">
            <h2>Quick Add</h2>
            <div ref={shellRef} className="quick-task-shell interaction-scroll-target open">
                <form
                    className="quick-task-fields"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <div className="quick-task-input-stack">
                        <label className="quick-add-field-label" htmlFor="quick-add-task-title">
                            Task title
                        </label>
                        <input
                            ref={taskInputRef}
                            id="quick-add-task-title"
                            className="quick-task-input"
                            value={title}
                            onChange={(event) => onTitleChange(event.target.value)}
                            onKeyDown={handleTitleKeyDown}
                            placeholder="Optional when creating only a project or bucket"
                            maxLength={160}
                        />
                        <QuickAddCombobox
                            inputRef={bucketInputRef}
                            label="Bucket"
                            value={bucketName}
                            selectedId={selectedBucketId}
                            options={bucketOptions}
                            placeholder="Unassigned"
                            onValueChange={onBucketNameChange}
                            onSelectionChange={(option) => onBucketSelectionChange(option?.id ?? null)}
                            onEnter={() => projectInputRef.current?.focus()}
                        />
                        <QuickAddCombobox
                            inputRef={projectInputRef}
                            label="Project"
                            value={projectName}
                            selectedId={selectedProjectId}
                            options={projectOptions}
                            placeholder="Current project"
                            onValueChange={onProjectNameChange}
                            onSelectionChange={(option) => onProjectSelectionChange(option?.id ?? null)}
                            onEnter={(acceptedOption) => onSubmit(acceptedOption
                                ? {
                                    projectName: acceptedOption.label,
                                    selectedProjectId: acceptedOption.id,
                                }
                                : undefined)}
                        />
                    </div>
                    <button type="submit" className="secondary-button">
                        Add
                    </button>
                    {message ? (
                        <p className="quick-add-message" role="status" aria-live="polite">
                            {message}
                        </p>
                    ) : null}
                </form>
            </div>
        </section>
    );
}
