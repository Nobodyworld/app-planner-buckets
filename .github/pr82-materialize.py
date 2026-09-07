"""Temporary, guarded materializer for PR #82. It creates blobs, NEVER refs or commits."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

REPO = 'Nobodyworld/app-planner-buckets'
BASE = '242e4a067bcb60951b47cfd9e95dc3f64c8d30d9'
ALLOWED = {'src/App.tsx', 'src/components/sidepanel/DataPanel.tsx', 'src/components/sidepanel/StorageStatusCard.tsx', 'src/services/plannerPersistence.ts', 'src/storage/plannerStorageRuntime.ts', 'src/storage/plannerStorageLifecycle.ts', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/src/desktop_storage.rs', 'src-tauri/src/lib.rs', 'src-tauri/capabilities/default.json', '.github/workflows/ci.yml', 'docs/DESKTOP.md', 'docs/execplans/durable-desktop-persistence-slice.md'}
def git(*args):
    return subprocess.check_output(['git', *args], encoding='utf-8').strip()
def read(path):
    return Path(path).read_text(encoding='utf-8')
def write(path, text):
    assert path in ALLOWED, path
    Path(path).write_text(text.rstrip() + '\n', encoding='utf-8', newline='\n')
def one(text, before, after):
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f'Expected one exact patch context; found {count}: {before[:120]!r}')
    return text.replace(before, after, 1)

def materialize():
    assert os.environ['GITHUB_REPOSITORY'] == REPO
    assert os.environ['GITHUB_REF'] == 'refs/heads/slice/durable-desktop-persistence'
    assert git('rev-parse', 'HEAD:src/App.tsx') == '1ea671a5a5a64ecc375d13fd7a1b4ea66f4b67fb'
    app = read('src/App.tsx')
    app = one(app, "import { savePlannerDataV2ToLocalStorage, loadPlannerDataV2FromLocalStorage } from './services/plannerPersistence';", "import { loadPlannerDataV2FromLocalStorage } from './services/plannerPersistence';\nimport { getPlannerStorageRuntimeTarget, isDesktopPlannerStorage } from './storage/plannerStorageBridge';\nimport { usePlannerStoragePersistence } from './hooks/usePlannerStoragePersistence';")
    app = one(app, 'dispatch: dispatchPlanner, canUndo, canRedo, undo, redo', 'dispatch: dispatchUnchecked, canUndo, canRedo, undo: undoUnchecked, redo: redoUnchecked')
    app = one(app, '  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);', '''  const restoreControl = useRef<AbortController | null>(null);
  const restorePhaseRef = useRef<'preparing' | 'committing' | null>(null);
  const mountedRef = useRef(true);
  const [desktopRestorePhase, setDesktopRestorePhase] = useState<'preparing' | 'committing' | null>(null);
  const dispatchPlanner = (action: PlannerActionV2) => { if (!restoreControl.current) dispatchUnchecked(action); };
  const undo = () => { if (!restoreControl.current) undoUnchecked(); };
  const redo = () => { if (!restoreControl.current) redoUnchecked(); };
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; restoreControl.current?.abort(); };
  }, []);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);''')
    app = one(app, '    loadRestoreRecoverySnapshot(localStorage, initialLoadResult.data)?.previousData ?? null', '''    isDesktopPlannerStorage()
      ? getPlannerStorageRuntimeTarget()?.getRestoreRecovery?.(initialLoadResult.data) ?? null
      : loadRestoreRecoverySnapshot(localStorage, initialLoadResult.data)?.previousData ?? null''')
    app = one(app, "  const [status, setStatus] = useState('Saved locally');", "  const [status, setStatus] = useState(isDesktopPlannerStorage() ? 'Loading storage…' : 'Saved locally');")
    app = one(app, '''  useEffect(() => {
    try {
      savePlannerDataV2ToLocalStorage(state);
      setStatus('Saved locally');
    } catch {
      setStatus('Could not save locally');
    }
  }, [state]);''', '  usePlannerStoragePersistence(state, setStatus, desktopRestorePhase !== null);')
    app = one(app, '    const recoverySnapshot = loadRestoreRecoverySnapshot(localStorage, state);', '''    const recoverySnapshot = isDesktopPlannerStorage()
      ? getPlannerStorageRuntimeTarget()?.getRestoreRecovery?.(state)
      : loadRestoreRecoverySnapshot(localStorage, state);''')
    app = one(app, '''      clearRestoreRecoverySnapshot(localStorage);
      setLastRestoreBackup(null);
      setHideRestoreUndoCard(false);
      setIsRestoreUndoClosing(false);
      clearWorkspaceTransientState(false);''', '''      // Desktop recovery retires inside the save queue only after the import commits.
      if (!isDesktopPlannerStorage()) clearRestoreRecoverySnapshot(localStorage);
      setLastRestoreBackup(null);
      setHideRestoreUndoCard(false);
      setIsRestoreUndoClosing(false);
      clearWorkspaceTransientState(false);''')
    app = one(app, '''  const confirmRestoreData = () => {
    if (!pendingRestoreData) return;''', '''  const replaceDesktopPlanner = (replacement: PlannerData, keepUndo: boolean): void => {
    const target = getPlannerStorageRuntimeTarget();
    if (!target?.replacePlanner) {
      setDataActionMessage('Desktop Restore is unavailable; no planner data was replaced.');
      return;
    }
    if (restoreControl.current) return;
    const controller = new AbortController();
    const before = state;
    restoreControl.current = controller;
    restorePhaseRef.current = 'preparing';
    setDesktopRestorePhase('preparing');
    void target.replacePlanner(before, replacement, keepUndo, controller.signal, (phase) => {
      restorePhaseRef.current = phase;
      if (mountedRef.current) setDesktopRestorePhase(phase);
    }).then((committed) => {
      if (!mountedRef.current) return;
      if (!committed) { setDataActionMessage('Restore cancelled; the current planner was retained.'); return; }
      const projectId = selectInitialProjectId(replacement.projects);
      const project = replacement.projects.find((item) => item.id === projectId);
      clearWorkspaceTransientState(true);
      dispatchUnchecked({ type: 'REPLACE_DATA', data: replacement });
      setLastRestoreBackup(keepUndo ? before : null);
      setHideRestoreUndoCard(false);
      setIsRestoreUndoClosing(false);
      setActiveProjectId(projectId);
      setQuickTaskProjectId(projectId || null);
      setQuickTaskProjectName(project?.name ?? '');
      setQuickTaskBucketId(null);
      setQuickTaskBucketName('');
      setQuickTaskMessage(null);
      clearPendingProjectImport();
      setPendingRestoreData(null);
      setDataActionMessage(keepUndo ? 'Restore saved to desktop storage.' : 'Restore undone.');
    }).catch((error: unknown) => {
      if (mountedRef.current) setDataActionMessage(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => {
      if (restoreControl.current === controller) {
        restoreControl.current = null;
        restorePhaseRef.current = null;
        if (mountedRef.current) setDesktopRestorePhase(null);
      }
    });
  };

  const confirmRestoreData = () => {
    if (!pendingRestoreData) return;
    if (isDesktopPlannerStorage()) { replaceDesktopPlanner(pendingRestoreData, true); return; }''')
    app = one(app, '''  const undoRestoreData = () => {
    if (!lastRestoreBackup) return;''', '''  const undoRestoreData = () => {
    if (!lastRestoreBackup) return;
    if (isDesktopPlannerStorage()) { replaceDesktopPlanner(lastRestoreBackup, false); return; }''')
    app = one(app, '''  const dismissRestoreUndoCard = () => {
    if (isRestoreUndoClosing) return;''', '''  const dismissRestoreUndoCard = () => {
    if (isDesktopPlannerStorage()) {
      void getPlannerStorageRuntimeTarget()?.clearRestoreRecovery?.().then(() => {
        setLastRestoreBackup(null);
        setHideRestoreUndoCard(true);
      }).catch((error: unknown) => {
        setDataActionMessage(`Recovery cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      return;
    }
    if (isRestoreUndoClosing) return;''')
    app = one(app, '    <main className="app-shell">', '    <>\n    <main className="app-shell" {...(desktopRestorePhase ? { inert: \'\' } : {})}>')
    app = one(app, '''    </main>
  );
}''', '''    </main>
    {desktopRestorePhase ? (
      <div className="modal-backdrop" role="presentation">
        <section className="modal modal-compact" role="dialog" aria-modal="true" aria-label="Durable restore">
          <h2>{desktopRestorePhase === 'preparing' ? 'Preparing recovery snapshot' : 'Committing Restore'}</h2>
          <p>{desktopRestorePhase === 'preparing'
            ? 'The current planner is retained until the replacement is verified.'
            : 'The native storage transaction is in progress. Cancellation is no longer available.'}</p>
          <button type="button" autoFocus disabled={desktopRestorePhase === 'committing'}
            aria-label="Cancel durable restore"
            onClick={() => { if (restorePhaseRef.current === 'preparing') restoreControl.current?.abort(); }}>
            Cancel
          </button>
        </section>
      </div>
    ) : null}
    </>
  );
}''')
    write('src/App.tsx', app)

    # Restore the established single file-selection path, adding only the storage card.
    panel = subprocess.check_output(['git', 'show', BASE + ':src/components/sidepanel/DataPanel.tsx'], encoding='utf-8')
    panel = "import { StorageStatusCard } from './StorageStatusCard';\n" + panel
    assert '<div className="data-action-row">' in panel
    panel = panel.replace('<div className="data-action-row">', '<StorageStatusCard />\n            <div className="data-action-row">', 1)
    write('src/components/sidepanel/DataPanel.tsx', panel)

    persistence = read('src/services/plannerPersistence.ts')
    persistence = one(persistence, 'export const savePlannerDataV2ToLocalStorage = (data: PlannerDataV2): void => {', 'export const savePlannerDataV2ToLocalStorage = (data: PlannerDataV2): void | Promise<void> => {')
    persistence = one(persistence, '''    if (forwardPlannerSaveToRuntime(data)) {
        return;
    }''', '''    const durable = forwardPlannerSaveToRuntime(data);
    if (durable !== false) return durable;''')
    write('src/services/plannerPersistence.ts', persistence)

    card = read('src/components/sidepanel/StorageStatusCard.tsx')
    card = one(card, '      {status.error ? (', '''      {status.phase === 'error' && target?.retry ? (
        <button type="button" className="secondary-button" onClick={() => {
          void target.retry?.().catch((error: unknown) => {
            setStatus((current) => ({ ...current, phase: 'error', error: error instanceof Error ? error.message : String(error) }));
          });
        }}>Retry save</button>
      ) : null}
      {status.error ? (''')
    write('src/components/sidepanel/StorageStatusCard.tsx', card)

    runtime = read('src/storage/plannerStorageRuntime.ts')
    runtime = one(runtime, '''    const before = JSON.parse(JSON.stringify(previous)) as PlannerDataV2;
    const after = JSON.parse(JSON.stringify(replacement)) as PlannerDataV2;
    return this.enqueue(async () => {''', '''    const before = JSON.parse(JSON.stringify(previous)) as PlannerDataV2;
    const after = JSON.parse(JSON.stringify(replacement)) as PlannerDataV2;
    this.update({ phase: 'saving', error: null });
    return this.enqueue(async () => {''')
    runtime = runtime.replace('if (signal.aborted) return false;', "if (signal.aborted) { this.update({ phase: this.unsaved ? 'error' : this.status.lastSavedAt ? 'saved' : 'idle' }); return false; }")
    runtime = one(runtime, '''    const serialized = await this.invokeCommand<string | null>('desktop_storage_read_restore_recovery', { session: this.session });
    this.recovery = serialized ? loadRestoreRecoverySnapshot(memoryStorage(serialized), data) : null;''', '''    let serialized: string | null;
    try { serialized = await this.invokeCommand<string | null>('desktop_storage_read_restore_recovery', { session: this.session }); }
    catch (error) {
      this.update({ warning: `Planner loaded; recovery record could not be read and was preserved: ${messageOf(error)}` });
      this.recovery = null;
      return null;
    }
    this.recovery = serialized ? loadRestoreRecoverySnapshot(memoryStorage(serialized), data) : null;''')
    write('src/storage/plannerStorageRuntime.ts', runtime)
    lifecycle = read('src/storage/plannerStorageLifecycle.ts')
    lifecycle = one(lifecycle, '  let closing = false;', '  let closing = false;\n  let allowUnload = false;')
    lifecycle = one(lifecycle, 'try { await adapter.flush(); await commands.finish(); }', 'try { await adapter.flush(); allowUnload = true; await commands.finish(); }')
    lifecycle = one(lifecycle, 'catch (error) { reportFailure(', 'catch (error) { allowUnload = false; reportFailure(')
    lifecycle = one(lifecycle, "    if (adapter.getStatus().phase === 'saving' || adapter.getStatus().phase === 'error') {", "    if (!allowUnload && (adapter.getStatus().phase === 'saving' || adapter.getStatus().phase === 'error')) {")
    write('src/storage/plannerStorageLifecycle.ts', lifecycle)

    cargo = read('src-tauri/Cargo.toml')
    cargo = cargo.split("\n[target.'cfg(windows)'.dependencies]")[0]
    write('src-tauri/Cargo.toml', cargo)
    capabilities = json.loads(read('src-tauri/capabilities/default.json'))
    capabilities['description'] = 'The main window can write clipboard text and listen for the constrained storage-close handshake.'
    capabilities['permissions'] = list(dict.fromkeys(capabilities['permissions'] + ['core:event:allow-listen', 'core:event:allow-unlisten']))
    write('src-tauri/capabilities/default.json', json.dumps(capabilities, indent=2))
    ci = read('.github/workflows/ci.yml').replace('node-version: 20.19.0', "node-version: '22'")
    ci = one(ci, 'run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings', 'run: cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings')
    ci = one(ci, 'run: cargo test --manifest-path src-tauri/Cargo.toml', 'run: cargo test --locked --manifest-path src-tauri/Cargo.toml')
    ci = one(ci, '      - name: Prepare installer provenance', '''      - name: Check tracked build inputs remain unchanged
        run: git diff --exit-code

      - name: Prepare installer provenance''')
    write('.github/workflows/ci.yml', ci)

    desktop_doc = read('docs/DESKTOP.md')
    start = desktop_doc.index('## Storage authority')
    end = desktop_doc.index('## Uninstall and lifecycle boundary')
    desktop_doc = desktop_doc[:start] + '''## Storage authority and health

The browser remains a supported offline localStorage application using the existing schema-v2 keys and import/export behavior. The installed Windows application uses Tauri's runtime-resolved application-data directory. The Data panel intentionally reports the resolved planner and backup locations; these runtime diagnostics are not hard-coded developer paths.

Relative native files are:

```text
data/planner-v2.json
data/planner-v2.previous.json
data/planner-v2.rollback-<identity>.json
data/planner-storage.lock
backups/routine-YYYY-MM-DD.json
backups/operation-<UTC timestamp>-<reason>-<identity>.json
backups/corrupt-primary-<identity>.json
backups/restore-recovery.json
migration-v1.complete
```

Previous/rollback files are interrupted-transaction recovery candidates, not routine backups. Temporary files are never selected as authoritative data.

## Safe writes, recovery and retention

The shared TypeScript validators remain the canonical schema and relational-integrity boundary. Rust defensively requires complete v2 collections and owns paths, exclusive writer handles, flushing, replacement and exact-byte verification. A version marker alone is not proof of valid planner data.

New bytes are written and synchronized beside the primary before promotion. Existing previous/rollback candidates survive until the replacement verifies. Promotion or rollback failures retain discoverable recovery files and report an error; cleanup cannot turn a committed write into a false failure. Corrupt-primary preservation copies raw bytes, including invalid UTF-8.

Startup makes one native session handshake before React mounts. It selects a valid primary, then the newest fully validated previous/routine/operation candidate with a deterministic tie-break. Unreadable files are errors, not missing data. Existing corrupt evidence with no valid candidate, or missing data after completed migration, stops startup without resetting the planner or replaying legacy WebView state.

Routine snapshots retain the first pre-change planner for each changed local calendar day and keep the newest **30** validated daily files. Operation snapshots retain **12** validated files. Identical saves do not create snapshots. Retention occurs only after the primary is established. TypeScript submits only fully validated candidates; Rust rechecks the exact current primary, reviewed filenames and candidate bytes under its lock before deletion. Unreviewed, changed, invalid and corrupt-preservation files are not pruned. Retention failures produce a warning rather than falsely reporting an already-committed planner as unsaved.

## Migration

A valid durable primary wins over legacy data. One-time migration is allowed only when no primary/recovery evidence or completed marker exists. Legacy v2/v1 values are read without changing them; malformed-only legacy data blocks initialization. A valid legacy planner is validated, snapshotted, written and verified before the completion marker. An interrupted marker write is finished on the next valid-primary startup without replaying migration. No WebView profile or legacy planner key is deleted.

Unrelated browser profiles are never scraped; transfer uses explicit All-data export/Restore.

## Serialized saves and Restore

All native saves, full Restore, Undo Restore and recovery retirement share one frontend queue and a native session-checked lock. A new WebView bootstrap establishes a new generation: old queued requests are rejected rather than overwriting newer state, while the new frontend can save immediately. This does not add a browser revision/CAS redesign.

The application reports Saved only after the actual durable acknowledgement. Failed ordinary saves retain the newest unsaved state for **Retry save**. Before normal window close, the native shell asks the frontend to drain its queue; a failed outstanding save keeps the window open. Forced termination, OS shutdown and power loss cannot promise delivery of edits not yet acknowledged; recoverable file replacement protects the last committed state.

Restore uses the App's single validated file-selection path. Preparation creates a verified native operation snapshot. It can be cancelled while waiting/preparing. At commit, cancellation and other planner mutations are disabled. Native commit compares the expected current planner, verifies the pre-operation snapshot, writes the matching Undo record and replaces the primary. React changes its planner only after that commit succeeds. Undo retirement follows successful replacement, not merely an in-memory edit. Desktop Restore and Undo do not require a WebView localStorage recovery write.

The installed writer guard is an exclusive OS file handle scoped to the data directory, not a process-global name or lockfile-existence check. Windows releases it on process exit/crash; a second instance remains explicitly read-only. Different isolated test roots do not contend with production storage.

''' + desktop_doc[end:]
    desktop_doc = desktop_doc.replace('- Node.js `^20.19.0 || ^22.12.0 || ^24.0.0`;', '- maintained Node.js 22 LTS (at least 22.12) or 24 LTS; the package engine range still records historical Node 20 compatibility, not an upstream support promise;')
    write('docs/DESKTOP.md', desktop_doc)
    write('docs/execplans/durable-desktop-persistence-slice.md', '''# Durable Desktop Persistence Slice

## Identity and scope

- Repository: Nobodyworld/app-planner-buckets
- Issue: #40; existing draft PR: #82
- Canonical branch: `slice/durable-desktop-persistence`
- Base main: `242e4a067bcb60951b47cfd9e95dc3f64c8d30d9`
- This file is the execution record. Earlier references to a `feat/` branch or `docs/DURABLE_PERSISTENCE.md` were incorrect.

Continue and repair the existing implementation; do not create a parallel store, branch, or PR. Keep schema-v2, browser behavior, scoped import/export, templates, and board behavior compatible. Signed updater/release work (#41), native lifecycle observations (#60), and unrelated warning cleanup (#80) are separate.

## Implemented repair contract

1. One validated bootstrap and session handshake before React mounts; durable primary, then fully validated recovery candidates. Invalid historical data never becomes an automatic blank planner.
2. Pure legacy v2/v1 migration reads; preserve original values, snapshot migrated data, commit the native primary, and only then mark completion. Valid durable data always wins.
3. Preserve all previous/rollback recovery sources until replacement verifies, including the previous-only interrupted-write case. Preserve non-UTF-8 corrupt bytes exactly. Surface I/O errors instead of treating them as absence.
4. One ordered queue for ordinary saves, Restore, Undo, and recovery retirement. Session generations reject obsolete frontend writes after WebView reload. Saved means acknowledged durable state; retain failed ordinary state for explicit retry.
5. Full Restore uses one App-owned validated candidate. Allow cancellation during preparation, then disable cancellation and mutations during native CAS/commit. Verify a pre-operation snapshot, preserve prior recovery on failed replacement, and update React only after commit. No desktop dependency on WebView recovery writes.
6. Scope the exclusive Windows writer handle to the resolved data directory; stale lockfile existence is not writer ownership. Second writers are read-only. Normal close waits for queued state; failed unsaved writes block close. Forced termination is not a guarantee for unacknowledged edits.
7. Preserve the agreed backup policy: one pre-change routine copy per changed local day, newest 30; newest 12 operation copies. Canonical frontend validation plus native exact-byte recheck precedes pruning. Keep invalid/unreviewed files, and prune only after a committed primary.
8. Browser storage remains supported and synchronous where previously synchronous. No unnecessary browser CAS or new data format. Runtime data paths are intentionally shown in the Data panel; machine-specific source paths must never be committed.
9. Use maintained Node 22/24 for development; CI defaults to Node 22. Cargo commands use the committed lockfile and fail on build-input drift.

## Validation

Hosted CI must pass at the final exact head: frontend suite, TypeScript/Vite, Cargo formatting, locked strict Clippy, locked Rust tests, Windows NSIS packaging, clean tracked inputs, installer checksum and provenance.

Regression coverage must exercise previous-only recovery failure, promotion/verification/rollback errors, invalid UTF-8 preservation, validated retention and byte-race rejection, session renewal, writer exclusion, save ordering and retry, false-success prevention, cancelled Restore, failed Undo, one-file selection, WebView recovery independence, and the native close handshake. Tests must not weaken existing browser assertions to hide timing regressions.

The branch stays draft until the final candidate has exact-head hosted evidence and local/browser/native evidence below. A retained installer from a failed frontend run is not accepted.

## Remaining local acceptance

Use one owned isolated worktree from the final PR head and preserve the primary checkout, stashes, rescue refs and historical evidence. Use synthetic data only. Follow root AGENTS.md for browser-first checks and safe reconciliation.

- Rendered browser: storage status, maintained browser persistence/Restore, retry/error display, and Data-panel containment at desktop and narrow viewports. Do not repeat unaffected zoom/drag suites.
- Isolated Windows/Tauri profile: first-run migration and original-byte preservation; save/restart; queued-save close; failed-save retry; WebView reload then immediate save; second-writer exclusion; Restore/Undo across restart; controlled corrupt-primary recovery and no-candidate fail-closed behavior.
- Isolation must be proven before native execution. Never run corruption/failure tests against the owner's profile. Missing native tooling is a specific limitation, not permission to claim a pass or hand back browser-observable work.
- Reconcile #60 uninstall/reinstall observations against the new data root before closing #40 or promoting a desktop release. Preserve external All-data backups. Do not silently waive this gate.

No real planner data, installers, browser traces, generated state, caches, or machine paths belong in Git. Record final branch/head, commands, results and any narrow unresolved native requirement in PR #82.
''')
    subprocess.run(['git', 'diff', '--check'], check=True)
    print('REPAIR_MATERIALIZED: guarded edits applied; validation not yet claimed.')

def publish():
    assert os.environ['GITHUB_REPOSITORY'] == REPO
    assert os.environ['GITHUB_REF'] == 'refs/heads/slice/durable-desktop-persistence'
    import tomllib
    before = tomllib.loads(subprocess.check_output(['git', 'show', 'HEAD:src-tauri/Cargo.lock'], encoding='utf-8'))
    after = tomllib.loads(read('src-tauri/Cargo.lock'))
    assert [p for p in before['package'] if p['name'] != 'planner-buckets'] == [p for p in after['package'] if p['name'] != 'planner-buckets'], 'Unexpected Cargo resolution churn'
    root = next(p for p in after['package'] if p['name'] == 'planner-buckets')
    assert 'serde_json' in root['dependencies']
    changed = git('diff', '--name-only').splitlines()
    assert changed and set(changed) <= ALLOWED, changed
    subprocess.run(['git', 'diff', '--check'], check=True)
    mapping = {}
    for path in changed:
        content = read(path).replace('\r\n', '\n').encode('utf-8')
        assert not re.search(rb'[A-Za-z]:[\\/]+Users[\\/]', content), f'Machine path in {path}'
        payload = json.dumps({'encoding':'base64','content':base64.b64encode(content).decode('ascii')}).encode()
        request = urllib.request.Request(f'https://api.github.com/repos/{REPO}/git/blobs', data=payload, headers={'Authorization':'Bearer ' + os.environ['GH_TOKEN'], 'Accept':'application/vnd.github+json', 'Content-Type':'application/json', 'User-Agent':'planner-pr82-reviewed-materializer'}, method='POST')
        with urllib.request.urlopen(request, timeout=60) as response:
            mapping[path] = json.load(response)['sha']
        print('REPAIR_BLOB ' + json.dumps({'path':path,'sha':mapping[path]}))
    proof = Path(os.environ['RUNNER_TEMP']) / 'pr82-repair-proof'
    proof.mkdir(exist_ok=False)
    (proof / 'blob-map.json').write_text(json.dumps({'stagingHead':git('rev-parse','HEAD'),'blobs':mapping}, indent=2), encoding='utf-8')
    (proof / 'repair.diff').write_text(subprocess.check_output(['git','diff','--no-ext-diff'], encoding='utf-8'), encoding='utf-8')
    print('REPAIR_OBJECTS_READY: no ref, commit, PR, or issue was changed by this worker.')

if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == '--publish': publish()
    elif len(sys.argv) == 1: materialize()
    else: raise SystemExit('Unsupported operation')
