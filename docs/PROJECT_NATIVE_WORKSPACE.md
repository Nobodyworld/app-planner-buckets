# Project-native workspace workflows

Planner Buckets treats a project as the working context for capture, selection,
copy, export, and import. This guide explains those workflows and the safety
boundaries between project exchange and full-planner Restore.

Planner data remains on schema v2. Projects, buckets, and tasks keep their
relationships through IDs; project names are added only to user-facing copy and
export context.

## Navigate and zoom the board

The main board viewport scrolls horizontally and vertically. Named buckets and
Unassigned remain columns within that viewport, while a long task list can still
scroll inside its own column. When an inner task list reaches an edge, continue
scrolling to reach the rest of the board rather than treating that list as the
whole workspace.

The board viewport is focusable and has an accessible name based on the active
project. Native scrollbar, wheel, touchpad, and keyboard scrolling are available
where the browser or desktop WebView supports them. Dragging near a horizontal
edge continues to autoscroll the board.

Board zoom uses this percentage scale:

`70%`, `75%`, `80%`, `85%`, `90%`, `95%`, `100%`, `105%`, `110%`

The toolbar shows the current percentage and disables the decrease or increase
button at the respective limit. The default is `90%`, and the preference is saved
locally. Older five-step zoom preferences are mapped deterministically to the new
scale; an invalid stored preference falls back to `90%`.

Zoom changes the rendered board without changing the coordinate system used for
task and bucket placement. Midpoint drops, zero-width bucket insertion targets,
and edge autoscroll therefore use the same viewport-coordinate contract at every
supported zoom level.

## Capture with Quick Add

Quick Add fields are ordered:

1. Task title
2. Bucket
3. Project

An empty Bucket means **Unassigned**, and an empty Project means the current
project. Leading and trailing whitespace is ignored. A submission containing no
meaningful task, bucket, or project is rejected with feedback, so it cannot create
blank records.

Quick Add supports all meaningful combinations:

- a task in the current project's Unassigned column;
- a task in an existing project and bucket;
- a task while creating a new bucket, project, or both;
- a new bucket without a task; and
- a new project without a task.

Names are compared after trimming and case normalization. A uniquely matching
existing project or bucket is reused rather than duplicated. If duplicate visible
names already exist, the suggestions identify their ordinal positions so the
target can be chosen explicitly. A newly created project becomes active.

Project and Bucket are accessible comboboxes. Typing filters their suggestions.
Use Up/Down Arrow to move through options and Escape to close a list. Tab accepts
the highlighted suggestion when applicable and moves forward; Shift+Tab moves
backward without submitting. Enter in Task title, Bucket, or Project submits
immediately; in a combobox, any highlighted match is resolved as part of that
submission. The Add button performs the same submission. IME-composition Enter
does not submit prematurely. After a task is added, only its title is cleared.
The resolved project and bucket remain selected, and changing the project
immediately refreshes the available bucket suggestions.

The sidepanel order is:

1. Quick Add
2. Buckets
3. Projects
4. Templates
5. Archive / View Options
6. Data

Projects, Templates, Archive / View Options, and Data are independent disclosures
and begin collapsed in each UI session. Opening one does not open or close another.

## Select tasks explicitly

Selection is a bulk-action state, not a side effect of copying or completing a
task.

- Enter selection mode to reveal task-selection checkboxes.
- Use a task's selection checkbox for bulk selection and its separate completion
  checkbox for task status.
- Use a bucket's square selector to select or clear its eligible visible tasks.
  Its checked, unchecked, or indeterminate state reflects those tasks.
- Unassigned follows the same selection rules as a named bucket.
- The selection controls show the selected count and place **Clear all** beside
  **Copy selected**.
- **Copy selected** is enabled only when at least one explicitly selected task is
  eligible.

Selected tasks are cleaned up when they stop belonging to the active eligible
view—for example after a project or filter change, archive, deletion, movement, or
Restore. Completing a task does not select it, and dragging does not change the
selection.

Copying one task, one bucket, or the project does not alter explicit selection.
The board's internal task paste buffer follows the latest compatible task or
bucket Copy action. **Copy project** is text exchange rather than a board-paste
source, so it does not leave an older task buffer masquerading as the latest copy.

Outside text-editing controls, the application supports Ctrl/Cmd+C for explicitly
selected tasks and Ctrl/Cmd+V for the board paste action. Ctrl/Cmd+Z performs
Undo; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y perform Redo where applicable.

## Copy formats

### Copy project

**Copy project** writes deterministic, readable Markdown suitable for notes,
email, chat, and ChatGPT. Its order is:

1. project heading and optional description;
2. pinned buckets in their stored visible order;
3. unpinned buckets in their stored visible order;
4. pinned tasks followed by unpinned tasks in each bucket; and
5. a final **Unassigned** section.

