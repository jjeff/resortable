import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'
import type { SortableEvent } from '../../src/types/index'

/**
 * Controlled mode (`controlled: true`) — the library never structurally
 * moves consumer-owned nodes. See docs/plans/2026-07-09-controlled-mode-design.md.
 *
 * THE invariant asserted throughout: when `end` / `add` / `remove` fire, the
 * container's DOM is byte-identical to its pre-drag state; the events carry
 * the intent (`oldIndex(es)` / `newIndex(es)`) instead.
 *
 * We drive the HTML5 pipeline (jsdom dispatches drag events synchronously)
 * and the keyboard pipeline. The pointer pipeline shares
 * `handleControlledMove` with HTML5 and gets geometry-real coverage in e2e.
 */

function createContainer(id: string, count = 4): HTMLElement {
  const container = document.createElement('div')
  container.id = id
  for (let i = 1; i <= count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `${id}-${i}`
    el.textContent = `Item ${i}`
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

function makeDragEvent(type: string, init: DragEventInit = {}): DragEvent {
  try {
    return new DragEvent(type, { bubbles: true, cancelable: true, ...init })
  } catch {
    return new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  }
}

function ids(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.sortable-item')).map(
    (el) => (el as HTMLElement).dataset.id ?? ''
  )
}

/** Full same-zone HTML5 drag: item → dragover target → drop → dragend */
function html5Drag(item: HTMLElement, overTarget: HTMLElement): void {
  item.dispatchEvent(makeDragEvent('dragstart'))
  overTarget.dispatchEvent(makeDragEvent('dragover'))
  overTarget.dispatchEvent(makeDragEvent('drop'))
  item.dispatchEvent(makeDragEvent('dragend'))
}

describe('controlled mode', () => {
  let container: HTMLElement
  let sortable: Sortable
  let others: Sortable[]

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer('list')
    others = []
  })

  afterEach(() => {
    sortable?.destroy()
    others.forEach((s) => s.destroy())
  })

  describe('HTML5 pipeline, same list', () => {
    it('never mutates consumer DOM: order identical at end-event time and after the drag', () => {
      const domAtEnd: string[][] = []
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onEnd: () => domAtEnd.push(ids(container)),
      })
      const before = ids(container)

      const item1 = container.children[0] as HTMLElement
      const item3 = container.children[3] as HTMLElement
      html5Drag(item1, item3)

      expect(domAtEnd).toEqual([before])
      expect(ids(container)).toEqual(before)
      // No placeholder or hidden-item residue
      expect(
        container.querySelector('[data-resortable-placeholder]')
      ).toBeNull()
      expect(container.querySelector('.sortable-controlled-hidden')).toBeNull()
    })

    it('end carries the intent: oldIndex/newIndex + oldIndexes/newIndexes', () => {
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onEnd,
      })

      const item1 = container.children[0] as HTMLElement
      const item3 = container.children[3] as HTMLElement // data-id list-4? index 3 → 'list-4'... children[3] is item 4
      html5Drag(item1, item3)

      expect(onEnd).toHaveBeenCalledTimes(1)
      const evt = onEnd.mock.calls[0][0]
      expect(evt.oldIndex).toBe(0)
      // Placeholder ends after children[3] hmm — inserted before/after by drag direction
      expect(evt.newIndex).toBeGreaterThan(0)
      expect(evt.oldIndexes).toEqual([0])
      expect(evt.newIndexes).toEqual([evt.newIndex])
      expect(evt.from).toBe(container)
      expect(evt.to).toBe(container)
    })

    it('mid-drag placeholder is marked and gone by dragend', () => {
      sortable = new Sortable(container, { animation: 0, controlled: true })
      const item1 = container.children[0] as HTMLElement
      const item3 = container.children[2] as HTMLElement

      item1.dispatchEvent(makeDragEvent('dragstart'))
      expect(
        container.querySelector('[data-resortable-placeholder]')
      ).not.toBeNull()

      item3.dispatchEvent(makeDragEvent('dragover'))
      item3.dispatchEvent(makeDragEvent('drop'))
      item1.dispatchEvent(makeDragEvent('dragend'))
      expect(document.querySelector('[data-resortable-placeholder]')).toBeNull()
    })

    it('dragend without drop = cancel: newIndex equals oldIndex', () => {
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onEnd,
      })
      const item1 = container.children[0] as HTMLElement
      const item3 = container.children[2] as HTMLElement

      item1.dispatchEvent(makeDragEvent('dragstart'))
      item3.dispatchEvent(makeDragEvent('dragover'))
      // No drop — e.g. Escape / released outside
      item1.dispatchEvent(makeDragEvent('dragend'))

      const evt = onEnd.mock.calls[0][0]
      expect(evt.newIndex).toBe(evt.oldIndex)
      expect(ids(container)).toEqual(['list-1', 'list-2', 'list-3', 'list-4'])
    })

    it('onMove returning false cancels the placeholder move', () => {
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      const onUpdate = vi.fn()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onMove: () => false,
        onUpdate,
        onEnd,
      })
      const item1 = container.children[0] as HTMLElement
      const item3 = container.children[2] as HTMLElement
      html5Drag(item1, item3)

      expect(onUpdate).not.toHaveBeenCalled()
      const evt = onEnd.mock.calls[0][0]
      expect(evt.newIndex).toBe(evt.oldIndex)
    })

    it('emits mid-drag update/sort/change with pending indices (HTML5 parity)', () => {
      const onUpdate = vi.fn<(evt: SortableEvent) => void>()
      const onSort = vi.fn()
      const onChange = vi.fn()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onUpdate,
        onSort,
        onChange,
      })
      const item1 = container.children[0] as HTMLElement
      const item3 = container.children[2] as HTMLElement

      item1.dispatchEvent(makeDragEvent('dragstart'))
      item3.dispatchEvent(makeDragEvent('dragover'))

      expect(onSort).toHaveBeenCalled()
      expect(onUpdate).toHaveBeenCalled()
      expect(onChange).toHaveBeenCalled()
      const evt = onUpdate.mock.calls[0][0]
      expect(evt.oldIndex).toBe(0)
      expect(evt.newIndex).toBe(2) // placeholder lands after item-3 (index 2 excl. dragged)
      // Cleanup
      item1.dispatchEvent(makeDragEvent('dragend'))
    })
  })

  describe('HTML5 pipeline, cross-list', () => {
    let target: HTMLElement
    let targetSortable: Sortable

    beforeEach(() => {
      target = createContainer('other', 3)
    })

    type EventMock = ReturnType<typeof vi.fn<(evt: SortableEvent) => void>>

    function makePair(
      sourceGroup: unknown = 'shared',
      targetGroup: unknown = 'shared'
    ): {
      onAdd: EventMock
      onRemove: EventMock
      onEnd: EventMock
      onClone: EventMock
    } {
      const onAdd = vi.fn<(evt: SortableEvent) => void>()
      const onRemove = vi.fn<(evt: SortableEvent) => void>()
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      const onClone = vi.fn<(evt: SortableEvent) => void>()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        group: sourceGroup as never,
        onRemove,
        onEnd,
        onClone,
      })
      targetSortable = new Sortable(target, {
        animation: 0,
        controlled: true,
        group: targetGroup as never,
        onAdd,
      })
      others.push(targetSortable)
      return { onAdd, onRemove, onEnd, onClone }
    }

    it('move between lists: remove/add/end carry intent, both DOMs untouched', () => {
      const { onAdd, onRemove, onEnd } = makePair()
      const sourceBefore = ids(container)
      const targetBefore = ids(target)

      const item2 = container.children[1] as HTMLElement
      const targetItem2 = target.children[1] as HTMLElement

      item2.dispatchEvent(makeDragEvent('dragstart'))
      targetItem2.dispatchEvent(makeDragEvent('dragover'))
      targetItem2.dispatchEvent(makeDragEvent('drop'))
      item2.dispatchEvent(makeDragEvent('dragend'))

      // DOM invariant on both sides
      expect(ids(container)).toEqual(sourceBefore)
      expect(ids(target)).toEqual(targetBefore)

      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(onAdd).toHaveBeenCalledTimes(1)
      const removeEvt = onRemove.mock.calls[0][0]
      expect(removeEvt.from).toBe(container)
      expect(removeEvt.to).toBe(target)
      expect(removeEvt.oldIndex).toBe(1)
      expect(removeEvt.newIndex).toBe(1) // placeholder inserted before target item 2
      expect(removeEvt.oldIndexes).toEqual([1])
      expect(removeEvt.newIndexes).toEqual([1])

      const addEvt = onAdd.mock.calls[0][0]
      expect(addEvt.to).toBe(target)
      expect(addEvt.newIndex).toBe(1)

      const endEvt = onEnd.mock.calls[0][0]
      expect(endEvt.to).toBe(target)
      expect(endEvt.newIndex).toBe(1)
    })

    it('clone mode creates no clone node; clone + add report pullMode clone', () => {
      const { onAdd, onRemove, onClone } = makePair(
        { name: 'shared', pull: 'clone' },
        'shared'
      )

      const item1 = container.children[0] as HTMLElement
      const targetItem1 = target.children[0] as HTMLElement

      item1.dispatchEvent(makeDragEvent('dragstart'))
      targetItem1.dispatchEvent(makeDragEvent('dragover'))
      targetItem1.dispatchEvent(makeDragEvent('drop'))
      item1.dispatchEvent(makeDragEvent('dragend'))

      // No clone node materialized anywhere
      expect(ids(container)).toEqual(['list-1', 'list-2', 'list-3', 'list-4'])
      expect(ids(target)).toEqual(['other-1', 'other-2', 'other-3'])

      expect(onClone).toHaveBeenCalledTimes(1)
      expect(onClone.mock.calls[0][0].pullMode).toBe('clone')
      expect(onRemove).not.toHaveBeenCalled()
      expect(onAdd).toHaveBeenCalledTimes(1)
      expect(onAdd.mock.calls[0][0].pullMode).toBe('clone')
    })
  })

  describe('keyboard pipeline', () => {
    function press(el: HTMLElement, key: string): void {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      )
    }

    it('grab → ArrowDown → Enter emits intent; DOM untouched', () => {
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      const domAtEnd: string[][] = []
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onEnd: (evt) => {
          onEnd(evt)
          domAtEnd.push(ids(container))
        },
      })
      const before = ids(container)
      const item2 = container.children[1] as HTMLElement

      item2.dispatchEvent(new MouseEvent('click', { bubbles: true })) // select + focus
      press(item2, 'Enter') // grab
      press(container, 'ArrowDown')
      press(container, 'Enter') // drop

      expect(onEnd).toHaveBeenCalledTimes(1)
      const evt = onEnd.mock.calls[0][0]
      expect(evt.oldIndex).toBe(1)
      expect(evt.newIndex).toBe(2)
      expect(evt.oldIndexes).toEqual([1])
      expect(evt.newIndexes).toEqual([2])
      expect(domAtEnd).toEqual([before])
      expect(ids(container)).toEqual(before)
      expect(
        container.querySelector('[data-resortable-placeholder]')
      ).toBeNull()
      expect(container.querySelector('.sortable-controlled-hidden')).toBeNull()
    })

    it('Escape cancels: newIndex equals oldIndex, DOM untouched', () => {
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        onEnd,
      })
      const before = ids(container)
      const item2 = container.children[1] as HTMLElement

      item2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      press(item2, 'Enter')
      press(container, 'ArrowDown')
      press(container, 'Escape')

      const evt = onEnd.mock.calls[0][0]
      expect(evt.newIndex).toBe(evt.oldIndex)
      expect(ids(container)).toEqual(before)
      expect(container.querySelector('.sortable-controlled-hidden')).toBeNull()
    })

    it('multi-drag: contiguous newIndexes for multiple grabbed items', () => {
      const onEnd = vi.fn<(evt: SortableEvent) => void>()
      sortable = new Sortable(container, {
        animation: 0,
        controlled: true,
        multiDrag: true,
        onEnd,
      })
      const item1 = container.children[0] as HTMLElement
      const item2 = container.children[1] as HTMLElement

      // multiDrag plain click toggles additively
      item1.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      item2.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      press(item2, 'Enter') // grab both
      press(container, 'ArrowDown')
      press(container, 'Enter')

      const evt = onEnd.mock.calls[0][0]
      expect(evt.items).toHaveLength(2)
      expect(evt.oldIndexes).toEqual([0, 1])
      const newIndex = evt.newIndex ?? -1
      expect(newIndex).toBeGreaterThanOrEqual(0)
      expect(evt.newIndexes).toEqual([newIndex, newIndex + 1])
      expect(ids(container)).toEqual(['list-1', 'list-2', 'list-3', 'list-4'])
    })
  })

  describe('imperative API guards', () => {
    it('sort() is a warned no-op in controlled mode', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      sortable = new Sortable(container, { animation: 0, controlled: true })
      const before = ids(container)

      sortable.sort(['list-4', 'list-3', 'list-2', 'list-1'])

      expect(ids(container)).toEqual(before)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('controlled mode')
      )
      warn.mockRestore()
    })
  })
})
