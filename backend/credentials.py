"""Remote credential resolution.

Credentials come from the environment, using Conan's own variable names so the
backend and the Conan client agree on where secrets live:

    CONAN_LOGIN_USERNAME_<REMOTE>  /  CONAN_LOGIN_USERNAME
    CONAN_PASSWORD_<REMOTE>        /  CONAN_PASSWORD

<REMOTE> is the remote name upper-cased with '-' replaced by '_'. The per-remote
variable wins over the global fallback. This mirrors Conan 2.17's
`conan/internal/rest/remote_credentials.py::RemoteCredentials._get_env`; keep the
two in sync if the pinned Conan version changes.

All remotes live on one Artifactory host, so the global variables are normally
all you need; the per-remote form exists for repositories with their own service
account. Conan resolves these itself for its own operations, but `artifactory.py`
talks to the Artifactory REST API directly, so it needs the same answer from
Python.
"""

import os


def env_var_names(remote_name: str):
    """Return the (user_var, password_var) env var names for a remote."""
    key = remote_name.replace("-", "_").upper()
    return f"CONAN_LOGIN_USERNAME_{key}", f"CONAN_PASSWORD_{key}"


def resolve(remote_name: str):
    """Return (user, password) for a remote, or (None, None) if unset.

    Falls back to the global CONAN_LOGIN_USERNAME / CONAN_PASSWORD, matching
    Conan's precedence.
    """
    user_var, password_var = env_var_names(remote_name)
    user = os.getenv(user_var) or os.getenv("CONAN_LOGIN_USERNAME")
    password = os.getenv(password_var) or os.getenv("CONAN_PASSWORD")
    return user, password


def has_credentials(remote_name: str) -> bool:
    """Whether both a user and a password are available for a remote."""
    user, password = resolve(remote_name)
    return bool(user and password)
