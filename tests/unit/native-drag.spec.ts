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
