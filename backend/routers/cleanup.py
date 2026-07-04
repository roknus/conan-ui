"""Cleanup endpoints: preview and execute binary-level removal on a remote.

Conan's native `--lru` filter is cache-only, so on remotes we approximate LRU by
ordering binaries by upload time (pref.timestamp), oldest first, and apply an
"older than" cutoff plus a "keep at least X" floor within a chosen grouping.

The scan is done recipe-by-recipe (via search.recipes) so the streaming variants
can report progress and match recipe names as substrings (e.g. "admin" matches
"admin_panel").
"""

import json
import time
import logging
from typing import List, Dict

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from conan.api.conan_api import ConanAPI
from conan.api.model import ListPattern, RecipeReference, PkgReference
from conan.errors import ConanException

import artifactory
from conan_client import get_conan_api, get_remote_by_name, validate_remote_name
from schemas import (
    CleanupRequest,
    CleanupExecuteRequest,
    CleanupBinary,
    CleanupGroup,
    CleanupSummary,
    CleanupPlanResponse,
    CleanupExecuteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cleanup", tags=["cleanup"])

PRERELEASE_MODES = ("all", "only", "exclude")

# Headers that tell nginx not to buffer the response, so NDJSON lines reach the
# client in real time (and the idle read-timeout never trips mid-scan).
_STREAM_HEADERS = {"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}


def _nd(obj) -> str:
    """Serialize one NDJSON line."""
    return json.dumps(obj) + "\n"


def _version_is_prerelease(version) -> bool:
    """True if a Conan Version has a prerelease component (e.g. 1.2.3-alpha)."""
    pre = getattr(version, "pre", None)
    if pre is not None:
        return bool(pre)
    return "-" in str(version)


def _search_pattern(pattern: str) -> str:
    """Turn the reference filter into a search.recipes pattern.

    A bare word is matched as a substring ("admin" -> "*admin*" so it covers
    "admin_panel"); anything with structure (/, @, :, *) is passed through.
    """
    p = (pattern or "").strip()
    if not p:
        return "*"
    if any(c in p for c in "/@:*"):
        return p
    return f"*{p}*"


def _size_name_filter(pattern: str):
    """Recipe-name scope for the Artifactory size query, mirroring _search_pattern."""
    p = (pattern or "").strip()
    if not p or p == "*":
        return None
    if any(c in p for c in "/@:"):
        head = p.split("/", 1)[0].split("@", 1)[0].split(":", 1)[0].strip()
        return head if head and head != "*" else None
    return p if "*" in p else f"*{p}*"


def _cleanup_group_key(ref: RecipeReference, scope: str) -> str:
    """Build the grouping key the keep-floor is counted within."""
    base = f"{ref.name}/{ref.version}"
    if ref.user or ref.channel:
        base += f"@{ref.user}/{ref.channel}"
    if scope == "name":
        return ref.name
    if scope == "version":
        return base
    # recipe_revision (default): finest grouping
    return f"{base}#{ref.revision}"


def _list_recipes(conan_api: ConanAPI, remote, req: CleanupRequest) -> List[RecipeReference]:
    """Recipe references (name/version[@user/channel]) matching the filter.

    Applies the prerelease filter here so downstream work only sees kept versions.
    """
    refs = conan_api.search.recipes(_search_pattern(req.pattern), remote=remote)
    out: List[RecipeReference] = []
    for ref in refs:
        if req.prerelease != "all":
            is_pre = _version_is_prerelease(ref.version)
            if req.prerelease == "only" and not is_pre:
                continue
            if req.prerelease == "exclude" and is_pre:
                continue
        out.append(ref)
    return out


def _collect_recipe_binaries(conan_api: ConanAPI, remote, req: CleanupRequest, recipe_ref: RecipeReference):
    """List all package binaries (with revisions) for one recipe reference."""
    uc = f"@{recipe_ref.user}/{recipe_ref.channel}" if (recipe_ref.user or recipe_ref.channel) else ""
    pattern = ListPattern(f"{recipe_ref.name}/{recipe_ref.version}{uc}:*", rrev="*", prev="*")
    package_list = conan_api.list.select(pattern, req.package_query, remote, lru=None)

    items = []
    for ref, ref_bundle in package_list.refs().items():
        prefs = package_list.prefs(ref, ref_bundle)
        for pref, _pbundle in prefs.items():
            items.append((pref.repr_notime(), pref, ref))
    return items


def build_plan(items, req: CleanupRequest, size_map: Dict[str, int]):
    """Apply the keep-logic to collected binaries. Pure/in-memory.

    Returns (groups, summary, delete_map). `items` is a list of (key, pref, ref).
    """
    grouped: Dict[str, list] = {}
    for key, pref, ref in items:
        grouped.setdefault(_cleanup_group_key(ref, req.keep_scope), []).append((key, pref, ref))

    now = time.time()
    cutoff = now - req.older_than_days * 86400 if req.older_than_days is not None else None
    floor = req.keep_at_least if req.keep_at_least is not None else 0

    groups: List[CleanupGroup] = []
    delete_map: Dict[str, PkgReference] = {}
    total = to_delete = to_keep = 0
    total_size = reclaim_size = 0

    for group_key in sorted(grouped.keys()):
        group_items = grouped[group_key]
        # Newest first. Treat missing timestamps as oldest (-inf) so they sort last.
        group_items.sort(
            key=lambda t: (t[1].timestamp if t[1].timestamp is not None else float("-inf")),
            reverse=True,
        )

        binaries: List[CleanupBinary] = []
        group_delete = 0
        group_total_size = 0
        group_delete_size = 0
        for i, (key, pref, ref) in enumerate(group_items):
            created = pref.timestamp
            size = size_map.get(key)
            within_floor = i < floor
            old_enough = cutoff is None or created is None or created < cutoff

            if within_floor:
                action, reason = "keep", f"within newest {floor} in group"
            elif not old_enough:
                action, reason = "keep", "newer than age cutoff"
            else:
                action = "delete"
                if cutoff is not None and floor > 0:
                    reason = f"beyond newest {floor} and older than {req.older_than_days}d"
                elif cutoff is not None:
                    reason = f"older than {req.older_than_days}d"
                elif floor > 0:
                    reason = f"beyond newest {floor} in group"
                else:
                    reason = "no rule set"  # shouldn't happen; endpoint guards this

            if size:
                group_total_size += size
                total_size += size
            if action == "delete":
                delete_map[key] = pref
                group_delete += 1
                to_delete += 1
                if size:
                    group_delete_size += size
                    reclaim_size += size
            else:
                to_keep += 1
            total += 1

            binaries.append(CleanupBinary(
                key=key,
                package_id=pref.package_id,
                ref=ref.repr_notime(),
                created=created,
                size=size,
                action=action,
                reason=reason,
            ))

        groups.append(CleanupGroup(
            key=group_key,
            binaries=binaries,
            to_delete=group_delete,
            total_size=group_total_size,
            delete_size=group_delete_size,
        ))

    summary = CleanupSummary(
        total=total, to_delete=to_delete, to_keep=to_keep,
        total_size=total_size, reclaim_size=reclaim_size,
    )
    return groups, summary, delete_map


def compute_cleanup_plan(conan_api: ConanAPI, remote, req: CleanupRequest):
    """Compute a binary-level cleanup plan without deleting anything (blocking)."""
    recipes = _list_recipes(conan_api, remote, req)
    items = []
    for recipe_ref in recipes:
        items.extend(_collect_recipe_binaries(conan_api, remote, req, recipe_ref))
    size_map = artifactory.get_binary_sizes(req.remote_name, _size_name_filter(req.pattern))
    return build_plan(items, req, size_map)


def _validate_rules(req: CleanupRequest):
    """Shared request validation for preview/execute."""
    if req.older_than_days is None and req.keep_at_least is None:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one rule: 'older_than_days' and/or 'keep_at_least'"
        )
    if req.keep_scope not in ("recipe_revision", "version", "name"):
        raise HTTPException(status_code=400, detail=f"Invalid keep_scope '{req.keep_scope}'")
    if req.prerelease not in PRERELEASE_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid prerelease '{req.prerelease}'")


# --- Non-streaming (kept for API clients / simple use) ------------------------

@router.post("/preview", response_model=CleanupPlanResponse)
async def cleanup_preview(
    req: CleanupRequest,
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Compute a cleanup plan for a remote. Deletes nothing."""
    _validate_rules(req)

    try:
        validate_remote_name(conan_api, req.remote_name)
        remote = get_remote_by_name(conan_api, req.remote_name)
        groups, summary, _ = compute_cleanup_plan(conan_api, remote, req)
        return CleanupPlanResponse(remote_name=req.remote_name, groups=groups, summary=summary)
    except HTTPException:
        raise
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"Cleanup preview error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to compute cleanup plan: {str(e)}")


@router.post("/execute", response_model=CleanupExecuteResponse)
async def cleanup_execute(
    req: CleanupExecuteRequest,
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Delete the binaries a matching preview would remove.

    Recomputes the plan server-side and aborts with 409 if the number of binaries
    to delete no longer matches what the client previewed.
    """
    _validate_rules(req)

    try:
        validate_remote_name(conan_api, req.remote_name)
        remote = get_remote_by_name(conan_api, req.remote_name)
        groups, summary, delete_map = compute_cleanup_plan(conan_api, remote, req)

        if summary.to_delete != req.expected_delete_count:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Plan changed since preview: {summary.to_delete} binaries now match "
                    f"(previewed {req.expected_delete_count}). Re-run the preview."
                )
            )

        size_by_key = {b.key: (b.size or 0) for g in groups for b in g.binaries}

        deleted: List[str] = []
        failed: List[Dict[str, str]] = []
        reclaimed = 0
        for key, pref in delete_map.items():
            try:
                conan_api.remove.package(pref, remote=remote)
                deleted.append(key)
                reclaimed += size_by_key.get(key, 0)
            except Exception as e:
                logger.warning(f"Failed to remove {key}: {e}")
                failed.append({"key": key, "error": str(e)})

        return CleanupExecuteResponse(
            remote_name=req.remote_name,
            deleted=deleted,
            failed=failed,
            total_deleted=len(deleted),
            reclaimed_size=reclaimed,
        )
    except HTTPException:
        raise
    except ConanException as e:
        logger.error(f"Conan API error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Conan API error: {str(e)}")
    except Exception as e:
        logger.error(f"Cleanup execute error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to execute cleanup: {str(e)}")


