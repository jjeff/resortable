import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { Sortable } from '../../src/index'
import { GhostManager } from '../../src/core/GhostManager'
import type { SortableEvent, SortableOptions } from '../../src/types/index'

/**
 * Guard-branch coverage for `DragManager` that no other unit suite reaches:
 *
 * 1. `sort: false` in the CONTROLLED pipeline (`handleControlledMove`) and in
 *    the POINTER pipeline (`onPointerMove`). The HTML5 `onDragOver` guard is
 *    already covered by `sort-option.spec.ts`; these two are not.
 * 2. `filter` / `onFilter` / `preventOnFilter` (`shouldAllowDrag`) — only
 *    `handle` / `ignore` had unit coverage.
 * 3. `cleanupPointerDrag(revert = true)` — the drag-cancel snap-back. Its only
 *    caller is the multi-touch guard in `onPointerDown`: a SECOND touch landing
 *    during an active touch drag cancels it. (`pointercancel` deliberately does
 *    NOT revert — see the last test in that block.)
 * 4. `canDropInZone` fallbacks — a target container with no registered
 *    DragManager (heuristic, fails closed) and the "no active pointer" branch.
 *
 * jsdom here has neither a `PointerEvent` constructor nor
 * `document.elementFromPoint`, so the pointer pipeline is driven with
 * MouseEvents carrying pointer fields (see `pointer()`) and a stubbed
 * `elementFromPoint` (see `hover()`) — the same technique as `hit-area.test.ts`.
 *
 * `tests/setup.ts` stubs every rect to all-zero. None of these branches are
 * geometry-gated: `swapThreshold` is left unset (so `shouldSwap` always allows)
 * and `controlledInsertAfter` falls back to DOM order on zero-size rects, so
 * per-element rect stubs would not change any outcome here.
 */

const sortables: Sortable[] = []

function mount(el: HTMLElement, options: SortableOptions): Sortable {
  const instance = new Sortable(el, options)
  sortables.push(instance)
  return instance
}

/** `<div id=…>` holding `count` `.sortable-item`s with ids `${id}-1…n`. */
function makeList(id: string, count = 4): HTMLElement {
  const list = document.createElement('div')
  list.id = id
  for (let i = 1; i <= count; i++) {
    const item = document.createElement('div')
    item.className = 'sortable-item'
    item.dataset.id = `${id}-${i}`
    item.textContent = `Item ${i}`
    list.appendChild(item)
  }
  document.body.appendChild(list)
  return list
}

/** Real DOM order of a list — ghost and placeholder clones excluded. */
function ids(list: HTMLElement): string[] {
  return Array.from(
    list.querySelectorAll<HTMLElement>(
      '.sortable-item:not([data-resortable-ghost]):not([data-resortable-placeholder])'
    )
  ).map((el) => el.dataset.id ?? '')
}

/** Position of the controlled-mode placeholder among the list's children. */
function placeholderIndex(list: HTMLElement): number {
  return Array.from(list.children).findIndex((el) =>
    el.hasAttribute('data-resortable-placeholder')
  )
}

interface PointerInit {
  x?: number
  y?: number
  id?: number
  pointerType?: 'mouse' | 'touch' | 'pen'
}

/**
 * A pointer event for jsdom, which has no `PointerEvent` constructor. The
 * pipeline only reads `clientX/Y`, `pointerId`, `pointerType`, `isPrimary` and
 * `button`, all of which a MouseEvent can carry or have defined onto it.
 */
function pointer(type: string, init: PointerInit = {}): PointerEvent {
  const { x = 10, y = 10, id = 1, pointerType = 'mouse' } = init
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  })
  Object.defineProperties(event, {
    pointerId: { value: id, configurable: true },
    pointerType: { value: pointerType, configurable: true },
    isPrimary: { value: true, configurable: true },
  })
  return event as unknown as PointerEvent
}

function dragEvent(type: string): DragEvent {
  return new Event(type, { bubbles: true, cancelable: true }) as DragEvent
}

/** Item lookup by `data-id`, so a missing item fails loudly. */
function byId(list: HTMLElement, id: string): HTMLElement {
  const el = list.querySelector<HTMLElement>(`[data-id="${id}"]`)
  if (!el) throw new Error(`no item with data-id "${id}"`)
  return el
}

