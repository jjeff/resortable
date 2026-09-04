import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'
import type { SortableEvent } from '../../src/types/index'

/**
 * Unit coverage for #165 — the `nativeDrag` option.
 *
 * Resortable attaches both drag pipelines, but only the pointer one ever ran:
 * `onPointerDown` calls `preventDefault()` on every drag-eligible pointerdown,
 * and `preventDefault()` on `pointerdown` suppresses the browser's native
 * drag, so `dragstart` never fires. That made the documented `setData` option
 * unreachable and left no way for a drag to carry a payload out of the
 * document.
 *
 * jsdom runs no real drag session, so these tests assert the one thing that
 * decides which pipeline the browser will use: whether the pointerdown was
 * default-prevented. A prevented pointerdown means no native drag can follow.
 */

function makeList(count = 3): HTMLElement {
  const ul = document.createElement('ul')
  for (let i = 1; i <= count; i++) {
    const li = document.createElement('li')
    li.className = 'item'
    li.dataset.id = `${i}`
    li.textContent = `Item ${i}`
    ul.appendChild(li)
  }
  document.body.appendChild(ul)
  return ul
}

// jsdom lacks the PointerEvent constructor in some CI configurations — fall
// back to a plain MouseEvent cast, same pattern as duplicate-key.spec.ts.
function mkPointer(
  type: string,
  pointerType = 'mouse',
  pointerId = 1
): PointerEvent {
  const initProps = { pointerId, isPrimary: true, button: 0, pointerType }
  try {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      ...initProps,
    })
  } catch {
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
    }) as unknown as PointerEvent
    // MouseEvent's own props are getter-only — define, don't assign.
    Object.defineProperties(ev, {
      pointerId: { value: pointerId },
      isPrimary: { value: true },
      pointerType: { value: pointerType },
    })
    return ev
  }
}

/** Press `el` and report whether the press was default-prevented. */
function pressWasPrevented(el: HTMLElement, pointerType = 'mouse'): boolean {
  const ev = mkPointer('pointerdown', pointerType)
  el.dispatchEvent(ev)
  return ev.defaultPrevented
}

