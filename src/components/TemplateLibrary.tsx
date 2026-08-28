import { useEffect, useMemo, useState } from 'react';
import type { GlobalBucketViewGroup } from '../selectors/globalBucketView';
import type { BucketTemplate, BucketTemplateDefinition } from '../types/v2';

interface TemplateLibraryProps {
  templates: BucketTemplate[];
  definitions: BucketTemplateDefinition[];
  embedded?: boolean;
  selectedTemplateId: string | null;
  activeProjectName: string;
  message: string | null;
  globalGroups: GlobalBucketViewGroup[];
  onSelectTemplate: (templateId: string) => void;
  onCreateTemplate: (name: string) => void;
  onRenameTemplate: (templateId: string, name: string) => void;
  onUpdateTemplateDescription: (templateId: string, description: string) => void;
  onSetTemplateActive: (templateId: string, active: boolean) => void;
  onMoveTemplate: (templateId: string, offset: -1 | 1) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCreateDefinition: (templateId: string, name: string) => void;
  onRenameDefinition: (definitionId: string, name: string) => void;
  onUpdateDefinitionDescription: (definitionId: string, description: string) => void;
  onSetDefinitionDefaultActive: (definitionId: string, defaultActive: boolean) => void;
  onMoveDefinition: (definitionId: string, offset: -1 | 1) => void;
  onDeleteDefinition: (definitionId: string) => void;
  onApplyTemplate: (templateId: string) => void;
}

