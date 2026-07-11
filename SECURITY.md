# Security Policy

## Supported Versions

Resortable follows semantic versioning. Only the latest published `2.x`
release on npm receives security fixes.

| Version | Supported |
| --- | --- |
| `2.0.x` (latest) | ✅ |
| `2.0.0-alpha.*` / `2.0.0-beta.*` (pre-release) | ❌ |
| `1.x` | n/a (never published — see [migration guide][mg]) |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report security issues privately using GitHub's
[private vulnerability reporting](https://github.com/jjeff/resortable/security/advisories/new)
feature. An advisory draft will be created and you'll be invited as a
collaborator.

For each report, please include:

- A description of the issue and its potential impact
- Reproduction steps (or a minimal failing snippet)
- The affected version(s) of Resortable
- Any suggested remediation, if you have one

### What to expect

- An acknowledgment within **72 hours** of report
- An assessment of the report within **7 days**, including whether it
  qualifies as a security issue and an estimated fix timeline
- For confirmed issues, a fix in the next patch release plus a published
  advisory crediting you (unless you prefer to remain anonymous)

## Scope

In scope:

- Vulnerabilities in `dist/` build outputs published to npm
- XSS / DOM-injection risks via library APIs
- Prototype pollution, code injection, or privilege escalation paths
- Supply-chain risks introduced by dependencies declared in `package.json`

Out of scope:

- Issues in the `legacy-sortable/` submodule (report those upstream at
  [SortableJS/Sortable](https://github.com/SortableJS/Sortable))
- Vulnerabilities in development dependencies that don't affect the
  published `dist/` bundle (those are still tracked via `npm audit` and
  the Dependabot configuration, but aren't security advisories)
- Drag-and-drop UX behaviors users find confusing — report those as
  regular issues

[mg]: ./docs/migration-from-sortable-v1.md