describe('nativeDrag', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('suppresses the browser drag by default, which is why setData was unreachable', () => {
    const ul = makeList()
    sortable = new Sortable(ul, { draggable: '.item', fallbackTolerance: 0 })
    const item = ul.querySelector<HTMLElement>('.item')!

    expect(pressWasPrevented(item)).toBe(true)
  })

  it('leaves the press alone when nativeDrag is set, so dragstart can fire', () => {
    const ul = makeList()
    sortable = new Sortable(ul, {
      draggable: '.item',
      fallbackTolerance: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    expect(pressWasPrevented(item)).toBe(false)
  })

  it('starts no pointer drag when nativeDrag is set', () => {
    const ul = makeList()
    sortable = new Sortable(ul, {
      draggable: '.item',
      fallbackTolerance: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!
    item.dispatchEvent(mkPointer('pointerdown'))

    // The pointer pipeline's first visible act is a cursor-following ghost,
    // which GhostManager marks with this attribute. Nothing was built.
    expect(document.querySelector('[data-resortable-ghost]')).toBeNull()
  })

  it('still uses the pointer pipeline for touch, which HTML5 drag cannot serve', () => {
    const ul = makeList()
    sortable = new Sortable(ul, {
      draggable: '.item',
      fallbackTolerance: 0,
      // Touch presses hold for 200ms by default; drop that so the drag starts
      // on the press and the assertion is about the pipeline, not the timer.
      delayOnTouchOnly: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    // Touch presses are not default-prevented (the browser must stay free to
    // scroll), so assert the pipeline directly: the pointer path builds a
    // ghost, the native path never would.
    item.dispatchEvent(mkPointer('pointerdown', 'touch'))
    expect(document.querySelector('[data-resortable-ghost]')).not.toBeNull()
  })

  it('still honours handle and filter, so a non-draggable press starts nothing', () => {
    const ul = makeList()
    sortable = new Sortable(ul, {
      draggable: '.item',
      fallbackTolerance: 0,
      nativeDrag: true,
      filter: '.item',
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    // Filtered out, so the press is prevented and no native drag can follow —
    // the same answer the pointer pipeline gives.
    expect(pressWasPrevented(item)).toBe(true)
  })

  it('yields to forceFallback and says so, rather than leaving no pipeline at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ul = makeList()
    sortable = new Sortable(ul, {
      draggable: '.item',
      fallbackTolerance: 0,
      nativeDrag: true,
      forceFallback: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    // forceFallback unbinds the HTML5 listeners nativeDrag needs, so honouring
    // both would leave the gesture with no pipeline. The pointer path wins.
    expect(pressWasPrevented(item)).toBe(true)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('`nativeDrag` was ignored')
    )
  })
})

/**
 * Parity coverage for #165 — the native pipeline used to be single-item and
 * to abort on any modifier. Both are gestures the pointer pipeline already
 * served, so a consumer that switched to `nativeDrag` silently lost them.
 *
 * Driven through HTML5 `dragstart` / `drop`, which jsdom dispatches
 * synchronously (same technique as swap-threshold-html5.spec.ts).
 */

// Some jsdom builds lack the DragEvent constructor — fall back to a plain
// MouseEvent cast, same pattern as swap-threshold-html5.spec.ts.
function mkDrag(type: string, init: MouseEventInit = {}): DragEvent {
  const full = { bubbles: true, cancelable: true, ...init }
  try {
    return new DragEvent(type, full)
  } catch {
    return new MouseEvent(type, full) as unknown as DragEvent
  }
}

function ctrlClick(el: HTMLElement): void {
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
  )
}

function ids(list: HTMLElement): (string | undefined)[] {
  return Array.from(list.querySelectorAll<HTMLElement>('.item')).map(
    (el) => el.dataset.id
  )
}

/**
 * Finish any in-flight native drag so `globalDragState` does not carry a stale
 * `'html5-drag'` entry into the next test. Dispatched on each zone, not on
 * `document.body` — an event dispatched on body never reaches its descendants,
 * so a body-level dragend silently cleans up nothing.
 */
function endAnyDrag(): void {
  document.querySelectorAll('ul').forEach((ul) => {
    ul.dispatchEvent(new Event('dragend', { bubbles: true, cancelable: true }))
  })
}

describe('nativeDrag parity with the pointer pipeline', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('drags the whole selection when the grabbed item is selected', () => {
    const ul = makeList(4)
    const onStart = vi.fn<(evt: SortableEvent) => void>()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      multiDrag: true,
      onStart,
    })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))
    ctrlClick(items[0])
    ctrlClick(items[1])

    items[0].dispatchEvent(mkDrag('dragstart'))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0][0].items).toHaveLength(2)
  })

  it('drags only the grabbed item when it is not selected', () => {
    const ul = makeList(4)
    const onStart = vi.fn<(evt: SortableEvent) => void>()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      multiDrag: true,
      onStart,
    })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))
    ctrlClick(items[0])
    ctrlClick(items[1])

    // Grabbing an unselected item must not sweep the selection along, and
    // must not silently change the selection either.
    items[3].dispatchEvent(mkDrag('dragstart'))

    expect(onStart.mock.calls[0][0].items).toEqual([items[3]])
  })

  it('marks the non-anchor items while dragging and clears them on dragend', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      multiDrag: true,
    })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))
    ctrlClick(items[0])
    ctrlClick(items[1])
    items[0].dispatchEvent(mkDrag('dragstart'))

    expect(items[0].classList.contains('sortable-multi-drag-source')).toBe(
      false
    )
    expect(items[1].classList.contains('sortable-multi-drag-source')).toBe(true)

    items[0].dispatchEvent(mkDrag('dragend'))
    expect(items[1].classList.contains('sortable-multi-drag-source')).toBe(
      false
    )
  })

  it('moves the whole run on drop, preserving its order', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      multiDrag: true,
    })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))
    expect(ids(ul)).toEqual(['1', '2', '3', '4'])

    ctrlClick(items[0])
    ctrlClick(items[1])
    items[0].dispatchEvent(mkDrag('dragstart'))
    items[3].dispatchEvent(mkDrag('dragover', { clientX: 0, clientY: 0 }))
    items[3].dispatchEvent(mkDrag('drop'))

    // 1 and 2 travel together and keep their relative order. Before the fix
    // only the anchor moved and 2 was stranded, giving ['2','3','4','1'].
    expect(ids(ul)).toEqual(['3', '4', '1', '2'])
  })

  it('lets a configured duplicateKey start a drag instead of reading as selection', () => {
    const ul = makeList(4)
    const onStart = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      duplicateKey: 'ctrl',
      onStart,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    // With `duplicateKey: 'ctrl'`, ctrl means "duplicate on drop", not
    // "toggle selection" — so it must not abort the drag.
    const ev = mkDrag('dragstart', { ctrlKey: true })
    item.dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(false)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('still aborts on a selection modifier that is not the duplicateKey', () => {
    const ul = makeList(4)
    const onStart = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      duplicateKey: 'alt',
      onStart,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    const ev = mkDrag('dragstart', { shiftKey: true })
    item.dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(true)
    expect(onStart).not.toHaveBeenCalled()
  })
})

