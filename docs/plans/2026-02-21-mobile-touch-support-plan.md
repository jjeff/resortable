# Mobile Touch Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable drag-and-drop on mobile/touch devices by fixing the specific gaps preventing Pointer Events from working on touch.

**Architecture:** Enhance the existing DragManager with touch-action CSS management, HTML5 DnD suppression on touch devices, hold-to-drag visual feedback, and fix AutoScrollPlugin to use pointer events instead of mouse events. No new abstractions — the Pointer Events API already unifies input types.

**Tech Stack:** TypeScript, Vitest (unit tests), Playwright (integration tests), Vite dev server

**Design Doc:** `docs/plans/2026-02-21-mobile-touch-support-design.md`

---

### Task 1: Touch-Action CSS Management

Apply `touch-action: none` to draggable items so the browser doesn't intercept touches for scrolling/zooming.

**Files:**
- Modify: `src/core/DragManager.ts` — `attach()`, `detach()`, `updateDraggableItems()`
- Test: `tests/unit/touch-support.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/touch-support.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { DragManager } from '../../src/core/DragManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'
import type { SortableEvents } from '../../src/types/index'

function createContainer(count = 3): HTMLElement {
  const container = document.createElement('div')
  for (let i = 1; i <= count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `${i}`
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

describe('Touch Support', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  describe('touch-action CSS', () => {
    it('sets touch-action: none on draggable items during attach', () => {
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined)
      dm.attach()

      const items = container.querySelectorAll('.sortable-item')
      items.forEach((item) => {
        expect((item as HTMLElement).style.touchAction).toBe('none')
      })

      dm.detach()
    })

    it('restores original touch-action on detach', () => {
      const items = container.querySelectorAll('.sortable-item')
      ;(items[0] as HTMLElement).style.touchAction = 'auto'

      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined)
      dm.attach()
      expect((items[0] as HTMLElement).style.touchAction).toBe('none')

      dm.detach()
      expect((items[0] as HTMLElement).style.touchAction).toBe('auto')
    })

    it('sets touch-action: none only on handles when handle option is set', () => {
      // Add handles to items
      container.querySelectorAll('.sortable-item').forEach((item) => {
        const handle = document.createElement('span')
        handle.className = 'drag-handle'
        item.appendChild(handle)
      })

      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, { handle: '.drag-handle' })
      dm.attach()

      // Items should NOT have touch-action: none
      container.querySelectorAll('.sortable-item').forEach((item) => {
        expect((item as HTMLElement).style.touchAction).not.toBe('none')
      })

      // Handles SHOULD have touch-action: none
      container.querySelectorAll('.drag-handle').forEach((handle) => {
        expect((handle as HTMLElement).style.touchAction).toBe('none')
      })

      dm.detach()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: FAIL — `touch-action` is not being set

**Step 3: Write minimal implementation**

In `src/core/DragManager.ts`:

1. Add a private field to store original touch-action values:
```typescript
private originalTouchActions = new Map<HTMLElement, string>()
```

2. In `updateDraggableItems()`, after setting `item.draggable = true`, also set `touch-action`:
```typescript
// If handle is configured, set touch-action on handles instead
if (this.handle) {
  const handles = item.querySelectorAll(this.handle)
  handles.forEach((handle) => {
    if (handle instanceof HTMLElement) {
      this.originalTouchActions.set(handle, handle.style.touchAction)
      handle.style.touchAction = 'none'
    }
  })
} else {
  this.originalTouchActions.set(item, item.style.touchAction)
  item.style.touchAction = 'none'
}
```

3. In `detach()`, restore original values:
```typescript
// Restore original touch-action values
this.originalTouchActions.forEach((originalValue, element) => {
  element.style.touchAction = originalValue
})
this.originalTouchActions.clear()
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/touch-support.test.ts src/core/DragManager.ts
git commit -m "feat: add touch-action CSS management for mobile support"
```

---

### Task 2: HTML5 DnD Suppression on Touch Devices

Prevent `draggable="true"` and HTML5 drag events from interfering on touch-capable devices.

**Files:**
- Modify: `src/core/DragManager.ts` — `updateDraggableItems()`, `onDragStart()`
- Test: `tests/unit/touch-support.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/touch-support.test.ts`:

```typescript
describe('HTML5 DnD suppression', () => {
  it('does not set draggable=true on touch-capable devices', () => {
    // Simulate touch capability
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })

    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    const dm = new DragManager(zone, events, undefined)
    dm.attach()

    const items = container.querySelectorAll('.sortable-item')
    items.forEach((item) => {
      expect((item as HTMLElement).draggable).toBe(false)
    })

    dm.detach()

    // Clean up
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
  })

  it('sets draggable=true on non-touch devices', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })

    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    const dm = new DragManager(zone, events, undefined)
    dm.attach()

    const items = container.querySelectorAll('.sortable-item')
    items.forEach((item) => {
      expect((item as HTMLElement).draggable).toBe(true)
    })

    dm.detach()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: FAIL — draggable is always set to true

