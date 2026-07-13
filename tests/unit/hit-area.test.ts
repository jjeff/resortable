import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'
import type { SortableEvent } from '../../src/types/index'

/**
 * `hitArea` (#126): a non-empty zone claims drops that land anywhere inside a
 * surrounding region (`zoneEl.closest(hitArea)`) but over no zone/item, and
 * inserts at the nearest end.
 *
 * Driven through the POINTER pipeline (where `findSortableContainerUnder`
 * lives) with `document.elementFromPoint` + `getBoundingClientRect` mocked —
 * the same technique the autoscroll parity suite uses. Real geometry is
 * covered in e2e.
 */

const CLIPS_RECT = {
  left: 100,
  right: 160,
  top: 0,
  bottom: 40,
  width: 60,
  height: 40,
  x: 100,
  y: 0,
  toJSON: () => ({}),
} as DOMRect

function mkPointer(type: string, clientX: number, id = 3): PointerEvent {
  let e: PointerEvent
  try {
    e = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      isPrimary: true,
      button: 0,
    })
  } catch {
    e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
    }) as unknown as PointerEvent
    Object.defineProperties(e, {
      pointerId: { value: id },
      isPrimary: { value: true },
    })
  }
  Object.defineProperties(e, {
    clientX: { value: clientX, configurable: true },
    clientY: { value: 20, configurable: true },
  })
  return e
}

/**
 * Two horizontal song rows. Each song's clip list (`ul.clips`) is a zone whose
 * `hitArea` is the surrounding `.song`. The clip list sits at x∈[100,160]; the
 * song body (title) is to its left, outside the zone rect.
 */
function buildSongs(): {
  clipsA: HTMLElement
  clipsB: HTMLElement
  bodyB: HTMLElement
} {
  document.body.innerHTML = ''
  const make = (id: string): { song: HTMLElement; clips: HTMLElement } => {
    const song = document.createElement('li')
    song.className = 'song'
    const body = document.createElement('span')
    body.className = 'body'
    body.textContent = `title ${id}`
    const clips = document.createElement('ul')
    clips.className = 'clips'
    const clip = document.createElement('li')
    clip.className = 'clip'
    clip.dataset.id = `${id}1`
    clip.textContent = `${id}1`
    clips.appendChild(clip)
    song.append(body, clips)
    document.body.appendChild(song)
    clips.getBoundingClientRect = () => CLIPS_RECT
    return { song, clips }
  }
  const a = make('a')
  const b = make('b')
  return {
    clipsA: a.clips,
    clipsB: b.clips,
    bodyB: b.song.querySelector<HTMLElement>('.body')!,
  }
}

/** Drag clip a1 out of clipsA, hover over `hoverEl` at x=`clientX`, release. */
function dragToBody(
  clipsA: HTMLElement,
  clipsB: HTMLElement,
  hoverEl: HTMLElement,
  clientX: number,
  group = 'clips'
): { srcA: Sortable; srcB: Sortable; end?: SortableEvent } {
  let end: SortableEvent | undefined
  const opts = {
    controlled: true,
    draggable: '.clip',
    direction: 'horizontal' as const,
    animation: 0,
    fallbackTolerance: 0,
    group,
    hitArea: '.song',
  }
  const srcA = new Sortable(clipsA, { ...opts, onEnd: (e) => (end = e) })
  const srcB = new Sortable(clipsB, opts)

  document.elementFromPoint = () => hoverEl
  const dragged = clipsA.querySelector<HTMLElement>('.clip')!
  dragged.dispatchEvent(mkPointer('pointerdown', clientX))
  document.dispatchEvent(mkPointer('pointermove', clientX))
  document.dispatchEvent(mkPointer('pointerup', clientX))
  return { srcA, srcB, end }
}

