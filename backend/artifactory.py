"""Artifactory-specific helpers.

Conan's remote API doesn't expose artifact sizes, but our remotes are Artifactory
Conan repos (URL contains `/api/conan/<repo>`). Artifactory's AQL API lets us sum
the on-disk size of each package binary. Best-effort: any failure (non-Artifactory
remote, auth, network) yields an empty map and the caller treats sizes as unknown.
"""

import logging

import requests

import config

logger = logging.getLogger(__name__)

# Marker in a remote URL identifying an Artifactory Conan repository
_CONAN_MARKER = "/api/conan/"


def _repo_conf(remote_name: str):
    """Find the config.json entry for a remote by name."""
    for repo in config.REPOSITORIES:
        if repo.get("name") == remote_name:
            return repo
    return None


def _path_to_key(path: str):
    """Map an Artifactory package-file path to a `pref.repr_notime()` key.

    Package binaries live at:
        <user>/<name>/<version>/<channel>/<rrev>/package/<package_id>/<prev>
    where `_` means "no user/channel". Anything that isn't exactly this shape
    (e.g. the package-id level index.json) returns None and is skipped.
    """
    parts = path.split("/")
    if len(parts) != 8:
        return None
    user, name, version, channel, rrev, marker, package_id, prev = parts
    if marker != "package":
        return None
    if user == "_" and channel == "_":
        ref = f"{name}/{version}"
    else:
        ref = f"{name}/{version}@{user}/{channel}"
    return f"{ref}#{rrev}:{package_id}#{prev}"


def get_binary_sizes(remote_name: str, name_filter=None):
    """Return {pref_key: total_bytes} for package binaries on an Artifactory remote.

    Sums every file under each package revision folder. `name_filter` scopes the
    query to a single recipe name to keep the payload small. Returns {} for
    non-Artifactory remotes or on any error.
    """
    conf = _repo_conf(remote_name)
    if not conf:
        return {}
    url = conf.get("url", "")
    if _CONAN_MARKER not in url:
        return {}

    base, repo_key = url.split(_CONAN_MARKER, 1)
    repo_key = repo_key.strip("/")
    user, password = conf.get("user"), conf.get("password")
    auth = (user, password) if user and password else None

    # `*` in an AQL path match spans '/', so this covers any user/channel/rrev.
    path_match = f"*/{name_filter}/*/package/*" if name_filter else "*/package/*"
    aql = (
        'items.find({"repo":"%s","path":{"$match":"%s"}})'
        '.include("repo","path","name","size")' % (repo_key, path_match)
    )

    try:
        resp = requests.post(
            base.rstrip("/") + "/api/search/aql",
            data=aql,
            headers={"Content-Type": "text/plain"},
            auth=auth,
            timeout=60,
        )
        resp.raise_for_status()
        rows = resp.json().get("results", [])
    except Exception as e:
        logger.warning(f"Artifactory size lookup failed for '{remote_name}': {e}")
        return {}

    sizes: dict = {}
    for item in rows:
        key = _path_to_key(item.get("path", ""))
        if key:
            sizes[key] = sizes.get(key, 0) + (item.get("size") or 0)
    return sizes
