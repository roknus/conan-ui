# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Full-stack web UI for browsing/searching Conan (C/C++ package manager) packages across remotes (Artifactory, conan-center). Python FastAPI backend + React/TypeScript frontend, two apps in one repo (not a workspace/monorepo).

- `backend/` — FastAPI app; all routes live in `backend/main.py`. Uses the Conan Python API directly (no shelling out). Pinned to `conan==2.17.0`.
- `frontend/` — Create React App (react-scripts), React 19 + TypeScript. Not Vite/Tauri/Electron.
- `docker/` — nginx config + `start.sh` (runs backend + nginx together).

## Commands

The README says to run from the repo root, but there is **no root `main.py` or `requirements.txt`** — the real paths are under `backend/`.

Backend (dev) — dependencies are managed with Poetry (`backend/pyproject.toml`):
```
cd backend && poetry install         # installs main + dev deps into a venv
cd backend && poetry run python main.py   # serves on :8000
```

Backend tests — run from `backend/` (no pytest config exists, so cwd matters):
```
cd backend && poetry run pytest
```

Frontend (dev), from `frontend/`:
```
npm install
npm start                         # CRA dev server on :3000
npm run build
```

Full stack via Docker:
```
docker-compose up -d              # frontend :80, backend :8000
```

Lint/format the backend (Ruff, config in `backend/ruff.toml`):
```
cd backend && poetry run ruff check .
cd backend && poetry run ruff format .
```

## Config & env vars

**All configuration is environment-based — there is no `config.json`** (it was removed; `backend/config.py` warns if a stale one is found). A real `.env` with live credentials exists in the working tree; never echo, log, or commit its contents.

- `ARTIFACTORY_URL` — Artifactory host, no trailing path (e.g. `https://your-artifactory.com`).
- `CONAN_REMOTES` — comma-separated Conan repo names on that host. Each URL is derived as `${ARTIFACTORY_URL}/artifactory/api/conan/<name>`; the **first** name is the default remote.
- `CONAN_LOGIN_USERNAME` / `CONAN_PASSWORD` — remote credentials. These are Conan's own variable names, with per-remote overrides (`CONAN_LOGIN_USERNAME_<REMOTE>`, name upper-cased and `-`→`_`) taking precedence. `backend/credentials.py` mirrors Conan 2.17's `RemoteCredentials._get_env`; keep them in sync if Conan is upgraded.
- `BACKEND_PORT` (default 8000), `CORS_ORIGINS` (comma-separated, default `http://localhost:3000`), `CONAN_HOME` (optional).
- Frontend build-time: `REACT_APP_API_URL` (Dockerfile forces `/api` for the nginx proxy).

## Gotchas

- No linter/formatter is configured beyond CRA's built-in ESLint (`react-app`) — follow existing style, don't introduce new tooling unprompted.
- `docker/start.sh` must keep LF line endings (the Dockerfile strips `\r`); watch this when editing on Windows.
- README links to `REPOSITORIES.md` / `MIGRATION.md`, which don't exist.

## Git workflow

Small changes may be committed directly to `main`. Only commit or push when the user asks.
