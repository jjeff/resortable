import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'

/**
 * Unit coverage for #130 — `swapThreshold` on the native HTML5 pipeline.
 *
 * The dragged item keeps its DOM slot until drop, so its own rect never
 * overlaps a sibling: any `swapThreshold > 0` used to fail the dragover gate
 * unconditionally (sorting frozen), and `invertSwap` had the mirror bug
 * (every hover swapped). The fix gates on a rect synthesized from the drag
 * cursor: position = clientX/Y minus the grab offset captured at dragstart,
 * size = the item's rect at dragstart.
 *
 * Driven through HTML5 `dragstart` / `dragover` — jsdom dispatches them
 * synchronously (same technique as `on-move.spec.ts`; Playwright's synthetic
 * mouse can only reach the pointer pipeline). jsdom's layout reports
 * zero-size boxes, so `getBoundingClientRect` is stubbed on the items.
 */

function stubRect(
  el: HTMLElement,
  { top = 0, left = 0, width = 100, height = 60 } = {}
): void {
  el.getBoundingClientRect = () => ({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  })
}

interface Layout {
  horizontal?: boolean
}

const lists: HTMLElement[] = []
const sortables: Sortable[] = []

function track(s: Sortable): Sortable {
  sortables.push(s)
  return s
}

/** 4 items, stacked vertically (60px tall) or in a row (100px wide). */
function makeList({ horizontal = false }: Layout = {}): {
  container: HTMLElement
  items: HTMLElement[]
} {
  const container = document.createElement('div')
  const items: HTMLElement[] = []
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `item-${i}`
    el.textContent = `Item ${i}`
    if (horizontal) {
      stubRect(el, { left: i * 100, top: 0 })
    } else {
      stubRect(el, { top: i * 60, left: 0 })
    }
    container.appendChild(el)
    items.push(el)
  }
  document.body.appendChild(container)
  lists.push(container)
  return { container, items }
}

// Some jsdom builds lack the DragEvent constructor — fall back to a plain
// MouseEvent cast (same pattern as on-move.spec.ts). MouseEvent carries the
// clientX/clientY the synthesized-rect gate consumes.
function makeDragEvent(
  type: string,
  clientX: number,
  clientY: number
): DragEvent {
  const init = { bubbles: true, cancelable: true, clientX, clientY }
  try {
    return new DragEvent(type, init)
  } catch {
    return new MouseEvent(type, init) as unknown as DragEvent
  }
}

function drag(el: HTMLElement, clientX: number, clientY: number): void {
  el.dispatchEvent(makeDragEvent('dragstart', clientX, clientY))
}

function over(el: HTMLElement, clientX: number, clientY: number): void {
  el.dispatchEvent(makeDragEvent('dragover', clientX, clientY))
}

