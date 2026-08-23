import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'

/**
 * Unit coverage for #121 — the pointer/PointerEvent drag pipeline had
 * drifted out of parity with the HTML5-native pipeline in two ways:
 *
 * 1. Uncontrolled same-zone reorder only emitted `update`. It now emits
 *    `sort` on every reorder, plus `update` + `change` when the reorder
 *    stays within the drag's source zone — matching the HTML5 `dragover`
 *    handler.
 * 2. The uncontrolled pipeline never consulted `swapThreshold` /
 *    `invertSwap` — it reordered on any hover. It now runs the same
 *    `shouldSwap` overlap gate the HTML5 `dragover` handler uses.
 *
 * Controlled mode's `handleControlledMove` also lost the `emitHtml5Events`
 * flag that used to make controlled-pointer emit `update` only while
 * controlled-HTML5 emitted the full `sort`/`update`/`change` set; both
 * pipelines now emit the same set unconditionally.
 *
 * Driven through the POINTER pipeline with `document.elementFromPoint`
 * stubbed to hit-test a fixed target element — same technique as
 * `hit-area.test.ts` and the autoscroll suite in `controlled-parity.spec.ts`.
 * `swapThreshold`'s overlap math additionally needs real
 * `getBoundingClientRect` rects, stubbed directly on the dragged/target
 * elements (jsdom's own layout always reports zero-size boxes).
 */

function makeList(count = 4): HTMLElement {
  const ul = document.createElement('ul')
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li')
    li.className = 'item'
    li.dataset.id = `it-${i}`
    li.textContent = `Item ${i}`
    ul.appendChild(li)
  }
  document.body.appendChild(ul)
  return ul
}

// jsdom lacks the PointerEvent constructor in some CI configurations — fall
// back to a plain MouseEvent cast, same pattern as controlled-parity.spec.ts.
function mkPointer(type: string, pointerId = 1): PointerEvent {
  try {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      isPrimary: true,
      button: 0,
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
    })
    return ev
  }
}

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

// A 100x60 box in a row — every item shares the same top/bottom, which is
// what makes the layout horizontal and what the vertical-axis math misreads.
function hRect(left: number): DOMRect {
  return {
    top: 0,
    bottom: 60,
    left,
    right: left + 100,
    width: 100,
    height: 60,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }
}

