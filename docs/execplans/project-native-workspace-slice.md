# Project-native workspace slice execution plan

Status: issue #63 correction and full local automated validation complete;
commit/push, exact installer build, hosted CI, and owner physical acceptance
pending
Primary issue: #61
Correction issue: #63
Separate dependency issue: #64 (no dependency changes in this correction)
Included issues: #59, #56, #47, #50, #51, #52, #53, #46
Branch: `slice/project-native-workspace`
Starting commit: `d83c2f9fbbb745815fab1d4e6ced8d07e51913ea`
Correction starting commit: `ef47435515cb616a017ce1b1cada5c8aef421a2c`

## Completion evidence

Implementation was delivered as independently reviewable commits:

- `bc5989a` — execution plan for the project-native workspace slice
- `59a84e2` — two-axis board navigation and nine-step percentage zoom
- `7d252eb` — project/bucket-aware Quick Add and sidebar disclosures
- `2ee2170` — explicit task and bucket selection
- `1805eff` — deterministic project/bucket copy and scoped export
- `e0731d8` — explicit project import plus recoverable full Restore
- `da229b5` — exact latest-paste Undo and bucket-action polish
- `ef47435` — workflow documentation and physical-acceptance handoff

Issue #63 correction work at the current checkpoint:

- `7019240` — strict scoped exchange, frozen one-to-one import reuse, exact task
  fingerprints, and synthetic regressions
- Project, Bucket, and Unassigned now use one strict versioned scope envelope;
  only All data is newly generated as raw schema-v2 data.
- Restore rejects current scoped envelopes and the legacy project envelope before
  replacement; Import accepts both wrappers plus supported raw v1/v2 files.
- Import reuse candidates come only from frozen pre-import destination snapshots
  and are consumed one-to-one.
- Task duplicate checks use the complete semantic state fingerprint.
- Focused synthetic validation: 3 test files and 128 tests passed; TypeScript and
  the Vite production build passed.

Final pre-packaging validation on 2026-07-25:

- `npm ci`: 160 packages installed; 161 packages audited
- `npm run verify`: 27 test files and 481 tests passed; TypeScript and the Vite
  production build passed
- `npm audit`: one high-severity transitive advisory for
  `vite/node_modules/postcss` (`postcss <=8.5.17`,
  `GHSA-r28c-9q8g-f849`); no dependency update was mixed into this feature slice
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features
  -- -D warnings`: passed
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed; the desktop crate
  currently contains zero Rust unit or documentation tests

Issue #63 correction validation on 2026-07-26:

- focused correction suites: 3 files and 128 synthetic tests passed
- pre-clean-install `npm run verify`: 27 files and 489 tests passed; TypeScript
  and the Vite production build passed
- `npm ci`: 160 packages installed; 161 packages audited
- post-clean-install `npm run verify`: 27 files and 489 tests passed; TypeScript
  and the Vite production build passed
- `npm audit --json`: one high-severity transitive `postcss` advisory,
  `GHSA-r28c-9q8g-f849`; zero critical, moderate, low, or informational findings;
  remediation remains exclusively owned by #64
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features
  -- -D warnings`: passed
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed; zero Rust unit or
  documentation tests
- `git diff --check`: passed; package manifests and lockfiles are unchanged

The exact committed desktop installer is built and hashed only after the final
documentation commit is synchronized with the remote branch. Browser/WebView,
clipboard, drag, focus, installation, and uninstall behavior remain in the owner
physical-acceptance matrix below.

## Purpose and boundaries

This slice makes projects the explicit unit of capture and exchange while improving
large-board navigation, selection, import safety, and clipboard recovery. Browser
and Tauri builds continue to use the same React source and schema-v2 domain model.

The work is terminal/API-only. Automated tests use synthetic fixtures. No browser,
desktop application, installer, clipboard read, Downloads folder, WebView profile,
or real planner/export data is inspected or controlled.

The following remain outside this plan:

- #49 template redesign and education
- #58 motion-profile redesign
- #40 durable desktop files and backups
- #41 updater and release publishing
- #60 physical uninstall/reinstall verification
- #64 dependency/audit remediation
- additional hierarchy below project → bucket → task