describe('swapThreshold on the HTML5 drag pipeline (#130)', () => {
  afterEach(() => {
    // Finish any in-flight drag so globalDragState doesn't carry a stale
    // 'html5-drag' entry into the next test (dragend bubbles to the zone).
    for (const list of lists) {
      list.dispatchEvent(
        new Event('dragend', { bubbles: true, cancelable: true })
      )
    }
    lists.length = 0
    for (const s of sortables) s.destroy()
    sortables.length = 0
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  // Vertical geometry, dragging item-0 (grabbed at its center: 50, 30, so
  // the synthesized rect is [clientY - 30, clientY + 30] on the y-axis)
  // over item-2 which spans y 120..180.

  it('threshold 0.5: pointer well inside the target allows the swap', () => {
    const { container, items } = makeList()
    const onSort = vi.fn()
    const onUpdate = vi.fn()
    track(
      new Sortable(container, {
        animation: 0,
        swapThreshold: 0.5,
        onSort,
        onUpdate,
      })
    )

    drag(items[0], 50, 30)
    // Synthesized rect [120, 180] — overlap with item-2 is 1.0 >= 0.5.
    over(items[2], 50, 150)

    expect(onSort).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('threshold 0.5: pointer barely overlapping the target blocks the swap', () => {
    const { container, items } = makeList()
    const onSort = vi.fn()
    track(new Sortable(container, { animation: 0, swapThreshold: 0.5, onSort }))

    drag(items[0], 50, 30)
    // Synthesized rect [70, 130] — overlap with item-2 is 10/60 ≈ 0.17 < 0.5.
    over(items[2], 50, 100)

    expect(onSort).not.toHaveBeenCalled()
  })

  it('threshold unset: always swaps (unchanged legacy behavior)', () => {
    const { container, items } = makeList()
    const onSort = vi.fn()
    track(new Sortable(container, { animation: 0, onSort }))

    drag(items[0], 50, 30)
    // Barely-overlapping cursor position — irrelevant without a threshold.
    over(items[2], 50, 100)

    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('invertSwap: swaps only when overlap is BELOW the threshold', () => {
    const { container, items } = makeList()
    const onSort = vi.fn()
    track(
      new Sortable(container, {
        animation: 0,
        swapThreshold: 0.5,
        invertSwap: true,
        onSort,
      })
    )

    drag(items[0], 50, 30)

    // Fully over the target (overlap 1.0 >= 0.5) — inverted mode blocks.
    // Before the fix the measured overlap was always 0, so EVERY hover
    // swapped in inverted mode; this asserts the mirror bug is gone.
    over(items[2], 50, 150)
    expect(onSort).not.toHaveBeenCalled()

    // Barely overlapping (0.17 < 0.5) — inverted mode swaps.
    over(items[2], 50, 100)
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('threshold 0.5 on a horizontal layout gates along the x-axis', () => {
    const { container, items } = makeList({ horizontal: true })
    const onSort = vi.fn()
    track(
      new Sortable(container, {
        animation: 0,
        direction: 'horizontal',
        swapThreshold: 0.5,
        onSort,
      })
    )

    // Grab item-0 at its center (50, 30); item-2 spans x 200..300.
    drag(items[0], 50, 30)

    // Synthesized rect [120, 220] — overlap 20/100 = 0.2 < 0.5 → blocked.
    over(items[2], 170, 30)
    expect(onSort).not.toHaveBeenCalled()

    // Synthesized rect [200, 300] — overlap 1.0 >= 0.5 → allowed.
    over(items[2], 250, 30)
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('coordless dragstart leaves the origin unset — gate falls back, never NaN-freezes', () => {
    const { container, items } = makeList()
    const onSort = vi.fn()
    track(
      new Sortable(container, {
        animation: 0,
        swapThreshold: 0.5,
        invertSwap: true,
        onSort,
      })
    )

    // Plain Event: no MouseEvent init, so clientX/clientY are undefined. An
    // unguarded capture would store a NaN grab origin, making every later
    // overlap NaN — NaN fails BOTH `>=` and `<`, freezing even inverted
    // mode despite the dragovers carrying good coordinates. Guarded, the
    // origin stays null and the gate falls back to the parked item's rect
    // (overlap 0), so inverted mode still swaps — the pre-fix fallback
    // behavior, not a NaN freeze.
    items[0].dispatchEvent(
      new Event('dragstart', { bubbles: true, cancelable: true })
    )
    over(items[2], 50, 150)

    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('controlled mode: the synthesized rect drives the handleControlledMove gate', () => {
    const { container, items } = makeList()
    const onSort = vi.fn()
    track(
      new Sortable(container, {
        animation: 0,
        controlled: true,
        swapThreshold: 0.5,
        onSort,
      })
    )

    drag(items[0], 50, 30)

    // Barely overlapping item-2 (0.17 < 0.5) — blocked, no reorder.
    over(items[2], 50, 100)
    expect(onSort).not.toHaveBeenCalled()

    // Fully over item-2 (overlap 1.0 >= 0.5) — the controlled gate passes
    // and the placeholder reorder emits sort. Before the fix this path
    // measured the browser-hidden ghost (zero-size rect → overlap 0).
    over(items[2], 50, 150)
    expect(onSort).toHaveBeenCalledTimes(1)
  })

  it('cross-zone: target zone reads the grab origin from the source manager', () => {
    const { container: a, items: aItems } = makeList()
    const { container: b, items: bItems } = makeList()
    const onSort = vi.fn()
    track(new Sortable(a, { animation: 0, group: 'shared' }))
    track(
      new Sortable(b, {
        animation: 0,
        group: 'shared',
        swapThreshold: 0.5,
        onSort,
      })
    )

    // Grab a's item-0 at its center; b's item-1 spans y 60..120. The origin
    // is captured on a's manager; b's dragover listener must reach it via
    // activeDrag.fromDragManager for its own threshold gate.
    drag(aItems[0], 50, 30)

    // First dragover parks the item in b (cross-zone entry — not gated),
    // but the barely-overlapping cursor (rect [10, 70], overlap 10/60)
    // blocks the same-zone reorder, so no sort fires.
    over(bItems[1], 50, 40)
    expect(onSort).not.toHaveBeenCalled()

    // Cursor centered on b's item-1 (overlap 1.0 >= 0.5) — gate passes.
    over(bItems[1], 50, 90)
    expect(onSort).toHaveBeenCalledTimes(1)
  })
})
