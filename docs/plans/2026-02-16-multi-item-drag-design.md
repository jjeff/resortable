# Multi-Item Drag Design

**Date:** 2026-02-16
**Branch:** `feat/multi-item-drag`
**Status:** Approved

## Problem

Multi-item selection is fully implemented (SelectionManager, KeyboardManager, click handlers), but pointer-based multi-item dragging only moves the single item under the cursor. The `draggedItems` array is collected in `DragManager.startPointerDrag()` but never used for actual movement.

Keyboard multi-drag already works correctly in KeyboardManager — pointer drag needs to follow the same pattern.

## Decisions

- **Approach:** DragManager-native multi-drag (Approach A). Multi-drag logic lives in core, not in a plugin.
- **Visual feedback:** Stacked ghost with count badge. Source items dimmed during drag.
- **Drop ordering:** Preserve relative order of selected items at drop position.
- **Input paths:** Both pointer (mouse/touch) and keyboard.
- **Multi-clone:** All selected items cloned when dragging from a `pull: 'clone'` source.
- **MultiDragPlugin:** Deprecated. Functionality absorbed into core per "plural-first drag model" principle.

## Architecture

### Core Principle: Plural-First

DragManager always operates on `draggedItems: HTMLElement[]`. Single-item drag is `items.length === 1`. No special-casing — the same code path handles both.

### Data Model Changes

**GlobalDragState.ActiveDrag:**
```typescript
interface ActiveDrag {
  items: HTMLElement[]      // was: item: HTMLElement
  startIndices: number[]    // was: startIndex: number
  clones?: HTMLElement[]    // was: clone?: HTMLElement
  // rest unchanged
}
```

**DragManager** gains `private draggedItems: HTMLElement[] = []` instance property, mirroring `KeyboardManager.grabbedItems`.

**DropZone** gains `moveMultiple(items: HTMLElement[], toIndex: number): void` for batch insertion preserving relative order.

### Pointer Drag Flow

**`startPointerDrag()`:**
- Store collected items as `this.draggedItems`
- Apply `sortable-multi-drag-source` class to non-anchor selected items
- Create stacked ghost when `draggedItems.length > 1`
- Pass `items[]` to GlobalDragState

**`onPointerMove()`:**
- Anchor item (`this.dragElement`) determines drop position from cursor
- When `draggedItems.length > 1`, call `zone.moveMultiple()` instead of `zone.move()`
- Other items insert relative to anchor, preserving original order
- Events emit full `items[]` array

**`cleanupPointerDrag()`:**
- Remove `sortable-multi-drag-source` class from all items
- Clear `this.draggedItems`

**Cross-zone moves:**
- All `draggedItems` removed from source zone
- All inserted into target zone at drop position
- Clone mode: all items get cloned

### Stacked Ghost

When `draggedItems.length > 1`:
- Clone anchor item as base ghost
- Add `sortable-ghost-stacked` class
- Append count badge element (`sortable-drag-count` class)
- Style with stacked shadow effect and circular count indicator

### `multiDrag` Option

Controls whether Ctrl/Shift+Click enables multi-select behavior. Without it, clicks just initiate single-item drag. The drag infrastructure always supports `items[]` regardless.

## Files Changed

| File | Change |
|------|--------|
| `src/core/DragManager.ts` | `draggedItems[]` property, multi-item pointer drag flow, stacked ghost, absorb selection click handlers |
| `src/core/GlobalDragState.ts` | `item` -> `items[]`, `startIndex` -> `startIndices[]`, `clone` -> `clones[]` |
| `src/core/DropZone.ts` | Add `moveMultiple(items, toIndex)` |
| `src/core/SelectionManager.ts` | Minor — expose click handler logic for DragManager |
| `src/plugins/MultiDragPlugin.ts` | Deprecate |
| `src/index.ts` | Remove MultiDragPlugin auto-install, update option handling |
| `src/types/index.ts` | Update ActiveDrag interface |
| `tests/e2e/multi-select.spec.ts` | Unskip and fix tests |
| `index.html` | Update demo for multi-drag |

## Testing

**Unskip:** `tests/e2e/multi-select.spec.ts` (10 tests covering selection UX, multi-drag, keyboard multi-drag).

**Key test scenarios:**
1. Ctrl/Cmd+Click toggles selection
2. Shift+Click range selection
3. Drag one selected item moves all selected
4. Items preserve relative order at drop
5. Cross-zone multi-drag and multi-clone
6. Stacked ghost shows count badge
7. Source items dimmed during drag
8. `multiDrag: false` ignores selection on drag

**Unit tests:** `DropZone.moveMultiple()`, `GlobalDragState` multi-item storage.