# --- Streaming (progressive scan + live delete progress) ----------------------

async def _stream_scan(conan_api, remote, req, request):
    """Async-generate scan progress events, returning collected items via a list.

    Yields NDJSON strings; appends (key, pref, ref) tuples to the returned holder.
    Returns the items list, or None if the client disconnected mid-scan.
    """
    recipes = await run_in_threadpool(_list_recipes, conan_api, remote, req)
    total = len(recipes)
    yield ("event", _nd({"event": "scan_start", "total": total}))
    items = []
    for i, recipe_ref in enumerate(recipes, 1):
        if await request.is_disconnected():
            yield ("abort", None)
            return
        part = await run_in_threadpool(_collect_recipe_binaries, conan_api, remote, req, recipe_ref)
        items.extend(part)
        yield ("event", _nd({
            "event": "scan_progress", "done": i, "total": total,
            "current": f"{recipe_ref.name}/{recipe_ref.version}",
        }))
    yield ("items", items)


def _preview_slots(recipes, keep_scope):
    """Group recipes into UI 'slots' (one collapsible per package).

    For 'name' scope a slot spans every version of a name (so its keep-floor is
    computed across versions); otherwise a slot is a single recipe. Returns a list
    of (slot_id, label, [recipe_refs]) preserving discovery order.
    """
    if keep_scope == "name":
        by_name: Dict[str, list] = {}
        order = []
        for r in recipes:
            if r.name not in by_name:
                by_name[r.name] = []
                order.append(r.name)
            by_name[r.name].append(r)
        return [(name, name, by_name[name]) for name in order]

    slots = []
    for r in recipes:
        uc = f"@{r.user}/{r.channel}" if (r.user or r.channel) else ""
        slots.append((str(r), f"{r.name}/{r.version}{uc}", [r]))
    return slots


