"""Cleanup endpoints: preview and execute removal on a remote.

The cleanup unit is the *recipe revision* (name/version@user/channel#rrev) — the
same thing the search UI browses — each holding N package binaries (one per
configuration/profile). Conan's native `--lru` filter is cache-only, so on
remotes we approximate LRU by ordering recipe revisions by upload time
(rref.timestamp), newest first, and apply an "older than" cutoff plus a
"keep at least X" floor within a chosen grouping.

A deletion either removes whole recipe revisions (`delete_mode="both"`, which
cascades to their binaries via remove.recipe) or only the package binaries under
the doomed revisions (`delete_mode="binaries"`, leaving the recipe metadata).

The scan is done recipe-by-recipe (via search_recipes) so the streaming variants
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
from conan_client import get_conan_api, get_remote_by_name, validate_remote_name, search_recipes
from schemas import (
    CleanupRequest,
    CleanupExecuteRequest,
    CleanupBinary,
    CleanupRecipeRevision,
    CleanupGroup,
    CleanupSummary,
    CleanupPlanResponse,
    CleanupExecuteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cleanup", tags=["cleanup"])

PRERELEASE_MODES = ("all", "only", "exclude")
KEEP_SCOPES = ("name", "version")
DELETE_MODES = ("both", "binaries")

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
    """Build the grouping key the keep-floor (newest N recipe revisions) is counted within."""
    if scope == "name":
        return ref.name
    # version (default): keep-floor counted across the revisions of one version
    base = f"{ref.name}/{ref.version}"
    if ref.user or ref.channel:
        base += f"@{ref.user}/{ref.channel}"
    return base


def _list_recipes(conan_api: ConanAPI, remote, req: CleanupRequest) -> List[RecipeReference]:
    """Recipe references (name/version[@user/channel]) matching the filter.

    Applies the prerelease filter here so downstream work only sees kept versions.
    """
    refs = search_recipes(conan_api, _search_pattern(req.pattern), remote=remote)
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


def _collect_recipe_revisions(conan_api: ConanAPI, remote, req: CleanupRequest, recipe_ref: RecipeReference):
    """List all recipe revisions (with their binaries) for one version reference.

    Returns a list of (rref, [(key, pref), ...]) — one entry per recipe revision,
    including revisions that carry no binaries (recipe-only versions), which the
    binary-level scan used to skip entirely.
    """
    uc = f"@{recipe_ref.user}/{recipe_ref.channel}" if (recipe_ref.user or recipe_ref.channel) else ""
    pattern = ListPattern(f"{recipe_ref.name}/{recipe_ref.version}{uc}:*", rrev="*", prev="*")
    package_list = conan_api.list.select(pattern, req.package_query, remote, lru=None)

    revisions = []
    for rref, prefs in package_list.items():
        binaries = [(pref.repr_notime(), pref) for pref in prefs.keys()]
        revisions.append((rref, binaries))
    return revisions


def _delete_reason(cutoff, floor, older_than_days) -> str:
    """Human-readable reason a recipe revision is flagged for deletion."""
    if cutoff is not None and floor > 0:
        return f"beyond newest {floor} and older than {older_than_days}d"
    if cutoff is not None:
        return f"older than {older_than_days}d"
    if floor > 0:
        return f"beyond newest {floor} recipe revisions in group"
    return "matches filter (no keep rule)"


def build_plan(rev_items, req: CleanupRequest, size_map: Dict[str, int]):
    """Apply the keep-logic to collected recipe revisions. Pure/in-memory.

    `rev_items` is a list of (rref, [(key, pref), ...]). Returns
    (groups, summary, delete_recipes, delete_binaries) where the two delete lists
    are the removal targets for "both" and "binaries" mode respectively.
    """
    grouped: Dict[str, list] = {}
    for rref, binaries in rev_items:
        grouped.setdefault(_cleanup_group_key(rref, req.keep_scope), []).append((rref, binaries))

    now = time.time()
    cutoff = now - req.older_than_days * 86400 if req.older_than_days is not None else None
    floor = req.keep_at_least if req.keep_at_least is not None else 0

    groups: List[CleanupGroup] = []
    delete_recipes: List[RecipeReference] = []   # remove.recipe targets ("both")
    delete_binaries: List[PkgReference] = []     # remove.package targets ("binaries")
    total_recipes = to_delete_recipes = 0
    total_binaries = to_delete_binaries = 0
    total_size = reclaim_size = 0

    for group_key in sorted(grouped.keys()):
        group_revs = grouped[group_key]
        # Newest first. Treat missing timestamps as oldest (-inf) so they sort last.
        group_revs.sort(
            key=lambda t: (t[0].timestamp if t[0].timestamp is not None else float("-inf")),
            reverse=True,
        )

        rev_models: List[CleanupRecipeRevision] = []
        group_delete_recipes = 0
        group_delete_binaries = 0
        group_total_size = 0
        group_delete_size = 0
        for i, (rref, binaries) in enumerate(group_revs):
            created = rref.timestamp
            within_floor = i < floor
            old_enough = cutoff is None or created is None or created < cutoff

            if within_floor:
                action, reason = "keep", f"within newest {floor} recipe revisions in group"
            elif not old_enough:
                action, reason = "keep", "newer than age cutoff"
            else:
                action = "delete"
                reason = _delete_reason(cutoff, floor, req.older_than_days)

            rev_total_size = 0
            rev_delete_size = 0
            bin_models: List[CleanupBinary] = []
            for key, pref in binaries:
                size = size_map.get(key)
                if size:
                    rev_total_size += size
                bin_models.append(CleanupBinary(
                    key=key,
                    package_id=pref.package_id,
                    package_revision=pref.revision,
                    created=pref.timestamp,
                    size=size,
                    action=action,  # binary follows its recipe revision
                ))
                total_binaries += 1

            total_recipes += 1
            total_size += rev_total_size
            if action == "delete":
                to_delete_recipes += 1
                group_delete_recipes += 1
                to_delete_binaries += len(binaries)
                group_delete_binaries += len(binaries)
                rev_delete_size = rev_total_size
                group_delete_size += rev_delete_size
                reclaim_size += rev_delete_size
                delete_recipes.append(rref)
                delete_binaries.extend(pref for _key, pref in binaries)

            group_total_size += rev_total_size

            rev_models.append(CleanupRecipeRevision(
                ref=rref.repr_notime(),
                revision=rref.revision or "",
                is_prerelease=_version_is_prerelease(rref.version),
                created=created,
                action=action,
                reason=reason,
                binaries=bin_models,
                total_size=rev_total_size,
                delete_size=rev_delete_size,
            ))

        groups.append(CleanupGroup(
            key=group_key,
            revisions=rev_models,
            to_delete_recipes=group_delete_recipes,
            to_delete_binaries=group_delete_binaries,
            total_size=group_total_size,
            delete_size=group_delete_size,
        ))

    summary = CleanupSummary(
        total_recipes=total_recipes,
        to_delete_recipes=to_delete_recipes,
        to_keep_recipes=total_recipes - to_delete_recipes,
        total_binaries=total_binaries,
        to_delete_binaries=to_delete_binaries,
        total_size=total_size,
        reclaim_size=reclaim_size,
    )
    return groups, summary, delete_recipes, delete_binaries


def _scan_items(conan_api: ConanAPI, remote, req: CleanupRequest):
    """Scan the remote for all recipe revisions (with binaries) matching the filter.

    Returns a list of (rref, [(key, pref), ...]) tuples.
    """
    recipes = _list_recipes(conan_api, remote, req)
    items = []
    for recipe_ref in recipes:
        items.extend(_collect_recipe_revisions(conan_api, remote, req, recipe_ref))
    return items


def compute_cleanup_plan(conan_api: ConanAPI, remote, req: CleanupRequest):
    """Compute a cleanup plan without deleting anything (blocking)."""
    items = _scan_items(conan_api, remote, req)
    size_map = artifactory.get_binary_sizes(req.remote_name, _size_name_filter(req.pattern))
    return build_plan(items, req, size_map)


def _resolve_selection(items, req: CleanupExecuteRequest):
    """Map the requested selection to concrete removal targets via a fresh scan.

    Returns (targets, missing): targets is a list of (kind, obj, key) where kind
    is "recipe" or "package"; missing lists selected refs/keys no longer present.
    Binaries whose recipe revision is also selected are skipped (the recipe
    removal already covers them).
    """
    recipe_by_ref = {}
    bin_by_key = {}
    for rref, binaries in items:
        recipe_by_ref[rref.repr_notime()] = rref
        for key, pref in binaries:
            bin_by_key[key] = pref

    selected_recipes = set(req.delete_recipes)
    # Which binary keys fall under a wholesale-removed recipe revision.
    covered_bins = set()
    for rref, binaries in items:
        if rref.repr_notime() in selected_recipes:
            covered_bins.update(key for key, _pref in binaries)

    targets = []
    missing = []
    for ref in req.delete_recipes:
        obj = recipe_by_ref.get(ref)
        if obj is not None:
            targets.append(("recipe", obj, ref))
        else:
            missing.append(ref)
    for key in req.delete_binaries:
        if key in covered_bins:
            continue  # its recipe revision is being removed wholesale
        obj = bin_by_key.get(key)
        if obj is not None:
            targets.append(("package", obj, key))
        else:
            missing.append(key)
    return targets, missing


def _selection_sizes(items, size_map: Dict[str, int]):
    """{binary_key: bytes} and {recipe_ref: sum of its binary bytes}."""
    by_bin = {key: (size_map.get(key) or 0) for _rref, bins in items for key, _p in bins}
    by_recipe = {
        rref.repr_notime(): sum(size_map.get(key) or 0 for key, _p in bins)
        for rref, bins in items
    }
    return by_bin, by_recipe


def _remove_target(conan_api, remote, kind, obj):
    """Remove one target (a recipe revision or a package binary)."""
    if kind == "recipe":
        conan_api.remove.recipe(obj, remote=remote)
    else:
        conan_api.remove.package(obj, remote=remote)


def _validate_rules(req: CleanupRequest):
    """Shared request validation for preview/execute.

    Rules are optional: with neither an age cutoff nor a keep-floor, every recipe
    revision matching the filter is selected (equivalent to keep_at_least=0).
    """
    if req.keep_scope not in KEEP_SCOPES:
        raise HTTPException(status_code=400, detail=f"Invalid keep_scope '{req.keep_scope}'")
    if req.delete_mode not in DELETE_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid delete_mode '{req.delete_mode}'")
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
        groups, summary, _dr, _db = compute_cleanup_plan(conan_api, remote, req)
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
    """Delete exactly the recipe revisions and binaries the request selects."""
    _validate_rules(req)

    try:
        validate_remote_name(conan_api, req.remote_name)
        remote = get_remote_by_name(conan_api, req.remote_name)

        items = _scan_items(conan_api, remote, req)
        size_map = artifactory.get_binary_sizes(req.remote_name, _size_name_filter(req.pattern))
        by_bin, by_recipe = _selection_sizes(items, size_map)
        targets, _missing = _resolve_selection(items, req)

        deleted: List[str] = []
        failed: List[Dict[str, str]] = []
        reclaimed = 0
        for kind, obj, key in targets:
            try:
                _remove_target(conan_api, remote, kind, obj)
                deleted.append(key)
                reclaimed += (by_recipe if kind == "recipe" else by_bin).get(key, 0)
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

    Yields NDJSON strings; the "items" payload is a list of (rref, [(key, pref)])
    recipe-revision tuples. Returns None if the client disconnected mid-scan.
    """
    recipes = await run_in_threadpool(_list_recipes, conan_api, remote, req)
    total = len(recipes)
    yield ("event", _nd({"event": "scan_start", "total": total}))
    items = []
    for i, recipe_ref in enumerate(recipes, 1):
        if await request.is_disconnected():
            yield ("abort", None)
            return
        part = await run_in_threadpool(_collect_recipe_revisions, conan_api, remote, req, recipe_ref)
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
    then fills each slot's groups as soon as that package's recipe revisions are
    scanned:
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
                        _collect_recipe_revisions, conan_api, remote, req, recipe_ref)
                    items.extend(part)
                    done += 1
                    yield _nd({"event": "scan_progress", "done": done, "total": total})
                groups, _summary, _dr, _db = build_plan(items, req, size_map)
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
            # Re-scan (with progress) so the selection resolves against current state.
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
            by_bin, by_recipe = _selection_sizes(items, size_map)
            targets, _missing = _resolve_selection(items, req)
            reclaim_total = sum(
                (by_recipe if kind == "recipe" else by_bin).get(key, 0)
                for kind, _obj, key in targets
            )
            total = len(targets)
            yield _nd({"event": "delete_start", "total": total, "reclaim_total": reclaim_total})

            deleted = 0
            reclaimed = 0
            failed: List[Dict[str, str]] = []
            for kind, obj, key in targets:
                if await request.is_disconnected():
                    # Client cancelled — stop issuing deletes.
                    return
                try:
                    await run_in_threadpool(_remove_target, conan_api, remote, kind, obj)
                    deleted += 1
                    reclaimed += (by_recipe if kind == "recipe" else by_bin).get(key, 0)
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