describe('pointer/HTML5 event parity (#121)', () => {
  let sortable: Sortable | undefined

  afterEach(() => {
    sortable?.destroy()
    sortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint
  })

  it('uncontrolled same-zone reorder fires sort, update, AND change', () => {
    const ul = makeList()
    const sortSpy = vi.fn()
    const updateSpy = vi.fn()
    const changeSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      onSort: sortSpy,
      onUpdate: updateSpy,
      onChange: changeSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 1))
    document.dispatchEvent(mkPointer('pointermove', 1))
    document.dispatchEvent(mkPointer('pointerup', 1))

    expect(sortSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(changeSpy).toHaveBeenCalledTimes(1)
  })

  it('uncontrolled same-zone reorder respects swapThreshold', () => {
    const ul = makeList()
    const sortSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      swapThreshold: 0.9,
      onSort: sortSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    target.getBoundingClientRect = () => rect(80, 120)
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 2))

    // The gate measures the GHOST, not the still-parked dragged item —
    // nothing moves `dragged` until a swap commits, so its rect stays put
    // for the whole hover. The ghost is the cursor-following visual, so
    // it's the only element whose rect actually changes as the drag
    // progresses (matches `data-resortable-ghost`, see GhostManager).
    const ghost = document.querySelector<HTMLElement>('[data-resortable-ghost]')
    expect(ghost).not.toBeNull()

    // Barely overlapping the target row (1px of 40px = 2.5%) — well under
    // the 0.9 threshold. No reorder, no events.
    ghost!.getBoundingClientRect = () => rect(119, 159)
    document.dispatchEvent(mkPointer('pointermove', 2))
    expect(sortSpy).not.toHaveBeenCalled()
    expect(ul.children[0]).toBe(dragged)

    // Full overlap with the target row — clears the 0.9 threshold.
    ghost!.getBoundingClientRect = () => rect(80, 120)
    document.dispatchEvent(mkPointer('pointermove', 2))
    expect(sortSpy).toHaveBeenCalledTimes(1)

    document.dispatchEvent(mkPointer('pointerup', 2))
  })

  it('measures the real layout axis, so a horizontal row + invertSwap still reorders', () => {
    // Regression: `shouldSwap` used to branch on the `direction` OPTION,
    // which defaults to 'vertical' and is never auto-detected. On a row every
    // item shares a top and bottom, so vertical overlap computes to ~1.0 —
    // `invertSwap` then evaluates `1.0 < threshold` as false on every move
    // and the list freezes for the entire drag. The axis is now measured.
    const ul = makeList()
    const sortSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      swapThreshold: 0.5,
      invertSwap: true,
      onSort: sortSpy,
      // `direction` deliberately left at its default — that IS the bug.
    })

    // Lay the items out as a row: shared top/bottom, side-by-side columns.
    Array.from(ul.children).forEach((el, i) => {
      ;(el as HTMLElement).getBoundingClientRect = () => hRect(i * 100)
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 4))
    const ghost = document.querySelector<HTMLElement>('[data-resortable-ghost]')
    expect(ghost).not.toBeNull()

    // Ghost overlaps the target column by 10% — under the 0.5 inverted
    // threshold, so an inverted swap SHOULD fire. Read on the wrong axis this
    // is ~100% overlap and nothing happens at all.
    ghost!.getBoundingClientRect = () => hRect(290)
    document.dispatchEvent(mkPointer('pointermove', 4))

    expect(sortSpy).toHaveBeenCalledTimes(1)
    document.dispatchEvent(mkPointer('pointerup', 4))
  })

  it('reports oldIndex against the destination list when reordering after a cross-zone move', () => {
    // Regression: `sort` now fires for reorders inside a DESTINATION zone,
    // where `startIndex` is an index into the ORIGINAL zone — so the payload
    // claimed `from`/`to` were zone B while `oldIndex` indexed zone A.
    const from = makeList(3)
    const to = makeList(3)
    Array.from(to.children).forEach((el, i) => {
      ;(el as HTMLElement).dataset.id = `to-${i}`
    })
    const sortSpy = vi.fn()
    const opts = { draggable: '.item', animation: 0, fallbackTolerance: 0 }
    sortable = new Sortable(from, { ...opts, group: 'shared' })
    const toSortable = new Sortable(to, {
      ...opts,
      group: 'shared',
      onSort: sortSpy,
    })

    try {
      // Index 2 in the SOURCE list, so that its index in the destination
      // (0, see below) differs — otherwise the buggy and correct values
      // coincide and the test proves nothing.
      const dragged = from.children[2] as HTMLElement
      let hit = to.children[0] as HTMLElement
      document.elementFromPoint = () => hit

      // Enter zone B — inserts before B's first item, so it lands at index 0.
      dragged.dispatchEvent(mkPointer('pointerdown', 5))
      document.dispatchEvent(mkPointer('pointermove', 5))
      expect(dragged.parentElement).toBe(to)
      expect(Array.from(to.children).indexOf(dragged)).toBe(0)

      // Now reorder WITHIN B, hovering B's last item.
      hit = to.children[to.children.length - 1] as HTMLElement
      document.dispatchEvent(mkPointer('pointermove', 5))
      document.dispatchEvent(mkPointer('pointerup', 5))

      expect(sortSpy).toHaveBeenCalled()
      const payload = sortSpy.mock.calls[0][0] as {
        from: HTMLElement
        to: HTMLElement
        oldIndex: number
      }
      expect(payload.from).toBe(to)
      expect(payload.to).toBe(to)
      // The item's live index in B — NOT its index back in the source list.
      expect(payload.oldIndex).toBe(0)
    } finally {
      toSortable.destroy()
    }
  })

  it('controlled pointer mode fires sort AND change too', () => {
    const ul = makeList()
    const sortSpy = vi.fn()
    const changeSpy = vi.fn()
    sortable = new Sortable(ul, {
      controlled: true,
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      onSort: sortSpy,
      onChange: changeSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 3))
    document.dispatchEvent(mkPointer('pointermove', 3))
    document.dispatchEvent(mkPointer('pointerup', 3))

    expect(sortSpy).toHaveBeenCalledTimes(1)
    expect(changeSpy).toHaveBeenCalledTimes(1)
  })
})