Incomplete tasks use `[ ]` and completed tasks use `[x]`. Each nonblank
description line appears as an indented `Note:` below its task. Active completed
tasks are included; archived tasks are omitted. Empty buckets and an empty
Unassigned section remain present as `_No active tasks._`. Search text and the
Show completed view option do not remove content from project copy.

Project Markdown contains no internal IDs, timestamps, template-definition IDs,
or other implementation metadata.

Example:

```markdown
# Website launch

Synthetic project description

## Bucket: Ready

1. [ ] Verify release notes
   Note: Use the synthetic acceptance fixture.

## Unassigned

_No active tasks._
```

### Copy bucket

A bucket's **Copy** action writes formatted JSON with two-space indentation. It
also makes that bucket's tasks the current internal board-paste buffer.

```json
{
  "bucket": {
    "name": "Ready",
    "pinned": false
  },
  "tasks": [
    {
      "title": "Verify release notes",
      "description": "Use the synthetic acceptance fixture.",
      "completed": false,
      "pinned": true
    }
  ]
}
```

The document includes active, non-archived tasks regardless of search or
Show completed filters, in stable pinned-first board order. An empty bucket has an
empty `tasks` array. The permanent lane is named `Unassigned` and has
`"pinned": false`.

## Export scopes and filenames

Open **Data**, expand **Advanced data actions**, choose
**Choose export scope**, and then use **Export JSON**. The exact saved filename
is shown in a dismissible notification long enough to identify the result.

| Scope | Payload | Filename pattern |
| --- | --- | --- |
| All data | Raw schema-v2 full backup containing every project and dependency | `bsp-planner-all-YYYY-MM-DD-HHmmss.json` |
| Project | Versioned scope envelope containing one complete project closure | `bsp-planner-project-project-name-YYYY-MM-DD-HHmmss.json` |
| Bucket | Versioned scope envelope containing one named bucket closure | `bsp-planner-bucket-bucket-name-YYYY-MM-DD-HHmmss.json` |
| Unassigned | Versioned scope envelope containing one project's null-bucket tasks | `bsp-planner-unassigned-YYYY-MM-DD-HHmmss.json` |

Timestamps are UTC through seconds. Scope and name segments are lowercase and
sanitized: Windows-invalid characters and control characters are removed,
diacritics are normalized, repeated separators collapse, and trailing dots or
spaces are removed. Empty or Windows-reserved names use a deterministic
`untitled` fallback.

Every newly generated Project, Bucket, and Unassigned export uses
`format: "bsp-planner-scope"` and `envelopeVersion: 1`. The exact `scope` object
contains the discriminator and source identity:

- Project: `kind`, `projectId`, and `projectName`;
- Bucket: those project fields plus `bucketId` and `bucketName`; and
- Unassigned: `kind`, `projectId`, and `projectName`.

A Project export contains:

- exactly one project, with its ID and name repeated in `scope`;
- that project's buckets and all of its tasks, including archived tasks; and
- only the template definitions referenced by those buckets and the templates
  required by those definitions.

A Bucket export contains exactly one named bucket, every task assigned to it
including archived tasks, and only its required template closure. An Unassigned
export contains no named bucket or template records and only tasks whose
`bucketId` is `null`.

Every scoped builder excludes unrelated projects and records. The strict
validator requires exact envelope and scope keys, a canonical ISO timestamp,
supported format/version/kind values, matching project and bucket identities,
valid nested schema-v2 relationships, and an exact required-template closure.
No planner schema version 3 is introduced.

## Project import and full Restore are different

The file shape determines the safe workflow:

| Workflow | Accepted source | Effect |
| --- | --- | --- |
| **Import project JSON** | A current scoped envelope, a legacy `bsp-planner-project` envelope, or a supported raw v1/v2 file from which a source project can be selected | Adds one project or merges it into one explicitly selected project |
| **Restore from JSON backup** | Raw validated v1/v2 planner data; among newly generated files, only **All data** has this shape | Replaces the complete current planner |

Current scoped exports use this tagged wrapper:

```json
{
  "format": "bsp-planner-scope",
  "envelopeVersion": 1,
  "scope": {
    "kind": "project",
    "projectId": "source-project-id",
    "projectName": "Website launch"
  },
  "exportedAt": "2026-07-25T06:30:00.000Z",
  "data": {
    "version": 2,
    "projects": [
      {
        "id": "source-project-id",
        "name": "Website launch",
        "description": "Synthetic example",
        "priority": 0,
        "pinned": false,
        "createdAt": "2026-07-25T06:00:00.000Z",
        "updatedAt": "2026-07-25T06:00:00.000Z"
      }
    ],
    "buckets": [],
    "tasks": [],
    "templates": [],
    "templateDefinitions": []
  }
}
```

