import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MultiDragVisualManager } from '../../src/core/MultiDragVisualManager'

// Mock DOM methods
Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  value: vi.fn(() => ({
    left: 0,
    top: 0,
    width: 100,
    height: 50,
  })),
})

// Mock animate method
Object.defineProperty(HTMLElement.prototype, 'animate', {
  value: vi.fn(() => ({
    addEventListener: vi.fn(),
    cancel: vi.fn(),
  })),
})

describe('MultiDragVisualManager', () => {
  let manager: MultiDragVisualManager
  let primaryItem: HTMLElement
  let selectedItems: HTMLElement[]

  beforeEach(() => {
    manager = new MultiDragVisualManager()

    // Create mock elements
    primaryItem = document.createElement('div')
    primaryItem.textContent = 'Primary Item'

    selectedItems = [
      primaryItem,
      document.createElement('div'),
      document.createElement('div'),
    ]

    selectedItems[1].textContent = 'Secondary Item 1'
    selectedItems[2].textContent = 'Secondary Item 2'
  })

  describe('Constructor', () => {
    it('should initialize with default state', () => {
      expect(manager.isFoldingActive()).toBe(false)
    })
  })

  describe('initiateVisualFold', () => {
    it('should skip folding if only one item', async () => {
      await manager.initiateVisualFold(primaryItem, [primaryItem])
      expect(manager.isFoldingActive()).toBe(false)
    })

    it('should skip folding if already folding', async () => {
      // Start first fold
      const foldPromise = manager.initiateVisualFold(primaryItem, selectedItems)

      // Should be folding immediately
      expect(manager.isFoldingActive()).toBe(true)

      // Try to start second fold while first is active - should be skipped
      await manager.initiateVisualFold(primaryItem, selectedItems)

      // Wait for first fold to complete
      await foldPromise

      // Should still be folding (until reset/unfold)
      expect(manager.isFoldingActive()).toBe(true)

      // Clean up by resetting
      manager.resetFolding()
      expect(manager.isFoldingActive()).toBe(false)
    })

    it('should set folding state during animation', async () => {
      const foldPromise = manager.initiateVisualFold(primaryItem, selectedItems)

      // Should be folding during animation
      expect(manager.isFoldingActive()).toBe(true)

      await foldPromise

      // Should remain folding until reset or unfold is called
      expect(manager.isFoldingActive()).toBe(true)

      // Reset should clear folding state
      manager.resetFolding()
      expect(manager.isFoldingActive()).toBe(false)
    })
  })

  describe('createCompositeDragImage', () => {
    it('should return null for single item', () => {
      const result = manager.createCompositeDragImage([primaryItem])
      expect(result).toBeNull()
    })

    it('should create composite image for multiple items', () => {
      const result = manager.createCompositeDragImage(selectedItems)

      expect(result).toBeInstanceOf(HTMLElement)
      expect(result?.className).toBe('sortable-multidrag-composite')
      expect(result?.style.position).toBe('absolute')
    })

    it('should add selection count indicator', () => {
      const result = manager.createCompositeDragImage(selectedItems)
      const indicator = result?.querySelector('.sortable-multidrag-count')

      expect(indicator).toBeTruthy()
      expect(indicator?.textContent).toBe('3')
    })

    it('should limit visible items to 3', () => {
      const manyItems = Array.from({ length: 10 }, () =>
        document.createElement('div')
      )
      const result = manager.createCompositeDragImage(manyItems)

      // Should only have 3 cloned items plus the count indicator
      expect(result?.children.length).toBe(4) // 3 items + 1 count indicator
    })
  })

  describe('setupNativeDragImage', () => {
    it('should call setDragImage on dataTransfer', () => {
      const setDragImageMock = vi.fn()
      const mockDataTransfer = {
        setDragImage: setDragImageMock,
      } as unknown as DataTransfer

      const dragImage = document.createElement('div')

      manager.setupNativeDragImage(mockDataTransfer, dragImage)

      expect(setDragImageMock).toHaveBeenCalledWith(
        dragImage,
        expect.any(Number),
        expect.any(Number)
      )
    })
  })

  describe('animateUnfold', () => {
    it('should do nothing if not folding', () => {
      manager.animateUnfold()
      expect(manager.isFoldingActive()).toBe(false)
    })

    it('should reset folding state', async () => {
      await manager.initiateVisualFold(primaryItem, selectedItems)
      manager.animateUnfold()
      expect(manager.isFoldingActive()).toBe(false)
    })
  })

  describe('resetFolding', () => {
    it('should clear folding state', async () => {
      await manager.initiateVisualFold(primaryItem, selectedItems)
      manager.resetFolding()

      expect(manager.isFoldingActive()).toBe(false)
    })

    it('should clean up composite drag image', () => {
      const composite = manager.createCompositeDragImage(selectedItems)

      // Verify composite is in DOM
      expect(composite?.parentNode).toBeTruthy()

      manager.resetFolding()

      // Should be removed from DOM
      expect(composite?.parentNode).toBeFalsy()
    })
  })

  describe('destroy', () => {
    it('should clean up all state', async () => {
      await manager.initiateVisualFold(primaryItem, selectedItems)
      const composite = manager.createCompositeDragImage(selectedItems)

      manager.destroy()

      expect(manager.isFoldingActive()).toBe(false)
      expect(composite?.parentNode).toBeFalsy()
    })
  })
})