@router.post("/preview/stream")
async def cleanup_preview_stream(
    req: CleanupRequest,
    request: Request,
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Streaming preview.

    Emits the full list of package 'slots' up front (each a spinner in the UI),
    then fills each slot's groups as soon as that package's binaries are scanned:
      scan_start -> slot* -> (scan_progress / slot_ready)* -> done (or error)
    """
    _validate_rules(req)
    validate_remote_name(conan_api, req.remote_name)
    remote = get_remote_by_name(conan_api, req.remote_name)

    async def gen():
        try:
            recipes = await run_in_threadpool(_list_recipes, conan_api, remote, req)
            total = len(recipes)
            yield _nd({"event": "scan_start", "total": total})

            slots = _preview_slots(recipes, req.keep_scope)
            for slot_id, label, _recipes in slots:
                yield _nd({"event": "slot", "id": slot_id, "label": label})

            # One size query up front; each slot looks its binaries up from it.
            size_map = await run_in_threadpool(
                artifactory.get_binary_sizes, req.remote_name, _size_name_filter(req.pattern))

            done = 0
            for slot_id, _label, slot_recipes in slots:
                if await request.is_disconnected():
                    return
                items = []
                for recipe_ref in slot_recipes:
                    part = await run_in_threadpool(
                        _collect_recipe_binaries, conan_api, remote, req, recipe_ref)
                    items.extend(part)
                    done += 1
                    yield _nd({"event": "scan_progress", "done": done, "total": total})
                groups, _summary, _dm = build_plan(items, req, size_map)
                yield _nd({
                    "event": "slot_ready",
                    "id": slot_id,
                    "groups": [g.model_dump() for g in groups],
                })
            yield _nd({"event": "done"})
        except Exception as e:
            logger.error(f"Cleanup preview stream error: {e}")
            yield _nd({"event": "error", "detail": str(e)})

    return StreamingResponse(gen(), media_type="application/x-ndjson", headers=_STREAM_HEADERS)


@router.post("/execute/stream")
async def cleanup_execute_stream(
    req: CleanupExecuteRequest,
    request: Request,
    conan_api: ConanAPI = Depends(get_conan_api)
):
    """Streaming delete: scan_* then delete_start / deleted / failed / done.

    Cancels cleanly if the client disconnects (AbortController) — it stops issuing
    further deletes; anything already removed stays removed.
    """
    _validate_rules(req)
    validate_remote_name(conan_api, req.remote_name)
    remote = get_remote_by_name(conan_api, req.remote_name)

    async def gen():
        try:
            # Recompute the plan (with scan progress) to guard against drift.
            items = None
            async for kind, payload in _stream_scan(conan_api, remote, req, request):
                if kind == "event":
                    yield payload
                elif kind == "abort":
                    return
                elif kind == "items":
                    items = payload
            if items is None:
                return

            size_map = await run_in_threadpool(
                artifactory.get_binary_sizes, req.remote_name, _size_name_filter(req.pattern))
            groups, summary, delete_map = build_plan(items, req, size_map)

            if summary.to_delete != req.expected_delete_count:
                yield _nd({
                    "event": "conflict",
                    "detail": (
                        f"Plan changed since preview: {summary.to_delete} binaries now match "
                        f"(previewed {req.expected_delete_count}). Re-run the preview."
                    ),
                })
                return

            size_by_key = {b.key: (b.size or 0) for g in groups for b in g.binaries}
            total = len(delete_map)
            yield _nd({"event": "delete_start", "total": total, "reclaim_total": summary.reclaim_size})

            deleted = 0
            reclaimed = 0
            failed: List[Dict[str, str]] = []
            for key, pref in list(delete_map.items()):
                if await request.is_disconnected():
                    # Client cancelled — stop issuing deletes.
                    return
                try:
                    await run_in_threadpool(conan_api.remove.package, pref, remote)
                    deleted += 1
                    reclaimed += size_by_key.get(key, 0)
                    yield _nd({
                        "event": "deleted", "done": deleted, "total": total,
                        "key": key, "reclaimed_size": reclaimed,
                    })
                except Exception as e:
                    logger.warning(f"Failed to remove {key}: {e}")
                    failed.append({"key": key, "error": str(e)})
                    yield _nd({
                        "event": "failed", "key": key, "error": str(e),
                        "done": deleted, "total": total,
                    })
            yield _nd({
                "event": "done", "total_deleted": deleted,
                "reclaimed_size": reclaimed, "failed": failed,
            })
        except Exception as e:
            logger.error(f"Cleanup execute stream error: {e}")
            yield _nd({"event": "error", "detail": str(e)})

    return StreamingResponse(gen(), media_type="application/x-ndjson", headers=_STREAM_HEADERS)
