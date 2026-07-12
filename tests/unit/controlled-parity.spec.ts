import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'

/**
 * Unit coverage for the 2026-07 SortableJS-parity fixes driven by the
 * first real-world controlled-mode integration:
 *
 * 1. The placeholder is a CLONE of the dragged item (not a bare gray box),
 *    marked with `data-resortable-placeholder` and excluded from item
 *    queries even though it matches the consumer's `draggable` selector.
 * 2. The ghost is marked with `data-resortable-ghost` and excluded from
 *    item queries (it can live inside the zone when `fallbackOnBody` is
 *    false, where it would otherwise corrupt index math).
 * 3. `multiDragKey` gates click-to-select: plain clicks select nothing and
 *    steal no focus; modifier+click toggles; shift+click extends a range.
 * 4. Dragging an UNselected item does not add it to the selection.
 */

function makeList(count = 4): HTMLElement {
  const ul = document.createElement('ul')
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li')
    li.className = 'item'
    li.id = `it-${i}`
    li.dataset.id = `it-${i}`
    li.textContent = `Item ${i}`
    ul.appendChild(li)
  }
  document.body.appendChild(ul)
  return ul
}

// jsdom lacks the DragEvent / PointerEvent constructors — fall back to a
// plain Event cast, same pattern as controlled-mode.spec.ts.
function mkDrag(type: string): DragEvent {
  try {
    return new DragEvent(type, { bubbles: true, cancelable: true })
  } catch {
    return new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  }
}

function mkPointer(type: string, pointerId = 1): PointerEvent {
  const initProps = {
    pointerId,
    isPrimary: true,
    button: 0,
  }
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
    })
    return ev
  }
}

function drag(from: HTMLElement, over: HTMLElement, drop = true): void {
  from.dispatchEvent(mkDrag('dragstart'))
  over.dispatchEvent(mkDrag('dragover'))
  if (drop) over.dispatchEvent(mkDrag('drop'))
  from.dispatchEvent(mkDrag('dragend'))
}

function click(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  )
}