## Starting architecture at the recorded baseline

- `src/App.tsx` owns application composition and most transient UI state. It wires
  project/bucket/task actions, sidepanel controls, native drag/drop, selection,
  clipboard actions, import/export, notifications, and board preferences.
- `src/state/plannerReducerV2.ts` is the deterministic domain transition boundary.
  `usePlannerHistory` wraps it for undo/redo, and `REPLACE_DATA` is used for
  validated merge/restore results.
- `src/types/v2.ts` defines relational schema v2. Projects, buckets, and tasks use
  IDs; buckets and tasks retain `projectId`, and tasks optionally retain
  `bucketId`. Project names are not duplicated into child records.
- `src/types/validators.ts` performs structural and relational validation.
- `src/services/plannerPersistence.ts` owns localStorage load, v1 migration,
  malformed-data recovery, validation, and v2 save.
- `src/services/plannerImport.ts` currently coerces v1/v2 files and merges every
  incoming bucket/task into a caller-selected project with normalized bucket/task
  duplicate checks.
- `src/services/plannerClipboard.ts` owns cross-runtime text writes and legacy
  task/bucket text formatters.
- `src/components/sidepanel/QuickTaskPanel.tsx` currently captures a task plus an
  optional bucket. Project creation/targeting is separate in `ProjectList`.
- `src/components/BucketColumn.tsx` and `TaskCard.tsx` own bucket/task controls and
  drag event surfaces. Task completion and implicit card selection are separate
  state paths, but copy handlers currently mutate selection.
- `.board-frame` is the fixed-height board viewport. It owns horizontal scrolling
  only, while each `.task-list` has an independent capped vertical scroll.
  `.board` is scaled with a CSS transform, so its visual height is not represented
  reliably by normal layout height.
- Board zoom is stored as an index under
  `planner-buckets:board-zoom-index`, with five CSS classes and a default index of
  three.
- The baseline synthetic suite at the starting commit is 16 test files and 290
  passing tests.

## Intended state model

Persistent domain state remains `PlannerDataV2` and schema version 2.

New or revised transient state is intentionally not stored in planner records:

- `boardZoomPercent`: one of 70, 75, 80, 85, 90, 95, 100, 105, 110.
- `quickAddDraft`: task title, bucket text/selected bucket, project text/selected
  project, and active combobox option.
- `selectionMode` plus a task-ID set scoped to eligible tasks in the active view.
- independent sidebar disclosure state for Projects, Templates,
  Archive / View Options, and Data; all default closed per UI session.
- `pendingProjectImport`: parsed source, selected source project, destination mode,
  and selected existing destination project.
- `pasteUndo`: project ID, reader-facing destination name, and the exact task IDs
  created by the latest paste transaction.

The internal paste buffer remains transient and follows the latest compatible
task or bucket Copy action. Copy project clears it so an older task buffer cannot
masquerade as the latest copy. It is independent from the explicit selection set.

Pure domain and presentation decisions move out of `App.tsx` into focused services:

- board zoom parsing/migration
- Quick Add resolution
- selection derivation/cleanup
- project/bucket copy formatting
- export scope and filename creation
- project import source/destination planning and merge

Components remain responsible for rendering, focus, and event routing rather than
domain transformations.

## Data-format decisions

### Board zoom preference

A new percentage key stores the documented value. The legacy index key remains
read-only for rollback compatibility. Load order is:

1. valid new percentage;
2. deterministic legacy index mapping;
3. default 90%.

The legacy visual scales map to the closest supported percentage:

- index 0 → 90%
- index 1 → 95%
- index 2 → 105%
- index 3 → 110%
- index 4 → 110%

Invalid values use 90%. New writes do not overwrite or delete the old key.

### Project copy

`Copy project` produces deterministic Markdown:

1. project heading and optional description;
2. pinned buckets in stored visible order;
3. unpinned buckets in stored visible order;
4. active tasks in pinned-first stored order within each bucket;
5. a labeled Unassigned section.

Completed active tasks are included and use checked task markers. Incomplete tasks
use unchecked task markers. Archived tasks are omitted. Search and
`Show completed` are presentation filters and do not remove project-copy content.
Empty buckets and an empty Unassigned section are included so project structure is
unambiguous. Internal IDs, timestamps, and template metadata are omitted.

