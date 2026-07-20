"""Configuration & environment for the Conan UI backend.

All configuration comes from the environment — there is no config file. The
remote list is derived from two variables:

    ARTIFACTORY_URL=https://your-artifactory.com
    CONAN_REMOTES=conan-repo,conan-dev

Every remote is a Conan repository on that one Artifactory host, so its URL is
derived rather than spelled out (see `remote_url`). The first name in
CONAN_REMOTES is the default remote.

Credentials deliberately do not live here; see `credentials.py`.
"""

import os
import logging

from dotenv import load_dotenv

# Load environment variables from a local .env if present
load_dotenv()

# Configure logging once for the whole app (config is imported first)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Optional: specify custom Conan home
CONAN_HOME = os.getenv("CONAN_HOME")

# Server configuration
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
# Backend always binds to all interfaces in container for nginx proxy access
BACKEND_HOST = "0.0.0.0"

# CORS origins (comma-separated)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# Base Artifactory host, e.g. https://your-artifactory.com (no trailing path)
ARTIFACTORY_URL = os.getenv("ARTIFACTORY_URL", "").strip().rstrip("/")

# Comma-separated Conan repository names on that host; the first is the default
CONAN_REMOTES = os.getenv("CONAN_REMOTES", "")

# Artifactory always serves Conan repositories under this path
CONAN_PATH = "/artifactory/api/conan"


def remote_url(name: str) -> str:
    """Full Conan remote URL for a repository name on the configured host."""
    return f"{ARTIFACTORY_URL}{CONAN_PATH}/{name}"


def artifactory_api_base() -> str:
    """Base URL for Artifactory's own REST API (not the Conan endpoint)."""
    return f"{ARTIFACTORY_URL}/artifactory"


def load_repositories():
    """Build the repository list from the environment.

    Returns a list of {name, url, is_default} dicts, in the order given by
    CONAN_REMOTES. Misconfiguration is logged and yields an empty list rather
    than raising, so the app still starts and reports itself unconfigured.
    """
    names = [name.strip() for name in CONAN_REMOTES.split(",") if name.strip()]

    if not names:
        logger.warning("CONAN_REMOTES is empty - no repositories configured")
        return []
    if not ARTIFACTORY_URL:
        logger.error("ARTIFACTORY_URL is not set - cannot build remote URLs")
        return []
    if not ARTIFACTORY_URL.startswith(("http://", "https://")):
        logger.error(f"ARTIFACTORY_URL must start with http:// or https:// (got '{ARTIFACTORY_URL}')")
        return []

    seen = set()
    repositories = []
    for name in names:
        if name in seen:
            logger.warning(f"Duplicate remote '{name}' in CONAN_REMOTES - ignoring the repeat")
            continue
        seen.add(name)
        repositories.append({
            "name": name,
            "url": remote_url(name),
            # First entry in CONAN_REMOTES is the default remote
            "is_default": not repositories,
        })

    logger.info(f"Configured {len(repositories)} repositories from CONAN_REMOTES")
    return repositories


def _warn_obsolete_config_file():
    """Point out a leftover config.json, which is no longer read."""
    legacy_path = os.getenv("CONAN_UI_CONFIG")
    for path in filter(None, [legacy_path, "config.json", "/etc/conan-ui/config.json"]):
        if os.path.exists(path):
            logger.warning(
                f"Found '{path}', which is no longer used. Configuration now comes from "
                "ARTIFACTORY_URL and CONAN_REMOTES. Move any credentials to "
                "CONAN_LOGIN_USERNAME/CONAN_PASSWORD and delete the file."
            )
            return


_warn_obsolete_config_file()

REPOSITORIES = load_repositories()
AVAILABLE_REMOTES = [repo["name"] for repo in REPOSITORIES]
DEFAULT_REMOTE = AVAILABLE_REMOTES[0] if AVAILABLE_REMOTES else None