Restore rejects Project, Bucket, and Unassigned scope envelopes before creating a
replacement confirmation or recovery snapshot, and directs the user to
**Import project JSON**. It also rejects the legacy version-1
`bsp-planner-project` wrapper, which Project Import continues to accept.

Legacy raw v1/v2 backups remain Restore- and Project-Import-compatible. Older
builds could generate raw Bucket or Unassigned files that are structurally
indistinguishable from other legacy raw planner data, so compatibility requires
Restore to continue accepting them. Newly generated scoped files are always
tagged and cannot masquerade as a new full backup. Use **All data** as the routine
full-planner backup.

### Choose the source and destination

A scoped envelope or legacy project envelope identifies exactly one source. A
raw file with one project selects that source automatically. A raw file with
several projects requires an explicit source-project choice; matching names are
disambiguated rather than guessed.

Then choose one destination:

- **Create new project** creates fresh relational IDs, activates the new project,
  and uses `Project name (imported)`, then `Project name (imported 2)`, and so on
  when needed.
- **Merge into existing project** requires one explicitly selected existing
  destination; Import confirmation remains disabled until that selection is
  valid. The active project is never used as an implicit merge destination.

### Matching and duplicate rules

Before importing any dependency or bucket, the importer freezes snapshots of the
destination templates, template definitions, destination-project buckets, and
destination-project tasks. Only those pre-import records may be reused. Created
records never become candidates for a later distinct source entity, and consumed
template, definition, and bucket IDs enforce one-to-one reuse.

Text names trim and normalize case. Import processes dependencies before content:

1. A template reuses one unconsumed frozen candidate only when normalized name,
   trimmed description, and active state are compatible; otherwise it creates a
   fresh template and reports any name conflict.
2. A definition resolves its mapped template first. It reuses one unconsumed
   frozen definition only when normalized name, trimmed description, priority,
   position, and default-active state are compatible; otherwise it creates a
   fresh definition and reports the conflict.
3. A bucket first reuses one unconsumed frozen bucket for its uniquely mapped
   template definition. Name-based fallback additionally requires compatible
   mapped-definition identity, trimmed description, priority, and pinned state.
   Conflicts or consumed candidates produce a fresh bucket, preserving each
   source bucket's task map.
4. A task is skipped only when this exact semantic fingerprint already exists in
   the frozen destination tasks or earlier in the same source import:

   ```text
   JSON.stringify([
     resolved destination bucket ID,
     normalized title,
     normalized description,
     completed,
     pinned,
     priority,
     normalized and sorted resource tags,
     normalized archived timestamp
   ])
   ```

   Title and description comparison trims and normalizes case. Resource tags are
   trimmed, lowercased, deduplicated, and code-unit sorted. `null` archive time
   means active. Any parseable archive timestamp is canonicalized to its UTC
   instant; an unparseable legacy string uses its trimmed literal. Internal ID,
   source/destination project ID, `createdAt`, and `updatedAt` are excluded.
   State-distinct tasks therefore import separately.

Ambiguous name matches are never selected arbitrarily. Import creates a separate
record when that is safe and reports canonically sorted candidate IDs. An invalid
or ambiguous relational destination that cannot preserve schema integrity is
rejected.

Created records receive fresh collision-safe IDs and the selected destination
project ID. Imported tasks preserve their completion, archive, pin, priority, tag,
title, and description state. The completion summary reports project
creation/merge, dependency and bucket creation/reuse, created tasks, skipped
exact semantic duplicates, and any ambiguity or conflict decisions.

## Recoverable full Restore

Restore is intentionally destructive, so the current validated planner is saved
as a recovery snapshot before replacement. If that snapshot cannot be written,
Restore stops rather than replacing data without its immediate recovery point.

After a successful Restore, **Undo Restore** can put back the exact previous
planner. The recovery snapshot is tied to the exact replacement state. A later
planner edit retires the stale Undo instead of allowing it to discard newer work;
the same check prevents an old snapshot from being offered against unrelated
data. Project switching and import state are reset to match the restored planner.

This is one operation-specific local recovery point, not a durable backup system.
It does not replace routine all-data exports, and clearing the application's site
or WebView storage can remove both planner data and the recovery snapshot.

## Keep or undo a paste

After tasks are pasted into a bucket or Unassigned, an accessible notice reports
the task count and destination and offers:

- **Keep** to finalize the paste; and
- **Undo** to delete only the exact task IDs created by that paste.

The notice expires after about 10 seconds. Timeout or choosing Keep finalizes the
paste. A second paste finalizes the previous one and becomes the only paste that
can be undone. Missing or independently deleted pasted tasks are ignored safely.
Switching projects or completing a full Restore clears stale paste-undo state.

## Accessibility and keyboard notes

- Quick Add uses labeled comboboxes, listbox semantics, highlighted-option
  announcements, and keyboard acceptance.