**Step 3: Write minimal implementation**

In `updateDraggableItems()`, check for touch capability:

```typescript
private updateDraggableItems(): void {
  const isTouchDevice = navigator.maxTouchPoints > 0
  const draggableItems = this.zone.element.querySelectorAll(this.draggable)

  for (const item of draggableItems) {
    if (item instanceof HTMLElement && item.parentElement === this.zone.element) {
      // Don't set draggable=true on touch devices — it triggers HTML5 DnD
      // which has zero mobile browser support and interferes with pointer events
      item.draggable = !isTouchDevice

      // touch-action CSS (from Task 1) ...
    }
  }

  // Set draggable=false for items that don't match the selector
  for (const child of this.zone.getItems()) {
    if (!child.matches(this.draggable)) {
      child.draggable = false
    }
  }
}
```

Also harden `onDragStart` to prevent any HTML5 drag from a touch pointer:

```typescript
private onDragStart = (e: DragEvent): void => {
  // If pointer-based drag is already active, prevent HTML5 drag from interfering
  if (this.isPointerDragging) {
    e.preventDefault()
    return
  }

  // On touch devices, always prevent HTML5 drag — use pointer events instead
  if (navigator.maxTouchPoints > 0) {
    e.preventDefault()
    return
  }

  // ... rest of existing code
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/DragManager.ts tests/unit/touch-support.test.ts
git commit -m "feat: suppress HTML5 DnD on touch-capable devices"
```

---

### Task 3: Hold-to-Drag Visual Feedback

Show a scale+shadow visual cue during the delay period when touch-holding an item.

**Files:**
- Modify: `src/core/DragManager.ts` — `startDragDelay()`, `cancelDragDelay()`, `startPointerDrag()`
- Test: `tests/unit/touch-support.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/touch-support.test.ts`:

```typescript
describe('hold-to-drag feedback', () => {
  it('adds sortable-holding class during touch delay', () => {
    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    const dm = new DragManager(zone, events, undefined, {
      delayOnTouchOnly: 200,
    })
    dm.attach()

    const item = container.querySelector('.sortable-item') as HTMLElement

    // Simulate touch pointerdown
    const pointerDown = new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
      bubbles: true,
      isPrimary: true,
      button: 0,
    })
    item.dispatchEvent(pointerDown)

    // During delay, item should have the holding class
    expect(item.classList.contains('sortable-holding')).toBe(true)

    // Clean up
    dm.detach()
  })

  it('removes sortable-holding class when delay is cancelled', () => {
    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    const dm = new DragManager(zone, events, undefined, {
      delayOnTouchOnly: 200,
      touchStartThreshold: 5,
    })
    dm.attach()

    const item = container.querySelector('.sortable-item') as HTMLElement

    // Simulate touch pointerdown
    const pointerDown = new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
      bubbles: true,
      isPrimary: true,
      button: 0,
    })
    item.dispatchEvent(pointerDown)
    expect(item.classList.contains('sortable-holding')).toBe(true)

    // Simulate move beyond threshold to cancel
    const pointerMove = new PointerEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 50,
      clientY: 100, // 50px movement > 5px threshold
      bubbles: true,
    })
    document.dispatchEvent(pointerMove)

    expect(item.classList.contains('sortable-holding')).toBe(false)

    dm.detach()
  })

  it('applies default hold styles (scale + shadow)', () => {
    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    const dm = new DragManager(zone, events, undefined, {
      delayOnTouchOnly: 200,
    })
    dm.attach()

    const item = container.querySelector('.sortable-item') as HTMLElement

    const pointerDown = new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
      bubbles: true,
      isPrimary: true,
      button: 0,
    })
    item.dispatchEvent(pointerDown)

    // Check for scale transform and shadow
    expect(item.style.transform).toContain('scale')
    expect(item.style.boxShadow).toBeTruthy()

    dm.detach()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: FAIL — no holding class or styles applied

**Step 3: Write minimal implementation**

Add a private field to track the hold target:

```typescript
private holdTarget: HTMLElement | null = null
private holdOriginalStyles: { transform: string; boxShadow: string; transition: string } | null = null
```

In `startDragDelay()`, after storing the initial position and starting the timer, apply feedback:

```typescript
private startDragDelay(event: PointerEvent, target: HTMLElement, callback: () => void): void {
  const isTouch = event.pointerType === 'touch'
  const effectiveDelay = isTouch ? this.delayOnTouchOnly : this.delay

  if (effectiveDelay <= 0) {
    callback()
    return
  }

  // Store initial position for threshold checking
  this.dragStartPosition = { x: event.clientX, y: event.clientY }

  // Apply hold feedback for touch
  if (isTouch) {
    this.holdTarget = target
    this.holdOriginalStyles = {
      transform: target.style.transform,
      boxShadow: target.style.boxShadow,
      transition: target.style.transition,
    }
    target.classList.add('sortable-holding')
    target.style.transition = 'transform 150ms ease, box-shadow 150ms ease'
    target.style.transform = 'scale(1.03)'
    target.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
  }

  // Set up delay timer
  this.dragStartTimer = window.setTimeout(() => {
    this.dragStartTimer = undefined
    this.dragStartPosition = undefined
    this.clearHoldFeedback()
    callback()
  }, effectiveDelay)

  // ... existing move/up/cancel handlers, but also clear hold feedback in onUp/cancel
}
```

Add `clearHoldFeedback()`:

```typescript
private clearHoldFeedback(): void {
  if (this.holdTarget && this.holdOriginalStyles) {
    this.holdTarget.classList.remove('sortable-holding')
    this.holdTarget.style.transform = this.holdOriginalStyles.transform
    this.holdTarget.style.boxShadow = this.holdOriginalStyles.boxShadow
    this.holdTarget.style.transition = this.holdOriginalStyles.transition
  }
  this.holdTarget = null
  this.holdOriginalStyles = null
}
```

Call `clearHoldFeedback()` in:
- `cancelDragDelay()` — when threshold exceeded or pointer up during delay
- `startPointerDrag()` — when drag actually starts (clear feedback, ghost takes over)

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/DragManager.ts tests/unit/touch-support.test.ts
git commit -m "feat: add hold-to-drag visual feedback for touch"
```

---

### Task 4: Fix AutoScrollPlugin to Use Pointer Events

Replace `mousemove` with `pointermove` so auto-scroll works on touch devices.

**Files:**
- Modify: `src/plugins/AutoScrollPlugin.ts` — `attachMouseTracking()`, `detachMouseTracking()`
- Test: `tests/unit/touch-support.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/touch-support.test.ts`:

```typescript
import { AutoScrollPlugin } from '../../src/plugins/AutoScrollPlugin'

describe('AutoScrollPlugin touch support', () => {
  it('tracks pointer position from pointermove events', () => {
    const plugin = AutoScrollPlugin.create()

    // Create a mock sortable instance
    const mockSortable = {
      element: container,
      eventSystem: new EventSystem<SortableEvents>(),
      dragManager: { isDragging: false },
    } as unknown as import('../../src/types/index').SortableInstance

    plugin.install(mockSortable)

    // Dispatch a pointermove event (simulating touch)
    const pointerMove = new PointerEvent('pointermove', {
      clientX: 100,
      clientY: 200,
      pointerType: 'touch',
      bubbles: true,
    })
    document.dispatchEvent(pointerMove)

    // Access internal state to verify position was tracked
    // We verify indirectly by checking the plugin doesn't error
    // and that it installed correctly
    plugin.uninstall(mockSortable)
  })

  it('does not listen to mousemove events', () => {
    const plugin = AutoScrollPlugin.create()

    const mockSortable = {
      element: container,
      eventSystem: new EventSystem<SortableEvents>(),
      dragManager: { isDragging: false },
    } as unknown as import('../../src/types/index').SortableInstance

    plugin.install(mockSortable)

    // Verify that the handler is stored as pointer handler, not mouse handler
    const sortableWithHandler = mockSortable as any
    expect(sortableWithHandler._autoScrollPointerHandler).toBeDefined()
    expect(sortableWithHandler._autoScrollMouseHandler).toBeUndefined()

    plugin.uninstall(mockSortable)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: FAIL — `_autoScrollMouseHandler` is defined, `_autoScrollPointerHandler` is not

**Step 3: Write minimal implementation**

In `src/plugins/AutoScrollPlugin.ts`, change `attachMouseTracking` and `detachMouseTracking`:

```typescript
private attachMouseTracking(sortable: SortableInstance): void {
  const handlePointerMove = (event: PointerEvent) => {
    this.lastMousePosition = { x: event.clientX, y: event.clientY }
  }

  const sortableWithAutoScroll = sortable as SortableInstance & {
    _autoScrollPointerHandler?: (event: PointerEvent) => void
  }
  if (!sortableWithAutoScroll._autoScrollPointerHandler) {
    sortableWithAutoScroll._autoScrollPointerHandler = handlePointerMove
    document.addEventListener('pointermove', handlePointerMove)
  }
}

