import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { formatDate } from '../utils/dateUtils';
import { streamCleanupPreview, streamCleanupExecute } from '../services/api';
import { useRemote } from '../context/RemoteContext';
import { CleanupDeleteMode, CleanupRequest, CleanupGroup, CleanupRecipeRevision } from '../types/conan';
import { FaCircleCheck, FaCircleStop, FaTriangleExclamation } from '../components/icons';
import './CleanupPage.css';

// Human-readable byte size. Returns an em-dash when size is unknown.
const formatBytes = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const ProgressBar: React.FC<{ pct: number }> = ({ pct }) => (
    <div className="progressbar">
        <div className="progressbar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
);

// A package slot: appears immediately (loading, with a spinner) and is filled
// with its computed group(s) once that package's recipe revisions are scanned.
type Slot = { id: string; label: string; status: 'loading' | 'ready'; groups: CleanupGroup[] };
type ScanState = { done: number; total: number; current: string };
type DelState = { done: number; total: number; reclaimed: number };
type ModalPhase = null | 'confirm' | 'verifying' | 'deleting' | 'done' | 'cancelled' | 'error';
type DeleteResult = { total_deleted: number; reclaimed_size: number; failed: Array<{ key: string; error: string }>; cancelled: boolean };

// Summary derived from the current user selection (the checkboxes), not from the
// plan's default actions. op_recipes/op_binaries are the actual remove calls;
// to_delete_binaries also counts binaries that cascade with a removed recipe.
const deriveSummary = (slots: Slot[], delRecipes: Set<string>, delBins: Set<string>) => {
    let total_recipes = 0;
    let to_delete_recipes = 0;
    let total_binaries = 0;
    let to_delete_binaries = 0;
    let total_size = 0;
    let reclaim_size = 0;
    let op_recipes = 0;
    let op_binaries = 0;
    for (const s of slots) {
        if (s.status !== 'ready') continue;
        for (const g of s.groups) {
            for (const r of g.revisions) {
                total_recipes += 1;
                total_binaries += r.binaries.length;
                total_size += r.total_size;
                if (delRecipes.has(r.ref)) {
                    to_delete_recipes += 1;
                    op_recipes += 1;
                    to_delete_binaries += r.binaries.length; // cascade
                    reclaim_size += r.total_size;
                } else {
                    for (const b of r.binaries) {
                        if (delBins.has(b.key)) {
                            to_delete_binaries += 1;
                            op_binaries += 1;
                            reclaim_size += b.size || 0;
                        }
                    }
                }
            }
        }
    }
    return {
        total_recipes,
        to_delete_recipes,
        to_keep_recipes: total_recipes - to_delete_recipes,
        total_binaries,
        to_delete_binaries,
        total_size,
        reclaim_size,
        op_recipes,
        op_binaries,
    };
};

// Default selection for a set of freshly-scanned groups, honoring the delete-mode:
// "both" pre-checks the doomed recipe revisions; "binaries" pre-checks their
// binaries (leaving the recipe metadata).
const seedSelection = (
    groups: CleanupGroup[],
    mode: CleanupDeleteMode,
    recipes: Set<string>,
    bins: Set<string>
) => {
    for (const g of groups) {
        for (const r of g.revisions) {
            if (r.action !== 'delete') continue;
            if (mode === 'both') recipes.add(r.ref);
            else r.binaries.forEach((b) => bins.add(b.key));
        }
    }
};