export function TemplateLibrary({
  templates,
  definitions,
  embedded = false,
  selectedTemplateId,
  activeProjectName,
  message,
  globalGroups,
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
}: TemplateLibraryProps) {
  const openInTests = /jsdom/i.test(window.navigator.userAgent);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const selectedTemplateIndex = selectedTemplate
    ? templates.findIndex((template) => template.id === selectedTemplate.id)
    : -1;
  const selectedDefinitions = useMemo(() => (
    selectedTemplate
      ? definitions
        .filter((definition) => definition.templateId === selectedTemplate.id)
        .slice()
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      : []
  ), [definitions, selectedTemplate]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newDefinitionName, setNewDefinitionName] = useState('');
  const [templateNameDraft, setTemplateNameDraft] = useState(selectedTemplate?.name ?? '');
  const [templateDescriptionDraft, setTemplateDescriptionDraft] = useState(selectedTemplate?.description ?? '');
  const [definitionDrafts, setDefinitionDrafts] = useState<Record<string, { name: string; description: string }>>({});

  useEffect(() => {
    setTemplateNameDraft(selectedTemplate?.name ?? '');
    setTemplateDescriptionDraft(selectedTemplate?.description ?? '');
  }, [selectedTemplate?.id, selectedTemplate?.name, selectedTemplate?.description]);

  useEffect(() => {
    const next: Record<string, { name: string; description: string }> = {};
    for (const definition of selectedDefinitions) {
      next[definition.id] = {
        name: definition.name,
        description: definition.description,
      };
    }
    setDefinitionDrafts(next);
  }, [selectedDefinitions]);

  const submitCreateTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    onCreateTemplate(name);
    setNewTemplateName('');
  };

  const submitTemplateName = () => {
    if (!selectedTemplate) return;
    const name = templateNameDraft.trim();
    if (!name || name === selectedTemplate.name) return;
    onRenameTemplate(selectedTemplate.id, name);
  };

  const submitTemplateDescription = () => {
    if (!selectedTemplate) return;
    if (templateDescriptionDraft.trim() === selectedTemplate.description) return;
    onUpdateTemplateDescription(selectedTemplate.id, templateDescriptionDraft);
  };

  const submitCreateDefinition = () => {
    if (!selectedTemplate) return;
    const name = newDefinitionName.trim();
    if (!name) return;
    onCreateDefinition(selectedTemplate.id, name);
    setNewDefinitionName('');
  };

  const updateDefinitionDraft = (definitionId: string, field: 'name' | 'description', value: string) => {
    setDefinitionDrafts((current) => ({
      ...current,
      [definitionId]: {
        name: current[definitionId]?.name ?? '',
        description: current[definitionId]?.description ?? '',
        [field]: value,
      },
    }));
  };

  const Wrapper = embedded ? 'div' : 'section';

  return (
    <Wrapper
      className={`template-library${embedded ? '' : ' panel-card'}`}
      aria-label={embedded ? undefined : 'Template Library'}
    >
      {!embedded ? (
        <div className="template-library-header">
          <h2>Templates</h2>
          <span className="toolbar-meta">{templates.length}</span>
        </div>
      ) : null}

      <p className="section-helper">Choose and apply templates without opening advanced definition editors.</p>

      <div className="template-create-row">
        <input
          value={newTemplateName}
          onChange={(event) => setNewTemplateName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitCreateTemplate();
          }}
          placeholder="New template"
          maxLength={80}
          aria-label="New template name"
        />
        <button type="button" className="secondary-button" onClick={submitCreateTemplate} disabled={!newTemplateName.trim()}>
          Add
        </button>
      </div>

      {selectedTemplate ? (
        <>
          <label className="template-select-label">
            <span className="visually-hidden">Selected template</span>
            <select value={selectedTemplate.id} onChange={(event) => onSelectTemplate(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.active ? '' : 'Inactive: '}{template.name}
                </option>
              ))}
            </select>
          </label>

          <div className="template-apply-row">
            <button type="button" className="secondary-button" onClick={() => onApplyTemplate(selectedTemplate.id)}>
              Apply to {activeProjectName}
            </button>
          </div>

          <details className="panel-details" aria-label="Template settings" open={openInTests}>
            <summary>Template settings</summary>

            <div className="template-row-actions" role="group" aria-label="Template actions">
              <button
                type="button"
                className={`secondary-button${selectedTemplate.active ? ' is-pinned' : ''}`}
                onClick={() => onSetTemplateActive(selectedTemplate.id, !selectedTemplate.active)}
              >
                {selectedTemplate.active ? 'Active' : 'Inactive'}
              </button>
              <button type="button" className="secondary-button" onClick={() => onMoveTemplate(selectedTemplate.id, -1)} disabled={selectedTemplateIndex <= 0}>Move up</button>
              <button type="button" className="secondary-button" onClick={() => onMoveTemplate(selectedTemplate.id, 1)} disabled={selectedTemplateIndex < 0 || selectedTemplateIndex >= templates.length - 1}>Move down</button>
              <button type="button" className="secondary-button danger" onClick={() => onDeleteTemplate(selectedTemplate.id)} aria-label="Delete template">Delete template</button>
            </div>

            <div className="template-edit-grid">
              <input
                value={templateNameDraft}
                onChange={(event) => setTemplateNameDraft(event.target.value)}
                onBlur={submitTemplateName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitTemplateName();
                }}
                placeholder="Template name"
                maxLength={80}
                aria-label="Template name"
              />
              <textarea
                value={templateDescriptionDraft}
                onChange={(event) => setTemplateDescriptionDraft(event.target.value)}
                onBlur={submitTemplateDescription}
                placeholder="Template description"
                rows={2}
                aria-label="Template description"
              />
            </div>
          </details>

          <details className="panel-details" aria-label="Template definition editing" open={openInTests}>
            <summary>Template definitions</summary>

            <div className="template-create-row">
              <input
                value={newDefinitionName}
                onChange={(event) => setNewDefinitionName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitCreateDefinition();
                }}
                placeholder="New bucket definition"
                maxLength={80}
                aria-label="New template definition name"
              />
              <button type="button" className="secondary-button" onClick={submitCreateDefinition} disabled={!newDefinitionName.trim()}>
                Add
              </button>
            </div>

            <div className="template-definition-list">
              {selectedDefinitions.map((definition, index) => {
                const draft = definitionDrafts[definition.id] ?? {
                  name: definition.name,
                  description: definition.description,
                };

                return (
                  <div key={definition.id} className="template-definition-row">
                    <div className="template-definition-actions">
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={definition.defaultActive}
                          onChange={(event) => onSetDefinitionDefaultActive(definition.id, event.target.checked)}
                        />
                        <span>Default</span>
                      </label>
                      <button type="button" className="secondary-button" onClick={() => onMoveDefinition(definition.id, -1)} disabled={index === 0}>Move up</button>
                      <button type="button" className="secondary-button" onClick={() => onMoveDefinition(definition.id, 1)} disabled={index === selectedDefinitions.length - 1}>Move down</button>
                      <button type="button" className="secondary-button danger" onClick={() => onDeleteDefinition(definition.id)} aria-label={`Delete ${definition.name}`}>Delete</button>
                    </div>
                    <input
                      value={draft.name}
                      onChange={(event) => updateDefinitionDraft(definition.id, 'name', event.target.value)}
                      onBlur={() => onRenameDefinition(definition.id, draft.name)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') onRenameDefinition(definition.id, draft.name);
                      }}
                      placeholder="Definition name"
                      maxLength={80}
                      aria-label={`${definition.name} definition name`}
                      data-testid={`template-definition-name-${definition.id}`}
                    />
                    <textarea
                      value={draft.description}
                      onChange={(event) => updateDefinitionDraft(definition.id, 'description', event.target.value)}
                      onBlur={() => onUpdateDefinitionDescription(definition.id, draft.description)}
                      placeholder="Definition description"
                      rows={2}
                      aria-label={`${definition.name} definition description`}
                      data-testid={`template-definition-description-${definition.id}`}
                    />
                  </div>
                );
              })}
              {selectedDefinitions.length === 0 && <p className="archive-empty">No definitions yet.</p>}
            </div>
          </details>
        </>
      ) : (
        <p className="archive-empty">No templates yet.</p>
      )}

      {message && <p className="data-message">{message}</p>}

      <details className="panel-details" aria-label="Shared bucket overview" open={openInTests}>
        <summary>Shared buckets overview (cross-project)</summary>
        <div className="global-bucket-view" aria-label="Shared bucket view">
          {globalGroups.length > 0 ? (
            globalGroups.map((group) => (
              <div key={group.definition.id} className="global-bucket-group">
                <div className="global-bucket-group-header">
                  <strong>{group.definition.name}</strong>
                  <span className="toolbar-meta">{group.template.name}</span>
                </div>
                <p className="toolbar-meta">
                  {group.aggregateTaskCounts.open} open / {group.aggregateTaskCounts.completed} complete / {group.aggregateTaskCounts.archived} archived
                </p>
                <ul>
                  {group.buckets.map((entry) => (
                    <li key={entry.bucket.id}>
                      {entry.project.name}: {entry.bucket.name} ({entry.taskCounts.open}/{entry.taskCounts.completed}/{entry.taskCounts.archived})
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="archive-empty">No shared buckets yet.</p>
          )}
        </div>
      </details>
    </Wrapper>
  );
}
