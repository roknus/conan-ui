"""Conan API lifecycle, the shared instance, and remote helpers.

The `conan_api` module global is initialized at startup (see main.lifespan) and
read back through `get_conan_api` (the FastAPI dependency) and `get_optional_api`.
Access it via this module's attribute (e.g. `conan_client.get_optional_api()`),
never `from conan_client import conan_api`, which would bind `None` at import.
"""

import logging

from fastapi import HTTPException
from conan.api.conan_api import ConanAPI
from conan.api.model import Remote, ListPattern, RecipeReference, PkgReference

import config
import credentials

logger = logging.getLogger(__name__)

# Global Conan API instance (set by initialize_conan_api)
conan_api = None

# Remote names this app has registered with Conan. Tracked so a config edit that
# drops a remote can remove it, without touching remotes the user added to their
# Conan home by other means.
_managed_remotes = set()


def get_remote_by_name(conan_api: ConanAPI, name: str):
    """Get a remote by name."""
    try:
        return conan_api.remotes.get(name)
    except Exception:
        return None


def sync_remotes():
    """Register/update/log into every remote in the current config.

    Idempotent, so it runs both at startup and after a config edit. Returns a
    list of per-remote warning strings; a remote that fails to configure is
    reported but does not stop the others.
    """
    global _managed_remotes

    warnings = []
    if conan_api is None:
        return ["Conan API is not available"]

    if not config.REPOSITORIES:
        logger.warning("No repositories configured - application may have limited functionality")

    configured_names = set()

    for repo_config in config.REPOSITORIES:
        repo_name = repo_config.get("name")
        repo_url = repo_config.get("url")

        if not repo_name or not repo_url:
            warnings.append(f"Skipped invalid repository configuration: {repo_config}")
            logger.warning(warnings[-1])
            continue

        configured_names.add(repo_name)

        try:
            # Check if remote already exists
            existing_remote = get_remote_by_name(conan_api, repo_name)
            if not existing_remote:
                # Add the remote
                remote = Remote(repo_name, repo_url)
                conan_api.remotes.add(remote)
                logger.info(f"Added remote '{repo_name}' at {repo_url}")
            elif existing_remote.url != repo_url:
                # Update URL if different
                conan_api.remotes.update(repo_name, url=repo_url)
                logger.info(f"Updated remote '{repo_name}' URL to {repo_url}")

            _managed_remotes.add(repo_name)

            # Credentials come from the environment (see credentials.py). Every
            # remote is a repository on the same authenticated Artifactory host.
            repo_user, repo_password = credentials.resolve(repo_name)
            if repo_user and repo_password:
                remote_for_auth = get_remote_by_name(conan_api, repo_name)
                if remote_for_auth:
                    try:
                        conan_api.remotes.user_login(remote_for_auth, repo_user, repo_password)
                        logger.info(f"Configured authentication for remote '{repo_name}'")
                    except Exception as auth_error:
                        warnings.append(f"Authentication failed for remote '{repo_name}': {auth_error}")
                        logger.warning(warnings[-1])
                else:
                    warnings.append(f"Could not retrieve remote '{repo_name}' for authentication")
                    logger.warning(warnings[-1])
            else:
                user_var, password_var = credentials.env_var_names(repo_name)
                logger.info(
                    f"No credentials for remote '{repo_name}' (set {user_var}/{password_var} "
                    f"if it requires authentication)"
                )

        except Exception as e:
            warnings.append(f"Failed to configure remote '{repo_name}': {e}")
            logger.warning(warnings[-1])

    # Drop remotes we previously added that are no longer in the config
    for stale_name in sorted(_managed_remotes - configured_names):
        try:
            if get_remote_by_name(conan_api, stale_name):
                conan_api.remotes.remove(stale_name)
                logger.info(f"Removed remote '{stale_name}' (no longer in config)")
        except Exception as e:
            warnings.append(f"Failed to remove remote '{stale_name}': {e}")
            logger.warning(warnings[-1])
    _managed_remotes &= configured_names

    return warnings