/** Stub the element the pointer is over (jsdom implements no hit testing). */
function hover(el: Element | null): void {
  document.elementFromPoint = () => el
}

afterEach(() => {
  // A test that trips an assertion mid-drag would otherwise leave the
  // pipeline's `document` pointermove/pointerup listeners attached (they are
  // only removed on pointerup, not by `destroy()`), and the orphaned manager
  // would then reorder the NEXT test's list. Release both pointer ids first.
  document.dispatchEvent(pointer('pointerup', { id: 1 }))
  document.dispatchEvent(pointer('pointerup', { id: 2 }))
  sortables.splice(0).forEach((s) => s.destroy())
  document.body.innerHTML = ''
  delete (document as unknown as { elementFromPoint?: unknown })
    .elementFromPoint
  vi.restoreAllMocks()
})

describe('sort: false', () => {
  describe('controlled pipeline (handleControlledMove)', () => {
    it('blocks in-zone reordering: placeholder never moves, no sort/update/change', () => {
      const list = makeList('list')
      const before = ids(list)
      const onSort = vi.fn()
      const onUpdate = vi.fn()
      const onChange = vi.fn()
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      mount(list, {
        animation: 0,
        controlled: true,
        sort: false,
        onSort,
        onUpdate,
        onChange,
        onEnd,
      })

      const item1 = list.children[0] as HTMLElement
      const item3 = list.children[2] as HTMLElement

      item1.dispatchEvent(dragEvent('dragstart'))
      // Placeholder is inserted at the dragged item's own spot.
      expect(placeholderIndex(list)).toBe(0)

      item3.dispatchEvent(dragEvent('dragover'))
      // The guard returns before `insertWithAnimation` — the placeholder is
      // still parked at index 0, so no reorder intent can accumulate.
      expect(placeholderIndex(list)).toBe(0)

      item3.dispatchEvent(dragEvent('drop'))
      item1.dispatchEvent(dragEvent('dragend'))

      expect(ids(list)).toEqual(before)
      expect(onSort).not.toHaveBeenCalled()
      expect(onUpdate).not.toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
      const evt = onEnd.mock.calls[0][0]
      expect(evt.oldIndex).toBe(0)
      expect(evt.newIndex).toBe(0)
    })

    it('sort: true (default) moves the placeholder and reports the new index', () => {
      const list = makeList('list')
      const onSort = vi.fn()
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      mount(list, { animation: 0, controlled: true, onSort, onEnd })

      const item1 = list.children[0] as HTMLElement
      const item3 = list.children[2] as HTMLElement

      item1.dispatchEvent(dragEvent('dragstart'))
      item3.dispatchEvent(dragEvent('dragover'))
      // Placeholder travelled past item-3 (children: 1, 2, 3, placeholder, 4).
      expect(placeholderIndex(list)).toBe(3)

      item3.dispatchEvent(dragEvent('drop'))
      item1.dispatchEvent(dragEvent('dragend'))

      expect(onSort).toHaveBeenCalled()
      const evt = onEnd.mock.calls[0][0]
      expect(evt.oldIndex).toBe(0)
      expect(evt.newIndex).toBe(2)
    })

    it('still accepts a transfer from another list — sort: false blocks reorder, not put', () => {
      const source = makeList('src', 3)
      const target = makeList('dst', 3)
      const sourceBefore = ids(source)
      const targetBefore = ids(target)
      const onRemove = vi.fn<(evt: SortableEvent) => void>()
      const onAdd = vi.fn<(evt: SortableEvent) => void>()
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      const shared: SortableOptions = {
        animation: 0,
        controlled: true,
        sort: false,
        group: 'shared',
      }
      mount(source, { ...shared, onRemove, onEnd })
      mount(target, { ...shared, onAdd })

      const dragged = source.children[0] as HTMLElement
      const targetItem2 = target.children[1] as HTMLElement

      dragged.dispatchEvent(dragEvent('dragstart'))
      targetItem2.dispatchEvent(dragEvent('dragover'))
      // The zone-ENTER branch runs before the sort guard: the placeholder is
      // now in the target list, ahead of its item 2.
      expect(placeholderIndex(target)).toBe(1)

      targetItem2.dispatchEvent(dragEvent('drop'))
      dragged.dispatchEvent(dragEvent('dragend'))

      expect(ids(source)).toEqual(sourceBefore)
      expect(ids(target)).toEqual(targetBefore)
      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(onAdd).toHaveBeenCalledTimes(1)
      expect(onAdd.mock.calls[0][0].to).toBe(target)
      expect(onAdd.mock.calls[0][0].newIndex).toBe(1)
      expect(onEnd.mock.calls[0][0].to).toBe(target)
    })
  })

  describe('pointer pipeline (onPointerMove)', () => {
    it('blocks in-zone reordering: real DOM order is unchanged', () => {
      const list = makeList('list')
      const before = ids(list)
      const onStart = vi.fn()
      const onUpdate = vi.fn()
      mount(list, { animation: 0, sort: false, onStart, onUpdate })

      const item1 = list.children[0] as HTMLElement
      const item3 = list.children[2] as HTMLElement

      hover(item3)
      item1.dispatchEvent(pointer('pointerdown'))
      // Guards against a silent pass: the drag really did start.
      expect(onStart).toHaveBeenCalledTimes(1)

      document.dispatchEvent(pointer('pointermove', { y: 60 }))
      expect(ids(list)).toEqual(before)

      document.dispatchEvent(pointer('pointerup', { y: 60 }))
      expect(ids(list)).toEqual(before)
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('sort: true (default) reorders the DOM and emits sort/update/change (#121)', () => {
      const list = makeList('list')
      const onSort = vi.fn()
      const onUpdate = vi.fn<(evt: SortableEvent) => void>()
      const onChange = vi.fn()
      mount(list, { animation: 0, onSort, onUpdate, onChange })

      const item1 = list.children[0] as HTMLElement
      const item3 = list.children[2] as HTMLElement

      hover(item3)
      item1.dispatchEvent(pointer('pointerdown'))
      document.dispatchEvent(pointer('pointermove', { y: 60 }))

      expect(ids(list)).toEqual(['list-2', 'list-3', 'list-1', 'list-4'])
      // Pointer/HTML5 parity: a same-zone pointer reorder fires all three.
      expect(onSort).toHaveBeenCalledTimes(1)
      expect(onUpdate).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledTimes(1)
      const evt = onUpdate.mock.calls[0][0]
      expect(evt.oldIndex).toBe(0)
      expect(evt.newIndex).toBe(2)

      document.dispatchEvent(pointer('pointerup', { y: 60 }))
    })
  })
})

describe('filter / onFilter / preventOnFilter (shouldAllowDrag)', () => {
  /** List whose item 2 carries `.locked`, the element `filter` targets. */
  function makeFilteredList(): {
    list: HTMLElement
    locked: HTMLElement
    free: HTMLElement
    item3: HTMLElement
  } {
    const list = makeList('list')
    const locked = list.children[1] as HTMLElement
    locked.classList.add('locked')
    return {
      list,
      locked,
      free: list.children[0] as HTMLElement,
      item3: list.children[2] as HTMLElement,
    }
  }

  it('a filtered element cannot start a drag — DOM order is untouched', () => {
    const { list, locked, item3 } = makeFilteredList()
    const before = ids(list)
    const onStart = vi.fn()
    mount(list, { animation: 0, filter: '.locked', onStart })

    hover(item3)
    locked.dispatchEvent(pointer('pointerdown'))
    document.dispatchEvent(pointer('pointermove', { y: 60 }))
    document.dispatchEvent(pointer('pointerup', { y: 60 }))

    expect(onStart).not.toHaveBeenCalled()
    expect(ids(list)).toEqual(before)
  })

  it('an unfiltered sibling in the same list still drags', () => {
    const { list, free, item3 } = makeFilteredList()
    const onFilter = vi.fn()
    mount(list, { animation: 0, filter: '.locked', onFilter })

    hover(item3)
    free.dispatchEvent(pointer('pointerdown'))
    document.dispatchEvent(pointer('pointermove', { y: 60 }))
    document.dispatchEvent(pointer('pointerup', { y: 60 }))

    expect(onFilter).not.toHaveBeenCalled()
    expect(ids(list)).toEqual(['list-2', 'list-3', 'list-1', 'list-4'])
  })

  it('onFilter receives the original event, targeting the filtered element', () => {
    const { list, locked } = makeFilteredList()
    const onFilter = vi.fn<(evt: Event) => void>()
    mount(list, { animation: 0, filter: '.locked', onFilter })

    locked.dispatchEvent(pointer('pointerdown'))

    expect(onFilter).toHaveBeenCalledTimes(1)
    const evt = onFilter.mock.calls[0][0]
    expect(evt.type).toBe('pointerdown')
    expect(evt.target).toBe(locked)
  })

  it('preventOnFilter defaults to true — the event is already prevented in onFilter', () => {
    const { list, locked } = makeFilteredList()
    // Read inside the callback: the pipeline also prevents the event AFTER
    // shouldAllowDrag returns false, so only this vantage point isolates the
    // `preventOnFilter` guard itself.
    const prevented: boolean[] = []
    mount(list, {
      animation: 0,
      filter: '.locked',
      onFilter: (evt) => prevented.push(evt.defaultPrevented),
    })

    locked.dispatchEvent(pointer('pointerdown'))

    expect(prevented).toEqual([true])
  })

  it('preventOnFilter: false leaves the event unprevented but still blocks the drag', () => {
    const { list, locked, item3 } = makeFilteredList()
    const before = ids(list)
    const prevented: boolean[] = []
    const onStart = vi.fn()
    mount(list, {
      animation: 0,
      filter: '.locked',
      preventOnFilter: false,
      onStart,
      onFilter: (evt) => prevented.push(evt.defaultPrevented),
    })

    hover(item3)
    locked.dispatchEvent(pointer('pointerdown'))
    document.dispatchEvent(pointer('pointermove', { y: 60 }))
    document.dispatchEvent(pointer('pointerup', { y: 60 }))

    expect(prevented).toEqual([false])
    expect(onStart).not.toHaveBeenCalled()
    expect(ids(list)).toEqual(before)
  })
})

describe('drag cancel (cleanupPointerDrag revert)', () => {
  const touch = (type: string, init: PointerInit = {}): PointerEvent =>
    pointer(type, { pointerType: 'touch', ...init })

  it('a second touch snaps the item back to its original index', () => {
    const list = makeList('list')
    const before = ids(list)
    const onEnd = vi.fn()
    mount(list, { animation: 0, delayOnTouchOnly: 0, onEnd })

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    hover(item3)
    item1.dispatchEvent(touch('pointerdown', { id: 1 }))
    document.dispatchEvent(touch('pointermove', { id: 1, y: 60 }))
    expect(ids(list)).toEqual(['list-2', 'list-3', 'list-1', 'list-4'])

    // Second finger anywhere in the list cancels the in-flight drag.
    const item4 = byId(list, 'list-4')
    item4.dispatchEvent(touch('pointerdown', { id: 2 }))

    expect(ids(list)).toEqual(before)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(list.querySelector('[data-resortable-ghost]')).toBeNull()
  })

  it('controlled: the cancel clears the pending intent so end reports newIndex = oldIndex', () => {
    const list = makeList('list')
    const before = ids(list)
    const onEnd = vi.fn<(evt: SortableEvent) => void>()
    mount(list, { animation: 0, controlled: true, delayOnTouchOnly: 0, onEnd })

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    hover(item3)
    item1.dispatchEvent(touch('pointerdown', { id: 1 }))
    document.dispatchEvent(touch('pointermove', { id: 1, y: 60 }))
    // Intent accumulated: the placeholder sits past item-3.
    expect(placeholderIndex(list)).toBe(3)

    const item4 = list.children[4] as HTMLElement
    item4.dispatchEvent(touch('pointerdown', { id: 2 }))

    const evt = onEnd.mock.calls[0][0]
    expect(evt.oldIndex).toBe(0)
    expect(evt.newIndex).toBe(0)
    expect(ids(list)).toEqual(before)
    // Controlled teardown ran: no placeholder, nothing left hidden.
    expect(placeholderIndex(list)).toBe(-1)
    expect(list.querySelector('.sortable-controlled-hidden')).toBeNull()
  })

  it('controlled: releasing instead of cancelling commits the pending index', () => {
    const list = makeList('list')
    const onEnd = vi.fn<(evt: SortableEvent) => void>()
    mount(list, { animation: 0, controlled: true, delayOnTouchOnly: 0, onEnd })

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    hover(item3)
    item1.dispatchEvent(touch('pointerdown', { id: 1 }))
    document.dispatchEvent(touch('pointermove', { id: 1, y: 60 }))
    document.dispatchEvent(touch('pointerup', { id: 1, y: 60 }))

    const evt = onEnd.mock.calls[0][0]
    expect(evt.oldIndex).toBe(0)
    expect(evt.newIndex).toBe(2)
  })

  it("removes the clone from the target list when a pull: 'clone' drag is cancelled", () => {
    const source = makeList('src', 3)
    const target = makeList('dst', 3)
    const sourceBefore = ids(source)
    const targetBefore = ids(target)
    mount(source, {
      animation: 0,
      delayOnTouchOnly: 0,
      group: { name: 'shared', pull: 'clone' },
    })
    mount(target, { animation: 0, delayOnTouchOnly: 0, group: 'shared' })

    const dragged = source.children[0] as HTMLElement
    const targetItem1 = target.children[0] as HTMLElement

    hover(targetItem1)
    dragged.dispatchEvent(touch('pointerdown', { id: 1 }))
    document.dispatchEvent(touch('pointermove', { id: 1, x: 200, y: 60 }))
    // The clone materialized in the target list; the original stayed home.
    expect(ids(target)).toEqual(['src-1', 'dst-1', 'dst-2', 'dst-3'])
    expect(ids(source)).toEqual(sourceBefore)

    const secondFinger = source.children[1] as HTMLElement
    secondFinger.dispatchEvent(touch('pointerdown', { id: 2 }))

    expect(ids(target)).toEqual(targetBefore)
    expect(ids(source)).toEqual(sourceBefore)
  })

  it('pointercancel ends the drag and detaches the document listeners', () => {
    const list = makeList('list')
    const onEnd = vi.fn()
    mount(list, { animation: 0, delayOnTouchOnly: 0, onEnd })

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    hover(item3)
    item1.dispatchEvent(touch('pointerdown', { id: 1 }))
    document.dispatchEvent(touch('pointermove', { id: 1, y: 60 }))
    const afterMove = ids(list)

    document.dispatchEvent(touch('pointercancel', { id: 1 }))

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(list.querySelector('[data-resortable-ghost]')).toBeNull()
    // NOTE: unlike the second-touch cancel above, `pointercancel` does NOT
    // revert — it drops the item where it currently sits (legacy Sortable
    // treats touchcancel as a drop). Asserted here so the difference is
    // deliberate rather than accidental.
    expect(ids(list)).toEqual(afterMove)

    // No stale document listeners: further pointer traffic changes nothing.
    const item4 = byId(list, 'list-4')
    hover(item4)
    document.dispatchEvent(touch('pointermove', { id: 1, y: 120 }))
    expect(ids(list)).toEqual(afterMove)
  })
})

describe('canDropInZone', () => {
  it('refuses a container with no registered DragManager (heuristic fails closed)', () => {
    const list = makeList('list', 3)
    const listBefore = ids(list)
    // A look-alike container holding matching items but no Sortable instance.
    const foreign = makeList('foreign', 2)
    const foreignBefore = ids(foreign)
    const onEnd = vi.fn<(evt: SortableEvent) => void>()
    const onRemove = vi.fn()
    mount(list, { animation: 0, group: 'shared', onEnd, onRemove })

    const dragged = list.children[0] as HTMLElement
    hover(foreign.children[0])
    dragged.dispatchEvent(pointer('pointerdown'))
    document.dispatchEvent(pointer('pointermove', { x: 200, y: 60 }))

    expect(ids(foreign)).toEqual(foreignBefore)
    expect(ids(list)).toEqual(listBefore)

    document.dispatchEvent(pointer('pointerup', { x: 200, y: 60 }))
    expect(onRemove).not.toHaveBeenCalled()
    expect(onEnd.mock.calls[0][0].to).toBe(list)
  })

  it('refuses any zone while no pointer drag is active', () => {
    const source = makeList('src', 2)
    const target = makeList('dst', 2)
    // Same group — group compatibility alone would say yes.
    const sortable = mount(source, { animation: 0, group: 'shared' })
    mount(target, { animation: 0, group: 'shared' })

    // `canDropInZone` is private; reach it by typed cast rather than widening
    // the class API. With no active pointer there is no drag to test against,
    // so it must fail closed.
    const internals = sortable.dragManager as unknown as {
      canDropInZone(zone: HTMLElement): boolean
    }
    expect(internals.canDropInZone(target)).toBe(false)
  })
})

describe('detach during an active pointer drag', () => {
  // A live pointer drag binds pointermove/pointerup/pointercancel/scroll to
  // `document`, and those were only ever unbound by onPointerUp. Tearing down
  // mid-drag (React unmount, or `option()` rebuilding the DragManager) skipped
  // that handler entirely and left an orphan bound to `document`, still
  // reordering on every later pointermove.
  it('stops responding to document pointermove after destroy()', () => {
    const list = makeList('list')
    const before = ids(list)
    const onStart = vi.fn()
    const sortable = mount(list, { animation: 0, onStart })

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    hover(item3)
    item1.dispatchEvent(pointer('pointerdown'))
    // The drag really is in flight — otherwise this proves nothing.
    expect(onStart).toHaveBeenCalledTimes(1)

    sortable.destroy()

    // The orphaned manager must not act on this.
    document.dispatchEvent(pointer('pointermove', { y: 60 }))
    expect(ids(list)).toEqual(before)
  })

  it('does not let a destroyed instance reorder a different list', () => {
    const first = makeList('first')
    const firstSortable = mount(first, { animation: 0 })

    const item1 = first.children[0] as HTMLElement
    hover(first.children[2])
    item1.dispatchEvent(pointer('pointerdown'))

    firstSortable.destroy()

    // A list created after the destroy — the zombie used to reorder this one.
    const second = makeList('second')
    mount(second, { animation: 0 })
    const secondBefore = ids(second)

    hover(second.children[2])
    document.dispatchEvent(pointer('pointermove', { y: 60 }))

    expect(ids(second)).toEqual(secondBefore)
  })
})

describe('scroll-replay coalescing during autoscroll (#134)', () => {
  // Autoscroll's rAF loop fires `scrollBy` every frame, and each `scroll`
  // event used to replay the last pointermove synchronously — a full
  // hit-test + rect pass per frame. The replay is now coalesced to at most
  // one `onPointerMove` call per animation frame (`tests/setup.ts` maps
  // `requestAnimationFrame` to a 16ms `setTimeout`, so fake timers drive it).

  afterEach(() => {
    vi.useRealTimers()
  })

  it('N scroll events within one frame produce exactly one replay', () => {
    vi.useFakeTimers()
    const list = makeList('list')
    const sortable = mount(list, { animation: 0 })
    const internals = sortable.dragManager as unknown as {
      onPointerMove(e: PointerEvent): void
    }
    const replay = vi.spyOn(internals, 'onPointerMove')

    const item1 = list.children[0] as HTMLElement
    hover(list.children[2])
    item1.dispatchEvent(pointer('pointerdown'))

    // Seed `lastPointerMoveEvent` — the scroll listener replays this.
    document.dispatchEvent(pointer('pointermove', { y: 20 }))
    expect(replay).toHaveBeenCalledTimes(1)

    // Several scroll ticks land before the animation frame flushes.
    document.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('scroll'))
    expect(replay).toHaveBeenCalledTimes(1) // still just the seed call

    vi.advanceTimersByTime(16)

    // One replay for the whole batch, not one per scroll event.
    expect(replay).toHaveBeenCalledTimes(2)
  })

  it('flushes a pending replay synchronously at drop, then cancels the frame', () => {
    // Race: pointerup lands in the same frame as the last autoscroll scroll
    // tick, before the deferred replay has fired. The old synchronous
    // replay never lost that last tick, so dropping here must not resolve
    // against a one-tick-stale target (#124) — cleanupPointerDrag flushes
    // the pending replay itself before tearing anything else down.
    vi.useFakeTimers()
    const list = makeList('list')
    const sortable = mount(list, { animation: 0 })
    const internals = sortable.dragManager as unknown as {
      onPointerMove(e: PointerEvent): void
    }
    const replay = vi.spyOn(internals, 'onPointerMove')

    const item1 = list.children[0] as HTMLElement
    hover(list.children[2])
    item1.dispatchEvent(pointer('pointerdown'))

    document.dispatchEvent(pointer('pointermove', { y: 20 }))
    expect(replay).toHaveBeenCalledTimes(1)

    // Schedules a replay frame that hasn't fired yet.
    document.dispatchEvent(new Event('scroll'))

    // Pointer released before the frame flushes — the drop must still see
    // the post-scroll target: one flushed replay, right here, synchronously.
    document.dispatchEvent(pointer('pointerup'))
    expect(replay).toHaveBeenCalledTimes(2)

    // No further callback once the frame would otherwise have fired —
    // teardown already cancelled it.
    vi.advanceTimersByTime(16)
    expect(replay).toHaveBeenCalledTimes(2)
  })

  it('detach mid-drag drops a pending replay instead of flushing it', () => {
    // `detach()` (React unmount, `option()` rebuild) documents itself as
    // behaviourally neutral: it must not move DOM. The drop-time flush in
    // cleanupPointerDrag would re-resolve the drop target, so detach cancels
    // the pending frame first and no replay ever fires.
    vi.useFakeTimers()
    const list = makeList('list')
    const sortable = mount(list, { animation: 0 })
    const internals = sortable.dragManager as unknown as {
      onPointerMove(e: PointerEvent): void
      detach(): void
    }
    const replay = vi.spyOn(internals, 'onPointerMove')

    const item1 = list.children[0] as HTMLElement
    hover(list.children[2])
    item1.dispatchEvent(pointer('pointerdown'))

    document.dispatchEvent(pointer('pointermove', { y: 20 }))
    expect(replay).toHaveBeenCalledTimes(1)

    // Schedules a replay frame that hasn't fired yet…
    document.dispatchEvent(new Event('scroll'))

    // …and the manager is torn down before it does. No synchronous flush.
    internals.detach()
    expect(replay).toHaveBeenCalledTimes(1)

    // And no deferred one either.
    vi.advanceTimersByTime(16)
    expect(replay).toHaveBeenCalledTimes(1)
  })
})

describe('stale drop-animation timer (#131)', () => {
  // The ghost drop-settle cleanup in `cleanupPointerDrag` only defers to a
  // transitionend/timeout pair when the ghost and the drag element disagree
  // on position by more than 2px — otherwise it destroys synchronously and
  // there is no timer to go stale. Force that gap so both tests exercise the
  // deferred path.
  function forceDropAnimation(ghost: HTMLElement, dragEl: HTMLElement): void {
    ghost.getBoundingClientRect = () => new DOMRect(0, 0, 50, 20)
    dragEl.getBoundingClientRect = () => new DOMRect(100, 100, 50, 20)
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("a stale fallback timer does not destroy a newer drag's ghost/placeholder", () => {
    const list = makeList('list', 4)
    const sortable = mount(list, { animation: 0 })
    // ghostManager is private; reached the same way `canDropInZone` is above.
    const internals = sortable.dragManager as unknown as {
      ghostManager: {
        getGhostElement(): HTMLElement | null
        getPlaceholderElement(): HTMLElement | null
        getChosenClass(): string
        getDragClass(): string
      }
    }

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement
    const item4 = byId(list, 'list-4')

    // First drag drops far enough from its ghost to schedule the 200ms
    // fallback timer instead of destroying synchronously.
    hover(item3)
    item1.dispatchEvent(pointer('pointerdown', { id: 1 }))
    const staleGhost = internals.ghostManager.getGhostElement()
    if (!staleGhost) throw new Error('expected a ghost element')
    forceDropAnimation(staleGhost, item1)
    document.dispatchEvent(pointer('pointerup', { id: 1 }))
    // Still mid drop-animation — not destroyed yet.
    expect(document.body.contains(staleGhost)).toBe(true)

    // A second drag starts within the 200ms window, before the stale timer
    // fires, and gets its own ghost and placeholder.
    hover(item3)
    item4.dispatchEvent(pointer('pointerdown', { id: 1 }))
    const freshGhost = internals.ghostManager.getGhostElement()
    const freshPlaceholder = internals.ghostManager.getPlaceholderElement()
    expect(freshGhost).not.toBeNull()
    expect(freshGhost).not.toBe(staleGhost)
    expect(freshPlaceholder).not.toBeNull()

    // The stale timer from the FIRST drop fires now. Unguarded, it would
    // destroy the CURRENT (second drag's) ghost and placeholder, leaving the
    // new drag with no ghost for the rest of its lifetime.
    vi.advanceTimersByTime(200)

    expect(internals.ghostManager.getGhostElement()).toBe(freshGhost)
    expect(internals.ghostManager.getPlaceholderElement()).toBe(
      freshPlaceholder
    )
    // The guarded cleanup still clears the FIRST drag element's state
    // classes — skipping the destroy must not leave item1 styled as
    // chosen/dragging forever.
    expect(
      item1.classList.contains(internals.ghostManager.getChosenClass())
    ).toBe(false)
    expect(
      item1.classList.contains(internals.ghostManager.getDragClass())
    ).toBe(false)
  })

  it('re-grabbing the SAME element within the window keeps its drag classes', () => {
    const list = makeList('list', 4)
    const sortable = mount(list, { animation: 0 })
    const internals = sortable.dragManager as unknown as {
      ghostManager: {
        getGhostElement(): HTMLElement | null
        getChosenClass(): string
      }
    }

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    // Drop item1 with a settle animation pending…
    hover(item3)
    item1.dispatchEvent(pointer('pointerdown', { id: 1 }))
    const staleGhost = internals.ghostManager.getGhostElement()
    if (!staleGhost) throw new Error('expected a ghost element')
    forceDropAnimation(staleGhost, item1)
    document.dispatchEvent(pointer('pointerup', { id: 1 }))

    // …then re-grab the SAME item before the stale timer fires. The new
    // drag re-applies the chosen class; the stale cleanup must not strip
    // it off a drag that is still running.
    hover(item3)
    item1.dispatchEvent(pointer('pointerdown', { id: 1 }))
    const chosenClass = internals.ghostManager.getChosenClass()
    expect(item1.classList.contains(chosenClass)).toBe(true)

    vi.advanceTimersByTime(200)

    expect(item1.classList.contains(chosenClass)).toBe(true)
    // And the second drag's ghost survives, as in the cross-element case.
    expect(internals.ghostManager.getGhostElement()).not.toBeNull()
  })

  it('re-grab still in fallback-tolerance capture phase keeps chosenClass', () => {
    // With `fallbackTolerance > 0` a pointerdown applies chosenClass at tap
    // start but leaves `dragElement` null until the pointer travels the
    // tolerance distance. A stale timer firing in that window must not
    // strip the class off the in-flight capture phase.
    const list = makeList('list', 4)
    const sortable = mount(list, { animation: 0, fallbackTolerance: 5 })
    const internals = sortable.dragManager as unknown as {
      ghostManager: {
        getGhostElement(): HTMLElement | null
        getChosenClass(): string
      }
    }

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement
    const chosenClass = internals.ghostManager.getChosenClass()

    // First drag: commit past the tolerance, then drop with a settle
    // animation pending.
    hover(item3)
    item1.dispatchEvent(pointer('pointerdown', { id: 1 }))
    document.dispatchEvent(pointer('pointermove', { id: 1, y: 30 }))
    const staleGhost = internals.ghostManager.getGhostElement()
    if (!staleGhost) throw new Error('expected a ghost element')
    forceDropAnimation(staleGhost, item1)
    document.dispatchEvent(pointer('pointerup', { id: 1 }))

    // Re-grab the SAME item: capture phase only — no movement, so the drag
    // has not committed and `dragElement` is still null.
    item1.dispatchEvent(pointer('pointerdown', { id: 1 }))
    expect(item1.classList.contains(chosenClass)).toBe(true)

    vi.advanceTimersByTime(200)

    expect(item1.classList.contains(chosenClass)).toBe(true)
  })

  it('transitionend cancels the fallback timer — cleanup runs once', () => {
    const list = makeList('list', 4)
    mount(list, { animation: 0 })

    const item1 = list.children[0] as HTMLElement
    const item3 = list.children[2] as HTMLElement

    const destroySpy = vi.spyOn(GhostManager.prototype, 'destroy')

    hover(item3)
    item1.dispatchEvent(pointer('pointerdown', { id: 1 }))
    const ghost = document.querySelector(
      '[data-resortable-ghost]'
    ) as HTMLElement
    forceDropAnimation(ghost, item1)
    document.dispatchEvent(pointer('pointerup', { id: 1 }))

    ghost.dispatchEvent(new Event('transitionend'))
    expect(destroySpy).toHaveBeenCalledTimes(1)

    // The fallback timeout must have been cleared by transitionend — it
    // must not fire a second cleanup.
    vi.advanceTimersByTime(200)
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })
})
