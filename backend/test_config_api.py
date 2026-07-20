"""Tests for env-based repository configuration and credential resolution."""

import importlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

CONFIG_VARS = ("ARTIFACTORY_URL", "CONAN_REMOTES")
CRED_VARS = (
    "CONAN_LOGIN_USERNAME", "CONAN_PASSWORD",
    "CONAN_LOGIN_USERNAME_ALPHA", "CONAN_PASSWORD_ALPHA",
)


@pytest.fixture
def load_config(monkeypatch):
    """Reimport the config module with a controlled environment."""
    def _load(**env):
        for var in CONFIG_VARS + CRED_VARS:
            monkeypatch.delenv(var, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        # load_dotenv() must not pull the developer's real .env into the test
        monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
        import config
        return importlib.reload(config)
    return _load


# --- Repository derivation ----------------------------------------------------


def test_urls_are_derived_from_artifactory_url(load_config):
    config = load_config(
        ARTIFACTORY_URL="https://art.example.com",
        CONAN_REMOTES="alpha,beta",
    )
    assert [r["url"] for r in config.REPOSITORIES] == [
        "https://art.example.com/artifactory/api/conan/alpha",
        "https://art.example.com/artifactory/api/conan/beta",
    ]


def test_first_remote_is_the_default(load_config):
    config = load_config(ARTIFACTORY_URL="https://art.example.com", CONAN_REMOTES="alpha,beta")
    assert config.DEFAULT_REMOTE == "alpha"
    assert [r["is_default"] for r in config.REPOSITORIES] == [True, False]
    assert config.AVAILABLE_REMOTES == ["alpha", "beta"]


def test_whitespace_and_blanks_are_tolerated(load_config):
    config = load_config(ARTIFACTORY_URL="https://art.example.com", CONAN_REMOTES=" alpha , , beta ")
    assert config.AVAILABLE_REMOTES == ["alpha", "beta"]


def test_trailing_slash_on_base_url_does_not_double_up(load_config):
    config = load_config(ARTIFACTORY_URL="https://art.example.com/", CONAN_REMOTES="alpha")
    assert config.REPOSITORIES[0]["url"] == "https://art.example.com/artifactory/api/conan/alpha"


def test_duplicate_remote_names_are_dropped(load_config):
    config = load_config(ARTIFACTORY_URL="https://art.example.com", CONAN_REMOTES="alpha,alpha,beta")
    assert config.AVAILABLE_REMOTES == ["alpha", "beta"]


def test_artifactory_api_base(load_config):
    config = load_config(ARTIFACTORY_URL="https://art.example.com", CONAN_REMOTES="alpha")
    assert config.artifactory_api_base() == "https://art.example.com/artifactory"


# --- Misconfiguration is non-fatal --------------------------------------------


def test_missing_remotes_yields_empty_config(load_config):
    config = load_config(ARTIFACTORY_URL="https://art.example.com")
    assert config.REPOSITORIES == []
    assert config.DEFAULT_REMOTE is None


def test_missing_base_url_yields_empty_config(load_config):
    config = load_config(CONAN_REMOTES="alpha")
    assert config.REPOSITORIES == []
    assert config.DEFAULT_REMOTE is None


def test_non_http_base_url_is_rejected(load_config):
    config = load_config(ARTIFACTORY_URL="ftp://art.example.com", CONAN_REMOTES="alpha")
    assert config.REPOSITORIES == []


# --- Credential resolution ----------------------------------------------------


def test_env_var_names_normalizes_remote_name():
    import credentials
    assert credentials.env_var_names("conan-dev") == (
        "CONAN_LOGIN_USERNAME_CONAN_DEV",
        "CONAN_PASSWORD_CONAN_DEV",
    )


def test_per_remote_credentials_win_over_global(monkeypatch):
    import credentials
    monkeypatch.setenv("CONAN_LOGIN_USERNAME", "global-user")
    monkeypatch.setenv("CONAN_PASSWORD", "global-pass")
    monkeypatch.setenv("CONAN_LOGIN_USERNAME_ALPHA", "repo-user")
    monkeypatch.setenv("CONAN_PASSWORD_ALPHA", "repo-pass")

    assert credentials.resolve("alpha") == ("repo-user", "repo-pass")
    # A remote without an override falls back to the global vars
    assert credentials.resolve("beta") == ("global-user", "global-pass")


def test_resolve_returns_none_when_unset(monkeypatch):
    import credentials
    for var in CRED_VARS:
        monkeypatch.delenv(var, raising=False)
    assert credentials.resolve("alpha") == (None, None)
    assert credentials.has_credentials("alpha") is False


# --- Remote sync --------------------------------------------------------------


def test_sync_logs_in_to_every_configured_remote(monkeypatch):
    import conan_client
    import config

    monkeypatch.setenv("CONAN_LOGIN_USERNAME", "u")
    monkeypatch.setenv("CONAN_PASSWORD", "p")
    monkeypatch.setattr(config, "REPOSITORIES", [
        {"name": "alpha", "url": "https://art.example.com/artifactory/api/conan/alpha"},
        {"name": "beta", "url": "https://art.example.com/artifactory/api/conan/beta"},
    ])

    logins = []

    class FakeRemotes:
        def add(self, remote): pass
        def update(self, name, url=None): pass
        def remove(self, name): pass
        def get(self, name): return type("R", (), {"name": name, "url": "https://x"})()
        def user_login(self, remote, user, password): logins.append(remote.name)

    monkeypatch.setattr(conan_client, "conan_api", type("API", (), {"remotes": FakeRemotes()})())
    monkeypatch.setattr(conan_client, "_managed_remotes", set())

    assert conan_client.sync_remotes() == []
    assert logins == ["alpha", "beta"]


def test_sync_removes_remotes_dropped_from_config(monkeypatch):
    """A remote removed from CONAN_REMOTES is deregistered on the next sync."""
    import conan_client
    import config

    removed = []

    class FakeRemotes:
        def add(self, remote): pass
        def update(self, name, url=None): pass
        def remove(self, name): removed.append(name)
        def get(self, name): return type("R", (), {"name": name, "url": "https://x"})()
        def user_login(self, remote, user, password): pass

    monkeypatch.setattr(conan_client, "conan_api", type("API", (), {"remotes": FakeRemotes()})())
    monkeypatch.setattr(conan_client, "_managed_remotes", {"alpha", "stale"})
    monkeypatch.setattr(config, "REPOSITORIES", [
        {"name": "alpha", "url": "https://art.example.com/artifactory/api/conan/alpha"},
    ])

    conan_client.sync_remotes()

    assert removed == ["stale"]
    assert conan_client._managed_remotes == {"alpha"}
