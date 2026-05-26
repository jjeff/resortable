import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'
import type { MoveEvent } from '../../src/types/index'

/**
 * Unit coverage for #33 — `onMove(MoveEvent, originalEvent)` wiring.
 *
 * Asserts the cancellation / override contract:
 *   - `false`  → no DOM mutation, no `sort` / `update` / `change` for that tick
 *   - `-1`     → force insert BEFORE related item (overrides natural direction)
 *   - `1`      → force insert AFTER related item
 *   - `void`   → proceed with the natural heuristic
 *
 * And the event-system side-channel: `'move'` must STILL fire (notification
 * only — it cannot cancel) so existing internal subscribers keep working.
 *
 * We drive the HTML5 `onDragOver` path here because jsdom dispatches
 * `dragstart` / `dragover` synchronously and exposes `DataTransfer` enough
 * for the pipeline to run. The pointer pipeline is covered by the e2e
 * suite (geometry depends on real layout — jsdom returns zeroed
 * `getBoundingClientRect`s).
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

interface DragEventInitWithDT extends DragEventInit {
  dataTransfer?: DataTransfer
}

function makeDragEvent(
  type: string,
  init: DragEventInitWithDT = {}
): DragEvent {
  // jsdom supports DragEvent construction but won't populate `dataTransfer`
  // by default. Forward whatever the test supplies (or null).
  try {
    return new DragEvent(type, { bubbles: true, cancelable: true, ...init })
  } catch {
    // Some jsdom builds lack the constructor — fall back to Event + patched
    // properties so the pipeline at least sees the right shape.
    const evt = new Event(type, {
      bubbles: true,
      cancelable: true,
    }) as DragEvent
    return evt
  }
}

function ids(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.sortable-item')).map(
    (el) => (el as HTMLElement).dataset.id ?? ''
  )
}

describe('onMove (#33)', () => {
  let container: HTMLElement
  let sortable: Sortable

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  afterEach(() => {
    sortable?.destroy()
  })

  it('passes (MoveEvent, originalEvent: Event) to the callback', () => {
    const onMove = vi.fn<(evt: MoveEvent, original: Event) => void>()
    sortable = new Sortable(container, { animation: 0, onMove })

    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement

    // Start an HTML5 drag on item-1
    item1.dispatchEvent(makeDragEvent('dragstart'))
    // Dragover targeting item-3
    const overEvt = makeDragEvent('dragover')
    item3.dispatchEvent(overEvt)

    expect(onMove).toHaveBeenCalled()
    const [moveEvt, originalEvt] = onMove.mock.calls[0]
    expect(moveEvt.item).toBe(item1)
    expect(moveEvt.related).toBe(item3)
    expect(moveEvt.from).toBe(container)
    expect(moveEvt.to).toBe(container)
    expect(originalEvt).toBeInstanceOf(Event)
    expect(originalEvt.type).toBe('dragover')
  })

  it('returning false cancels the move — no DOM mutation, no sort/update/change', () => {
    const sortHandler = vi.fn()
    const updateHandler = vi.fn()
    const changeHandler = vi.fn()
    sortable = new Sortable(container, {
      animation: 0,
      onMove: () => false,
      onSort: sortHandler,
      onUpdate: updateHandler,
      onChange: changeHandler,
    })

    const before = ids(container)
    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement

    item1.dispatchEvent(makeDragEvent('dragstart'))
    item3.dispatchEvent(makeDragEvent('dragover'))

    // No reorder: item order and placeholder position unchanged.
    expect(ids(container)).toEqual(before)
    expect(sortHandler).not.toHaveBeenCalled()
    expect(updateHandler).not.toHaveBeenCalled()
    expect(changeHandler).not.toHaveBeenCalled()
  })

  it('still emits the `move` event-system channel even when onMove cancels', () => {
    const moveChannelHandler = vi.fn()
    sortable = new Sortable(container, {
      animation: 0,
      onMove: () => false,
    })
    // Subscribe AFTER construction so we can confirm the side-channel still
    // fires (this is how internal / plugin subscribers wire up).
    sortable.eventSystem.on('move', moveChannelHandler)

    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement
    item1.dispatchEvent(makeDragEvent('dragstart'))
    item3.dispatchEvent(makeDragEvent('dragover'))

    expect(moveChannelHandler).toHaveBeenCalled()
  })

  it('returning void proceeds with natural placement (placeholder moves)', () => {
    sortable = new Sortable(container, {
      animation: 0,
      onMove: () => undefined,
    })

    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement
    item1.dispatchEvent(makeDragEvent('dragstart'))
    item3.dispatchEvent(makeDragEvent('dragover'))

    // The placeholder should now sit immediately after item-3 (dragging
    // down → naturalAfter = true).
    // Placeholder element is created by GhostManager with the configured
    // `ghostClass` (default `sortable-ghost`). We track it by querying the
    // DOM directly — it's a non-`.sortable-item` child carrying that class.
    const placeholder = container.querySelector(
      '.sortable-ghost:not(.sortable-item)'
    )
    expect(placeholder).not.toBeNull()
    expect(placeholder?.previousElementSibling).toBe(item3)
  })

  it('returning -1 forces insert-BEFORE related (overrides natural drag-down direction)', () => {
    sortable = new Sortable(container, { animation: 0, onMove: () => -1 })

    // Dragging DOWN from item-1 over item-3 → natural is insert-AFTER item-3.
    // Override -1 forces insert-BEFORE item-3 (placeholder lands between
    // item-2 and item-3).
    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement
    item1.dispatchEvent(makeDragEvent('dragstart'))
    item3.dispatchEvent(makeDragEvent('dragover'))

    // Placeholder element is created by GhostManager with the configured
    // `ghostClass` (default `sortable-ghost`). We track it by querying the
    // DOM directly — it's a non-`.sortable-item` child carrying that class.
    const placeholder = container.querySelector(
      '.sortable-ghost:not(.sortable-item)'
    )
    expect(placeholder).not.toBeNull()
    expect(placeholder?.nextElementSibling).toBe(item3)
  })

  it('returning 1 forces insert-AFTER related (overrides natural drag-up direction)', () => {
    sortable = new Sortable(container, { animation: 0, onMove: () => 1 })

    // Dragging UP from item-3 over item-1 → natural is insert-BEFORE item-1.
    // Override 1 forces insert-AFTER item-1 (placeholder lands between
    // item-1 and item-2).
    const item1 = container.children[0] as HTMLElement
    const item3 = container.children[2] as HTMLElement
    item3.dispatchEvent(makeDragEvent('dragstart'))
    item1.dispatchEvent(makeDragEvent('dragover'))

    // Placeholder element is created by GhostManager with the configured
    // `ghostClass` (default `sortable-ghost`). We track it by querying the
    // DOM directly — it's a non-`.sortable-item` child carrying that class.
    const placeholder = container.querySelector(
      '.sortable-ghost:not(.sortable-item)'
    )
    expect(placeholder).not.toBeNull()
    expect(placeholder?.previousElementSibling).toBe(item1)
  })
})
