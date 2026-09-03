import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'

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
