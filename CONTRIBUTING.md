# Contributing to Conan UI

Thanks for your interest in improving Conan UI! Contributions of all kinds are
welcome — bug reports, feature requests, documentation, and code.

## Getting set up

Conan UI is a Python FastAPI backend plus a React/TypeScript frontend in a
single repository. A `.env` with your Artifactory host, repositories, and
credentials is required to run the backend — copy `.env.example` to `.env` and
fill it in (it is gitignored — never commit it).

**Backend** (dependencies managed with [Poetry](https://python-poetry.org/)):

```bash
cd backend
poetry install
poetry run python main.py        # serves on http://localhost:8000
```

**Frontend** (Create React App):

```bash
cd frontend
npm install
npm start                        # dev server on http://localhost:3000
```

**Full stack** via Docker:

```bash
docker-compose up -d             # frontend :3000, backend :8000
```

## Tests, linting, and formatting

Run these before opening a pull request:

```bash
# Backend (from backend/)
poetry run pytest
poetry run ruff check .
poetry run ruff format .

# Frontend (from frontend/)
npm test
npm run build                    # must compile cleanly (CI treats warnings as errors)
```

## Coding style

- Match the style of the surrounding code; don't introduce new tooling unprompted.
- Keep changes focused — one logical change per pull request.
- The backend talks to Conan through its Python API directly (no shelling out).

## Submitting changes

1. Fork the repository and create a topic branch off `main`.
2. Make your change, with clear and descriptive commit messages.
3. Ensure tests, linting, and the frontend build all pass.
4. Open a pull request describing **what** changed and **why**, and how you
   verified it. Link any related issues.

## Reporting bugs and requesting features

Please use the issue templates. For bug reports, include steps to reproduce,
what you expected, what happened, and your environment. For security issues, do
**not** open a public issue — see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions will be licensed under the
project's [GPL-3.0 license](LICENSE).