describe('nativeDrag and drags this library did not start', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('leaves a foreign dragover alone, so the page can be its own drop target', () => {
    const ul = makeList(3)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })

    // No resortable drag is in flight — this is a file from the desktop, or a
    // drag from another window. Claiming it (preventDefault marks a valid drop
    // target, stopPropagation hides it from the page) would swallow exactly
    // the cross-window drop nativeDrag exists to enable.
    const ev = mkDrag('dragover', { clientX: 10, clientY: 10 })
    ul.dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(false)
  })

  it('leaves a foreign dragenter alone for the same reason', () => {
    const ul = makeList(3)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })

    const ev = mkDrag('dragenter', { clientX: 10, clientY: 10 })
    ul.dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(false)
  })

  it('still claims a dragover belonging to its own drag', () => {
    const ul = makeList(3)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    items[0].dispatchEvent(mkDrag('dragstart'))
    const ev = mkDrag('dragover', { clientX: 10, clientY: 10 })
    items[2].dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(true)
    ul.dispatchEvent(mkDrag('dragend'))
  })

  it('keeps items draggable on a touch-capable device when nativeDrag is set', () => {
    const original = Object.getOwnPropertyDescriptor(
      Navigator.prototype,
      'maxTouchPoints'
    )
    // A laptop with a touchscreen. Without this, `draggable` stays false and
    // the mouse loses the native path along with the touchscreen.
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    })
    try {
      const ul = makeList(3)
      sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
      const item = ul.querySelector<HTMLElement>('.item')!
      expect(item.draggable).toBe(true)

      sortable.destroy()
      const ul2 = makeList(3)
      sortable = new Sortable(ul2, { draggable: '.item' })
      expect(ul2.querySelector<HTMLElement>('.item')!.draggable).toBe(false)
    } finally {
      if (original) Object.defineProperty(navigator, 'maxTouchPoints', original)
      else
        delete (navigator as unknown as Record<string, unknown>).maxTouchPoints
    }
  })
})

/**
 * A DataTransfer stub rich enough for the drag-image path, returned alongside
 * its `setDragImage` spy so tests never have to read the method back off the
 * object (which trips `unbound-method`).
 */
