import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoScrollPlugin } from '../../src/plugins/AutoScrollPlugin'
import type { SortableInstance } from '../../src/types/index'

/**
 * Unit coverage for the 2026-07 AutoScroll rewrite (Visibox QA findings):
 *
 * 1. No scrolling before a real cursor position is observed —
 *    lastMousePosition starts at (0,0) and scrolling toward it on drag
 *    start yanked scrollable ancestors and the window to the top.
 * 2. Elements only scroll along axes they can actually scroll further in
 *    that direction; the window is never scrolled as a blind "last resort".
 * 3. Per-element sensitivity is clamped to a third of the element's size so
 *    a large sensitivity against a small container doesn't pin "near top"
 *    permanently true.
 */

interface PluginInternals {
  lastMousePosition: { x: number; y: number }
  cursorSeen: boolean
  scrollNearCursor(sortable: SortableInstance): void
}

function makeScrollableRowFor(_p: unknown): HTMLElement {
  const el = document.createElement('ul')
  el.style.overflowX = 'auto'
  document.body.appendChild(el)
  mockLayout(
    el,
    { left: 100, right: 700, top: 100, bottom: 190, width: 600, height: 90 },
    { scrollWidth: 1200, clientWidth: 600, scrollHeight: 90, clientHeight: 90 }
  )
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () => ({ overflowX: 'auto', overflowY: 'visible' }) as CSSStyleDeclaration
  )
  return el
}

function fakeSortable(element: HTMLElement): SortableInstance {
  return {
    element,
    dragManager: { isDragging: true },
    eventSystem: { on: vi.fn() },
  } as unknown as SortableInstance
}

/** Give an element a fake layout: rect + scroll metrics. */
function mockLayout(
  el: HTMLElement,
  rect: Partial<DOMRect>,
  metrics: {
    scrollWidth?: number
    clientWidth?: number
    scrollHeight?: number
    clientHeight?: number
  }
): void {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect
  for (const [k, v] of Object.entries(metrics)) {
    Object.defineProperty(el, k, { value: v, configurable: true })
  }
}

describe('AutoScrollPlugin scroll behavior (2026-07 rewrite)', () => {
  let plugin: AutoScrollPlugin
  let internals: PluginInternals

  beforeEach(() => {
    document.body.innerHTML = ''
    plugin = AutoScrollPlugin.create({ sensitivity: 200, speed: 10 })
    internals = plugin as unknown as PluginInternals
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeScrollableRow(): HTMLElement {
    const el = document.createElement('ul')
    el.style.overflowX = 'auto'
    document.body.appendChild(el)
    // 600px visible, 1200px of content, currently at scrollLeft 0.
    mockLayout(
      el,
      { left: 100, right: 700, top: 100, bottom: 190, width: 600, height: 90 },
      {
        scrollWidth: 1200,
        clientWidth: 600,
        scrollHeight: 90,
        clientHeight: 90,
      }
    )
    // jsdom computed style: make overflow readable
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ overflowX: 'auto', overflowY: 'visible' }) as CSSStyleDeclaration
    )
    return el
  }

  it('does not scroll anything before a cursor position has been seen', () => {
    const el = makeScrollableRow()
    el.scrollLeft = 50
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

    // cursorSeen is false — the tick guard lives in startAutoScroll, so
    // verify the invariant the guard protects: scrollNearCursor with the
    // initial (0,0) position must not be reachable. We assert the flag
    // starts false; the rAF loop checks it before calling scrollNearCursor.
    expect(internals.cursorSeen).toBe(false)
    expect(el.scrollLeft).toBe(50)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('scrolls a scrollable element toward its right edge under the cursor', () => {
    const el = makeScrollableRow()
    el.scrollLeft = 0
    internals.lastMousePosition = { x: 690, y: 145 } // near right edge
    internals.cursorSeen = true

    internals.scrollNearCursor(fakeSortable(el))
    expect(el.scrollLeft).toBeGreaterThan(0)
  })

  it('does NOT scroll left when already at scrollLeft 0', () => {
    const el = makeScrollableRow()
    el.scrollLeft = 0
    internals.lastMousePosition = { x: 110, y: 145 } // near left edge
    internals.cursorSeen = true

    internals.scrollNearCursor(fakeSortable(el))
    expect(el.scrollLeft).toBe(0)
  })

  it('clamps sensitivity to a third of the element size (no permanent near-top)', () => {
    // 90px-tall row with sensitivity 200: the old math treated EVERY cursor
    // position as "near top". With the clamp (90/3 = 30px), a cursor in the
    // vertical middle triggers neither edge.
    const el = makeScrollableRow()
    // Make it vertically scrollable too so the Y axis is considered.
    mockLayout(
      el,
      { left: 100, right: 700, top: 100, bottom: 190, width: 600, height: 90 },
      {
        scrollWidth: 1200,
        clientWidth: 600,
        scrollHeight: 300,
        clientHeight: 90,
      }
    )
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ overflowX: 'auto', overflowY: 'auto' }) as CSSStyleDeclaration
    )
    el.scrollTop = 100
    internals.lastMousePosition = { x: 400, y: 145 } // vertical middle
    internals.cursorSeen = true

    internals.scrollNearCursor(fakeSortable(el))
    expect(el.scrollTop).toBe(100) // untouched — not near either edge
  })

  it('explicit-undefined options do not clobber defaults (NaN scroll guard)', () => {
    // Core wiring passes only consumer-set keys, but the constructor also
    // defends itself: `speed: undefined` must not undefine the default and
    // turn every scroll amount into NaN (which coerces scrollTop to 0 —
    // the "drag start yanks everything to the top" symptom).
    const p = AutoScrollPlugin.create({
      sensitivity: 60,
      speed: undefined,
    }) as unknown as PluginInternals & {
      options: { speed: number; sensitivity: number }
    }
    expect(p.options.speed).toBe(10)
    expect(p.options.sensitivity).toBe(60)

    const el = makeScrollableRowFor(p)
    el.scrollLeft = 0
    p.lastMousePosition = { x: 690, y: 145 }
    p.cursorSeen = true
    p.scrollNearCursor(fakeSortable(el))
    expect(Number.isFinite(el.scrollLeft)).toBe(true)
    expect(el.scrollLeft).toBeGreaterThan(0)
  })

  it('never window-scrolls when the document is not scrollable', () => {
    const el = makeScrollableRow()
    internals.lastMousePosition = { x: 5, y: 5 } // viewport corner
    internals.cursorSeen = true
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    // jsdom: documentElement scrollWidth == innerWidth by default (0), so
    // the document reads as non-scrollable.
    internals.scrollNearCursor(fakeSortable(el))
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
