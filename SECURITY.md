# Security Policy

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through public GitHub issues.

Instead, report them privately using GitHub's
[private vulnerability reporting](https://github.com/roknus/conan-ui/security/advisories/new),
or by email to **roknus@gmail.com**.

Please include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- Affected version(s) or commit
- Any suggested mitigation

You can expect an initial response within a few days. We will keep you informed
as we work on a fix and coordinate disclosure.

## Scope

Conan UI reads remote/Artifactory credentials from environment variables
(`CONAN_LOGIN_USERNAME` / `CONAN_PASSWORD`, or their per-remote
`*_<REMOTE>` variants), typically supplied through a gitignored `.env` file.
Credentials are never written to disk by the application and never returned by
the API. If you find credentials or other secrets committed to this repository,
please report it via the process above.