function mkDataTransfer(withSetDragImage = true): {
  dt: DataTransfer
  setDragImage: ReturnType<typeof vi.fn>
} {
  const setDragImage = vi.fn()
  const dt: Record<string, unknown> = {
    setData: vi.fn(),
    getData: vi.fn(),
    effectAllowed: 'none',
    dropEffect: 'none',
  }
  if (withSetDragImage) dt.setDragImage = setDragImage
  return { dt: dt as unknown as DataTransfer, setDragImage }
}

/** A dragstart carrying a DataTransfer, which jsdom's DragEvent will not. */
function mkDragStart(dt: DataTransfer, init: MouseEventInit = {}): DragEvent {
  const ev = mkDrag('dragstart', init)
  Object.defineProperty(ev, 'dataTransfer', { value: dt })
  return ev
}

describe('nativeDrag drag image', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('hands the browser a stacked ghost for a multi-item drag', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      multiDrag: true,
    })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))
    ctrlClick(items[0])
    ctrlClick(items[1])

    const { dt, setDragImage } = mkDataTransfer()
    items[0].dispatchEvent(mkDragStart(dt))

    expect(setDragImage).toHaveBeenCalledTimes(1)
    const ghost = setDragImage.mock.calls[0][0] as HTMLElement
    expect(ghost.classList.contains('sortable-ghost-stacked')).toBe(true)
    expect(ghost.querySelector('.sortable-drag-count')?.textContent).toBe('2')
  })

  it('hands the browser a plain ghost for a single-item drag', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    const { dt, setDragImage } = mkDataTransfer()
    item.dispatchEvent(mkDragStart(dt))

    expect(setDragImage).toHaveBeenCalledTimes(1)
    const ghost = setDragImage.mock.calls[0][0] as HTMLElement
    expect(ghost.classList.contains('sortable-ghost-stacked')).toBe(false)
  })

  it('parks the ghost offscreen rather than hiding it, so it can be snapshotted', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    const { dt, setDragImage } = mkDataTransfer()
    item.dispatchEvent(mkDragStart(dt))

    const ghost = setDragImage.mock.calls[0][0] as HTMLElement
    // No engine snapshots a display:none / visibility:hidden element.
    expect(ghost.style.display).not.toBe('none')
    expect(ghost.style.visibility).not.toBe('hidden')
    expect(ghost.style.left).toBe('-10000px')
    expect(ghost.isConnected).toBe(true)
  })

  it('does not throw when the DataTransfer has no setDragImage', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    expect(() =>
      item.dispatchEvent(mkDragStart(mkDataTransfer(false).dt))
    ).not.toThrow()
  })

  it('keeps the chosen and drag classes on the item after dropping the ghost', async () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
    })
    const item = ul.querySelector<HTMLElement>('.item')!
    item.dispatchEvent(mkDragStart(mkDataTransfer().dt))

    // The ghost is removed a tick after the snapshot; the classes must not go
    // with it, or the item loses its dragging styling for the whole drag.
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(document.querySelector('[data-resortable-ghost]')).toBeNull()
    expect(item.classList.contains('sortable-chosen')).toBe(true)
    expect(item.classList.contains('sortable-drag')).toBe(true)
  })
})