private detachMouseTracking(sortable: SortableInstance): void {
  const sortableWithAutoScroll = sortable as SortableInstance & {
    _autoScrollPointerHandler?: (event: PointerEvent) => void
  }
  if (sortableWithAutoScroll._autoScrollPointerHandler) {
    document.removeEventListener(
      'pointermove',
      sortableWithAutoScroll._autoScrollPointerHandler
    )
    delete sortableWithAutoScroll._autoScrollPointerHandler
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: PASS

**Step 5: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/plugins/AutoScrollPlugin.ts tests/unit/touch-support.test.ts
git commit -m "fix: AutoScrollPlugin now uses pointermove instead of mousemove"
```

---

### Task 5: Set Default Touch Delay

Set a sensible default for `delayOnTouchOnly` so touch users get scroll-vs-drag disambiguation out of the box.

**Files:**
- Modify: `src/core/DragManager.ts` — constructor default
- Modify: `src/index.ts` — option default (if options are processed there)
- Test: `tests/unit/touch-support.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/touch-support.test.ts`:

```typescript
describe('default touch options', () => {
  it('defaults delayOnTouchOnly to 200ms when not specified', () => {
    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    // No delayOnTouchOnly option provided
    const dm = new DragManager(zone, events, undefined)
    dm.attach()

    const item = container.querySelector('.sortable-item') as HTMLElement

    // Simulate touch pointerdown — should start a delay, not immediate drag
    const pointerDown = new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
      bubbles: true,
      isPrimary: true,
      button: 0,
    })
    item.dispatchEvent(pointerDown)

    // If delay is working, the item should have the holding class (from Task 3)
    // indicating a delay is in progress, not an immediate drag
    expect(item.classList.contains('sortable-holding')).toBe(true)

    dm.detach()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: FAIL — current default is `0` (from `options?.delay ?? 0`), so no delay, no holding class

**Step 3: Write minimal implementation**

In `DragManager` constructor, change the default:

```typescript
// Old:
this.delayOnTouchOnly = options?.delayOnTouchOnly ?? options?.delay ?? 0
// New:
this.delayOnTouchOnly = options?.delayOnTouchOnly ?? 200
```

This means:
- If `delayOnTouchOnly` is explicitly set → use that value
- If not set → default to 200ms (sensible for touch)
- The `delay` option still controls mouse delay separately

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/touch-support.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing tests don't depend on the delay default being 0)

**Step 6: Commit**

```bash
git add src/core/DragManager.ts tests/unit/touch-support.test.ts
git commit -m "feat: default delayOnTouchOnly to 200ms for mobile UX"
```

---

### Task 6: Lint, Type-Check, and Final Verification

Ensure everything passes project quality gates.

**Files:**
- All modified files from Tasks 1-5

**Step 1: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 2: Fix any lint issues**

If there are lint issues, fix them in the relevant files.

**Step 3: Run type checker**

Run: `npm run type-check`
Expected: No errors

**Step 4: Fix any type issues**

If there are type errors, fix them.

**Step 5: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix lint and type-check issues"
```

---

### Task 7: Manual Testing with Playwright MCP

Test on a real browser to verify touch simulation works.

**Files:**
- No new files — use Playwright MCP tools

**Step 1: Start dev server**

Run: `npm run dev` (background)

**Step 2: Navigate to demo page**

Use Playwright MCP to open the dev server URL.

**Step 3: Test touch interaction**

Use Playwright's `touchscreen.tap()` and touch simulation to:
1. Verify tap-and-hold shows the scale+shadow feedback
2. Verify dragging after hold moves the item
3. Verify quick taps don't start a drag (delay works)
4. Verify scrolling still works when not holding an item

**Step 4: Verify and report results**

Report what works and what needs adjustment.