### Bucket copy

Bucket copy produces formatted valid JSON with stable two-space indentation and
line endings:

```json
{
  "bucket": {
    "name": "In Progress",
    "pinned": false
  },
  "tasks": [
    {
      "title": "Synthetic example",
      "description": "",
      "completed": false,
      "pinned": true
    }
  ]
}
```

It includes active, non-archived tasks regardless of the search or completed-task
view filter, in the same pinned-first order used by the board. Empty buckets copy
with an empty `tasks` array. Unassigned uses the explicit name `Unassigned`.

### JSON export

All data remains a raw schema-v2 full backup. Project, Bucket, and Unassigned use
the strict version-1 `bsp-planner-scope` exchange envelope. A Project scope
contains:

- the selected project;
- only its buckets and tasks, including archived tasks;
- only template definitions referenced by those buckets;
- only templates required by those definitions.

Every scoped export uses a tagged, versioned envelope around a valid schema-v2
data object:

```json
{
  "format": "bsp-planner-scope",
  "envelopeVersion": 1,
  "scope": {
    "kind": "project",
    "projectId": "source-id",
    "projectName": "Project name"
  },
  "exportedAt": "2026-07-25T06:30:00.000Z",
  "data": {
    "version": 2,
    "projects": [
      {
        "id": "source-id",
        "name": "Project name",
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

Bucket scope adds exact `bucketId` and `bucketName` metadata and includes one
bucket, its tasks, and required dependencies. Unassigned scope includes no named
buckets or dependencies and only null-bucket tasks. Validators require exact
envelope/scope keys, canonical ISO time, supported kind/format/version, matching
nested identities, one source project, exact dependency closure, and no unrelated
records. No schema version 3 is introduced.

Filenames use sanitized lowercase scope/name segments and a UTC timestamp through
seconds:

`bsp-planner-project-project-name-YYYY-MM-DD-HHmmss.json`

Windows-invalid characters, control characters, trailing dots/spaces, repeated
separators, and reserved/empty segments are normalized to deterministic fallbacks.
The exact filename is included in a longer-lived notification.

## Migration and compatibility

- Planner data stays at schema version 2.
- Existing v2 localStorage and v1-to-v2 migration behavior is unchanged.
- The board zoom preference receives a separate percentage key and deterministic
  one-way read migration; no stored planner data migration is required.
- The current scoped envelope has its own strict validator. Its nested planner
  data uses the unchanged schema-v2 validator.
- The legacy version-1 `bsp-planner-project` envelope remains accepted by Project
  Import and rejected by Restore.
- Legacy full v1/v2 exports remain valid Restore inputs.
- Project, Bucket, and Unassigned envelopes are rejected by full Restore with
  guidance to use project import.
- Older raw scoped exports are indistinguishable from other valid legacy raw
  planner files and remain accepted for compatibility; newly generated scoped
  files are always tagged.
- A legacy full export can be used for project import. A one-project source is
  derived automatically; a multi-project source requires an explicit source
  project choice.
- Full Restore remains replacement behavior. Before replacement, a validated
  pre-restore snapshot is written to a dedicated recovery localStorage key and is
  also available through the session Undo notice. Later domain edits retire the
  stale session Undo target rather than allowing it to discard newer work.

## Deterministic project-import rules

Project import has two explicit destinations:

1. Create a new project.
2. Merge into an explicitly selected existing project.

Create mode copies the source project while generating fresh relational IDs.
If its normalized name already exists, a deterministic ` (imported)` suffix and
then numbered suffixes are used. The created project becomes active.

Merge mode never defaults silently. The destination control must contain an
explicit valid project selection before confirmation.

Dependencies and records are resolved in this order:

1. templates by compatible normalized name, trimmed description, and active state;
2. template definitions within the mapped template by compatible normalized name,
   trimmed description, priority, position, and default-active state;
3. buckets by a unique mapped template definition, then by normalized name only
   when definition identity, trimmed description, priority, and pinned state are
   compatible;
4. tasks by the exact semantic fingerprint of resolved bucket, normalized title
   and description, completed, pinned, priority, normalized/sorted resource tags,
   and normalized archive state/timestamp.

Candidates come only from frozen snapshots of destination templates, definitions,
destination-project buckets, and destination-project tasks. Created records never
enter those candidate pools. Consumed template, definition, and bucket IDs enforce
one-to-one reuse, preserving duplicate-named source identities and bucket task
maps. Ambiguous/conflicting candidate IDs are sorted with locale-independent
code-unit ordering.

For the task fingerprint, parseable archive timestamps canonicalize to the UTC
instant; unparseable legacy strings compare by trimmed literal and `null` remains
active. Internal ID, project ID, `createdAt`, and `updatedAt` are excluded. Exact
duplicates are skipped; any state difference imports separately.

Incoming IDs are never trusted as globally unique. Every created record receives a
collision-safe ID. Imported buckets/tasks receive the chosen destination
`projectId`, and task `bucketId` values use the resolved bucket map. The summary
reports project creation/merge, dependency reuse/creation, bucket reuse/creation,
task creation, skipped exact semantic duplicates, and ambiguity/conflict choices.

## Implementation sequence and rollback points

### 1. Planning baseline

- Add this execution plan.
- Record baseline test count and preflight SHA.
- Commit independently as `docs: plan project-native workspace slice`.

Rollback: documentation-only revert.

### 2. Board navigation and zoom

- Add pure zoom constants, parsing, legacy mapping, and preference helpers.
- Replace index-based toolbar state/classes with percentage state and display.
- Make `.board-frame` own both axes and keyboard focus.
- Retain the top-left board transform because drag events and
  `getBoundingClientRect()` already share viewport coordinates. CSS transformed
  overflow expands the frame's scrollable overflow above 100%; below 100% the
  natural footprint may leave trailing blank space but does not make content
  unreachable. Record physical transformed-height verification in manual
  acceptance rather than claiming JSDOM proves it.
- Preserve task-list vertical scrolling and allow scroll chaining at its edge.
- Preserve viewport-coordinate midpoint calculations, zero-footprint bucket drop
  targets, and horizontal edge autoscroll.

Rollback: revert this commit; the old zoom key remains available and unchanged.

### 3. Project-native Quick Add and sidebar order

- Add pure Quick Add resolution with normalized existing/new targets and no-op
  validation.
- Apply the resolved optional project, bucket, and task as one reducer transition
  so history and relational validation cannot observe a partial combination.
- Add accessible project and bucket comboboxes with filtered options, arrow
  navigation, Tab acceptance, and final-field Enter submit.
- Support task, bucket, project, and all meaningful combinations.
- Retain resolved project/bucket targets after task creation; clear only title.
- Activate newly created projects and refresh bucket options on project changes.
- Reorder sidebar to Quick Add, Buckets, Projects, Templates,
  Archive / View Options, Data.
- Add independent accessible disclosures for secondary sections, closed by
  default per session.

Rollback: Quick Add/sidebar commit can be reverted without a data migration.

### 4. Explicit selection

- Add a selection-mode control and visible selected count.
- Add task selection checkboxes distinct from completion checkboxes.
- Add bucket checked/unchecked/indeterminate selectors over eligible visible tasks.
- Use the same nullable bucket-selection contract for named buckets and
  Unassigned.
- Add `Clear all` beside `Copy selected`.
- Stop task/bucket Copy and unrelated drag starts from mutating selection.
- Clean selection deterministically against active, non-archived, currently visible
  tasks after project/filter/archive/delete/move/restore changes.

Rollback: transient UI-only state can be reverted without persistence changes.

### 5. Project and bucket exchange

- Add deterministic project Markdown and structured bucket JSON formatters.
- Add `Copy project` without changing explicit selection.
- Add pure project-scope/envelope builders and a filename builder.
- Add project export scope and longer exact-filename notification.
- Keep All data as raw schema-v2 and tag Project, Bucket, and Unassigned with the
  strict general scope envelope.

Rollback: nested data remains valid schema-v2; reverting removes only new
UI/scope behavior.

### 6. Project-aware import

- Parse the strict current scope envelope and legacy project envelope while
  retaining raw v1/v2 coercion.
- Reject every supported scoped wrapper in destructive Restore.
- Add source-project and destination-mode controls.
- Implement create/merge transforms as pure validated functions.
- Report created, reused/merged, and skipped records explicitly.

Rollback: full Restore remains available throughout; this commit does not alter
stored schema or rewrite existing data.

### 7. Paste confirmation and bucket-action polish

- Record exact created IDs for each `ADD_TASK_BATCH` paste.
- Add a reducer batch-delete inverse for transaction-specific paste Undo.
- Consolidate duplicate global copy/paste keyboard handlers so one shortcut
  produces exactly one copy or paste transaction.
- Show a 10-second accessible Keep/Undo notice; a new paste finalizes the prior
  notice.
- Clear stale paste notices on project switch and Restore.
- Place Copy, Paste, Left, Right on the first bucket action row.
- Place drag, select, pin, rename, trash on the second row.
- Use recognizable muted/active pin and trash icons with explicit names.

Rollback: paste records are ordinary v2 tasks; reverting only removes the transient
undo affordance and action layout.

### 8. Coverage and documentation

- Expand pure-service, reducer, component, integration, and CSS source contracts.
- Update README behavior and exchange/import documentation.
- Record automated counts and audit state.

Rollback: tests/docs follow the independently revertible feature commits.

### 9. Issue #63 scoped-exchange and import-identity correction

- Tag every newly generated Project, Bucket, and Unassigned export.
- Reserve raw generation for All data while retaining legacy raw compatibility.
- Freeze pre-import destination candidates and consume reusable dependency/bucket
  IDs one-to-one.
- Replace text-only task duplicate matching with the exact semantic fingerprint.
- Add synthetic regressions for all scope kinds, Restore routing, legacy formats,
  duplicate-named source identity, consumed candidates, correct task maps,
  deterministic ambiguities, and state-distinct tasks.
- Keep dependency remediation in #64 and make no package changes.

Rollback: the correction is isolated after the original eight slice commits and
does not rewrite planner schema or existing history.

## Automated test matrix

### Navigation and zoom

- board frame permits both axes and is the board scroll owner
- tall board remains reachable with sidepanel closed
- horizontal scrolling and Shift+wheel mapping remain available
- all nine percentages, 90% default, new preference persistence
- legacy indices and invalid preference fallback
- toolbar percentage and disabled endpoints
- min/max midpoint calculations use viewport rectangles
- edge autoscroll and zero-footprint bucket insertion regressions

### Quick Add and sidebar

- current-project and Unassigned defaults
- existing project/bucket selection
- new project, new bucket, task with either/both
- project-only/bucket-only creation
- whitespace no-op and normalized duplicate reuse
- filtered autocomplete, arrow movement, Tab acceptance, final Enter
- retained targets and project-dependent bucket options
- required sidebar order, default disclosures, independent toggle, ARIA state

### Selection

- explicit task toggle and selection mode
- bucket select/deselect and indeterminate state
- empty bucket behavior
- visible count and Clear all
- task and bucket Copy independence
- ordered `Copy selected`
- project/filter/archive/delete/move/restore cleanup
- completion remains independent
- drag behavior and keyboard/screen-reader names

### Exchange

- project heading/description and pinned/unpinned order
- task ordering, checked state, empty buckets, Unassigned
- filter-independent active content and archived omission in Markdown
- structured valid bucket JSON and empty Unassigned
- all three scoped envelopes use exact scope identity, exclude unrelated records,
  and include only the required nested closure
- filename sanitization, reserved/empty fallback, timestamp precision
- only All data is raw; scoped nested data passes schema-v2 validation and each
  envelope passes the strict general validator

### Import and paste

- derive a one-project source and require a multi-project choice
- create-new-project and explicit merge-existing destination
- duplicate-named source template/definition/bucket preservation and correct task
  maps
- frozen reuse candidates, one-to-one consumption, and deterministic ambiguity
  reporting
- exact semantic task duplicates plus every required state-distinct case
- Project/Bucket/Unassigned/legacy-wrapper Restore rejection and legacy raw
  Restore compatibility
- paste notice, Keep, timeout, exact-ID Undo, repeated paste
- project switch, Restore, and deleted destination cleanup

### Regression

- persistence and v1 migration
- export, Restore, and Restore Undo
- task and bucket drag, midpoint placement, pin boundaries
- horizontal edge autoscroll
- bucket header containment and zero-footprint targets
- clipboard writes
- one-time entrance animation and reduced motion

## Validation cadence

After each coherent slice:

```powershell
npm run test -- --run
```

Before each commit:

```powershell
npm run verify
git diff --check
```

At major checkpoints:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Before final push/PR evidence:

```powershell
npm ci
npm run verify
npm audit
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