describe('controlled-mode parity fixes (2026-07)', () => {
  let ul: HTMLElement
  let sortable: Sortable

  beforeEach(() => {
    document.body.innerHTML = ''
    ul = makeList()
  })

  afterEach(() => {
    sortable?.destroy()
  })

  describe('placeholder is a clone of the dragged item', () => {
    it('carries the item classes and content, minus identity attributes', () => {
      sortable = new Sortable(ul, {
        controlled: true,
        draggable: '.item',
        animation: 0,
      })

      const item = ul.children[0] as HTMLElement
      item.dispatchEvent(mkDrag('dragstart'))

      const ph = ul.querySelector<HTMLElement>('[data-resortable-placeholder]')
      expect(ph).not.toBeNull()
      expect(ph!.classList.contains('item')).toBe(true)
      expect(ph!.textContent).toBe('Item 0')
      // Identity stripped — no duplicate id/data-id in the DOM
      expect(ph!.id).toBe('')
      expect(ph!.dataset.id).toBeUndefined()
      expect(document.querySelectorAll('#it-0').length).toBe(1)

      item.dispatchEvent(mkDrag('dragend'))
      expect(ul.querySelector('[data-resortable-placeholder]')).toBeNull()
    })

    it('is excluded from index math even though it matches `draggable`', () => {
      const newIndexes: number[][] = []
      sortable = new Sortable(ul, {
        controlled: true,
        draggable: '.item',
        animation: 0,
        onEnd: (evt) => {
          if (evt.newIndexes) newIndexes.push(evt.newIndexes)
        },
      })

      drag(ul.children[0] as HTMLElement, ul.children[2] as HTMLElement)
      expect(newIndexes).toEqual([[2]])
      // Controlled: consumer DOM untouched
      expect(
        Array.from(ul.querySelectorAll('.item')).map((el) => el.id)
      ).toEqual(['it-0', 'it-1', 'it-2', 'it-3'])
    })
  })

  describe('multiDragKey', () => {
    it('plain click selects nothing and does not steal focus', () => {
      sortable = new Sortable(ul, {
        multiDrag: true,
        multiDragKey: 'meta',
        draggable: '.item',
      })

      const item = ul.children[1] as HTMLElement
      click(item)

      expect(item.classList.contains('sortable-selected')).toBe(false)
      expect(item.getAttribute('aria-selected')).not.toBe('true')
      expect(document.activeElement).not.toBe(item)
    })

    it('modifier+click toggles selection additively', () => {
      sortable = new Sortable(ul, {
        multiDrag: true,
        multiDragKey: 'meta',
        draggable: '.item',
      })

      const a = ul.children[0] as HTMLElement
      const b = ul.children[2] as HTMLElement
      click(a, { metaKey: true })
      click(b, { metaKey: true })
      expect(a.classList.contains('sortable-selected')).toBe(true)
      expect(b.classList.contains('sortable-selected')).toBe(true)

      click(b, { metaKey: true })
      expect(b.classList.contains('sortable-selected')).toBe(false)
      expect(a.classList.contains('sortable-selected')).toBe(true)
    })

    it('with a handle configured, modifier+click selects only via the handle', () => {
      // Give each item a handle child plus other content.
      for (const li of Array.from(ul.children)) {
        const handle = document.createElement('span')
        handle.className = 'grip'
        const body = document.createElement('span')
        body.className = 'body'
        li.append(handle, body)
      }
      sortable = new Sortable(ul, {
        multiDrag: true,
        multiDragKey: 'meta',
        draggable: '.item',
        handle: '.grip',
      })

      const item = ul.children[1] as HTMLElement
      const body = item.querySelector('.body') as HTMLElement
      const grip = item.querySelector('.grip') as HTMLElement

      // Modifier+click on non-handle content (e.g. a nested sortable's
      // items) passes through — the outer item must NOT toggle.
      click(body, { metaKey: true })
      expect(item.classList.contains('sortable-selected')).toBe(false)

      click(grip, { metaKey: true })
      expect(item.classList.contains('sortable-selected')).toBe(true)
    })

    it('shift+click extends a range from the last selection', () => {
      sortable = new Sortable(ul, {
        multiDrag: true,
        multiDragKey: 'meta',
        draggable: '.item',
      })

      click(ul.children[0] as HTMLElement, { metaKey: true })
      click(ul.children[2] as HTMLElement, { shiftKey: true })

      const selected = Array.from(
        ul.querySelectorAll('.sortable-selected')
      ).map((el) => el.id)
      expect(selected).toEqual(['it-0', 'it-1', 'it-2'])
    })

    it('without multiDragKey, plain click still selects (legacy default)', () => {
      sortable = new Sortable(ul, { multiDrag: true, draggable: '.item' })

      const item = ul.children[1] as HTMLElement
      click(item)
      expect(item.classList.contains('sortable-selected')).toBe(true)
    })
  })

  describe('drag does not mutate the selection', () => {
    it('dragging an unselected item leaves the selection untouched', () => {
      sortable = new Sortable(ul, {
        controlled: true,
        multiDrag: true,
        multiDragKey: 'meta',
        draggable: '.item',
        animation: 0,
        // Pointer pipeline commits on pointerdown in this test
        fallbackTolerance: 0,
      })

      // Select it-0 explicitly, then drag it-2 (unselected)
      click(ul.children[0] as HTMLElement, { metaKey: true })
      const dragged = ul.children[2] as HTMLElement
      dragged.dispatchEvent(mkPointer('pointerdown', 1))

      expect(dragged.classList.contains('sortable-selected')).toBe(false)
      expect(
        (ul.children[0] as HTMLElement).classList.contains('sortable-selected')
      ).toBe(true)

      document.dispatchEvent(mkPointer('pointerup', 1))
    })
  })

  describe('ghost exclusion from item queries', () => {
    it('the pointer-pipeline ghost never appears in getItems()', () => {
      sortable = new Sortable(ul, {
        controlled: true,
        draggable: '.item',
        animation: 0,
        fallbackTolerance: 0,
      })

      const dragged = ul.children[1] as HTMLElement
      dragged.dispatchEvent(mkPointer('pointerdown', 2))

      const ghost = document.querySelector<HTMLElement>(
        '[data-resortable-ghost]'
      )
      expect(ghost).not.toBeNull()
      expect(ghost!.classList.contains('item')).toBe(true)
      // Item queries see exactly the four real items
      expect(sortable.dropZone.getItems().map((el) => el.id)).toEqual([
        'it-0',
        'it-1',
        'it-2',
        'it-3',
      ])

      document.dispatchEvent(mkPointer('pointerup', 2))
      expect(document.querySelector('[data-resortable-ghost]')).toBeNull()
    })
  })

  describe('scroll option', () => {
    it('accepts scroll options without error and cleans up on destroy', () => {
      sortable = new Sortable(ul, {
        draggable: '.item',
        scroll: true,
        scrollSensitivity: 200,
        scrollSpeed: 15,
      })
      expect(() => sortable.destroy()).not.toThrow()
    })
  })

  // Autoscroll under a stationary pointer must keep the drop target fresh
  // (jjeff/resortable#124; downstream spaceagetv/missioncontrol#4566).
  //
  // The pointer pipeline resolves the drop target from
  // `document.elementFromPoint(pointer.clientX, pointer.clientY)` on
  // `pointermove`. When a long list autoscrolls under a HELD (non-moving)
  // pointer, no `pointermove` fires, so the target was never recomputed and
  // the drop fell back to the source index. The fix re-resolves on `scroll`.
  describe('autoscroll keeps the drop target fresh (#124)', () => {
    const ITEM_H = 40
    const VIEWPORT_H = 200 // shows 5 rows at a time
    let list: HTMLElement
    let items: HTMLElement[]

    // Build a tall list whose item rects and `elementFromPoint` both track
    // `list.scrollTop`, so scrolling under a stationary pointer changes which
    // row sits beneath a fixed viewport-Y — exactly the real-world geometry.
    function makeScrollList(count: number): void {
      document.body.innerHTML = ''
      list = document.createElement('ul')
      list.style.overflowY = 'auto'
      for (let i = 0; i < count; i++) {
        const li = document.createElement('li')
        li.className = 'item'
        li.id = `it-${i}`
        li.dataset.id = `it-${i}`
        li.textContent = `Item ${i}`
        list.appendChild(li)
      }
      document.body.appendChild(list)
      list.scrollTop = 0

      items = Array.from(list.children) as HTMLElement[]
      list.getBoundingClientRect = () =>
        ({
          top: 0,
          bottom: VIEWPORT_H,
          left: 0,
          right: 200,
          width: 200,
          height: VIEWPORT_H,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
      items.forEach((li, i) => {
        li.getBoundingClientRect = () => {
          const top = i * ITEM_H - list.scrollTop
          return {
            top,
            bottom: top + ITEM_H,
            left: 0,
            right: 200,
            width: 200,
            height: ITEM_H,
            x: 0,
            y: top,
            toJSON: () => ({}),
          } as DOMRect
        }
      })

      // Hit-test that honours the current scroll offset.
      document.elementFromPoint = (_x: number, y: number): Element | null => {
        if (y < 0 || y >= VIEWPORT_H) return list
        const row = Math.floor((y + list.scrollTop) / ITEM_H)
        return items[row] ?? list
      }
    }

    function pointer(type: string, y: number, id = 7): PointerEvent {
      const e = mkPointer(type, id)
      Object.defineProperties(e, {
        clientX: { value: 100, configurable: true },
        clientY: { value: y, configurable: true },
      })
      return e
    }

    // Drag item 0 downward: press, one move to `moveY`, optionally autoscroll
    // to `scrollTo` WITHOUT another move, release. Returns onEnd's newIndex.
    function dragWithOptionalScroll(
      moveY: number,
      scrollTo: number | null
    ): number {
      let ended = -1
      sortable = new Sortable(list, {
        controlled: true,
        draggable: '.item',
        animation: 0,
        fallbackTolerance: 0,
        onEnd: (evt) => {
          ended = evt.newIndex ?? -1
        },
      })

      const dragged = items[0]
      dragged.dispatchEvent(pointer('pointerdown', 0))
      document.dispatchEvent(pointer('pointermove', moveY))
      if (scrollTo !== null) {
        list.scrollTop = scrollTo
        list.dispatchEvent(new Event('scroll', { bubbles: false }))
      }
      document.dispatchEvent(pointer('pointerup', moveY))

      sortable.destroy()
      return ended
    }

    afterEach(() => {
      vi.restoreAllMocks()
      // Restore the real elementFromPoint the shared afterEach can't reach.
      delete (document as unknown as { elementFromPoint?: unknown })
        .elementFromPoint
    })

    it('recomputes the target after the list scrolls under a held pointer', () => {
      // Control: hold the pointer near the bottom edge (row 4), no scroll.
      makeScrollList(12)
      const withoutScroll = dragWithOptionalScroll(180, null)

      // Same held pointer, but the list autoscrolls two viewports down so a
      // much later row (≈ row 9) now sits under the fixed Y. No pointermove.
      makeScrollList(12)
      const withScroll = dragWithOptionalScroll(180, 200)

      // The scrolled drag must land LATER than the un-scrolled one — the
      // target followed the scrolled content instead of freezing.
      expect(withScroll).toBeGreaterThan(withoutScroll)
      // And it must not collapse back to the source row (the #4566 symptom).
      expect(withScroll).toBeGreaterThan(0)
    })
  })
})