// Cleanup tool: filter binaries on a remote, preview a plan (each package fills
// in progressively), then confirm to remove (with live progress).
const CleanupPage: React.FC = () => {
    const { remote: remoteName } = useRemote();

    // Filter + rules
    const [pattern, setPattern] = useState('');
    const [packageQuery, setPackageQuery] = useState('');
    const [onlyPrerelease, setOnlyPrerelease] = useState(false);
    const [olderThanDays, setOlderThanDays] = useState('');
    const [keepAtLeast, setKeepAtLeast] = useState('');
    const [deleteMode, setDeleteMode] = useState<CleanupDeleteMode>('both');
    const [deletionsOnly, setDeletionsOnly] = useState(false);

    // Which recipe revisions are expanded (collapsed by default).
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // User selection (fine-tuned via checkboxes). A recipe ref here means "remove
    // the whole recipe revision"; a binary key means "remove just that binary".
    const [deleteRecipes, setDeleteRecipes] = useState<Set<string>>(new Set());
    const [deleteBinaries, setDeleteBinaries] = useState<Set<string>>(new Set());

    // Preview / plan state
    const [slots, setSlots] = useState<Slot[]>([]);
    const [scanning, setScanning] = useState(false);
    const [scan, setScan] = useState<ScanState>({ done: 0, total: 0, current: '' });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DeleteResult | null>(null);

    // Delete modal state
    const [modalPhase, setModalPhase] = useState<ModalPhase>(null);
    const [del, setDel] = useState<DelState>({ done: 0, total: 0, reclaimed: 0 });
    const [modalError, setModalError] = useState<string | null>(null);

    const previewAbort = useRef<AbortController | null>(null);
    const deleteAbort = useRef<AbortController | null>(null);

    // A previewed plan belongs to the remote it was scanned against. When the
    // active remote changes, drop the stale list (and abort any in-flight scan).
    useEffect(() => {
        previewAbort.current?.abort();
        setSlots([]);
        setExpanded(new Set());
        setDeleteRecipes(new Set());
        setDeleteBinaries(new Set());
        setResult(null);
        setError(null);
        setScan({ done: 0, total: 0, current: '' });
        setScanning(false);
    }, [remoteName]);

    const buildRequest = (): CleanupRequest => ({
        remote_name: remoteName!,
        pattern: pattern.trim() || '*',
        package_query: packageQuery.trim() || undefined,
        older_than_days: olderThanDays.trim() ? Number(olderThanDays) : undefined,
        keep_at_least: keepAtLeast.trim() ? Number(keepAtLeast) : undefined,
        // Keep-floor is always counted per package name (newest N recipe revisions).
        keep_scope: 'name',
        delete_mode: deleteMode,
        prerelease: onlyPrerelease ? 'only' : 'all',
    });

    const summary = deriveSummary(slots, deleteRecipes, deleteBinaries);
    // Total remove operations (whole recipe revisions + individual binaries).
    const totalOps = summary.op_recipes + summary.op_binaries;

    // Toggle a whole recipe revision in/out of the deletion selection.
    const toggleRecipeSel = (ref: string) =>
        setDeleteRecipes((prev) => {
            const next = new Set(prev);
            if (next.has(ref)) next.delete(ref);
            else next.add(ref);
            return next;
        });

    // Toggle a single binary in/out of the deletion selection.
    const toggleBinarySel = (key: string) =>
        setDeleteBinaries((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    // Changing the delete-mode re-seeds the default selection across all packages.
    const changeDeleteMode = (mode: CleanupDeleteMode) => {
        setDeleteMode(mode);
        const recipes = new Set<string>();
        const bins = new Set<string>();
        for (const s of slots) {
            if (s.status === 'ready') seedSelection(s.groups, mode, recipes, bins);
        }
        setDeleteRecipes(recipes);
        setDeleteBinaries(bins);
    };

    // A label describing the removal operations for the delete button/modal.
    const deleteLabel = (): string => {
        const parts: string[] = [];
        if (summary.op_recipes)
            parts.push(`${summary.op_recipes} recipe revision${summary.op_recipes > 1 ? 's' : ''}`);
        if (summary.op_binaries)
            parts.push(`${summary.op_binaries} ${summary.op_binaries > 1 ? 'binaries' : 'binary'}`);
        return parts.join(' + ') || 'nothing';
    };

    const handlePreview = async () => {
        if (!remoteName) return;
        setError(null);
        setResult(null);
        setSlots([]);
        setExpanded(new Set());
        setDeleteRecipes(new Set());
        setDeleteBinaries(new Set());
        setScanning(true);
        setScan({ done: 0, total: 0, current: '' });

        const controller = new AbortController();
        previewAbort.current = controller;
        try {
            await streamCleanupPreview(buildRequest(), (ev) => {
                switch (ev.event) {
                    case 'scan_start':
                        setScan({ done: 0, total: ev.total ?? 0, current: '' });
                        setSlots([]);
                        break;
                    case 'slot':
                        setSlots((prev) => [
                            ...prev,
                            { id: ev.id!, label: ev.label ?? ev.id!, status: 'loading', groups: [] },
                        ]);
                        break;
                    case 'scan_progress':
                        setScan((s) => ({ ...s, done: ev.done ?? 0, total: ev.total ?? s.total }));
                        break;
                    case 'slot_ready': {
                        const groups = ev.groups ?? [];
                        setSlots((prev) =>
                            prev.map((s) =>
                                s.id === ev.id ? { ...s, status: 'ready', groups } : s
                            )
                        );
                        // Seed this package's default selection from the current mode.
                        setDeleteRecipes((prevR) => {
                            const nextR = new Set(prevR);
                            const throwaway = new Set<string>();
                            seedSelection(groups, deleteMode, nextR, throwaway);
                            return nextR;
                        });
                        setDeleteBinaries((prevB) => {
                            const nextB = new Set(prevB);
                            const throwaway = new Set<string>();
                            seedSelection(groups, deleteMode, throwaway, nextB);
                            return nextB;
                        });
                        break;
                    }
                    case 'error':
                        setError(ev.detail || 'Preview failed');
                        break;
                }
            }, controller.signal);
        } catch (err) {
            if ((err as DOMException)?.name !== 'AbortError') {
                setError(err instanceof Error ? err.message : 'Preview failed');
            }
        } finally {
            setScanning(false);
        }
    };

    const openDeleteModal = () => {
        setModalError(null);
        setDel({ done: 0, total: totalOps, reclaimed: 0 });
        setModalPhase('confirm');
    };

    const confirmDelete = async () => {
        setModalError(null);
        setScan({ done: 0, total: 0, current: '' });
        setModalPhase('verifying');

        const controller = new AbortController();
        deleteAbort.current = controller;
        const failures: Array<{ key: string; error: string }> = [];
        let lastDone = 0;
        let lastReclaimed = 0;

        const selection = {
            delete_recipes: Array.from(deleteRecipes),
            delete_binaries: Array.from(deleteBinaries),
        };
        try {
            await streamCleanupExecute(buildRequest(), selection, (ev) => {
                switch (ev.event) {
                    case 'scan_start':
                        setScan({ done: 0, total: ev.total ?? 0, current: '' });
                        setModalPhase('verifying');
                        break;
                    case 'scan_progress':
                        setScan({ done: ev.done ?? 0, total: ev.total ?? 0, current: ev.current ?? '' });
                        break;
                    case 'delete_start':
                        setDel({ done: 0, total: ev.total ?? 0, reclaimed: 0 });
                        setModalPhase('deleting');
                        break;
                    case 'deleted':
                        lastDone = ev.done ?? lastDone;
                        lastReclaimed = ev.reclaimed_size ?? lastReclaimed;
                        setDel({ done: lastDone, total: ev.total ?? 0, reclaimed: lastReclaimed });
                        break;
                    case 'failed':
                        failures.push({ key: ev.key ?? '?', error: ev.error ?? 'error' });
                        break;
                    case 'done':
                        setResult({
                            total_deleted: ev.total_deleted ?? lastDone,
                            reclaimed_size: ev.reclaimed_size ?? lastReclaimed,
                            failed: ev.failed ?? failures,
                            cancelled: false,
                        });
                        setModalPhase('done');
                        break;
                    case 'conflict':
                        setModalError(ev.detail || 'The plan changed since preview.');
                        setModalPhase('error');
                        break;
                    case 'error':
                        setModalError(ev.detail || 'Delete failed.');
                        setModalPhase('error');
                        break;
                }
            }, controller.signal);
        } catch (err) {
            if ((err as DOMException)?.name === 'AbortError') {
                setResult({
                    total_deleted: lastDone,
                    reclaimed_size: lastReclaimed,
                    failed: failures,
                    cancelled: true,
                });
                setModalPhase('cancelled');
            } else {
                setModalError(err instanceof Error ? err.message : 'Delete failed.');
                setModalPhase('error');
            }
        }
    };

    const cancelDelete = () => deleteAbort.current?.abort();

    const closeModal = () => {
        const finished = modalPhase === 'done' || modalPhase === 'cancelled' || modalPhase === 'error';
        setModalPhase(null);
        if (finished && (result || modalError)) {
            setSlots([]);
            setExpanded(new Set());
            setDeleteRecipes(new Set());
            setDeleteBinaries(new Set());
        }
    };

    const toggleRevision = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Is any part of this recipe revision selected for deletion?
    const isRevSelected = (r: CleanupRecipeRevision): boolean =>
        deleteRecipes.has(r.ref) || r.binaries.some((b) => deleteBinaries.has(b.key));

    // Recipe revisions visible under a group given the "selected only" filter.
    const visibleRevisions = (group: CleanupGroup): CleanupRecipeRevision[] =>
        deletionsOnly ? group.revisions.filter(isRevSelected) : group.revisions;

    const readyGroups = slots.flatMap((s) => (s.status === 'ready' ? s.groups : []));
    const visibleGroups = readyGroups.filter(
        (g) => !deletionsOnly || g.revisions.some(isRevSelected)
    );
    const allVisibleRevs = visibleGroups.flatMap((g) => visibleRevisions(g));
    const allExpanded = allVisibleRevs.length > 0 && allVisibleRevs.every((r) => expanded.has(r.ref));
    const toggleAll = () =>
        setExpanded(allExpanded ? new Set() : new Set(allVisibleRevs.map((r) => r.ref)));

    const scanPct = scan.total ? (scan.done / scan.total) * 100 : 8;
    const delPct = del.total ? (del.done / del.total) * 100 : 0;

    const renderRevision = (rev: CleanupRecipeRevision) => {
        const isOpen = expanded.has(rev.ref);
        // ref is "name/version[@user/channel]#rrev" — split into its two columns.
        const nameVersion = rev.ref.split('#')[0];
        const recipeChecked = deleteRecipes.has(rev.ref);
        const recipeAction = recipeChecked ? 'delete' : 'keep';
        const selected = isRevSelected(rev);
        return (
            <div className={`cleanup-rev ${selected ? 'delete' : ''}`} key={rev.ref}>
                <div className="cleanup-rev-row">
                    <input
                        type="checkbox"
                        className="cleanup-check"
                        checked={recipeChecked}
                        onChange={() => toggleRecipeSel(rev.ref)}
                        title="Delete this whole recipe revision"
                        aria-label={`Delete recipe revision ${nameVersion}`}
                    />
                    <button
                        type="button"
                        className="cleanup-rev-head"
                        onClick={() => toggleRevision(rev.ref)}
                        aria-expanded={isOpen}
                    >
                        <span className={`cleanup-group-caret ${isOpen ? 'open' : ''}`}>▸</span>
                        <span className={`badge ${recipeAction}`}>{recipeAction}</span>
                        <code className="cleanup-rev-name">{nameVersion}</code>
                        <code className="cleanup-rev-rrev">{rev.revision || '—'}</code>
                        <span className="cleanup-rev-meta">
                            <span className="nowrap">{formatDate(rev.created)}</span>
                            <span className="cleanup-group-count">
                                {rev.binaries.length} {rev.binaries.length === 1 ? 'binary' : 'binaries'}
                            </span>
                            <span className="cleanup-group-size">
                                {formatBytes(recipeChecked ? rev.total_size : rev.delete_size)}
                            </span>
                        </span>
                    </button>
                </div>
                {isOpen && (
                    rev.binaries.length > 0 ? (
                        <table className="cleanup-table">
                            <thead>
                                <tr>
                                    <th>Delete</th>
                                    <th>Action</th>
                                    <th>Package ID</th>
                                    <th>Package revision</th>
                                    <th>Uploaded</th>
                                    <th>Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rev.binaries.map((b) => {
                                    const binChecked = recipeChecked || deleteBinaries.has(b.key);
                                    const binAction = binChecked ? 'delete' : 'keep';
                                    return (
                                        <tr key={b.key} className={binChecked ? 'delete' : ''}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    className="cleanup-check"
                                                    checked={binChecked}
                                                    disabled={recipeChecked}
                                                    onChange={() => toggleBinarySel(b.key)}
                                                    title={recipeChecked
                                                        ? 'Removed with its recipe revision'
                                                        : 'Delete this binary'}
                                                    aria-label={`Delete binary ${b.package_id}`}
                                                />
                                            </td>
                                            <td>
                                                <span className={`badge ${binAction}`}>{binAction}</span>
                                            </td>
                                            <td className="mono">{b.package_id}</td>
                                            <td className="mono dim">{b.package_revision || '—'}</td>
                                            <td className="nowrap">{formatDate(b.created)}</td>
                                            <td className="nowrap">{formatBytes(b.size)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="cleanup-rev-empty">Recipe-only revision — no binaries.</div>
                    )
                )}
            </div>
        );
    };

    const renderGroup = (group: CleanupGroup) => {
        const revs = visibleRevisions(group);
        const releases = revs.filter((r) => !r.is_prerelease);
        const prereleases = revs.filter((r) => r.is_prerelease);
        // Only label the sections when both kinds are present; a single-kind
        // group needs no header.
        const showSections = releases.length > 0 && prereleases.length > 0;
        return (
            <div className="cleanup-group" key={group.key}>
                <div className="cleanup-group-head static">
                    <code>{group.key}</code>
                    <span className="cleanup-group-meta">
                        <span className="cleanup-group-count">
                            {group.to_delete_recipes} / {group.revisions.length} recipe revisions to delete
                        </span>
                        <span className="cleanup-group-size">
                            {formatBytes(group.delete_size)}
                            <span className="stat-sub"> / {formatBytes(group.total_size)}</span>
                        </span>
                    </span>
                </div>
                <div className="cleanup-revs">
                    {showSections && <div className="cleanup-rev-section">Releases</div>}
                    {releases.map(renderRevision)}
                    {showSections && <div className="cleanup-rev-section">Prereleases</div>}
                    {prereleases.map(renderRevision)}
                </div>
            </div>
        );
    };

    return (
        <Layout>
            <div className="cleanup">
                <div className="cleanup-head">
                    <h2>Cleanup packages</h2>
                    <p className="cleanup-sub">
                        Prune recipe revisions (and their binaries) on <code>{remoteName}</code>.
                    </p>
                </div>

                {/* --- Filter + rules --- */}
                <div className="cleanup-form">
                    <div className="cleanup-filters">
                        <div className="cleanup-field">
                            <label htmlFor="cl-pattern">Reference filter</label>
                            <input
                                id="cl-pattern"
                                value={pattern}
                                onChange={(e) => setPattern(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !scanning) handlePreview();
                                }}
                                placeholder="*"
                            />
                            <label className="cleanup-checkbox">
                                <input
                                    type="checkbox"
                                    checked={onlyPrerelease}
                                    onChange={(e) => setOnlyPrerelease(e.target.checked)}
                                />
                                Only prereleases
                            </label>
                        </div>

                        <div className="cleanup-field">
                            <label htmlFor="cl-query">Binary filter (package query)</label>
                            <input
                                id="cl-query"
                                value={packageQuery}
                                onChange={(e) => setPackageQuery(e.target.value)}
                                placeholder="os=Windows AND compiler=gcc"
                            />
                            <span className="cleanup-hint">Optional. Filters by settings/options.</span>
                        </div>
                    </div>

                    <div className="cleanup-rules">
                        <div className="cleanup-field">
                            <label htmlFor="cl-older">Older than (days)</label>
                            <input
                                id="cl-older"
                                type="number"
                                min={0}
                                value={olderThanDays}
                                onChange={(e) => setOlderThanDays(e.target.value)}
                                placeholder="e.g. 90"
                            />
                            <span className="cleanup-hint">Only delete recipe revisions older than this.</span>
                        </div>

                        <div className="cleanup-field">
                            <label htmlFor="cl-keep">Keep at least</label>
                            <input
                                id="cl-keep"
                                type="number"
                                min={0}
                                value={keepAtLeast}
                                onChange={(e) => setKeepAtLeast(e.target.value)}
                                placeholder="e.g. 3"
                            />
                            <span className="cleanup-hint">Always keep the newest N recipe revisions.</span>
                        </div>

                        <div className="cleanup-field">
                            <label htmlFor="cl-delmode">On delete, remove</label>
                            <select
                                id="cl-delmode"
                                value={deleteMode}
                                onChange={(e) => changeDeleteMode(e.target.value as CleanupDeleteMode)}
                            >
                                <option value="both">recipes + binaries</option>
                                <option value="binaries">binaries only</option>
                            </select>
                            <span className="cleanup-hint">
                                {deleteMode === 'both'
                                    ? 'Default: pre-checks whole recipe revisions.'
                                    : 'Default: pre-checks binaries, keeps recipes.'}
                            </span>
                        </div>
                    </div>

                    <div className="cleanup-actions">
                        <button
                            type="button"
                            className="cleanup-preview-btn"
                            onClick={handlePreview}
                            disabled={scanning}
                        >
                            {scanning ? 'Searching…' : 'Search'}
                        </button>
                        <span className="cleanup-rule-summary">
                            {keepAtLeast.trim() && olderThanDays.trim()
                                ? `Delete recipe revisions older than ${olderThanDays}d, but keep the newest ${keepAtLeast} per package name.`
                                : keepAtLeast.trim()
                                    ? `Keep the newest ${keepAtLeast} recipe revisions per package name, delete the rest.`
                                    : olderThanDays.trim()
                                        ? `Delete every recipe revision older than ${olderThanDays}d.`
                                        : 'No rule — select every matched recipe revision.'}
                        </span>
                    </div>
                </div>

                {error && <div className="error cleanup-error">Error: {error}</div>}

                {/* --- Post-delete result banner --- */}
                {result && (
                    <div className={`cleanup-result ${result.cancelled ? 'cancelled' : ''}`}>
                        <h3>
                            {result.cancelled ? <><FaCircleStop /> Stopped</> : <><FaCircleCheck /> Removed</>} {result.total_deleted}{' '}
                            item{result.total_deleted === 1 ? '' : 's'} — reclaimed {formatBytes(result.reclaimed_size)}
                        </h3>
                        {result.failed.length > 0 && (
                            <div className="cleanup-failed">
                                {result.failed.length} failed:
                                <ul>
                                    {result.failed.map((f) => (
                                        <li key={f.key}>
                                            <code>{f.key}</code> — {f.error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* --- Plan (progressively filled) --- */}
                {slots.length > 0 && (
                    <div className="cleanup-plan">
                        {scanning && <ProgressBar pct={scanPct} />}

                        {!scanning && totalOps > 0 && (
                            <div className="cleanup-planbar">
                                <button
                                    type="button"
                                    className="cleanup-delete-btn"
                                    onClick={openDeleteModal}
                                >
                                    Delete {deleteLabel()} ({formatBytes(summary.reclaim_size)})…
                                </button>
                            </div>
                        )}

                        <div className="cleanup-summary">
                            <span className="stat">
                                <b>{summary.total_recipes}</b> recipe revisions
                            </span>
                            <span className="stat delete">
                                <b>{summary.to_delete_recipes}</b> selected
                            </span>
                            <span className="stat">
                                <b>{summary.to_delete_binaries}</b>
                                <span className="stat-sub"> / {summary.total_binaries} binaries</span>
                            </span>
                            <span className="stat reclaim">
                                reclaim <b>{formatBytes(summary.reclaim_size)}</b>
                                <span className="stat-sub"> of {formatBytes(summary.total_size)}</span>
                            </span>
                            {allVisibleRevs.length > 0 && (
                                <button type="button" className="cleanup-linkbtn" onClick={toggleAll}>
                                    {allExpanded ? 'Collapse all' : 'Expand all'}
                                </button>
                            )}
                            <label className="cleanup-toggle">
                                <input
                                    type="checkbox"
                                    checked={deletionsOnly}
                                    onChange={(e) => setDeletionsOnly(e.target.checked)}
                                />
                                Show selected only
                            </label>
                        </div>

                        {!scanning && summary.total_recipes === 0 && (
                            <div className="cleanup-empty">
                                Nothing matches these rules — nothing would be deleted.
                            </div>
                        )}

                        {slots.map((slot) => (
                            <React.Fragment key={slot.id}>
                                {slot.status === 'loading' ? (
                                    <div className="cleanup-group">
                                        <div className="cleanup-group-head static">
                                            <span className="cleanup-group-caret">▸</span>
                                            <code>{slot.label}</code>
                                            <span className="cleanup-group-meta">
                                                <span className="cleanup-spinner" aria-label="loading" />
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    slot.groups
                                        .filter((g) => !deletionsOnly || g.to_delete_recipes > 0)
                                        .map((group) => renderGroup(group))
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* --- Delete modal --- */}
                {modalPhase && (
                    <div className="cleanup-modal-overlay">
                        <div className="cleanup-modal" role="dialog" aria-modal="true">
                            {modalPhase === 'confirm' && (
                                <>
                                    <h3>Delete {deleteLabel()}?</h3>
                                    <p>
                                        {summary.op_recipes > 0 && (
                                            <>Removes <b>{summary.op_recipes}</b> whole recipe revision
                                            {summary.op_recipes > 1 ? 's' : ''}
                                            {summary.op_binaries > 0 ? ' plus ' : '. '}</>
                                        )}
                                        {summary.op_binaries > 0 && (
                                            <><b>{summary.op_binaries}</b> individual binar
                                            {summary.op_binaries > 1 ? 'ies' : 'y'}. </>
                                        )}
                                        This permanently frees{' '}
                                        <b>{formatBytes(summary.reclaim_size)}</b> from{' '}
                                        <code>{remoteName}</code>. This cannot be undone.
                                    </p>
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-delete-btn danger" onClick={confirmDelete}>
                                            Delete
                                        </button>
                                        <button className="cleanup-cancel-btn" onClick={closeModal}>
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}

                            {(modalPhase === 'verifying' || modalPhase === 'deleting') && (
                                <>
                                    <h3>Deleting…</h3>
                                    <ProgressBar pct={delPct} />
                                    <p className="cleanup-modal-status">
                                        {del.done} / {del.total} deleted
                                    </p>
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-cancel-btn" onClick={cancelDelete}>
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}

                            {modalPhase === 'done' && result && (
                                <>
                                    <h3><FaCircleCheck /> Removed {result.total_deleted} item{result.total_deleted === 1 ? '' : 's'}</h3>
                                    <p>Reclaimed <b>{formatBytes(result.reclaimed_size)}</b>.</p>
                                    {result.failed.length > 0 && (
                                        <div className="cleanup-failed">
                                            {result.failed.length} failed (see below).
                                        </div>
                                    )}
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-cancel-btn" onClick={closeModal}>
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}

                            {modalPhase === 'cancelled' && result && (
                                <>
                                    <h3><FaCircleStop /> Stopped</h3>
                                    <p>
                                        Deleted {result.total_deleted} item{result.total_deleted === 1 ? '' : 's'} before
                                        cancelling — reclaimed <b>{formatBytes(result.reclaimed_size)}</b>. The rest were
                                        left untouched.
                                    </p>
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-cancel-btn" onClick={closeModal}>
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}

                            {modalPhase === 'error' && (
                                <>
                                    <h3><FaTriangleExclamation /> Couldn't complete</h3>
                                    <p className="cleanup-modal-error">{modalError}</p>
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-cancel-btn" onClick={closeModal}>
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default CleanupPage;
