import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { formatDate } from '../utils/dateUtils';
import { streamCleanupPreview, streamCleanupExecute } from '../services/api';
import { useRemote } from '../context/RemoteContext';
import { CleanupScope, CleanupRequest, CleanupGroup } from '../types/conan';
import './CleanupPage.css';

const SCOPE_LABELS: Record<CleanupScope, string> = {
    recipe_revision: 'per recipe revision',
    version: 'per version',
    name: 'per package name',
};

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
// with its computed group(s) once that package's binaries are scanned.
type Slot = { id: string; label: string; status: 'loading' | 'ready'; groups: CleanupGroup[] };
type ScanState = { done: number; total: number; current: string };
type DelState = { done: number; total: number; reclaimed: number };
type ModalPhase = null | 'confirm' | 'verifying' | 'deleting' | 'done' | 'cancelled' | 'error';
type DeleteResult = { total_deleted: number; reclaimed_size: number; failed: Array<{ key: string; error: string }>; cancelled: boolean };

const deriveSummary = (slots: Slot[]) => {
    let total = 0;
    let to_delete = 0;
    let total_size = 0;
    let reclaim_size = 0;
    for (const s of slots) {
        if (s.status !== 'ready') continue;
        for (const g of s.groups) {
            total += g.binaries.length;
            to_delete += g.to_delete;
            total_size += g.total_size;
            reclaim_size += g.delete_size;
        }
    }
    return { total, to_delete, to_keep: total - to_delete, total_size, reclaim_size };
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
    const [keepScope, setKeepScope] = useState<CleanupScope>('name');
    const [deletionsOnly, setDeletionsOnly] = useState(false);

    // Which group keys are expanded (collapsed by default to keep the list short)
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Preview / plan state
    const [slots, setSlots] = useState<Slot[]>([]);
    const [scanning, setScanning] = useState(false);
    const [scan, setScan] = useState<ScanState>({ done: 0, total: 0, current: '' });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DeleteResult | null>(null);

    // Delete modal state
    const [modalPhase, setModalPhase] = useState<ModalPhase>(null);
    const [del, setDel] = useState<DelState>({ done: 0, total: 0, reclaimed: 0 });
    const [delFailed, setDelFailed] = useState<Array<{ key: string; error: string }>>([]);
    const [modalError, setModalError] = useState<string | null>(null);

    const previewAbort = useRef<AbortController | null>(null);
    const deleteAbort = useRef<AbortController | null>(null);

    // A previewed plan belongs to the remote it was scanned against. When the
    // active remote changes, drop the stale list (and abort any in-flight scan).
    useEffect(() => {
        previewAbort.current?.abort();
        setSlots([]);
        setExpanded(new Set());
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
        keep_scope: keepScope,
        prerelease: onlyPrerelease ? 'only' : 'all',
    });

    const hasRule = olderThanDays.trim() !== '' || keepAtLeast.trim() !== '';
    const summary = deriveSummary(slots);

    const handlePreview = async () => {
        if (!remoteName) return;
        if (!hasRule) {
            setError('Set at least one rule: "older than" and/or "keep at least".');
            return;
        }
        setError(null);
        setResult(null);
        setSlots([]);
        setExpanded(new Set());
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
                    case 'slot_ready':
                        setSlots((prev) =>
                            prev.map((s) =>
                                s.id === ev.id
                                    ? { ...s, status: 'ready', groups: ev.groups ?? [] }
                                    : s
                            )
                        );
                        break;
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
        setDelFailed([]);
        setDel({ done: 0, total: summary.to_delete, reclaimed: 0 });
        setModalPhase('confirm');
    };

    const confirmDelete = async () => {
        setModalError(null);
        setDelFailed([]);
        setScan({ done: 0, total: 0, current: '' });
        setModalPhase('verifying');

        const controller = new AbortController();
        deleteAbort.current = controller;
        const failures: Array<{ key: string; error: string }> = [];
        let lastDone = 0;
        let lastReclaimed = 0;

        try {
            await streamCleanupExecute(buildRequest(), summary.to_delete, (ev) => {
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
                        setDelFailed([...failures]);
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
        }
    };

    const toggleGroup = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const readyGroups = slots.flatMap((s) => (s.status === 'ready' ? s.groups : []));
    const visibleGroups = readyGroups.filter((g) => !deletionsOnly || g.to_delete > 0);
    const allExpanded = visibleGroups.length > 0 && visibleGroups.every((g) => expanded.has(g.key));
    const toggleAll = () =>
        setExpanded(allExpanded ? new Set() : new Set(visibleGroups.map((g) => g.key)));

    const scanPct = scan.total ? (scan.done / scan.total) * 100 : 8;
    const delPct = del.total ? (del.done / del.total) * 100 : 0;

    const renderGroup = (group: CleanupGroup) => {
        const isOpen = expanded.has(group.key);
        const rows = deletionsOnly
            ? group.binaries.filter((b) => b.action === 'delete')
            : group.binaries;
        return (
            <div className="cleanup-group" key={group.key}>
                <button
                    type="button"
                    className="cleanup-group-head"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={isOpen}
                >
                    <span className={`cleanup-group-caret ${isOpen ? 'open' : ''}`}>▸</span>
                    <code>{group.key}</code>
                    <span className="cleanup-group-meta">
                        <span className="cleanup-group-count">
                            {group.to_delete} / {group.binaries.length} to delete
                        </span>
                        <span className="cleanup-group-size">
                            {formatBytes(group.delete_size)}
                            <span className="stat-sub"> / {formatBytes(group.total_size)}</span>
                        </span>
                    </span>
                </button>
                {isOpen && (
                    <table className="cleanup-table">
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Package ID</th>
                                <th>Recipe revision</th>
                                <th>Uploaded</th>
                                <th>Size</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((b) => (
                                <tr key={b.key} className={b.action}>
                                    <td>
                                        <span className={`badge ${b.action}`}>{b.action}</span>
                                    </td>
                                    <td className="mono">{b.package_id}</td>
                                    <td className="mono dim">{b.ref}</td>
                                    <td className="nowrap">{formatDate(b.created)}</td>
                                    <td className="nowrap">{formatBytes(b.size)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    return (
        <Layout>
            <div className="cleanup">
                <div className="cleanup-head">
                    <h2>Cleanup package binaries</h2>
                    <p className="cleanup-sub">
                        Remove binaries on <code>{remoteName}</code>.
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
                            <span className="cleanup-hint">Only delete binaries older than this.</span>
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
                            <span className="cleanup-hint">Always keep the newest N.</span>
                        </div>

                        <div className="cleanup-field">
                            <label htmlFor="cl-scope">Keep scope</label>
                            <select
                                id="cl-scope"
                                value={keepScope}
                                onChange={(e) => setKeepScope(e.target.value as CleanupScope)}
                            >
                                <option value="recipe_revision">per recipe revision</option>
                                <option value="version">per version</option>
                                <option value="name">per package name</option>
                            </select>
                            <span className="cleanup-hint">"Keep at least" counts within this.</span>
                        </div>
                    </div>

                    <div className="cleanup-actions">
                        <button
                            type="button"
                            className="cleanup-preview-btn"
                            onClick={handlePreview}
                            disabled={scanning || !hasRule}
                        >
                            {scanning ? 'Scanning…' : 'Preview plan'}
                        </button>
                        <span className="cleanup-rule-summary">
                            {keepAtLeast.trim() && olderThanDays.trim()
                                ? `Delete binaries older than ${olderThanDays}d, but keep the newest ${keepAtLeast} ${SCOPE_LABELS[keepScope]}.`
                                : keepAtLeast.trim()
                                    ? `Keep the newest ${keepAtLeast} ${SCOPE_LABELS[keepScope]}, delete the rest.`
                                    : olderThanDays.trim()
                                        ? `Delete every binary older than ${olderThanDays}d.`
                                        : 'Set at least one rule.'}
                        </span>
                    </div>
                </div>

                {error && <div className="error cleanup-error">Error: {error}</div>}

                {/* --- Post-delete result banner --- */}
                {result && (
                    <div className={`cleanup-result ${result.cancelled ? 'cancelled' : ''}`}>
                        <h3>
                            {result.cancelled ? '⏹ Stopped' : '✅ Removed'} {result.total_deleted}{' '}
                            binaries — reclaimed {formatBytes(result.reclaimed_size)}
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

                        {!scanning && summary.to_delete > 0 && (
                            <div className="cleanup-planbar">
                                <button
                                    type="button"
                                    className="cleanup-delete-btn"
                                    onClick={openDeleteModal}
                                >
                                    🗑 Delete {summary.to_delete} binaries (
                                    {formatBytes(summary.reclaim_size)})…
                                </button>
                            </div>
                        )}

                        <div className="cleanup-summary">
                            <span className="stat">
                                <b>{summary.total}</b> matched
                            </span>
                            <span className="stat keep">
                                <b>{summary.to_keep}</b> kept
                            </span>
                            <span className="stat delete">
                                <b>{summary.to_delete}</b> to delete
                            </span>
                            <span className="stat reclaim">
                                reclaim <b>{formatBytes(summary.reclaim_size)}</b>
                                <span className="stat-sub"> of {formatBytes(summary.total_size)}</span>
                            </span>
                            {visibleGroups.length > 0 && (
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
                                Show deletions only
                            </label>
                        </div>

                        {!scanning && summary.total === 0 && (
                            <div className="cleanup-empty">
                                Nothing matches these rules — nothing would be deleted.
                            </div>
                        )}

                        {slots.map((slot) => (
                            <React.Fragment key={slot.id}>
                                {slot.status === 'loading' ? (
                                    <div className="cleanup-group">
                                        <button type="button" className="cleanup-group-head" disabled>
                                            <span className="cleanup-group-caret">▸</span>
                                            <code>{slot.label}</code>
                                            <span className="cleanup-group-meta">
                                                <span className="cleanup-spinner" aria-label="loading" />
                                            </span>
                                        </button>
                                    </div>
                                ) : (
                                    slot.groups
                                        .filter((g) => !deletionsOnly || g.to_delete > 0)
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
                                    <h3>Delete {summary.to_delete} binaries?</h3>
                                    <p>
                                        This permanently removes{' '}
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

                            {modalPhase === 'verifying' && (
                                <>
                                    <h3>Verifying plan…</h3>
                                    <ProgressBar pct={scanPct} />
                                    <p className="cleanup-modal-status">
                                        Re-scanning {scan.total ? `${scan.done} / ${scan.total}` : ''}{' '}
                                        <span className="dim mono">{scan.current}</span>
                                    </p>
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-cancel-btn" onClick={cancelDelete}>
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}

                            {modalPhase === 'deleting' && (
                                <>
                                    <h3>Deleting…</h3>
                                    <ProgressBar pct={delPct} />
                                    <p className="cleanup-modal-status">
                                        {del.done} / {del.total} deleted — reclaimed{' '}
                                        {formatBytes(del.reclaimed)}
                                        {delFailed.length > 0 && <span className="dim"> · {delFailed.length} failed</span>}
                                    </p>
                                    <div className="cleanup-modal-actions">
                                        <button className="cleanup-delete-btn" onClick={cancelDelete}>
                                            Cancel
                                        </button>
                                    </div>
                                    <p className="cleanup-modal-note">
                                        Cancelling stops further deletions; already-deleted binaries stay removed.
                                    </p>
                                </>
                            )}

                            {modalPhase === 'done' && result && (
                                <>
                                    <h3>✅ Removed {result.total_deleted} binaries</h3>
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
                                    <h3>⏹ Stopped</h3>
                                    <p>
                                        Deleted {result.total_deleted} binaries before cancelling —
                                        reclaimed <b>{formatBytes(result.reclaimed_size)}</b>. The rest were
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
                                    <h3>⚠️ Couldn't complete</h3>
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