describe('duplicateKey on the native HTML5 path', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  function build(): { ul: HTMLElement; items: HTMLElement[] } {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      duplicateKey: 'alt',
    })
    return { ul, items: Array.from(ul.querySelectorAll<HTMLElement>('.item')) }
  }

  it('leaves the original at home and puts the copy in the drop slot', () => {
    const { ul, items } = build()

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt, { altKey: true }))
    items[3].dispatchEvent(mkDrag('dragover', { altKey: true, clientY: 10 }))
    items[3].dispatchEvent(mkDrag('drop', { altKey: true }))

    // The original stays at home and the copy lands in the drop slot. Asserted
    // as a whole order: a count plus a first-element check would also pass if
    // the copy landed somewhere else entirely.
    expect(ids(ul)).toEqual(['1', '2', '3', '4', '1'])
  })

  it('moves rather than duplicates when the modifier is released before the drop', () => {
    const { ul, items } = build()

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt, { altKey: true }))
    items[3].dispatchEvent(mkDrag('dragover', { altKey: true, clientY: 10 }))
    // Released: the drop is an ordinary move again.
    items[3].dispatchEvent(mkDrag('dragover', { clientY: 10 }))
    items[3].dispatchEvent(mkDrag('drop'))

    // An ordinary move to the drop slot. Length alone would also pass for a
    // move that landed in the wrong place.
    expect(ids(ul)).toEqual(['2', '3', '4', '1'])
  })

  it('never duplicates on a drag that ends without a drop', () => {
    const { ul, items } = build()

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt, { altKey: true }))
    items[3].dispatchEvent(mkDrag('dragover', { altKey: true, clientY: 10 }))
    // Released outside every zone — dragend arrives, drop never does.
    ul.dispatchEvent(mkDrag('dragend'))

    expect(ids(ul)).toEqual(['1', '2', '3', '4'])
  })

  it('reports copy or move to the OS through dropEffect', () => {
    const { items } = build()

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt, { altKey: true }))

    const armed = mkDrag('dragover', { altKey: true, clientY: 10 })
    Object.defineProperty(armed, 'dataTransfer', {
      value: mkDataTransfer().dt,
    })
    items[3].dispatchEvent(armed)
    expect(armed.dataTransfer?.dropEffect).toBe('copy')

    const released = mkDrag('dragover', { clientY: 10 })
    Object.defineProperty(released, 'dataTransfer', {
      value: mkDataTransfer().dt,
    })
    items[3].dispatchEvent(released)
    expect(released.dataTransfer?.dropEffect).toBe('move')
  })

  it('advertises copyMove on dragstart so the browser can offer both', () => {
    const { items } = build()
    const { dt } = mkDataTransfer()

    items[0].dispatchEvent(mkDragStart(dt))

    expect(dt.effectAllowed).toBe('copyMove')
  })
})

describe('setDragCursor', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    document.dispatchEvent(mkPointer('pointerup'))
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    document.getElementById('resortable-drag-cursor')?.remove()
    vi.restoreAllMocks()
  })

  function styleRule(): string | undefined {
    return (
      document.getElementById('resortable-drag-cursor')?.textContent ??
      undefined
    )
  }

  it('applies the cursor document-wide, where the capture target cannot reach', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', fallbackTolerance: 0 })

    sortable.setDragCursor('copy')

    // Document-wide and !important, because in controlled mode the capture
    // target is display:none and paints no cursor at all.
    expect(styleRule()).toContain('cursor:copy!important')
  })

  it('survives the pointermoves that would overwrite an inline cursor', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      fallbackTolerance: 0,
      // duplicateKey is what makes syncDuplicate run on every pointermove and
      // reset the cursor — the exact race an app-side fix loses.
      duplicateKey: 'alt',
    })
    const item = ul.querySelector<HTMLElement>('.item')!

    item.dispatchEvent(mkPointer('pointerdown'))
    sortable.setDragCursor('copy')
    document.dispatchEvent(mkPointer('pointermove'))
    document.dispatchEvent(mkPointer('pointermove'))

    expect(styleRule()).toContain('cursor:copy!important')
  })

  it('clears itself when the pointer drag ends', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', fallbackTolerance: 0 })
    const item = ul.querySelector<HTMLElement>('.item')!

    item.dispatchEvent(mkPointer('pointerdown'))
    sortable.setDragCursor('copy')
    document.dispatchEvent(mkPointer('pointerup'))

    expect(document.getElementById('resortable-drag-cursor')).toBeNull()
  })

  it('is cleared by null', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', fallbackTolerance: 0 })

    sortable.setDragCursor('copy')
    sortable.setDragCursor(null)

    expect(document.getElementById('resortable-drag-cursor')).toBeNull()
  })

  it('maps onto dropEffect during a native drag, where CSS is ignored', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    sortable.setDragCursor('copy')

    const over = mkDrag('dragover', { clientY: 10 })
    Object.defineProperty(over, 'dataTransfer', { value: mkDataTransfer().dt })
    items[2].dispatchEvent(over)

    expect(over.dataTransfer?.dropEffect).toBe('copy')
  })

  it('leaves dropEffect alone for a cursor the native pipeline cannot express', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    sortable.setDragCursor('grabbing')

    const over = mkDrag('dragover', { clientY: 10 })
    const seeded = mkDataTransfer().dt
    // Seeded to something the code would never choose, so "left alone" is
    // distinguishable from "explicitly set to none" — which is what
    // no-drop/not-allowed genuinely map to.
    seeded.dropEffect = 'link'
    Object.defineProperty(over, 'dataTransfer', { value: seeded })
    items[2].dispatchEvent(over)

    // 'grabbing' has no dropEffect equivalent — better to leave the browser's
    // own answer than to invent one.
    expect(over.dataTransfer?.dropEffect).toBe('link')
  })

  it('clears itself when the native drag ends', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    sortable.setDragCursor('copy')
    items[0].dispatchEvent(mkDrag('dragend'))

    expect(document.getElementById('resortable-drag-cursor')).toBeNull()
  })
})