After local and remote heads match at the final implementation commit:

```powershell
npm run desktop:build
```

The installer is inspected and hashed but never launched. Generated build outputs
must remain ignored and unstaged.

## Manual acceptance matrix

The owner performs these checks against the exact committed installer:

| Area | Physical check | Expected result |
| --- | --- | --- |
| Board | Tall and wide realistic synthetic/migrated board, sidepanel closed | Both axes reach all cards and entry controls without a nested-scroll trap |
| Zoom | 70%, 90%, and 110% | Readable controls, accurate drag midpoint, no header overflow |
| Quick Add | Repeated tasks into retained existing/new project and bucket | Only title clears; target project/bucket remains correct |
| Sidebar | Toggle every secondary section at narrow and normal widths | Required order, independent disclosure, stable scrolling/focus |
| Selection | Select tasks and partial/whole buckets | Count, indeterminate state, Copy selected, and Clear all are correct |
| Copy independence | Copy unrelated task/bucket while a selection exists | Selection remains intact; paste buffer follows latest Copy |
| Project copy | Paste into plain text, Markdown, email/chat, and ChatGPT | Stable readable project order with no internal metadata |
| Bucket copy | Paste into a JSON parser/editor | Valid structured JSON in board order |
| Export | Inspect synthetic Project, Bucket, and Unassigned JSON chosen by the owner | Exact scope metadata, no unrelated records, and filename/notice identify scope |
| Import | Create a project and explicitly merge into an existing project | Correct destination and deterministic summary |
| Restore | Try all scoped wrappers in full Restore, then an All data backup | Scoped files are refused; full Restore/Undo stays separate |
| Paste | Paste, Keep, Undo, repeat, and switch projects | Only latest pasted IDs can be undone; stale notice clears |
| Regression | Task/bucket drag, edge autoscroll, pin, completion, archive | Existing interactions and persistence remain intact |
| Themes/motion | Light, dark, and reduced motion | Controls remain visible and motion preference is respected |