describe('hitArea option (#126)', () => {
  let srcs: Sortable[] = []
  const track = <T extends { srcA: Sortable; srcB: Sortable }>(r: T): T => {
    srcs.push(r.srcA, r.srcB)
    return r
  }

  afterEach(() => {
    srcs.forEach((s) => s.destroy())
    srcs = []
    vi.restoreAllMocks()
    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint
  })

  it('a drop on the song body left of the clip list inserts at index 0', () => {
    const { clipsA, clipsB, bodyB } = buildSongs()
    // clientX=10 is left of clipsB (left=100) → nearest end is the start.
    const { end } = track(dragToBody(clipsA, clipsB, bodyB, 10))
    expect(end?.to).toBe(clipsB)
    expect(end?.newIndex).toBe(0)
  })

  it('a drop past the clip list appends (nearest end = end)', () => {
    const { clipsA, clipsB, bodyB } = buildSongs()
    // clientX=500 is right of clipsB → append after its 1 existing clip.
    const { end } = track(dragToBody(clipsA, clipsB, bodyB, 500))
    expect(end?.to).toBe(clipsB)
    expect(end?.newIndex).toBe(1)
  })

  it('does not claim the drop when group rules reject it (no hitArea resolve)', () => {
    const { clipsA, clipsB, bodyB } = buildSongs()
    // Give clipsB an incompatible group so canDropInZone fails: the hitArea
    // pass skips it and the drag reverts to the source list unchanged.
    const opts = {
      controlled: true,
      draggable: '.clip',
      direction: 'horizontal' as const,
      animation: 0,
      fallbackTolerance: 0,
      hitArea: '.song',
    }
    let end: SortableEvent | undefined
    const srcA = new Sortable(clipsA, {
      ...opts,
      group: 'clips',
      onEnd: (e) => (end = e),
    })
    const srcB = new Sortable(clipsB, { ...opts, group: 'other' })
    srcs.push(srcA, srcB)

    document.elementFromPoint = () => bodyB
    const dragged = clipsA.querySelector<HTMLElement>('.clip')!
    dragged.dispatchEvent(mkPointer('pointerdown', 10))
    document.dispatchEvent(mkPointer('pointermove', 10))
    document.dispatchEvent(mkPointer('pointerup', 10))

    // Rejected target → stays in source list (to === from, index unchanged).
    expect(end?.to).toBe(clipsA)
    expect(end?.newIndex).toBe(0)
  })

  it('fails closed on a malformed hitArea selector (no throw, drag reverts)', () => {
    const { clipsA, clipsB, bodyB } = buildSongs()
    const opts = {
      controlled: true,
      draggable: '.clip',
      direction: 'horizontal' as const,
      animation: 0,
      fallbackTolerance: 0,
      group: 'clips',
    }
    let end: SortableEvent | undefined
    const srcA = new Sortable(clipsA, {
      ...opts,
      hitArea: '.song',
      onEnd: (e) => (end = e),
    })
    // `:::bad:::` throws in `closest()` — the pass must catch and skip it.
    const srcB = new Sortable(clipsB, { ...opts, hitArea: ':::bad:::' })
    srcs.push(srcA, srcB)

    document.elementFromPoint = () => bodyB
    const dragged = clipsA.querySelector<HTMLElement>('.clip')!
    expect(() => {
      dragged.dispatchEvent(mkPointer('pointerdown', 10))
      document.dispatchEvent(mkPointer('pointermove', 10))
      document.dispatchEvent(mkPointer('pointerup', 10))
    }).not.toThrow()
    // clipsB's bad selector is skipped → no resolution → reverts to source.
    expect(end?.to).toBe(clipsA)
  })

  it('ignores (0,0) synthetic coords instead of forcing index 0', () => {
    const { clipsA, clipsB, bodyB } = buildSongs()
    // Vertical zone whose top edge is BELOW 0. Without the (0,0) coord gate,
    // `clientY(0) < rect.top(50)` would wrongly route to index 0.
    clipsB.getBoundingClientRect = () =>
      ({ ...CLIPS_RECT, top: 50, bottom: 90, y: 50 }) as DOMRect
    const opts = {
      controlled: true,
      draggable: '.clip',
      direction: 'vertical' as const,
      animation: 0,
      fallbackTolerance: 0,
      group: 'clips',
      hitArea: '.song',
    }
    let end: SortableEvent | undefined
    const srcA = new Sortable(clipsA, { ...opts, onEnd: (e) => (end = e) })
    const srcB = new Sortable(clipsB, opts)
    srcs.push(srcA, srcB)

    // Events at true (0,0) — "no usable coords", must append not prepend.
    const at00 = (type: string): PointerEvent => {
      const e = mkPointer(type, 0)
      Object.defineProperty(e, 'clientY', { value: 0, configurable: true })
      return e
    }
    document.elementFromPoint = () => bodyB
    const dragged = clipsA.querySelector<HTMLElement>('.clip')!
    dragged.dispatchEvent(at00('pointerdown'))
    document.dispatchEvent(at00('pointermove'))
    document.dispatchEvent(at00('pointerup'))

    expect(end?.to).toBe(clipsB)
    expect(end?.newIndex).toBe(1)
  })
})
