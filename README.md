# Resortable

Modern TypeScript rewrite of Sortable.js — reorderable drag-and-drop lists.

[![npm version](https://img.shields.io/npm/v/resortable?logo=npm&color=cb3837)](https://www.npmjs.com/package/resortable)
[![npm downloads](https://img.shields.io/npm/dm/resortable?logo=npm&color=cb3837)](https://www.npmjs.com/package/resortable)
[![CI](https://img.shields.io/github/actions/workflow/status/jjeff/resortable/ci.yml?branch=main&logo=github&label=CI)](https://github.com/jjeff/resortable/actions/workflows/ci.yml)
[![gzip size](https://img.shields.io/bundlephobia/minzip/resortable?label=gzip)](https://bundlephobia.com/package/resortable)
[![TypeScript](https://img.shields.io/npm/types/resortable?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/npm/l/resortable?color=blue)](./LICENSE)

> **Migrating from Sortable.js?** See the [migration guide](./docs/migration-from-sortable-v1.md) for the option/plugin/breaking-change delta.

**Contents:** [Features](#features) · [Install](#installation) · [Quick start](#quick-start) · [Options](#options) · [Methods](#methods) · [Static API](#static-api) · [Plugins](#plugins) · [Examples](#examples) · [Development](#development) · [Architecture](#architecture)

## Documentation

Full docs hub: [**jjeff.github.io/resortable**](https://jjeff.github.io/resortable/) · folder index: [`docs/`](./docs/README.md)

| Guide | What's inside |
| --- | --- |
| [API Reference](https://jjeff.github.io/resortable/api/) | TypeDoc — every exported class, interface, option, and type |
| [Migration from Sortable v1](./docs/migration-from-sortable-v1.md) | Option renames, plugin changes, and breaking-change delta |
| [Plugin Development](./docs/plugin-development.md) | Plugin lifecycle, hook reference, and authoring patterns |
| [Accessibility](./docs/accessibility.md) | Keyboard contract, ARIA attributes, and the WCAG 2.1 AA audit |

**Live:** [Examples](https://jjeff.github.io/resortable/demo/examples/) · [Showcase](https://jjeff.github.io/resortable/demo/) · [Playground](https://jjeff.github.io/resortable/demo/playground.html)
&nbsp;•&nbsp;
**Project:** [Architecture](./ARCHITECTURE.md) · [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md)

## Features

- **Drag & Drop** — HTML5 Drag API + Pointer Events for mouse, touch, and pen
- **Cross-Container** — Drag items between lists with shared groups
- **Clone Support** — `group.pull: 'clone'` to copy items instead of moving
- **Animations** — FLIP-based 60fps reorder animations
- **Accessibility** — Full keyboard navigation, ARIA attributes, screen reader support. WCAG 2.1 AA verified via an automated axe-core audit in CI; see [docs/accessibility.md](./docs/accessibility.md) for the keyboard contract and ARIA reference.
- **Multi-Drag** — Ctrl+Click / Shift+Click selection, drag multiple items together
- **Controlled mode** — `controlled: true` reports the drop as intent (`newIndex`/`newIndexes` + target zone) and never mutates your DOM, so React/Vue/state-owned lists stay the single source of truth
- **React hook** — `resortable/react` ships a `useSortable` hook (1.4 kB, built on controlled mode); Vue/Svelte wrappers are on the roadmap
- **Flexible drop targeting** — `emptyInsertThreshold` and `hitArea` let a list accept drops thrown at the empty space or surrounding region around it, not just its own box
- **Plugin System** — AutoScroll, Swap plugins (extensible architecture)
- **TypeScript** — Strict types with full IntelliSense support, zero runtime dependencies
- **Small** — ~20 kB gzipped (19.8 kB ESM)
- **Cross-browser tested** — 299 unit tests (Vitest) + 182 end-to-end tests (Playwright) exercised across Chromium, Firefox, WebKit, and mobile emulation (iOS Safari + Android Chrome), run on Linux, Windows, and macOS in CI

## Installation

### npm (recommended)

```bash
npm install resortable
```

### CDN (UMD)

The UMD bundle exposes a `window.Sortable` global and works without a bundler. Version-pin to avoid surprise breaking changes:

```html
<!-- unpkg — @2 tracks the latest 2.x (major-pinned, no surprise breaking changes) -->
<script src="https://unpkg.com/resortable@2/dist/sortable.umd.js"></script>

<!-- or jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/resortable@2/dist/sortable.umd.js"></script>

<script>
  // The UMD build attaches the library as `window.Sortable`
  new Sortable(document.getElementById('my-list'), {
    animation: 150,
  });
</script>
```

The ESM build via `npm install resortable` is the recommended path for app code — it tree-shakes, ships TypeScript types, and integrates with modern bundlers.

## Quick Start

```typescript
import { Sortable } from 'resortable';

const sortable = new Sortable(document.getElementById('my-list'), {
  animation: 150,
  ghostClass: 'sortable-ghost',
  onEnd: (evt) => {
    console.log(`Moved from ${evt.oldIndex} to ${evt.newIndex}`);
  }
});
```

## Options

```typescript
new Sortable(element, {
  // Behavior
  group: 'shared',                    // Group name or { name, pull, put } config
  sort: true,                         // Allow sorting within list
  disabled: false,                    // Disable the sortable
  draggable: '.sortable-item',       // CSS selector for draggable items
  handle: '.drag-handle',            // Restrict drag to handle elements
  filter: 'input, button',           // Prevent drag on these elements
  ignore: 'a, img',                  // Descendants that should NOT initiate drag (default 'a, img')
  delay: 0,                          // Delay in ms before drag starts
  delayOnTouchOnly: 0,              // Touch-specific delay
  touchStartThreshold: 5,            // Pixels of movement before cancelling delay
  direction: 'vertical',             // 'vertical' | 'horizontal' list axis
  swapThreshold: 1,                  // Overlap fraction before an item swaps

  // Drop targeting
  emptyInsertThreshold: 5,           // Px around an empty list that still counts as a drop
  hitArea: '.row',                   // Selector for a surrounding region whose drops this
                                     // list also claims, inserting at the nearest end

  // Visual
  animation: 150,                    // Animation duration in ms
  easing: 'cubic-bezier(0.4,0,0.2,1)', // CSS easing
  ghostClass: 'sortable-ghost',      // Class on the ghost placeholder
  chosenClass: 'sortable-chosen',    // Class on the chosen item
  dragClass: 'sortable-drag',        // Class on the dragging item

  // Multi-drag
  multiDrag: false,                  // Enable multi-selection
  selectedClass: 'sortable-selected', // Class on selected items

  // State ownership
  controlled: false,                 // Report intent via events, never mutate the DOM

  // Accessibility
  enableAccessibility: true,         // Keyboard nav + ARIA

  // Events
  onStart: (evt) => {},
  onEnd: (evt) => {},
  onAdd: (evt) => {},
  onRemove: (evt) => {},
  onUpdate: (evt) => {},
  onSort: (evt) => {},
  onChoose: (evt) => {},
  onUnchoose: (evt) => {},
  onClone: (evt) => {},
  onChange: (evt) => {},
  onMove: (evt, originalEvent) => {},
  onSelect: (evt) => {},
  onFilter: (evt) => {},
});
```

## Shared Groups / Clone

```typescript
// Source list — items are cloned when dragged out
new Sortable(sourceList, {
  group: { name: 'shared', pull: 'clone', put: false },
});

// Target list — accepts items from 'shared' group
new Sortable(targetList, {
  group: { name: 'shared', pull: true, put: true },
});
```

## Methods

```typescript
sortable.toArray()              // Get order as array of data-id values
sortable.sort(['c','a','b'])    // Set order by data-id values
sortable.option('animation')    // Get option value
sortable.option('animation', 300) // Set option value
sortable.destroy()              // Remove instance and clean up
```

## Static API

```typescript
Sortable.active    // Currently active Sortable instance
Sortable.dragged   // Currently dragged element
Sortable.ghost     // Ghost placeholder element
Sortable.clone     // Cloned element from the most recent clone operation
Sortable.get(el)   // Get Sortable instance by element
Sortable.closest(el, selector) // Find closest Sortable ancestor

// DOM helpers — Sortable.utils.* (note: distinct from the static surface above)
Sortable.utils.on(el, event, handler)        // addEventListener; returns an unsubscribe fn
Sortable.utils.off(el, event, handler)       // removeEventListener (symmetric to on)
Sortable.utils.index(el)                     // Element's index within its parent
Sortable.utils.insertAt(parent, el, index)   // Insert el at a specific index in parent
Sortable.utils.closest(el, selector, ctx?)   // Nearest ancestor matching selector, bounded by ctx
Sortable.utils.toggleClass(el, name, force?) // classList.toggle wrapper
Sortable.utils.clone(el)                     // Deep-clone an element (cloneNode(true))
```

## Plugins

```typescript
import { Sortable, PluginSystem } from 'resortable';
import { registerAllPlugins } from 'resortable/plugins';

// Register all built-in plugins
registerAllPlugins();

const sortable = new Sortable(element, { animation: 150 });
sortable.usePlugin('AutoScroll');
sortable.usePlugin('Swap');
```

**Built-in plugins:** `AutoScroll`, `MarqueeSelect`, `OnSpill`, `Swap`.

> **Note:** Multi-drag is built into the core — no plugin needed. Set `multiDrag: true` in options. (The `MultiDragPlugin` v1-compat shim was removed in #34; see the [migration guide](./docs/migration-from-sortable-v1.md#multidrag-is-built-into-the-core--do-not-mount-the-plugin).)

### Authoring custom plugins

See the [Plugin Development Guide](./docs/plugin-development.md) for the plugin lifecycle, hook reference, and authoring patterns.

## API Reference

Full TypeDoc-generated API reference: [jjeff.github.io/resortable/api/](https://jjeff.github.io/resortable/api/).

## Framework wrappers

**React** ships today as a first-class hook: `import { useSortable } from 'resortable/react'`. It is built on [controlled mode](#options), so your component state stays the source of truth — the hook reports reorders as intent and never mutates React-owned DOM:

```tsx
import { useSortable } from 'resortable/react';

function List({ items, setItems }) {
  const { ref } = useSortable<HTMLUListElement>({
    animation: 150,
    onSort: (intent) => setItems(reorder(items, intent)),
  });
  return (
    <ul ref={ref}>
      {items.map((i) => <li key={i.id} data-id={i.id}>{i.label}</li>)}
    </ul>
  );
}
```

Vue and Svelte wrappers are on the roadmap. Any other framework works today via the imperative `new Sortable(element, options)` API on a ref/`useEffect`-mounted element. See [#44](https://github.com/jjeff/resortable/issues/44) for the v2.0 master roadmap, where the remaining framework-wrapper packages are tracked.

## Examples

The repo ships with a curated set of nine standalone examples covering the v2 API surface — basic list, shared lists, kanban board, clone mode, swap, multi-drag, handle + filter, accessibility, and a custom plugin.

**Live examples:** <https://jjeff.github.io/resortable/demo/examples/>

To run them against the source locally, see [`./examples/index.html`](./examples/index.html) (clone the repo and `npm run dev`, then open `http://localhost:5173/examples/index.html`).

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Build library (ESM, CJS, UMD)
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run E2E tests (Playwright)
npm run type-check   # TypeScript strict check
npm run lint         # ESLint
```

Setup, conventions, and the PR checklist live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module documentation.

| Module | Purpose |
|--------|---------|
| `core/DragManager` | Drag interaction handling (HTML5 + Pointer Events) |
| `core/DropZone` | Container management and DOM operations |
| `core/EventSystem` | Type-safe event emitter |
| `core/GlobalDragState` | Cross-zone drag coordination |
| `core/GroupManager` | Group config and clone detection |
| `core/GhostManager` | Ghost/placeholder elements |
| `core/KeyboardManager` | Keyboard navigation |
| `core/SelectionManager` | Multi-item selection |
| `core/PluginSystem` | Plugin lifecycle management |
| `animation/AnimationManager` | FLIP-based animations |

## License

[MIT](./LICENSE) © 2025-2026 Jeff Robbins

## Acknowledgments

Resortable is a TypeScript rewrite of [SortableJS](https://github.com/SortableJS/Sortable) by Lebedev Konstantin and the SortableJS contributors. The original library pioneered the drag-and-drop patterns this project builds on, and the legacy source under `legacy-sortable/` is consulted for v1 parity. See [NOTICE](./NOTICE) for full attribution.
