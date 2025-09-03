import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { KeyboardManager } from '../../src/core/KeyboardManager'
import { SelectionManager } from '../../src/core/SelectionManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'

describe('KeyboardManager', () => {
  let container: HTMLElement
  let dropZone: DropZone
  let selectionManager: SelectionManager
  let eventSystem: EventSystem
  let keyboardManager: KeyboardManager
  let items: HTMLElement[]
  let announcer: HTMLElement

  beforeEach(() => {
    // Create a container element
    container = document.createElement('div')
    container.id = 'test-container'
    container.setAttribute('role', 'list')
    document.body.appendChild(container)

    // Create sortable items
    items = []
    for (let i = 0; i < 5; i++) {
      const item = document.createElement('div')
      item.className = 'sortable-item'
      item.setAttribute('data-id', `item-${i}`)
      item.setAttribute('role', 'listitem')
      item.setAttribute('tabindex', '-1')
      item.textContent = `Item ${i}`
      container.appendChild(item)
      items.push(item)
    }

    // Create announcer element
    announcer = document.createElement('div')
    announcer.setAttribute('aria-live', 'assertive')
    announcer.setAttribute('aria-atomic', 'true')
    announcer.style.position = 'absolute'
    announcer.style.width = '1px'
    announcer.style.height = '1px'
    announcer.style.padding = '0'
    announcer.style.margin = '-1px'
    announcer.style.overflow = 'hidden'
    announcer.style.clip = 'rect(0, 0, 0, 0)'
    announcer.style.whiteSpace = 'nowrap'
    announcer.style.border = '0'
    document.body.appendChild(announcer)

    // Initialize components
    dropZone = new DropZone(container)
    eventSystem = new EventSystem()
    selectionManager = new SelectionManager(container, eventSystem)
    keyboardManager = new KeyboardManager(
      container,
      dropZone,
      selectionManager,
      eventSystem,
      'test-group'
    )
  })

  afterEach(() => {
    keyboardManager.detach()
    selectionManager.destroy()
    document.body.removeChild(container)
    document.body.removeChild(announcer)
  })

  describe('Initialization', () => {
    it('should attach keyboard event listeners', () => {
      keyboardManager.attach()
      
      // First item should have tabindex="0"
      expect(items[0].getAttribute('tabindex')).toBe('0')
      // Others should have tabindex="-1"
      expect(items[1].getAttribute('tabindex')).toBe('-1')
    })

    it('should set ARIA attributes on items', () => {
      keyboardManager.attach()
      
      items.forEach((item, index) => {
        expect(item.getAttribute('role')).toBe('listitem')
        expect(item.getAttribute('aria-grabbed')).toBe('false')
        expect(item.getAttribute('aria-selected')).toBe('false')
        expect(item.getAttribute('aria-setsize')).toBe('5')
        expect(item.getAttribute('aria-posinset')).toBe((index + 1).toString())
      })
    })
  })

  describe('Arrow Key Navigation', () => {
    beforeEach(() => {
      keyboardManager.attach()
    })

    it('should navigate down with ArrowDown', () => {
      items[0].focus()
      selectionManager.setFocus(items[0])
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getFocused()).toBe(items[1])
      expect(items[1].getAttribute('tabindex')).toBe('0')
      expect(items[0].getAttribute('tabindex')).toBe('-1')
    })

    it('should navigate up with ArrowUp', () => {
      selectionManager.setFocus(items[2])
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getFocused()).toBe(items[1])
    })

    it('should wrap around when navigating past the end', () => {
      selectionManager.setFocus(items[4])
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getFocused()).toBe(items[0])
    })

    it('should wrap around when navigating before the start', () => {
      selectionManager.setFocus(items[0])
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getFocused()).toBe(items[4])
    })

    it('should navigate to first item with Home key', () => {
      selectionManager.setFocus(items[3])
      
      const event = new KeyboardEvent('keydown', {
        key: 'Home',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getFocused()).toBe(items[0])
    })

    it('should navigate to last item with End key', () => {
      selectionManager.setFocus(items[1])
      
      const event = new KeyboardEvent('keydown', {
        key: 'End',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getFocused()).toBe(items[4])
    })
  })

  describe('Selection with Space Key', () => {
    beforeEach(() => {
      keyboardManager.attach()
    })

    it('should select item with Space key', () => {
      selectionManager.setFocus(items[1])
      
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getSelected()).toContain(items[1])
    })

    it('should toggle selection with Space key in multi-select mode', () => {
      // Create new keyboard manager with multi-select
      keyboardManager.detach()
      selectionManager = new SelectionManager(container, eventSystem, {
        multiSelect: true
      })
      keyboardManager = new KeyboardManager(
        container,
        dropZone,
        selectionManager,
        eventSystem,
        'test-group'
      )
      keyboardManager.attach()
      
      selectionManager.setFocus(items[1])
      
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true
      })
      
      container.dispatchEvent(event)
      expect(selectionManager.getSelected()).toContain(items[1])
      
      container.dispatchEvent(event)
      expect(selectionManager.getSelected()).not.toContain(items[1])
    })
  })

  describe('Drag Operations with Enter Key', () => {
    beforeEach(() => {
      keyboardManager.attach()
    })

    it('should grab item with Enter key', () => {
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)
      
      expect(items[1].getAttribute('aria-grabbed')).toBe('true')
    })

    it('should drop item with Enter key when already grabbing', () => {
      // First grab an item
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      const grabEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(grabEvent)
      
      // Move focus to drop location
      selectionManager.setFocus(items[3])
      
      // Drop the item
      const dropEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(dropEvent)
      
      expect(items[1].getAttribute('aria-grabbed')).toBe('false')
    })

    it('should cancel grab with Escape key', () => {
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      // Grab item
      const grabEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(grabEvent)
      
      expect(items[1].getAttribute('aria-grabbed')).toBe('true')
      
      // Cancel with Escape
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(escapeEvent)
      
      expect(items[1].getAttribute('aria-grabbed')).toBe('false')
    })

    it('should emit drag events during keyboard drag operation', () => {
      const startHandler = vi.fn()
      const endHandler = vi.fn()
      eventSystem.on('start', startHandler)
      eventSystem.on('end', endHandler)
      
      // Select and grab
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      const grabEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(grabEvent)
      
      expect(startHandler).toHaveBeenCalled()
      
      // Move and drop
      selectionManager.setFocus(items[3])
      container.dispatchEvent(grabEvent)
      
      expect(endHandler).toHaveBeenCalled()
    })
  })

  describe('Multi-Selection Keyboard Shortcuts', () => {
    beforeEach(() => {
      keyboardManager.detach()
      selectionManager = new SelectionManager(container, eventSystem, {
        multiSelect: true
      })
      keyboardManager = new KeyboardManager(
        container,
        dropZone,
        selectionManager,
        eventSystem,
        'test-group'
      )
      keyboardManager.attach()
    })

    it('should extend selection with Shift+ArrowDown', () => {
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        shiftKey: true,
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getSelected()).toContain(items[1])
      expect(selectionManager.getSelected()).toContain(items[2])
      expect(selectionManager.getFocused()).toBe(items[2])
    })

    it('should extend selection with Shift+ArrowUp', () => {
      selectionManager.select(items[2])
      selectionManager.setFocus(items[2])
      
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        shiftKey: true,
        bubbles: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getSelected()).toContain(items[1])
      expect(selectionManager.getSelected()).toContain(items[2])
    })

    it('should select all with Ctrl+A', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getSelected()).toHaveLength(5)
      items.forEach(item => {
        expect(selectionManager.getSelected()).toContain(item)
      })
    })

    it('should select all with Cmd+A on Mac', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)
      
      expect(selectionManager.getSelected()).toHaveLength(5)
    })
  })

  describe('Screen Reader Announcements', () => {
    beforeEach(() => {
      keyboardManager.attach()
    })

    it('should announce when item is grabbed', () => {
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      const announceHandler = vi.fn()
      const originalMethod = keyboardManager.announce
      keyboardManager.announce = announceHandler
      
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(event)
      
      expect(announceHandler).toHaveBeenCalledWith(
        expect.stringContaining('Grabbed')
      )
      
      keyboardManager.announce = originalMethod
    })

    it('should announce when item is dropped', () => {
      // Grab item first
      selectionManager.select(items[1])
      selectionManager.setFocus(items[1])
      
      const grabEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      })
      container.dispatchEvent(grabEvent)
      
      // Set up announcement spy
      const announceHandler = vi.fn()
      const originalMethod = keyboardManager.announce
      keyboardManager.announce = announceHandler
      
      // Move and drop
      selectionManager.setFocus(items[3])
      container.dispatchEvent(grabEvent)
      
      expect(announceHandler).toHaveBeenCalledWith(
        expect.stringContaining('Dropped')
      )
      
      keyboardManager.announce = originalMethod
    })
  })

  describe('Cleanup', () => {
    it('should remove event listeners on detach', () => {
      keyboardManager.attach()
      keyboardManager.detach()
      
      const handler = vi.fn()
      eventSystem.on('start', handler)
      
      // Try keyboard operation after detach
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true
      })
      container.dispatchEvent(event)
      
      // Should not trigger any events
      expect(handler).not.toHaveBeenCalled()
    })

    it('should reset tabindex values on detach', () => {
      keyboardManager.attach()
      keyboardManager.detach()
      
      items.forEach(item => {
        expect(item.getAttribute('tabindex')).toBe('-1')
      })
    })
  })
})