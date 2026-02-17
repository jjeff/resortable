# Resortable

Modern TypeScript rewrite of Sortable.js — reorderable drag-and-drop lists.

> **Alpha — Not ready for production use.** This library is under active development and has not been published to npm. APIs will change. If you need a drag-and-drop library today, use [SortableJS](https://github.com/SortableJS/Sortable).

## Features

- **Drag & Drop** — HTML5 Drag API + Pointer Events for mouse, touch, and pen
- **Cross-Container** — Drag items between lists with shared groups
- **Clone Support** — `group.pull: 'clone'` to copy items instead of moving
- **Animations** — FLIP-based 60fps reorder animations
- **Accessibility** — Full keyboard navigation, ARIA attributes, screen reader support
- **Multi-Drag** — Ctrl+Click / Shift+Click selection, drag multiple items together
- **Plugin System** — AutoScroll, Swap plugins (extensible architecture)
- **TypeScript** — Strict types with full IntelliSense support
- **Small** — ~17KB gzipped (ESM)

## Installation

```bash
npm install resortable
```

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
  delay: 0,                          // Delay in ms before drag starts
  delayOnTouchOnly: 0,              // Touch-specific delay
  touchStartThreshold: 5,            // Pixels of movement before cancelling delay

  // Visual
  animation: 150,                    // Animation duration in ms
  easing: 'cubic-bezier(0.4,0,0.2,1)', // CSS easing
  ghostClass: 'sortable-ghost',      // Class on the ghost placeholder
  chosenClass: 'sortable-chosen',    // Class on the chosen item
  dragClass: 'sortable-drag',        // Class on the dragging item

  // Multi-drag
  multiDrag: false,                  // Enable multi-selection
  selectedClass: 'sortable-selected', // Class on selected items

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
Sortable.clone     // Cloned element (clone operations)
Sortable.get(el)   // Get Sortable instance by element
Sortable.closest(el, selector) // Find closest Sortable ancestor
Sortable.utils.on(el, event, handler) // addEventListener with unsubscribe
Sortable.utils.index(el)              // Get element index in parent
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

**Built-in plugins:** AutoScroll, Swap

> **Note:** Multi-drag is built into the core — no plugin needed. Set `multiDrag: true` in options.

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

MIT
