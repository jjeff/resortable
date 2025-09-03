import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SelectionManager } from '../../src/core/SelectionManager'
import { EventSystem } from '../../src/core/EventSystem'
import type { SortableEvents } from '../../src/types/index.js'

describe('SelectionManager', () => {
  let container: HTMLElement
  let eventSystem: EventSystem<SortableEvents>
  let selectionManager: SelectionManager
  let items: HTMLElement[]

  beforeEach(() => {
    // Create a container element
    container = document.createElement('div')
    container.id = 'test-container'
    document.body.appendChild(container)

    // Create sortable items
    items = []
    for (let i = 0; i < 5; i++) {
      const item = document.createElement('div')
      item.className = 'sortable-item'
      item.setAttribute('data-id', `item-${i}`)
      item.textContent = `Item ${i}`
      container.appendChild(item)
      items.push(item)
    }

    // Initialize event system and selection manager
    eventSystem = new EventSystem<SortableEvents>()
    selectionManager = new SelectionManager(container, eventSystem)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('Single Selection', () => {
    it('should select a single item', () => {
      selectionManager.select(items[0])

      expect(selectionManager.getSelected()).toContain(items[0])
      expect(selectionManager.getSelected()).toHaveLength(1)
      expect(items[0].getAttribute('aria-selected')).toBe('true')
    })

    it('should deselect previous item when selecting a new one in single-select mode', () => {
      selectionManager.select(items[0])
      selectionManager.select(items[1])

      expect(selectionManager.getSelected()).toContain(items[1])
      expect(selectionManager.getSelected()).not.toContain(items[0])
      expect(items[0].getAttribute('aria-selected')).toBe('false')
      expect(items[1].getAttribute('aria-selected')).toBe('true')
    })

    it('should clear selection', () => {
      selectionManager.select(items[0])
      selectionManager.clearSelection()

      expect(selectionManager.getSelected()).toHaveLength(0)
      expect(items[0].getAttribute('aria-selected')).toBe('false')
    })
  })

  describe('Multi-Selection', () => {
    beforeEach(() => {
      // Recreate selection manager with multi-select enabled
      selectionManager = new SelectionManager(container, eventSystem, {
        multiSelect: true,
      })
    })

    it('should select multiple items', () => {
      selectionManager.select(items[0])
      selectionManager.select(items[2], true) // additive selection

      expect(selectionManager.getSelected()).toContain(items[0])
      expect(selectionManager.getSelected()).toContain(items[2])
      expect(selectionManager.getSelected()).toHaveLength(2)
    })

    it('should toggle item selection', () => {
      selectionManager.toggle(items[0])
      expect(selectionManager.getSelected()).toContain(items[0])

      selectionManager.toggle(items[0])
      expect(selectionManager.getSelected()).not.toContain(items[0])
    })

    it('should select range of items', () => {
      selectionManager.select(items[1])
      selectionManager.selectRange(items[1], items[3])

      expect(selectionManager.getSelected()).toContain(items[1])
      expect(selectionManager.getSelected()).toContain(items[2])
      expect(selectionManager.getSelected()).toContain(items[3])
      expect(selectionManager.getSelected()).toHaveLength(3)
    })

    it('should handle range selection with no previous selection', () => {
      // When called with single item, should just select that item
      selectionManager.selectRange(items[2], items[2])

      // Should just select the single item
      expect(selectionManager.getSelected()).toContain(items[2])
      expect(selectionManager.getSelected()).toHaveLength(1)
    })
  })

  describe('Focus Management', () => {
    it('should set focus on an item', () => {
      selectionManager.setFocus(items[2])

      expect(selectionManager.getFocused()).toBe(items[2])
      expect(items[2].classList.contains('sortable-focused')).toBe(true)
    })

    it('should clear previous focus when setting new focus', () => {
      selectionManager.setFocus(items[1])
      selectionManager.setFocus(items[3])

      expect(selectionManager.getFocused()).toBe(items[3])
      expect(items[1].classList.contains('sortable-focused')).toBe(false)
      expect(items[3].classList.contains('sortable-focused')).toBe(true)
    })

    it('should clear focus', () => {
      selectionManager.setFocus(items[2])
      selectionManager.clearFocus()

      expect(selectionManager.getFocused()).toBeNull()
      expect(items[2].classList.contains('sortable-focused')).toBe(false)
    })

    it('should use custom focus class', () => {
      selectionManager = new SelectionManager(container, eventSystem, {
        focusClass: 'custom-focus',
      })

      selectionManager.setFocus(items[1])
      expect(items[1].classList.contains('custom-focus')).toBe(true)
      expect(items[1].classList.contains('sortable-focused')).toBe(false)
    })
  })

  describe('Custom Classes', () => {
    it('should use custom selected class', () => {
      selectionManager = new SelectionManager(container, eventSystem, {
        selectedClass: 'custom-selected',
      })

      selectionManager.select(items[0])
      expect(items[0].classList.contains('custom-selected')).toBe(true)
      expect(items[0].classList.contains('sortable-selected')).toBe(false)
    })
  })

  describe('Event Emission', () => {
    it('should emit select event when item is selected', () => {
      const selectHandler = vi.fn()
      eventSystem.on('select', selectHandler)

      selectionManager.select(items[1])

      expect(selectHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [items[1]],
          from: container,
          to: container,
        })
      )
    })

    it('should emit select event for multi-selection', () => {
      selectionManager = new SelectionManager(container, eventSystem, {
        multiSelect: true,
      })

      const selectHandler = vi.fn()
      eventSystem.on('select', selectHandler)

      selectionManager.select(items[0])
      selectionManager.select(items[1], true)

      // Should be called twice
      expect(selectHandler).toHaveBeenCalledTimes(2)

      // Second call should have both items selected
      expect(selectHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([items[0], items[1]]) as HTMLElement[],
        })
      )
    })
  })

  // Note: Click event handling has been moved to KeyboardManager
  // These tests have been moved to the integration tests

  describe('Cleanup', () => {
    it('should clean up event listeners on destroy', () => {
      const clickHandler = vi.fn()
      container.addEventListener('click', clickHandler)

      selectionManager.destroy()

      // Try to click after destroy
      const clickEvent = new MouseEvent('click', { bubbles: true })
      items[0].dispatchEvent(clickEvent)

      // The selection manager should not respond
      expect(selectionManager.getSelected()).toHaveLength(0)
    })

    it('should clear all selections on destroy', () => {
      selectionManager.select(items[0])
      selectionManager.setFocus(items[1])

      selectionManager.destroy()

      expect(items[0].getAttribute('aria-selected')).toBe('false')
      expect(items[1].classList.contains('sortable-focused')).toBe(false)
    })
  })
})
