# Controlled Mode Design (framework-friendly DnD)

**Date:** 2026-07-09
**Status:** Draft
**Blocks:** #44 (framework wrappers — React first)

## Problem

Resortable's drag pipeline mutates the consumer's DOM directly:

- Same-zone pointer drag relocates the real item live (`DragManager.onPointerMove` → `DropZone.move`/`moveMultiple`).
- Cross-zone drag inserts the real items (or clones) into the target zone mid-drag (`DragManager.ts` pointer path ~1247, HTML5 path ~608).
- Keyboard grab-move relocates items per arrow press.
- Final `end`/`add`/`remove` indices are derived from the resulting DOM.

Declarative frameworks (React, Vue, Svelte) own that DOM. After a drop, the consumer updates state and the framework re-renders — but the library already moved the nodes, so reconciliation sees a DOM that doesn't match its virtual tree. Every SortableJS wrapper (react-sortablejs et al.) works around this by undoing the library's DOM changes before applying state, which is fragile (StrictMode breakage, key churn, duplicate nodes). We should not ship a React adapter on top of that hack.

## Approach: `controlled: true` option

One new boolean option. Default `false` — existing behavior untouched.

**Invariant:** in controlled mode the library NEVER changes the structural position of consumer-owned nodes. Between `start` and `end` it may only:

1. add/remove its own overlay artifacts (ghost — already `position: fixed` outside flow),
2. insert/move **one placeholder element** it owns,
3. toggle CSS classes / inline styles on dragged items (hide/show).

At the moment `end` (and `add`/`remove`/`update`) fire, the consumer's DOM structure is **identical to pre-drag**. The events carry the full intent; the consumer commits it by updating state and re-rendering. Cancel (`Escape`, revert, spill) is trivial: remove placeholder, unhide items — nothing to restore.

### Why placeholder, not transform-displacement

dnd-kit/react-beautiful-dnd visualize the gap by transforming siblings. That avoids even the placeholder insertion, but requires a parallel layout engine (measure all siblings, compute offsets, handle grids/wrapping). The placeholder gets identical UX from natural reflow, works in flex/grid/wrapped layouts for free, and reuses `GhostManager.createPlaceholder` + the HTML5 pipeline's existing placeholder logic. A foreign node inside a framework-owned container is safe as long as it's removed before the commit re-render — which the invariant guarantees. (Known edge: an *external* re-render mid-drag may reflow around the placeholder; acceptable v1, transform mode can be a future opt-in if it bites.)

## Mechanism

### Drag state addition

Track pending intent in `ActiveDrag` (GlobalDragState) instead of deriving from DOM:

```ts
pending?: {
  zone: HTMLElement      // current placeholder container
  index: number          // insertion index among draggables (see Index semantics)
}
```

### Pointer pipeline (`DragManager`)

- `commitPointerDrag`: after ghost creation, insert placeholder at the anchor item's position and hide all dragged items (`sortable-controlled-hidden` → `display: none`). Placeholder sized from the anchor (multi-drag: single placeholder; stacked ghost already conveys count).
- `onPointerMove` same-zone branch: replace `targetZone.move/moveMultiple(...)` with a placeholder move to the computed index (FLIP-animate affected siblings via the existing `AnimationManager.animateReorder`). Update `pending`.
- `onPointerMove` cross-zone branch: move the placeholder into the target zone instead of inserting real items. `onMove` dispatch, group checks, `setPutTarget` unchanged. Update `pending`.
- `cleanupPointerDrag`: remove placeholder, unhide items, restore classes — **then** let `globalDragState.endDrag` emit events from `pending` (not from DOM). Revert path becomes: same cleanup, no `pending` commit.

### HTML5 pipeline

Already placeholder-driven during `dragover`. Changes: skip the real `zone.move()` in `onDrop`; record `pending` as the placeholder moves; suppress mid-drag `update`/`sort`/`change` DOM assumptions (see Events).

### Keyboard pipeline (`KeyboardManager`)

Grab: hide grabbed items, insert placeholder (same as pointer commit). Arrow move: move placeholder, update `pending`, announce target position from `pending.index`. Enter: cleanup then emit intent. Escape: cleanup, no events beyond `unchoose`/`end` with `newIndex === oldIndex`.

