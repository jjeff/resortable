/**
 * @fileoverview Unit tests for SwapPlugin
 *
 * SwapPlugin has no prior coverage at all: `tests/e2e/plugin-functionality.spec.ts`
 * and `plugin-system.spec.ts` only exercise an inline mock object that happens
 * to be *named* SwapPlugin, and `tests/e2e/swap-behavior.spec.ts` actually
 * drives `DragManager.shouldSwap()` / `handleControlledMove()` (the
 * `swapThreshold` / `invertSwap` DragManager options) — a different code path
 * entirely. These tests import and exercise the real `SwapPlugin` class.
 *
 * `dropZone.move` is patched by the plugin to accept `(items: HTMLElement[],
 * targetIndex: number)`. That matches the plugin's own internal contract, so
 * the mock `dropZone.move` below uses the same array-based signature.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SwapPlugin } from '../../src/plugins/SwapPlugin.js'
import { EventSystem } from '../../src/core/EventSystem.js'
import type {
  SortableEvents,
  SortableInstance,
  SortableOptions,
} from '../../src/types/index.js'

type DropZoneLike = {
  element: HTMLElement
  // The real DropZone.move takes a single element — that is how DragManager
  // calls it. SwapPlugin's override also accepts an array for its own
  // multi-item paths, so the mock has to allow both.
  move: (item: HTMLElement | HTMLElement[], targetIndex: number) => void
}

type MockSortable = SortableInstance & { dropZone: DropZoneLike }

function createContainer(ids: string[]): HTMLElement {
  const container = document.createElement('div')
  for (const id of ids) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = id
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

function childIds(container: HTMLElement): string[] {
  return Array.from(container.children).map(
    (el) => (el as HTMLElement).dataset.id ?? ''
  )
}

function createMockSortable(
  container: HTMLElement,
  options: SortableOptions = {},
  // Mirrors the patched DropZone.move: DragManager passes a single element,
  // the plugin's own multi-item paths pass an array.
  originalMove: (
    item: HTMLElement | HTMLElement[],
    targetIndex: number
  ) => void = vi.fn()
): MockSortable {
  return {
    element: container,
    options,
    eventSystem: new EventSystem<SortableEvents>(),
    dropZone: { element: container, move: originalMove },
  } as unknown as MockSortable
}

function mockRect(
  el: HTMLElement,
  rect: { x: number; y: number; width: number; height: number }
): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(rect.x, rect.y, rect.width, rect.height)
  )
}

function dragOver(clientX: number, clientY: number): DragEvent {
  const e = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperties(e, {
    clientX: { value: clientX, configurable: true },
    clientY: { value: clientY, configurable: true },
  })
  return e as unknown as DragEvent
}

describe('SwapPlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint
    document.body.innerHTML = ''
  })

  it('has correct name and version', () => {
    const plugin = SwapPlugin.create()
    expect(plugin.name).toBe('Swap')
    expect(plugin.version).toBe('2.0.0')
  })

  describe('overrideDropZoneMove / restoreDropZoneMove', () => {
    it('install replaces dropZone.move with swap-aware logic', () => {
      const container = createContainer(['1', '2', '3'])
      const originalMove = vi.fn()
      const sortable = createMockSortable(container, {}, originalMove)
      const preInstallMove = sortable.dropZone.move

      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      expect(sortable.dropZone.move).not.toBe(preInstallMove)

      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      // Move item[0] to index 2 (where item id "3" lives) -> real swap,
      // original move is never reached.
      sortable.dropZone.move([items[0]], 2)

      expect(originalMove).not.toHaveBeenCalled()
      expect(childIds(container)).toEqual(['3', '2', '1'])
    })

    it('uninstall genuinely restores the original move behavior', () => {
      const container = createContainer(['1', '2', '3'])
      const originalMove = vi.fn()
      const sortable = createMockSortable(container, {}, originalMove)

      const plugin = SwapPlugin.create()
      plugin.install(sortable)
      plugin.uninstall(sortable)

      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      // Single-element form: this is how DragManager actually calls
      // DropZone.move, and after uninstall it reaches the original untouched.
      sortable.dropZone.move(items[0], 2)

      // Original move (bound to dropZone) receives the call, unmodified DOM.
      expect(originalMove).toHaveBeenCalledTimes(1)
      expect(originalMove).toHaveBeenCalledWith(items[0], 2)
      expect(childIds(container)).toEqual(['1', '2', '3'])
    })

    it('balanced double-install/double-uninstall restores the true original', () => {
      // A `not.toThrow()` assertion used to stand here, and it passed while
      // the plugin was permanently stuck on: the second install captured the
      // plugin's own wrapper as "the original", so the second uninstall had
      // nothing left to restore. Assert the restore actually happened.
      const container = createContainer(['1', '2'])
      const trueOriginal = vi.fn()
      const sortable = createMockSortable(container, {}, trueOriginal)
      const plugin = SwapPlugin.create({ animation: false })

      plugin.install(sortable)
      plugin.install(sortable)
      plugin.uninstall(sortable)
      plugin.uninstall(sortable)

      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      sortable.dropZone.move(items[0], 1)

      // Original move is back in place: it receives the call and no swap runs.
      expect(trueOriginal).toHaveBeenCalledTimes(1)
      expect(trueOriginal).toHaveBeenCalledWith(items[0], 1)
      expect(childIds(container)).toEqual(['1', '2'])
    })

    it('does nothing when the instance has no dropZone', () => {
      const container = createContainer(['1'])
      const sortable = {
        element: container,
        options: {},
        eventSystem: new EventSystem<SortableEvents>(),
      } as unknown as SortableInstance

      const plugin = SwapPlugin.create()
      expect(() => plugin.install(sortable)).not.toThrow()
      expect(() => plugin.uninstall(sortable)).not.toThrow()
    })
  })

  describe('findSwapTarget + checkSwapThreshold (dragover-driven)', () => {
    let container: HTMLElement
    let items: HTMLElement[]
    let sortable: MockSortable
    let plugin: SwapPlugin

    beforeEach(() => {
      container = createContainer(['1', '2', '3'])
      items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      // Centered at (150, 150), half-width/height 50 -> maxDistance ~= 70.7
      mockRect(items[1], { x: 100, y: 100, width: 100, height: 100 })
      sortable = createMockSortable(container)
      plugin = SwapPlugin.create()
      plugin.install(sortable)
      sortable.eventSystem.emit('start', {
        item: items[0],
        items: [items[0]],
        from: container,
        to: container,
        oldIndex: 0,
        newIndex: 0,
      })
    })

    afterEach(() => {
      plugin.uninstall(sortable)
    })

    it('marks the hovered item as swap target within the overlap threshold', () => {
      document.elementFromPoint = () => items[1]
      // Distance from center (150,150) = sqrt(25^2+25^2) ~= 35.36,
      // overlap = 1 - 35.36/70.7 ~= 0.5 -> meets default 0.5 threshold.
      container.dispatchEvent(dragOver(175, 175))

      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(true)
    })

    it('does not mark the item when within bounds but outside the overlap threshold', () => {
      document.elementFromPoint = () => items[1]
      // Still inside the 100x100 rect (x,y in [100,200]) but far from the
      // (150,150) center: distance ~= sqrt(45^2+45^2) ~= 63.6, overlap
      // ~= 0.1 < 0.5 threshold.
      container.dispatchEvent(dragOver(105, 105))

      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(false)
    })

    it('does not mark the item when the pointer is outside its rect entirely', () => {
      document.elementFromPoint = () => items[1]
      container.dispatchEvent(dragOver(500, 500))

      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(false)
    })

    it('respects a custom swapThreshold option', () => {
      plugin.uninstall(sortable)
      plugin = SwapPlugin.create({ swapThreshold: 0.9 })
      plugin.install(sortable)
      sortable.eventSystem.emit('start', {
        item: items[0],
        items: [items[0]],
        from: container,
        to: container,
        oldIndex: 0,
        newIndex: 0,
      })

      document.elementFromPoint = () => items[1]
      // overlap ~= 0.5 (see first test) fails a 0.9 threshold.
      container.dispatchEvent(dragOver(175, 175))

      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(false)
    })

    it('ignores hover when elementFromPoint finds nothing', () => {
      // NB: no `expect(dispatchEvent).not.toThrow()` here. dispatchEvent never
      // propagates a listener's exception to the caller, so such an assertion
      // passes no matter what the handler does. Watch for the error instead.
      const onError = vi.fn()
      window.addEventListener('error', onError)
      try {
        document.elementFromPoint = () => null
        container.dispatchEvent(dragOver(150, 150))

        expect(onError).not.toHaveBeenCalled()
        expect(items[1].classList.contains('sortable-swap-highlight')).toBe(
          false
        )
      } finally {
        window.removeEventListener('error', onError)
      }
    })

    it('ignores hovering over the item currently being dragged', () => {
      document.elementFromPoint = () => items[0]
      container.dispatchEvent(dragOver(0, 0))

      expect(items[0].classList.contains('sortable-swap-highlight')).toBe(false)
    })

    it('ignores an element outside the sortable container', () => {
      const outsider = document.createElement('div')
      outsider.className = 'sortable-item'
      document.body.appendChild(outsider)

      document.elementFromPoint = () => outsider
      container.dispatchEvent(dragOver(150, 150))

      expect(outsider.classList.contains('sortable-swap-highlight')).toBe(false)
    })

    it('swaps the highlight when the hovered target changes', () => {
      mockRect(items[2], { x: 300, y: 300, width: 100, height: 100 })

      document.elementFromPoint = () => items[1]
      container.dispatchEvent(dragOver(175, 175))
      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(true)

      document.elementFromPoint = () => items[2]
      container.dispatchEvent(dragOver(375, 375))
      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(false)
      expect(items[2].classList.contains('sortable-swap-highlight')).toBe(true)
    })

    it('clears the preview highlight on drag end', () => {
      document.elementFromPoint = () => items[1]
      container.dispatchEvent(dragOver(175, 175))
      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(true)

      sortable.eventSystem.emit('end', {
        item: items[0],
        items: [items[0]],
        from: container,
        to: container,
        oldIndex: 0,
        newIndex: 1,
      })

      expect(items[1].classList.contains('sortable-swap-highlight')).toBe(false)
    })
  })

  describe('canSwap / restrictToSameType / typeAttribute', () => {
    it('allows swapping mismatched types by default', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      items[0].setAttribute('data-swap-type', 'a')
      items[1].setAttribute('data-swap-type', 'b')

      const sortable = createMockSortable(container)
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 1)

      expect(childIds(container)).toEqual(['2', '1'])
    })

    it('blocks swapping between mismatched types when restrictToSameType is set', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      items[0].setAttribute('data-swap-type', 'a')
      items[1].setAttribute('data-swap-type', 'b')

      const originalMove = vi.fn()
      const sortable = createMockSortable(container, {}, originalMove)
      const plugin = SwapPlugin.create({
        animation: false,
        restrictToSameType: true,
      })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 1)

      // canSwap fails -> early return, no fallback to original move either.
      expect(originalMove).not.toHaveBeenCalled()
      expect(childIds(container)).toEqual(['1', '2'])
    })

    it('allows swapping between matching types when restrictToSameType is set', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      items[0].setAttribute('data-swap-type', 'same')
      items[1].setAttribute('data-swap-type', 'same')

      const sortable = createMockSortable(container)
      const plugin = SwapPlugin.create({
        animation: false,
        restrictToSameType: true,
      })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 1)

      expect(childIds(container)).toEqual(['2', '1'])
    })

    it('checks type using a custom typeAttribute', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      // Mismatched on the default attribute, matching on the custom one.
      items[0].setAttribute('data-swap-type', 'a')
      items[1].setAttribute('data-swap-type', 'b')
      items[0].setAttribute('data-item-type', 'same')
      items[1].setAttribute('data-item-type', 'same')

      const sortable = createMockSortable(container)
      const plugin = SwapPlugin.create({
        animation: false,
        restrictToSameType: true,
        typeAttribute: 'data-item-type',
      })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 1)

      expect(childIds(container)).toEqual(['2', '1'])
    })
  })

  describe('performSwap / immediateSwap / animatedSwap', () => {
    it('immediateSwap swaps two items and preserves the elements in between', () => {
      const container = createContainer(['1', '2', '3', '4'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      const sortable = createMockSortable(container)
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 2)

      expect(childIds(container)).toEqual(['3', '2', '1', '4'])
      // The actual DOM nodes were relocated, not cloned/replaced.
      expect(container.contains(items[0])).toBe(true)
      expect(container.contains(items[2])).toBe(true)
    })

    it('is a no-op when the target index does not resolve, falling back to original move', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      const originalMove = vi.fn()
      const sortable = createMockSortable(container, {}, originalMove)
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 99)

      expect(originalMove).toHaveBeenCalledWith(items[0], 99)
      expect(childIds(container)).toEqual(['1', '2'])
    })

    it('is a no-op when items is empty', () => {
      const container = createContainer(['1', '2'])
      const originalMove = vi.fn()
      const sortable = createMockSortable(container, {}, originalMove)
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move([], 1)

      expect(originalMove).not.toHaveBeenCalled()
      expect(childIds(container)).toEqual(['1', '2'])
    })

    it('is a no-op when swapping an item with itself', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('.sortable-item')
      )
      const sortable = createMockSortable(container)
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 0)

      expect(childIds(container)).toEqual(['1', '2'])
    })

    it('animatedSwap (default) reorders the DOM and manages the transition style lifecycle', () => {
      vi.useFakeTimers()
      try {
        const container = createContainer(['1', '2', '3'])
        const items = Array.from(
          container.querySelectorAll<HTMLElement>('.sortable-item')
        )
        const sortable = createMockSortable(container)
        const plugin = SwapPlugin.create({ animationDuration: 200 })
        plugin.install(sortable)

        sortable.dropZone.move([items[0]], 2)

        // Real DOM order changed, same as the non-animated path.
        expect(childIds(container)).toEqual(['3', '2', '1'])

        // Transition applied for the animation duration...
        expect(items[0].style.transition).toBe('transform 200ms ease')
        expect(items[2].style.transition).toBe('transform 200ms ease')
        // ...and the transform itself is reset synchronously after reflow.
        expect(items[0].style.transform).toBe('')
        expect(items[2].style.transform).toBe('')

        vi.advanceTimersByTime(200)

        expect(items[0].style.transition).toBe('')
        expect(items[2].style.transition).toBe('')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('getElementAtIndex selector source', () => {
    it('resolves items via sortable.options.draggable', () => {
      // The target lookup used by the dropZone.move override used to read a
      // `data-draggable` *DOM attribute* only, ignoring `options.draggable`.
      // A consumer setting `draggable` (the documented API) therefore got no
      // swap at all: the lookup found nothing and silently fell through to
      // the original move. It now prefers the configured option.
      const container = createContainer(['1', '2'])
      const items = Array.from(container.children) as HTMLElement[]
      items.forEach((el) => el.classList.replace('sortable-item', 'custom'))

      const originalMove = vi.fn()
      const sortable = createMockSortable(
        container,
        { draggable: '.custom' },
        originalMove
      )
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move(items[0], 1)

      // Swap actually happens; the original move is never reached.
      expect(originalMove).not.toHaveBeenCalled()
      expect(childIds(container)).toEqual(['2', '1'])
    })

    it('honors a "data-draggable" DOM attribute on the container for target lookup', () => {
      const container = createContainer(['1', '2'])
      const items = Array.from(container.children) as HTMLElement[]
      items.forEach((el) => el.classList.replace('sortable-item', 'custom'))
      container.setAttribute('data-draggable', '.custom')

      const sortable = createMockSortable(container, { draggable: '.custom' })
      const plugin = SwapPlugin.create({ animation: false })
      plugin.install(sortable)

      sortable.dropZone.move([items[0]], 1)

      expect(childIds(container)).toEqual(['2', '1'])
    })
  })
})
