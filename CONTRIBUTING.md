# Contributing to Resortable

Thanks for your interest. This document covers the setup and conventions
needed to land a change.

## Quick start

```bash
git clone https://github.com/jjeff/resortable
cd resortable
npm install
npm run dev     # starts Vite dev server at http://localhost:5173/
```

The dev playground lives at the root (`index.html`); curated examples are
under `examples/`. Both import directly from `src/` via Vite's TypeScript
resolver — no build step needed during development.

## Tests

| Command | What it runs |
|---|---|
| `npm run test:unit` | Vitest unit tests |
| `npm run test:e2e` | Playwright across all configured browsers |
| `CI=1 npx playwright test --project=chromium` | Chromium-only e2e (faster local loop) |

Browsers must be installed once per machine:

```bash
npx playwright install
```

## Pre-commit gate

**Always run `npm run check` before committing.** It runs the exact same
lint + type-check commands CI uses. This is non-negotiable:

```bash
npm run check
```

In a fresh worktree, run `npm ci` once first — `npm` walks up the directory
tree to find `node_modules`, which can cause a worktree to lint against
stale parent dependencies and falsely pass while CI fails on the same code.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/)
because `semantic-release` derives version bumps from them:

| Prefix | Meaning | Version impact |
|---|---|---|
| `feat:` | new user-facing feature | minor |
| `fix:` | user-facing bug fix | patch |
| `perf:` | performance improvement | patch |
| `refactor:` | code refactoring | patch |
| `docs:` | documentation only | none |
| `test:` | test additions/changes | none |
| `chore:` | tooling, CI, config | none |
| `feat!:` / `BREAKING CHANGE:` | API-breaking change | major |

Use `BREAKING CHANGE:` in the commit footer when shipping a breaking API
change so the version bump is correct on the next release.

## Pull requests

1. Branch from `main`. Branch name format: `<type>-<short-slug>-<issue>` (e.g.,
   `feat-ignore-option-30`, `test-mobile-chrome-48`).
2. Land changes in small, focused PRs. Mega-PRs are hard to review.
3. CHANGELOG: add an entry under `## [Unreleased]` in the appropriate
   `### Features` / `### Bug Fixes` / `### Tests` / `### Documentation`
   section. Reference the issue number.
4. PR title MUST follow Conventional Commits (it becomes the squash-merge
   commit message → drives the next version bump).
5. CI must be green before merge. The full matrix runs on PR creation:
   - `lint-and-typecheck` — ESLint + TypeScript
   - `unit-tests` — Vitest
   - `e2e-tests-linux` — Playwright chromium baseline
   - `e2e-tests-hosted-windows` — full browser matrix (chromium, firefox,
     webkit, Mobile Chrome, Mobile Safari)
   - `build` — library bundle (Rollup output via Vite)
   - `bundle-size` — gzipped size budgets (50 / 30 / 30 kB ESM / CJS / UMD)
   - `cross-platform-test` — Node 18 + 20 install/build
   - `dependency-review` — high-severity vulnerabilities block PRs

## Repository layout

| Path | Purpose |
|---|---|
| `src/core/` | Drag pipeline, drop zones, event system, global state |
| `src/plugins/` | Optional plugins (AutoScroll, Swap, MarqueeSelect, OnSpill) |
| `src/animation/` | FLIP-based reorder animations |
| `src/types/` | Public TypeScript types (`SortableOptions`, `MoveEvent`, etc.) |
| `tests/unit/` | Vitest specs |
| `tests/e2e/` | Playwright specs |
| `examples/` | Live demo pages (deployed to gh-pages `/demo/`) |
| `docs/` | TypeDoc API ref (`api/`), migration guide, plugin guide, landing |
| `legacy-sortable/` | Original Sortable.js v1.x as a git submodule (reference only) |

## Architecture notes

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the module-by-module overview.

Two parallel input pipelines exist by design:

- **HTML5 drag** — the default; uses native `dragstart` / `dragover` / `drop`
- **Pointer events** — the fallback; activated by `forceFallback: true`,
  on touch devices automatically, and via the `fallbackTolerance` gate

Both share the same `DragManager` instance and converge on the same
`onMove` / `'move'` event contract. When fixing drag bugs, verify the fix
in BOTH pipelines (toggle `forceFallback: true` in a test fixture to exercise
the pointer path under chromium).

## Plugin development

See [`docs/plugin-development.md`](./docs/plugin-development.md) for the
plugin authoring guide. Custom plugins implement `SortablePlugin` and are
registered via `Sortable.mount(YourPlugin)`.

## Reporting bugs

Open an issue with:

- Minimal reproduction (a CodePen or short HTML snippet)
- Resortable version
- Browser and OS
- Expected vs actual behavior

Security issues: see [`SECURITY.md`](./SECURITY.md) — do **not** open public
issues.

## License

By contributing, you agree that your contributions will be licensed under
the [MIT License](./LICENSE).
