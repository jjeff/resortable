# Accessibility

<sub>[← Home](../README.md) · [Docs hub](./README.md) · Related: [Migration](./migration-from-sortable-v1.md) · [Plugin Development](./plugin-development.md) · [API Reference](https://jjeff.github.io/resortable/api/)</sub>

Resortable is designed to be usable by keyboard-only users and screen-reader
users out of the box. This document is the canonical reference for the
keyboard contract, the ARIA attributes the library emits, and the screen-reader
announcements you can expect.

The dev playground and every page in the curated examples site pass an
automated axe-core WCAG 2.1 A + AA audit on every PR (see
[`tests/e2e/accessibility-audit.spec.ts`](../tests/e2e/accessibility-audit.spec.ts)).
The audit is a hard gate in CI.

> **TL;DR** — `enableAccessibility: true` is the default in Resortable v2.
> You do not need to do anything special; keyboard navigation, ARIA
> attributes, and a single shared `aria-live` announcer are wired
> automatically.

## Live demo

[`examples/accessibility.html`](../examples/accessibility.html) is the
showcase page. It is also the spec's "must pass with zero suppressions"
target. Try the keyboard contract there before reading the reference below.

## Keyboard contract

When `enableAccessibility` is on (the default), every sortable container
is reachable from the keyboard. The flow is:

| Key                        | Action                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tab` / `Shift+Tab`        | Move focus into / out of the sortable list. The container itself is focusable; the first item also becomes the tab stop once items have been rendered.      |
| `↑` / `↓`                  | Move keyboard focus between items. Wraps at the boundaries (last → first and first → last).                                                                |
| `Home`                     | Jump to the first item.                                                                                                                                     |
| `End`                      | Jump to the last item.                                                                                                                                      |
| `Space`                    | Toggle selection of the focused item. When `multiDrag: true`, builds up a multi-selection; otherwise selects the focused item (and clears any prior).      |
| `Ctrl+A` / `Cmd+A`         | Select all items in the list (only when `multiDrag: true`).                                                                                                |
| `Enter`                    | If nothing is grabbed: grab the currently selected item(s) (or the focused item if no selection). If something is grabbed: drop it at the current location. |
| While grabbed: `↑` / `↓`   | Move the grabbed item(s) up / down within the list.                                                                                                         |
| `Escape`                   | Cancel an in-progress grab and restore the original order.                                                                                                  |
| `Shift+↑` / `Shift+↓`      | Extend the selection range (tracked separately in [#36](https://github.com/Spaceage-TV/resortable/issues/36)).                                              |

The container itself receives `keydown` (in capture mode for descendants too),
so the listeners stay attached even when focus is on a specific item.

## ARIA attributes

The library writes the following ARIA attributes on initialization and
keeps them in sync as items are inserted, removed, selected, or grabbed:

### On the container

| Attribute             | Value                                                                | Why                                                                  |
| --------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `role`                | `listbox`                                                            | Allows `aria-selected` on item children and conveys "pick items".    |
| `aria-multiselectable`| `true`                                                               | Permits multi-item selection (the keyboard contract supports it).    |
| `aria-label`          | `Sortable list. Use arrow keys to navigate, space to select, ...`    | Default. Override by setting `aria-label` on the element yourself.   |
| `tabindex`            | `-1` (only if the element does not already have a `tabindex`)        | Makes the container programmatically focusable without polluting tab order. |

### On each item

| Attribute        | Value                                                       | Notes                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role`           | `option`                                                    | `option` is the required child role of `listbox`; it also allows `aria-selected`.                                                                                                  |
| `aria-setsize`   | total item count                                            | Updated when items are added or removed.                                                                                                                                           |
| `aria-posinset`  | 1-based index                                                | Updated on every reorder so the announced position matches the visual position.                                                                                                    |
| `aria-selected`  | `true` / `false`                                            | Mirrors `SelectionManager` state.                                                                                                                                                  |
| `aria-grabbed`   | `true` / `false`                                            | _Deprecated in WAI-ARIA 1.1._ Kept for backward compatibility; modernisation tracked as a follow-up. Consumer code should prefer reacting to the `onStart` / `onEnd` event hooks. |
| `tabindex`       | `0` for the focused item, `-1` for the rest                  | Implements the WAI-ARIA "roving tabindex" pattern so the list is a single tab stop.                                                                                                |

Items the library considers "non-draggable" (matching the `filter` option or
the `ignore` selector) do **not** receive `role="option"` and stay out of the
roving tabindex.

### Headings inside sortable containers

Because `role="listbox"` requires `role="option"` children, any **non-item
child** of the sortable container (typical example: a section heading) will
trip axe's `aria-required-children` rule. Keep headings _outside_ the
sortable element:

```html
<!-- Bad: <h3> is inside the listbox, axe will flag it -->
<div class="sortable-list" id="todo">
  <h3>To Do</h3>
  <div class="sortable-item">Write docs</div>
</div>

<!-- Good: heading lives outside the sortable container -->
<div>
  <h3>To Do</h3>
  <div class="sortable-list" id="todo">
    <div class="sortable-item">Write docs</div>
  </div>
</div>
```

This pattern is enforced in the dev playground and the curated examples
(kanban, shared-lists, etc.) so the WCAG 2.1 AA audit stays green.

## Screen-reader announcements

On first attach, the library appends a single shared `.sortable-announcer`
element to `<body>` with `role="status"`, `aria-live="assertive"`, and
`aria-atomic="true"`. The element is positioned off-screen via the
standard "visually hidden" idiom (1×1 px, `overflow: hidden`,
`position: absolute; left: -10000px`).

Subsequent Sortable instances reuse the same announcer; cleanup removes
it only when the last instance is destroyed.

Messages announced include:

- **Selection** — `Selected: <item text>` / `Deselected: <item text>` /
  `Selected all N items`
- **Grab** — `Grabbed N item(s). Use arrow keys to move, Enter to drop, Escape to cancel.`
- **Move while grabbed** — `Moved to position N`
- **Drop** — `Dropped at position N`
- **Cancel** — `Move cancelled`

The visible status panel on the showcase example (`examples/accessibility.html`)
mirrors these messages for sighted users — it is a UI convenience, not
part of the library's a11y surface.

## Reduced-motion and focus indicators

- The library writes a `focusClass` (default `sortable-focused`) on the
  currently focused item so consumers can paint a strong focus ring that
  is independent of the browser's `:focus-visible` heuristic.
  See [`examples/accessibility.html`](../examples/accessibility.html) for
  the recommended `outline: 3px solid var(--accent); outline-offset: 3px;`
  pattern.
- Animations honour the `animation` option's duration; consumers who
  want to respect `prefers-reduced-motion` should pass `animation: 0`
  when the media query matches.

## Following along with the audit

To run the audit locally:

```bash
npm run dev          # one terminal, dev server
CI=1 npx playwright test \
  --project=chromium \
  tests/e2e/accessibility-audit.spec.ts
```

The spec prints a JSON summary of any violations to stdout (rule id,
impact, affected node count, first three CSS targets) so triage doesn't
require digging through the playwright HTML report.

## Known follow-ups

- `aria-grabbed` is deprecated in WAI-ARIA 1.1. We currently emit it for
  backward compatibility with consumer CSS and tests; a follow-up issue
  tracks migrating to a modern pattern (custom `data-grabbed` attribute
  + `aria-activedescendant` semantics).
- Nested sortable lists (a sortable item that itself contains another
  sortable) intentionally produce "nested interactive" elements. The
  dev playground's File Explorer demo suppresses this rule in the axe
  spec with a documented reason; a follow-up issue tracks an APG-aligned
  pattern for nested DnD.
- Shift+Arrow range selection is tracked in [#36](https://github.com/Spaceage-TV/resortable/issues/36).
