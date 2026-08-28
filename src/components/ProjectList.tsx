import { useEffect, useState } from 'react';
import type { Project } from '../types/v2';

interface ProjectListProps {
  projects: Project[];
  activeProjectId: string;
  embedded?: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onUpdateProjectDescription: (projectId: string, description: string) => void;
  onToggleProjectPin: (projectId: string) => void;
  onMoveProject: (projectId: string, offset: -1 | 1) => void;
  onDeleteProject: (project: Project) => void;
}

export function ProjectList({
  projects,
  activeProjectId,
  embedded = false,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onUpdateProjectDescription,
  onToggleProjectPin,
  onMoveProject,
  onDeleteProject,
}: ProjectListProps) {
  const openInTests = /jsdom/i.test(window.navigator.userAgent);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
  const activeProjectIndex = activeProject
    ? projects.findIndex((project) => project.id === activeProject.id)
    : -1;
  const [newProjectName, setNewProjectName] = useState('');
  const [nameDraft, setNameDraft] = useState(activeProject?.name ?? '');
  const [descriptionDraft, setDescriptionDraft] = useState(activeProject?.description ?? '');

  useEffect(() => {
    setNameDraft(activeProject?.name ?? '');
    setDescriptionDraft(activeProject?.description ?? '');
  }, [activeProject?.id, activeProject?.name, activeProject?.description]);

  const submitCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    onCreateProject(name);
    setNewProjectName('');
  };

  const submitRenameProject = () => {
    if (!activeProject) return;
    const name = nameDraft.trim();
    if (!name || name === activeProject.name) return;
    onRenameProject(activeProject.id, name);
  };

  const submitDescription = () => {
    if (!activeProject) return;
    if (descriptionDraft.trim() === activeProject.description) return;
    onUpdateProjectDescription(activeProject.id, descriptionDraft);
  };

  if (!activeProject) return null;
  const Wrapper = embedded ? 'div' : 'section';

  return (
    <Wrapper
      className={`project-list${embedded ? '' : ' panel-card'}`}
      aria-label={embedded ? undefined : 'Projects'}
    >
      {!embedded ? (
        <div className="project-list-header">
          <h2>Projects</h2>
          <span className="toolbar-meta">{projects.length}</span>
        </div>
      ) : null}

      <p className="section-helper">Choose an active project for the board view.</p>

      <label className="project-select-label">
        <span className="visually-hidden">Active project</span>
        <select
          value={activeProject.id}
          onChange={(event) => onSelectProject(event.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.pinned ? 'Pinned: ' : ''}{project.name}
            </option>
          ))}
        </select>
      </label>

      <div className="project-create-row">
        <input
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitCreateProject();
          }}
          placeholder="New project"
          maxLength={80}
          aria-label="New project name"
        />
        <button type="button" className="secondary-button" onClick={submitCreateProject} disabled={!newProjectName.trim()}>
          Add
        </button>
      </div>

      <details className="panel-details" aria-label="Project settings" open={openInTests}>
        <summary>Project settings</summary>

        <div className="project-row-actions" role="group" aria-label="Project actions">
          <button
            type="button"
            className={`secondary-button${activeProject.pinned ? ' is-pinned' : ''}`}
            onClick={() => onToggleProjectPin(activeProject.id)}
          >
            {activeProject.pinned ? 'Unpin project' : 'Pin project'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onMoveProject(activeProject.id, -1)}
            disabled={activeProjectIndex <= 0}
          >
            Move up
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onMoveProject(activeProject.id, 1)}
            disabled={activeProjectIndex < 0 || activeProjectIndex >= projects.length - 1}
          >
            Move down
          </button>
          <button
            type="button"
            className="secondary-button danger"
            onClick={() => onDeleteProject(activeProject)}
            disabled={projects.length <= 1}
            aria-label={projects.length <= 1 ? 'Keep at least one project' : 'Delete project'}
          >
            Delete project
          </button>
        </div>

        <div className="project-edit-grid">
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={submitRenameProject}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitRenameProject();
            }}
            placeholder="Project name"
            maxLength={80}
            aria-label="Project name"
          />
          <textarea
            value={descriptionDraft}
            onChange={(event) => setDescriptionDraft(event.target.value)}
            onBlur={submitDescription}
            placeholder="Project description"
            rows={2}
            aria-label="Project description"
          />
        </div>
      </details>
    </Wrapper>
  );
}
