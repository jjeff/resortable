import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'

/**
 * Unit coverage for #75 — `sort: false` must block reordering WITHIN a
 * zone. The option was declared in `SortableOptions` and defaulted in
 * `defaultOptions`, but never threaded into `DragManager` or checked by any
 * reorder pipeline, so items in a `sort: false` list could still be dragged
 * to a new position among their siblings.
 *
 * Drives the HTML5 `onDragOver` path (see `on-move.spec.ts` for why: jsdom
 * dispatches `dragstart`/`dragover` synchronously, and geometry-dependent
 * pointer-pipeline behavior is covered by e2e).
 */

function createContainer(count = 4): HTMLElement {
  const container = document.createElement('div')
  container.id = 'list'
  for (let i = 1; i <= count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `item-${i}`
    el.textContent = `Item ${i}`
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

function makeDragEvent(type: string): DragEvent {
  try {
    return new DragEvent(type, { bubbles: true, cancelable: true })
  } catch {
    return new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  }
}

function ids(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(
      '.sortable-item:not([data-resortable-placeholder])'
    )
  ).map((el) => (el as HTMLElement).dataset.id ?? '')
}

describe('sort: false (#75)', () => {
  let sortable: Sortable

  afterEach(() => {
    sortable?.destroy()
    document.body.innerHTML = ''
  })

  it('blocks reordering within the zone — no DOM move, no sort/update/change', () => {
    const container = createContainer()
    const sortHandler = vi.fn()
    const updateHandler = vi.fn()
    const changeHandler = vi.fn()
    sortable = new Sortable(container, {
      animation: 0,
      sort: false,
      onSort: sortHandler,
      onUpdate: updateHandler,
      onChange: changeHandler,
    })

    const before = ids(container)
    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement

    item1.dispatchEvent(makeDragEvent('dragstart'))
    item3.dispatchEvent(makeDragEvent('dragover'))

    expect(ids(container)).toEqual(before)
    expect(sortHandler).not.toHaveBeenCalled()
    expect(updateHandler).not.toHaveBeenCalled()
    expect(changeHandler).not.toHaveBeenCalled()
  })

  it('sort: true (default) still allows reordering', () => {
    // The library only commits the DOM swap on drop (dragover just moves a
    // placeholder), so assert via the `sort` event firing rather than
    // reading final item order — mirrors the guard this test exists to
    // check: `if (!this.sort) return` must NOT trip when sort defaults true.
    const container = createContainer()
    const sortHandler = vi.fn()
    sortable = new Sortable(container, { animation: 0, onSort: sortHandler })

    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement

    item1.dispatchEvent(makeDragEvent('dragstart'))
    item3.dispatchEvent(makeDragEvent('dragover'))

    expect(sortHandler).toHaveBeenCalled()
  })
})