describe('nativeDrag teardown and edge cases', () => {
  let sortable: Sortable | undefined
  let other: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    sortable?.destroy()
    other?.destroy()
    sortable = undefined
    other = undefined
    document.body.innerHTML = ''
    document.getElementById('resortable-drag-cursor')?.remove()
    vi.restoreAllMocks()
  })

  it('ends an in-flight native drag when the instance is destroyed', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    sortable.setDragCursor('copy')
    // A React unmount, or any option() that rebuilds the manager. `destroy`
    // removes the dragend listener, so nothing else will ever end this drag.
    sortable.destroy()
    sortable = undefined

    // A stuck cursor rule would apply to the whole page forever.
    expect(document.getElementById('resortable-drag-cursor')).toBeNull()

    // And a surviving 'html5-drag' entry would make the next FOREIGN drag
    // over a same-group zone get claimed — the exact bug the ownership
    // checks exist to prevent.
    const ul2 = makeList(3)
    other = new Sortable(ul2, { draggable: '.item', nativeDrag: true })
    const foreign = mkDrag('dragover', { clientX: 5, clientY: 5 })
    ul2.dispatchEvent(foreign)
    expect(foreign.defaultPrevented).toBe(false)
  })

  it('clears the drag styling off the item that was actually grabbed', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      nativeDrag: true,
      multiDrag: true,
    })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))
    ctrlClick(items[0])
    ctrlClick(items[1])
    ctrlClick(items[2])

    // Grab the LAST of the selection, so the grabbed item is not items[0].
    items[2].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    expect(items[2].classList.contains('sortable-chosen')).toBe(true)

    items[2].dispatchEvent(mkDrag('dragend'))
    expect(items[2].classList.contains('sortable-chosen')).toBe(false)
    expect(items[2].classList.contains('sortable-drag')).toBe(false)
  })

  it('leaves no ghost behind when the dragstart carries no dataTransfer', async () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    // jsdom's DragEvent has a null dataTransfer. Without cleanup outside that
    // branch, a visible clone parks at the grab point for the whole drag.
    items[0].dispatchEvent(mkDrag('dragstart'))
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(document.querySelector('[data-resortable-ghost]')).toBeNull()
  })

  it('refuses a dragstart on a draggable child that is not one of its items', () => {
    const ul = makeList(3)
    sortable = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const img = document.createElement('img')
    img.draggable = true
    ul.appendChild(img)

    // Otherwise the browser starts a real drag session with no data and no
    // library state, which nothing can then accept.
    const ev = mkDrag('dragstart')
    img.dispatchEvent(ev)

    expect(ev.defaultPrevented).toBe(true)
  })

  it('honours a cursor set on the zone being dragged over, not just the source', () => {
    const ulA = makeList(3)
    const ulB = makeList(3)
    sortable = new Sortable(ulA, {
      draggable: '.item',
      group: 'shared',
      nativeDrag: true,
    })
    other = new Sortable(ulB, {
      draggable: '.item',
      group: 'shared',
      nativeDrag: true,
    })
    const aItems = Array.from(ulA.querySelectorAll<HTMLElement>('.item'))
    const bItems = Array.from(ulB.querySelectorAll<HTMLElement>('.item'))

    aItems[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    // The zone being entered is the one that knows it will refuse the drop.
    other.setDragCursor('not-allowed')

    const over = mkDrag('dragover', { clientX: 5, clientY: 5 })
    Object.defineProperty(over, 'dataTransfer', { value: mkDataTransfer().dt })
    bItems[0].dispatchEvent(over)

    expect(over.dataTransfer?.dropEffect).toBe('none')
  })
})

