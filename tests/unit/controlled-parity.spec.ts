import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Sortable } from '../../src/index'

/**
 * Unit coverage for the 2026-07 SortableJS-parity fixes driven by the
 * Visibox design-system integration:
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
})
