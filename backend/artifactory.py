"""Artifactory-specific helpers.

Conan's remote API doesn't expose artifact sizes, but every remote is a Conan
repository on the configured Artifactory host (see config.ARTIFACTORY_URL).
Artifactory's AQL API lets us sum the on-disk size of each package binary.
Best-effort: any failure (unknown remote, auth, network) yields an empty map and
the caller treats sizes as unknown.
"""

import logging

import requests

import config
import credentials

logger = logging.getLogger(__name__)


def _repo_conf(remote_name: str):
    """Find the configured entry for a remote by name."""
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
    if not _repo_conf(remote_name):
        return {}

    # Every remote is a Conan repository on the configured Artifactory host, so
    # the API base and repo key are known directly rather than parsed back out
    # of the remote URL.
    base = config.artifactory_api_base()
    repo_key = remote_name
    user, password = credentials.resolve(remote_name)
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