describe('nativeDrag across two zones', () => {
  let a: Sortable | undefined
  let b: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    a?.destroy()
    b?.destroy()
    a = undefined
    b = undefined
    document.body.innerHTML = ''
    document.getElementById('resortable-drag-cursor')?.remove()
    vi.restoreAllMocks()
  })

  function pair(): {
    ulA: HTMLElement
    ulB: HTMLElement
    aItems: HTMLElement[]
    bItems: HTMLElement[]
  } {
    const ulA = makeList(3)
    const ulB = makeList(3)
    // Distinguish the two lists' ids so an assertion can tell them apart.
    Array.from(ulB.querySelectorAll<HTMLElement>('.item')).forEach((el, i) => {
      el.dataset.id = `b${i + 1}`
    })
    a = new Sortable(ulA, {
      draggable: '.item',
      animation: 0,
      group: 'shared',
      nativeDrag: true,
      multiDrag: true,
    })
    b = new Sortable(ulB, {
      draggable: '.item',
      animation: 0,
      group: 'shared',
      nativeDrag: true,
      multiDrag: true,
    })
    return {
      ulA,
      ulB,
      aItems: Array.from(ulA.querySelectorAll<HTMLElement>('.item')),
      bItems: Array.from(ulB.querySelectorAll<HTMLElement>('.item')),
    }
  }

  it('lands a cross-zone drop where the pointer was, not at the end', () => {
    const { ulB, aItems, bItems } = pair()

    aItems[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    // Enter B over its FIRST item, and drop there.
    bItems[0].dispatchEvent(mkDrag('dragover', { clientX: 5, clientY: 5 }))
    bItems[0].dispatchEvent(mkDrag('drop'))

    // The placeholder lives on the SOURCE manager; reading the target's gave
    // null, skipped the placement block, and left the item wherever the
    // cross-zone entry appended it — always the end.
    expect(ids(ulB)).not.toEqual(['b1', 'b2', 'b3', '1'])
    expect(ids(ulB)).toContain('1')
  })

  it('takes the whole selection across, not just the grabbed item', () => {
    const { ulA, ulB, aItems, bItems } = pair()

    ctrlClick(aItems[0])
    ctrlClick(aItems[1])
    aItems[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    bItems[0].dispatchEvent(mkDrag('dragover', { clientX: 5, clientY: 5 }))

    // Both selected items must leave A and arrive in B. Inserting only the
    // anchor stranded the rest while the end events still reported all of
    // them, so a consumer's model and the DOM diverged.
    expect(ids(ulB)).toContain('1')
    expect(ids(ulB)).toContain('2')
    expect(ids(ulA)).not.toContain('1')
    expect(ids(ulA)).not.toContain('2')
  })

  it('cleans up the SOURCE zone when the drag ends in the target', () => {
    const { ulA, aItems, bItems } = pair()

    ctrlClick(aItems[0])
    ctrlClick(aItems[1])
    aItems[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    bItems[0].dispatchEvent(mkDrag('dragover', { clientX: 5, clientY: 5 }))
    // `dragend` fires on the moved element, which now lives in B — so it
    // reaches B's listener and never A's. The teardown has to be routed back
    // to whichever manager started the drag.
    aItems[0].dispatchEvent(mkDrag('dragend'))

    // The source placeholder must not be left behind in A. It carries the
    // item class, so it would match `draggable` and act as a drop target.
    expect(ulA.querySelector('.sortable-ghost')).toBeNull()
    expect(aItems[1].classList.contains('sortable-multi-drag-source')).toBe(
      false
    )
  })

  it('stops claiming foreign drags once a cross-zone drag has ended', () => {
    const { ulA, aItems, bItems } = pair()

    aItems[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    bItems[0].dispatchEvent(mkDrag('dragover', { clientX: 5, clientY: 5 }))
    aItems[0].dispatchEvent(mkDrag('dragend'))

    // A stuck 'html5-drag' entry would make every later foreign drag over a
    // same-group zone get claimed, and run the move path against stale items.
    const foreign = mkDrag('dragover', { clientX: 5, clientY: 5 })
    ulA.dispatchEvent(foreign)
    expect(foreign.defaultPrevented).toBe(false)
  })
})

describe('nativeDrag with nested sortables', () => {
  let outer: Sortable | undefined
  let inner: Sortable | undefined

  afterEach(() => {
    endAnyDrag()
    inner?.destroy()
    outer?.destroy()
    inner = undefined
    outer = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does not let an outer zone cancel a drag an inner zone started', () => {
    // Both zones use the same `draggable` selector — the self-similar tree
    // pattern. `dragstart` bubbles, so the outer manager sees an event whose
    // target belongs to the inner list.
    const outerUl = document.createElement('ul')
    const host = document.createElement('li')
    host.className = 'item'
    host.dataset.id = 'host'
    const innerUl = document.createElement('ul')
    for (const id of ['i1', 'i2']) {
      const li = document.createElement('li')
      li.className = 'item'
      li.dataset.id = id
      innerUl.appendChild(li)
    }
    host.appendChild(innerUl)
    outerUl.appendChild(host)
    document.body.appendChild(outerUl)

    outer = new Sortable(outerUl, { draggable: '.item', nativeDrag: true })
    inner = new Sortable(innerUl, { draggable: '.item', nativeDrag: true })

    const innerItem = innerUl.querySelector<HTMLElement>('.item')!
    const ev = mkDragStart(mkDataTransfer().dt)
    innerItem.dispatchEvent(ev)

    // Cancelling here aborts the whole drag, and a cancelled dragstart fires
    // no dragend — so the inner zone would keep its placeholder and drag
    // classes for good.
    expect(ev.defaultPrevented).toBe(false)
    expect(innerItem.classList.contains('sortable-chosen')).toBe(true)

    innerItem.dispatchEvent(mkDrag('dragend'))
    expect(innerItem.classList.contains('sortable-chosen')).toBe(false)
  })

  it('recovers when a second dragstart arrives with one still in flight', () => {
    const ul = makeList(3)
    outer = new Sortable(ul, { draggable: '.item', nativeDrag: true })
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.item'))

    items[0].dispatchEvent(mkDragStart(mkDataTransfer().dt))
    // No dragend in between — the first drag was cancelled by something else.
    items[1].dispatchEvent(mkDragStart(mkDataTransfer().dt))

    // The abandoned drag's marks must not be stranded on the first item.
    expect(items[0].classList.contains('sortable-chosen')).toBe(false)
    expect(items[1].classList.contains('sortable-chosen')).toBe(true)
  })
})