## Risks and mitigations

- Layout-aware zoom can affect board dimensions and drag rectangles. Keep all drag
  comparisons in viewport coordinates and add min/max regression tests.
- App composition is already large. New transformations belong in services, and
  new interaction surfaces belong in focused components to avoid further
  monolithic growth.
- Task-list and board scrolling are nested by necessity. The list keeps its own
  scroll for long columns, while edge chaining and the board frame provide access
  to the complete scaled column.
- Import can corrupt relational identity if IDs or template references are copied
  directly or if created records become later name-match candidates. All created
  records use mapped collision-safe IDs; reuse is frozen and one-to-one; final
  results pass the existing integrity validator before dispatch.
- Older raw scoped files cannot be distinguished from legacy full raw files.
  Current exports carry explicit scope tags, while Restore retains raw v1/v2
  compatibility and the documentation directs routine backup use to All data.
- Full exports with multiple projects are ambiguous as project-import sources.
  Confirmation is disabled until the source project and destination are explicit.
- Clipboard writes can fail. UI success is reported only after the shared clipboard
  service resolves.
- Physical WebView scroll, drag, clipboard, and installer behavior cannot be proven
  by JSDOM. Those items remain visibly called out for owner acceptance.

## Delivery and interruption handoff

Each numbered implementation unit should end as a coherent validated commit and be
pushed normally. If interrupted, leave a clean worktree after the current unit,
update #61 with exact completed/remaining units, and identify the next section in
this plan. Do not reset, clean, stash, amend, rebase, or force-push.

One draft PR targets `main` from `slice/project-native-workspace`. It remains draft
and unmerged until automated validation and owner physical acceptance are complete.