- Secondary sidepanel sections expose independent expanded/collapsed state.
- Task completion and task selection are separate labeled checkboxes.
- Bucket selection exposes checked, unchecked, and mixed states.
- Board, export, Restore, clipboard, paste confirmation, and bucket actions use
  explicit accessible names and keyboard-focusable controls.
- Named bucket actions keep Copy, Paste, Move left, and Move right together, with
  drag, select, pin, rename, and a labeled trash action in the companion row.
- Unpinned bucket pins remain visible in a muted state; pinned buckets use the
  active state.
- Left/Right buttons provide a non-pointer way to reorder buckets. Pointer drag
  remains available for bucket and task placement.
- Status, copy/export feedback, and paste confirmation use live or status regions
  so they do not rely on color alone.
- Focus indicators, light/dark themes, responsive widths, and reduced-motion
  preferences remain part of physical acceptance.

## Local-first privacy

Planner Buckets has no required account or backend. Browser and current desktop
builds store planner state in their own `localStorage`; project import, Restore,
and export occur only after a user action.

Clipboard features write only after an explicit Copy action. The application does
not need clipboard-read, shell, unrestricted filesystem, or broad Tauri
permissions for these workflows.

Readable project Markdown intentionally omits internal metadata. JSON exports are
machine-portable records and do contain relational IDs, timestamps, and the task
text needed to preserve data. Treat exported JSON and copied task text as private
user content. They are not encrypted by Planner Buckets; share them only with
trusted destinations and do not store secrets or credentials in task text.

## Manual physical acceptance checklist

Run these checks in both the supported browser and the exact desktop build using a
synthetic multi-project fixture. Back up any existing planner with **All data**
before replacing it. Automated DOM tests cannot prove physical WebView scrolling,
dragging, clipboard integration, focus, or installer behavior.

- [ ] Create a board wider and taller than the viewport, close the sidepanel, and
  reach every lower card and task-entry control with scrollbars, wheel/touchpad,
  and keyboard scrolling.
- [ ] Scroll a long inner task list to each edge and confirm the board remains
  reachable without a nested-scroll trap.
- [ ] At `70%`, `90%`, and `110%`, verify readable controls, disabled zoom limits,
  horizontal edge autoscroll, task midpoint placement, bucket midpoint placement,
  and zero-footprint insertion targets.
- [ ] Reload and confirm the chosen zoom percentage persists.
- [ ] Use Quick Add for an existing target, a new bucket, a new project, both new
  targets, bucket-only creation, and project-only creation; confirm only the task
  title clears after adding a task.
- [ ] Exercise Up/Down Arrow, Escape, Tab forward acceptance, Shift+Tab backward
  navigation, Enter submission from each field, Add-button submission, IME
  composition, duplicate-name descriptions, and project-dependent bucket
  suggestions in Quick Add.
- [ ] Confirm the required sidepanel order and independently toggle each
  secondary disclosure at normal and narrow widths.
- [ ] Select one task, a whole bucket, and part of a bucket; verify selected count,
  mixed state, Copy selected, Clear all, and independence from completion.
- [ ] With a selection intact, copy another task and bucket; confirm the selection
  remains and the next board paste uses the latest compatible Copy.
- [ ] Paste **Copy project** into a plain-text and Markdown destination; verify
  stable pinned-first order, empty sections, checked completed tasks, archived
  omission, descriptions, and absence of internal metadata.
- [ ] Paste a named bucket and Unassigned into a JSON parser; verify valid JSON,
  stable task order, explicit names, and empty-array behavior.
- [ ] Export All data, Project, Bucket, and Unassigned; verify the exact
  scope-specific UTC filename, notification, valid JSON, scope identity, and
  absence of unrelated records in every scoped envelope.
- [ ] Import each scoped envelope kind as a new project and into an explicitly
  selected existing project; verify activation, fresh IDs, preserved task state,
  and the created/reused/skipped summary.
- [ ] Import a synthetic raw multi-project file and confirm that source and
  destination ambiguity blocks confirmation until both choices are explicit.
- [ ] Offer synthetic Project, Bucket, Unassigned, and legacy project envelopes
  to Restore and confirm each is refused; then Restore a synthetic All data
  backup and use Undo Restore before making another edit.
- [ ] After another Restore, make a planner edit and confirm the old recovery
  action cannot discard that newer work.
- [ ] Paste tasks and test Keep, Undo, timeout, repeated paste, an independently
  deleted pasted task, project switching, and Restore cleanup.
- [ ] Navigate all new controls by keyboard and with a screen reader; verify names,
  checkbox states, disclosure state, focus order, focus visibility, and status
  announcements.
- [ ] Repeat the layout checks in light and dark themes, with reduced motion, and
  at practical narrow and wide window sizes.
