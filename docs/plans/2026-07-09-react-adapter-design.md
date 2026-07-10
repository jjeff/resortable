# React Adapter Design (`resortable/react`)

**Date:** 2026-07-09
**Status:** Draft
**Depends on:** [Controlled Mode](./2026-07-09-controlled-mode-design.md) (#44)

## Problem

Controlled mode makes Resortable safe under a declarative renderer, but raw usage from React is still all boilerplate: `useEffect` create/destroy (broken twice by StrictMode double-effects), translating `end`/`add`/`remove` into a state update, keeping option changes from remounting the instance, and restoring keyboard focus after the commit re-render. Every consumer would re-write the same ~100 fragile lines. Ship one adapter that owns them.

## Approach: `useSortable` hook, subpath export

A single hook is the whole v1 API. It creates a `Sortable` with `controlled: true` forced, translates the drag outcome into one **intent** object, and hands it to the consumer, who commits it by updating state. The adapter never touches consumer DOM (that invariant is the core's; the adapter just doesn't break it).

```tsx
import { useSortable } from 'resortable/react'

function TrackList({ tracks, onReorder }: Props) {
  const { ref } = useSortable({
    group: 'playlist',
    multiDrag: true,
    animation: 150,
    onSort: (intent) => onReorder(applyIntent(tracks, intent)),
  })
  return (
    <ul ref={ref}>
      {tracks.map((t) => (
        <li key={t.id} data-id={t.id} className="sortable-item">{t.title}</li>
      ))}
    </ul>
  )
}
```

### Hook signature

```ts
function useSortable<T extends HTMLElement = HTMLElement>(
  options: UseSortableOptions
): {
  ref: React.RefCallback<T>          // attach to the list container
  sortable: React.RefObject<Sortable | null>  // escape hatch to the raw instance
  getSelectedIds(): string[]
  setSelectedIds(ids: string[]): void
}

type UseSortableOptions = Omit<
  SortableOptions,
  'controlled' | 'onSort' | 'onEnd' | 'store'
> & {
  onSort: (intent: SortIntent) => void
  onSelectionChange?: (ids: string[]) => void
  id?: string   // names this zone in cross-list intents (fromId/toId)
}
```

- Hook **returns** the ref (callback ref) rather than taking one: the callback ref tells us exactly when the element attaches/detaches, which handles conditional rendering and avoids "ref not yet assigned" effect races.
- Naming collision: core `SortableOptions.onSort` takes a `SortableEvent`; the adapter option shadows it with the intent signature and is stripped before options reach `new Sortable()`. `onEnd`/`store` are stripped too — the adapter owns the end event, and order persistence is consumer state in controlled mode.
- All remaining `SortableOptions` pass through untouched (group, handle, filter, delay, multiDrag, direction, dataIdAttr, …).

### Intent object

```ts
interface SortIntent {
  dataIds: string[]      // per event.items[], read from dataIdAttr at emit time
  from: HTMLElement
  to: HTMLElement
  fromId?: string        // hook `id` when the zone is adapter-managed
  toId?: string
  oldIndexes: number[]   // from event.oldIndexes (fallback [event.oldIndex])
  newIndexes: number[]   // from event.newIndexes (fallback [event.newIndex])
  pullMode?: boolean | 'clone' | 'move'
}
```

Assembled **entirely from the source list's `end` event**. Controlled mode guarantees `end` fires exactly once per drag, after DOM restore, carrying `to`, `oldIndexes`/`newIndexes` (from `pending`), and `pullMode`. `dataIds` are read off `event.items` via the effective `dataIdAttr` (default `data-id`); an item without the attribute is a consumer bug — dev-mode `console.error`, index used as fallback.

- **No-op drop** (`from === to` and `oldIndexes` deep-equals `newIndexes`, or Escape/revert): no `onSort`.
- **Clone** (`pullMode: 'clone'`): consumer inserts copies into the target state; `dataIds` are the *source* ids — the consumer mints new ids for the copies. Documented, not adapter magic.

### Cross-container dedupe

For a cross-list drag, core fires `remove` on the source instance, `add` on the target, `end` on the source. Two hook instances therefore each see events — but the adapter fires **one `onSort` total, on the source hook**, built from `end`. No group-keyed event dedupe is needed because `end` is already unique per drag; deriving intent from `add`+`remove` pairs and de-duplicating them would rebuild information `end` already carries.

A module-level registry still exists — `const zones = new WeakMap<HTMLElement, ZoneRecord>()` (element → `{ id, optionsRef }`), the adapter's analog of core's `GlobalDragState` singleton: every mounted hook registers its container on attach, unregisters on detach. Its jobs:

1. Resolve `event.to` → `toId` so cross-list intents name the receiving zone without the consumer comparing DOM nodes.
2. Detect "target is not adapter-managed" (plain `Sortable` on the other side) — intent still fires, `toId` undefined.

Consumers with **split state** (source and target lists in unrelated components with no shared parent) don't get a target-side `onSort`; they use the pass-through `onAdd`/`onRemove` options, whose raw events already carry `oldIndexes`/`newIndexes` per the controlled-mode design. Shared-state consumers (the normal React case — a common ancestor owns both arrays) handle everything in one `onSort`.

### Mount / destroy / StrictMode

- Callback ref stores the element in `useState`; a `useEffect([element])` does `new Sortable(element, mapped)` / `sortable.destroy()`.
- StrictMode's double effect produces create → destroy → create. `destroy()` is already clean (detach + `WeakMap` delete), so this Just Works; a test locks it (exactly one live instance, no duplicate listeners after double-mount).
- React 18 and 19 both supported; no use of 19-only ref-cleanup semantics.

### Option updates without remount

- Every callback (`onSort`, `onSelectionChange`, pass-throughs, `onMove`) lives in a ref the adapter reads at call time — changing a callback identity never touches the `Sortable`.
- A second effect shallow-diffs the remaining option values against the previous render and applies changes via `sortable.option(key, value)`. No remount. (`option()` internally rebuilds `DragManager` for group/handle/etc. — that's core's cost, invisible here.)
- **Mid-drag guard:** if a diff lands while `Sortable.active` is set, queue it and flush on the next `end`/`unchoose` — `option()`'s DragManager teardown mid-drag would kill the drag.

### Items changing mid-drag

The adapter takes no `items` prop — the consumer renders children. Controlled mode tolerates an external re-render around the placeholder. Contract, documented: intent **indexes are a snapshot** of drag-start/drop-time positions; if the consumer's array may mutate mid-drag (live data), apply the intent by `dataIds` (splice by id lookup), not by index. Keys must stay stable during a drag; keyed reorder is fine.

### Focus restoration (keyboard a11y)

At `end`, if `document.activeElement` is one of `event.items` (true after a keyboard grab-drop, since core moves focus with the grab), record the anchor's data-id. After calling `onSort`, one `requestAnimationFrame` later (consumer commit has rendered), query `to` for `[<dataIdAttr>="<anchor>"]` and `.focus()` it. rAF avoids coupling to the consumer's render cycle; if the element isn't found (consumer rejected the intent), do nothing.

### Multi-drag selection

`SelectionManager` (exposed as `dragManager.selectionManager`) provides `select(el, additive)`, `deselect`, `clearSelection`, `getSelected()`, and emits `select` events with element arrays. That's enough for:

- **v1: internal selection** — core owns the `Set<HTMLElement>`; adapter maps elements ⇄ data-ids at the boundary. `onSelectionChange(ids)` mirrors the `select` event out; `getSelectedIds()`/`setSelectedIds(ids)` (id → `querySelector([data-id=…])` → `select`) are the escape hatch for programmatic control.
- **Deferred: controlled `selectedIds` prop.** True controlled selection needs SelectionManager to reconcile an external id list without emitting feedback loops, and to survive commit re-renders where React recreates nodes (element-identity Sets go stale). Add when a real consumer needs it.
- **Core pre-req:** `SelectionManager` hardcodes `'.sortable-item'` in `isValidItem`/`getSortableItems` instead of honoring the `draggable` option. Fix in core alongside this work; otherwise adapter users must use that class.

### `<Sortable>` component wrapper

**Not shipping one.** The hook attaches to any element the consumer already renders; a wrapper component must choose a tag, forward refs, and either clone children or take a render prop — three API decisions for zero capability. A consumer who wants a component writes it in five lines over the hook. Revisit only on demonstrated demand.

### SSR safety

No module-scope `window`/`document` access in the adapter, and instantiation only happens inside effects/ref callbacks, which never run on the server. Core is already side-effect-clean at import (touch detection etc. runs in `attach()`, not import). Lock both with a node-environment (non-jsdom) vitest that imports `resortable/react` and asserts no throw.

## Packaging: subpath export, not a workspace package

The repo is a single package with one semantic-release pipeline and no workspace tooling; the Vite lib build already emits multiple formats from one entry. A workspace/monorepo adds versioning, release, and CI surface for one small file. **Recommendation: subpath export.**

- New source: `src/react/index.ts` (the only new runtime file). It imports core via the self-referencing specifier `import { Sortable } from 'resortable'` — Node resolves a package's own name through its exports map, and the build marks it external. This guarantees the adapter shares the consumer's core module instance (bundling core into the react build would duplicate `GlobalDragState`/`PluginSystem` singletons — the one packaging failure mode that must not happen).
- Second build config (`vite.config.react.ts`, `npm run build` chains it): entry `src/react/index.ts`, formats `es` + `cjs` (no UMD — script-tag users aren't writing React hooks), externals `react`, `resortable`; d.ts to `dist/react/`.
- `package.json`:

```json
"exports": {
  ".": { "…": "unchanged" },
  "./react": {
    "types": "./dist/react/index.d.ts",
    "import": "./dist/react/index.esm.js",
    "require": "./dist/react/index.cjs.js"
  }
},
"peerDependencies": { "react": ">=18" },
"peerDependenciesMeta": { "react": { "optional": true } }
```

  `optional: true` keeps core-only installs warning-free. **No `react-dom` anywhere in the runtime graph** — the hook uses only `react` APIs; `react-dom` + `@testing-library/react` are devDependencies for tests.
- Add a `size-limit` entry for `dist/react/index.esm.js` (budget: 5 kB gzip — it's glue).
- This also establishes the subpath pattern the docs already promise for `resortable/plugins`.

## Touch points

| File | Change |
|------|--------|
| `src/react/index.ts` | new — hook, intent assembly, zone registry, focus restore, selection bridge |
| `package.json` | `./react` export, react peer dep (optional), test/build deps, size-limit entry |
| `vite.config.react.ts` | new — es/cjs build for the adapter, externals `react` + `resortable` |
| `vitest.config.ts` | include `tests/unit/react/**`; React tests use jsdom (already default) |
| `src/core/SelectionManager.ts` | pre-req: honor `draggable` option instead of hardcoded `.sortable-item` |
| `examples/` + `vite.config.examples.ts` | React demo app (doubles as the Playwright fixture) |

## Testing strategy

- **Unit (vitest + jsdom + React Testing Library):**
  - StrictMode double-mount: render under `<StrictMode>`, assert one live instance and that a drag still emits exactly one `onSort`.
  - Intent assembly: emit synthetic `end` events on the instance's `eventSystem` (same-list, cross-list, multi-drag, clone, no-op/cancel) and assert intent shape, single delivery, `fromId`/`toId` resolution.
  - Option updates: change props, spy on `destroy` (never called) and `option()` (called per changed key); mid-drag diff deferred until `end`.
  - Focus restore: keyboard-shaped end event → commit re-render with new nodes → active element is `[data-id=anchor]`.
  - Selection bridge: `select` event → `onSelectionChange` ids; `setSelectedIds` round-trip.
  - SSR: node-environment test imports the adapter without a DOM.
- **E2E (Playwright):** real React app fixture in `examples/` (built via `vite.config.examples.ts`, served by the existing Playwright web server). Specs: pointer same-list reorder commits correct order with no duplicate/orphan nodes; cross-list drag between two hooks updates both lists from one `onSort`; keyboard grab-move-drop restores focus; StrictMode build of the same fixture passes the same specs.
- **A11y:** run the existing axe gate against the React fixture.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Packaging | subpath `resortable/react` | one package/release pipeline already; workspace is overhead for one file |
| Core linkage | self-referencing `import 'resortable'`, externalized | guarantees single core instance; bundling core would fork GlobalDragState |
| Hook ref | hook returns callback ref | knows attach/detach timing; survives conditional render; no effect races |
| Intent source | source list's `end` event only | fires exactly once with full intent; add/remove dedupe would rebuild it |
| `onSort` delivery | once, on the source hook | shared-state consumers hoist the handler; split state uses onAdd/onRemove pass-through |
| Registry | module-level `WeakMap<element, zone>` | resolves `toId` across hook instances; WeakMap = no unmount leaks; mirrors GlobalDragState singleton scope |
| Option changes | ref'd callbacks + `option()` diff, queued during drag | no remount; mid-drag DragManager rebuild would kill the drag |
| Selection | internal v1 + id-based helpers | SelectionManager suffices today; controlled `selectedIds` waits for a real consumer |
| Component wrapper | none | hook covers it; wrapper adds API decisions, zero capability |
| Peer deps | `react >=18` optional; no react-dom | hook uses only `react`; optional keeps core-only installs clean |
| React 19 features | none required | works on 18/19 with plain effects; no ref-cleanup dependency |