def initialize_conan_api():
    """Initialize the Conan API and configure all repositories."""
    global conan_api

    try:
        conan_api = ConanAPI(cache_folder=config.CONAN_HOME)
        logger.info("Conan API initialized successfully")
        sync_remotes()
    except Exception as e:
        logger.error(f"Failed to initialize Conan API: {e}")
        conan_api = None


def get_conan_api() -> ConanAPI:
    """FastAPI dependency to get the Conan API instance."""
    if conan_api is None:
        raise HTTPException(
            status_code=503,
            detail="Conan API not available - service starting up",
        )
    return conan_api


def get_optional_api():
    """Return the current Conan API instance (or None) without raising."""
    return conan_api


def get_all_remotes():
    """Get all configured remotes."""
    try:
        return conan_api.remotes.list()
    except Exception:
        return []


def validate_remote_name(conan_api: ConanAPI, remote_name: str) -> str:
    """Validate and return a supported remote name."""
    if not remote_name:
        raise HTTPException(status_code=400, detail="Remote name is required")

    if remote_name not in config.AVAILABLE_REMOTES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported remote '{remote_name}'. Available remotes: {', '.join(config.AVAILABLE_REMOTES)}",
        )

    remote = get_remote_by_name(conan_api, remote_name)
    if not remote:
        raise HTTPException(status_code=404, detail=f"Remote '{remote_name}' not found in Conan configuration")

    return remote_name


def get_supported_remotes(conan_api: ConanAPI):
    """Get list of supported remotes with their configuration."""
    remotes = []
    for remote_name in config.AVAILABLE_REMOTES:
        remote = get_remote_by_name(conan_api, remote_name)
        if remote:
            remotes.append({"name": remote.name, "url": remote.url, "available": True})
        else:
            remotes.append({"name": remote_name, "url": None, "available": False})
    return remotes


# --- Listing helpers ----------------------------------------------------------
# Thin wrappers over `conan_api.list.select`, which is what conan's own
# `search`/`list` CLI commands use. Conan 2.18+ removed the convenience methods
# these cover (the `search` subapi and `list.packages_configurations`), leaving
# `select` + reading the returned PackagesList as the supported way to query
# recipes and package configurations. Iteration over a PackagesList uses its
# `.items()` method directly at the call sites.


def search_recipes(conan_api: ConanAPI, query: str, remote=None):
    """Search a remote for recipe references matching `query`.

    Returns a sorted list of RecipeReference (without revisions). A trailing '@'
    restricts the result to references with no user/channel. Wraps `list.select`
    with a recipe-only pattern, the same way `conan search` does.
    """
    only_none_user_channel = False
    if query and query.endswith("@"):
        only_none_user_channel = True
        query = query[:-1]

    # only_recipe: parse just the recipe part; select then returns a recipe-only
    # PackagesList whose keys are the matching references.
    pattern = ListPattern(query, rrev=None, only_recipe=True)
    package_list = conan_api.list.select(pattern, remote=remote)

    refs = [RecipeReference.loads(ref_str) for ref_str in package_list.serialize().keys()]
    if only_none_user_channel:
        refs = [r for r in refs if r.user is None and r.channel is None]
    return sorted(refs)


def get_package_configurations(conan_api: ConanAPI, ref: RecipeReference, remote=None):
    """Return {PkgReference(package_id): info} for every binary of `ref`.

    `info` holds each binary's settings/options/requires; `ref` must carry a
    revision. Wraps `list.select` with a package pattern and reads the
    per-package `info` from the resulting PackagesList — `.items()` intentionally
    exposes only package revisions, not this configuration data.
    """
    assert ref.revision is not None, "get_package_configurations: ref should have a revision"

    pattern = ListPattern(f"{ref.repr_notime()}:*", prev=None)
    package_list = conan_api.list.select(pattern, remote=remote)

    result = {}
    for ref_str, ref_data in package_list.serialize().items():
        for rrev, rrev_data in ref_data.get("revisions", {}).items():
            recipe = RecipeReference.loads(f"{ref_str}#{rrev}")
            for package_id, package_data in rrev_data.get("packages", {}).items():
                result[PkgReference(recipe, package_id)] = package_data.get("info", {})
    return result
