"""Configuration & environment for the Conan UI backend.

Loads env vars and the repositories config file, exposing the derived remote
lists used across the app. Imported first, so it also configures logging.
"""

import os
import json
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

# Configuration file path. Default to /etc/conan-ui/config.json in containers,
# or config.json for local development.
CONFIG_FILE = os.getenv("CONAN_UI_CONFIG", "/etc/conan-ui/config.json")


def load_config():
    """Load repositories from the config.json file."""
    config_path = CONFIG_FILE
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
            repositories = config.get("repositories", [])
            logger.info(f"Loaded {len(repositories)} repositories from {config_path}")
            return repositories
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse config file '{config_path}': {e}")
        return []
    except Exception as e:
        logger.error(f"Failed to load config file '{config_path}': {e}")
        return []


# Parse repositories configuration
REPOSITORIES = load_config()

# Extract available remote names and default remote
AVAILABLE_REMOTES = [repo["name"] for repo in REPOSITORIES]
DEFAULT_REMOTE = next(
    (repo["name"] for repo in REPOSITORIES if repo.get("is_default")),
    AVAILABLE_REMOTES[0] if AVAILABLE_REMOTES else None,
)