Focus survives the consumer re-render via `dataIdAttr`: the adapter re-focuses `[data-id="<anchor>"]` after commit (adapter concern, but the contract is that identity lives in `dataIdAttr`, not node identity).

### Clone mode

Controlled mode never creates clone DOM nodes. `pullMode: 'clone'` is reported in the events; the consumer's state update inserts the copy (that's what "clone" means in data anyway). `GlobalDragState.setPutTarget` skips clone creation when controlled.

### Events

- All existing events keep firing with the same names/timing, but indices come from `pending`, and multi-item events gain arrays:

```ts
oldIndexes?: number[]   // per items[], indices in `from` at drag start
newIndexes?: number[]   // per items[], indices in `to` after commit (contiguous block)
```

  (Deliberately `-Indexes`, not legacy MultiDrag's misspelled `oldIndicies` — migration doc gets a note.)
- Mid-drag `sort`/`update`/`change` still fire as the placeholder moves (useful for live UIs), with `newIndex` = current `pending.index`.
- Ordering guarantee (documented + asserted in tests): DOM restored **before** `remove`/`add`/`update`/`end` fire, so a synchronous `setState` inside a handler re-renders against clean DOM.

### Index semantics

`newIndex` / `newIndexes[i]` = index the item will occupy in the target list **after** the consumer applies the move — i.e. count of draggable siblings before the placeholder, excluding hidden dragged items and the placeholder itself. Placeholder must never match the `draggable` selector (it's a bare tag + ghost class today; add a defensive `data-resortable-placeholder` attribute and filter it in `DropZone.getItems`). Matches SortableJS semantics so `migration-from-sortable-v1.md` stays true.

## Touch points

| File | Change |
|------|--------|
| `src/types/index.ts` | `controlled` option; `oldIndexes`/`newIndexes` on `SortableEvent` |
| `src/core/DragManager.ts` | gate the three mutation sites; placeholder-drive; cleanup ordering |
| `src/core/GlobalDragState.ts` | `pending` on `ActiveDrag`; controlled `endDrag` emission; skip clone creation |
| `src/core/KeyboardManager.ts` | placeholder-based grab/move/drop |
| `src/core/GhostManager.ts` | placeholder marker attr; multi-drag placeholder sizing |
| `src/core/DropZone.ts` | `getItems()` excludes placeholder; index helper for "count before placeholder" |

`Sortable.sort()` / `toArray()` unchanged — imperative helpers stay uncontrolled-only (document that `sort()` throws or no-ops in controlled mode; the consumer owns order).

## Testing strategy

- Unit: controlled-mode suite asserting the invariant — snapshot `container.innerHTML` before drag and at each event emission; must be identical at `end`. Index math for same-zone, cross-zone, multi-drag, clone, keyboard.
- E2E: duplicate a representative slice of the existing drag specs with `controlled: true` + a minimal "framework sim" (re-render list from data on `end`, keyed nodes recreated) — assert no duplicate/orphan nodes and correct visual order.
- A11y: keyboard grab/move/drop announcements unchanged; axe gate already covers the rest.

## Follow-on (separate designs)

1. **`resortable/react`** — `useSortable({ onSort, ...options })` returning a callback ref (see `2026-07-09-react-adapter-design.md` for the authoritative API); forces `controlled: true`; `onSort(intent)` where intent is `{ dataIds, from, to, oldIndexes, newIndexes, pullMode }`; focus restore; StrictMode-safe mount/destroy. Cross-list state coordination stays in userland (the intent is assembled from the source list's `end` event; `onAdd`/`onRemove` pass-throughs serve split-state consumers).
2. **Downstream adoption** — bind the adapter in the consuming app's container components; map `onSort` → the app's existing move actions.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Option shape | single `controlled: boolean` | one mode switch, no matrix; default false = zero behavior change |
| Gap visualization | placeholder + reflow | reuses HTML5-path machinery; grid/flex free; transform engine is over-engineering v1 |
| Clone mode | no clone nodes; intent-only | consumer state insert IS the clone; avoids foreign node leaking into framework DOM |
| Multi-drag indices | new `oldIndexes`/`newIndexes` | events must carry full intent; fixes legacy `Indicies` misspelling |
| Keyboard | placeholder-based, commit on Enter | same invariant as pointer; per-arrow live commits would spam consumer re-renders |
| `sort()`/`store` in controlled mode | no-op + doc | order is consumer state; silent DOM sort would violate the invariant |
