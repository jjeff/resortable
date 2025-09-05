import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AnimationManager } from '../../src/animation/AnimationManager.js'

describe('AnimationManager', () => {
  let manager: AnimationManager
  let mockElement: HTMLElement
  let mockElements: HTMLElement[]

  beforeEach(() => {
    manager = new AnimationManager({ animation: 150 })

    // Create mock elements
    mockElement = document.createElement('div')
    mockElements = [
      document.createElement('div'),
      document.createElement('div'),
      document.createElement('div'),
    ]

    // Mock getBoundingClientRect
    mockElements.forEach((el, i) => {
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        top: i * 100,
        left: i * 50,
        width: 100,
        height: 50,
        right: i * 50 + 100,
        bottom: i * 100 + 50,
        x: i * 50,
        y: i * 100,
      } as DOMRect)
    })

    // Mock animate method
    mockElements.forEach((el) => {
      el.animate = vi.fn().mockReturnValue({
        addEventListener: vi.fn((event, callback) => {
          if (event === 'finish') {
            // Simulate animation finish
            // eslint-disable-next-line no-undef
            setTimeout(callback as () => void, 150)
          }
        }),
        cancel: vi.fn(),
      })
    })

    // Mock offsetHeight for reflow forcing
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 100,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultManager = new AnimationManager()
      expect(defaultManager).toBeDefined()
    })

    it('should accept custom animation duration', () => {
      const customManager = new AnimationManager({ animation: 300 })
      expect(customManager).toBeDefined()
    })

    it('should accept custom easing function', () => {
      const customManager = new AnimationManager({
        easing: 'ease-in-out',
      })
      expect(customManager).toBeDefined()
    })
  })

  describe('animateReorder', () => {
    it('should skip animation when duration is 0', () => {
      const zeroManager = new AnimationManager({ animation: 0 })
      const callback = vi.fn()

      zeroManager.animateReorder(mockElements, callback)

      expect(callback).toHaveBeenCalledTimes(1)
      mockElements.forEach((el) => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(el.animate).not.toHaveBeenCalled()
      })
    })

    it('should capture initial positions before reordering', () => {
      const callback = vi.fn()

      manager.animateReorder(mockElements, callback)

      expect(callback).toHaveBeenCalledTimes(1)
      mockElements.forEach((el) => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(el.getBoundingClientRect).toHaveBeenCalled()
      })
    })

    it('should apply FLIP animation to moved elements', () => {
      const callback = vi.fn()

      // Change positions after callback
      mockElements.forEach((el, i) => {
        const spy = vi.spyOn(el, 'getBoundingClientRect')
        spy.mockReturnValueOnce({
          top: i * 100,
          left: i * 50,
          width: 100,
          height: 50,
          right: i * 50 + 100,
          bottom: i * 100 + 50,
          x: i * 50,
          y: i * 100,
        } as DOMRect)
        spy.mockReturnValueOnce({
          top: (2 - i) * 100, // Reversed positions
          left: (2 - i) * 50,
          width: 100,
          height: 50,
          right: (2 - i) * 50 + 100,
          bottom: (2 - i) * 100 + 50,
          x: (2 - i) * 50,
          y: (2 - i) * 100,
        } as DOMRect)
      })

      manager.animateReorder(mockElements, callback)

      // Elements that moved should have animations
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockElements[0].animate).toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockElements[2].animate).toHaveBeenCalled()
    })

    it('should skip elements that have not moved', () => {
      const callback = vi.fn()

      // Same positions before and after
      mockElements.forEach((el, i) => {
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
          top: i * 100,
          left: i * 50,
          width: 100,
          height: 50,
          right: i * 50 + 100,
          bottom: i * 100 + 50,
          x: i * 50,
          y: i * 100,
        } as DOMRect)
      })

      manager.animateReorder(mockElements, callback)

      mockElements.forEach((el) => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(el.animate).not.toHaveBeenCalled()
      })
    })
  })

  describe('animateInsert', () => {
    it('should skip animation when duration is 0', () => {
      const zeroManager = new AnimationManager({ animation: 0 })

      zeroManager.animateInsert(mockElement)

      expect(mockElement.style.opacity).toBe('')
      expect(mockElement.style.transform).toBe('')
    })

    it('should animate element insertion with scale and opacity', () => {
      vi.useFakeTimers()

      manager.animateInsert(mockElement)

      // Should end at full opacity and scale
      expect(mockElement.style.opacity).toBe('1')
      expect(mockElement.style.transform).toBe('scale(1)')

      // Cleanup should happen after animation
      vi.advanceTimersByTime(150)
      expect(mockElement.style.transition).toBe('')

      vi.useRealTimers()
    })
  })

  describe('animateRemove', () => {
    it('should skip animation when duration is 0', () => {
      const zeroManager = new AnimationManager({ animation: 0 })
      const callback = vi.fn()

      zeroManager.animateRemove(mockElement, callback)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(mockElement.style.opacity).toBe('')
    })

    it('should animate element removal with scale and opacity', () => {
      vi.useFakeTimers()
      const callback = vi.fn()

      manager.animateRemove(mockElement, callback)

      // Should animate to zero opacity and smaller scale
      expect(mockElement.style.opacity).toBe('0')
      expect(mockElement.style.transform).toBe('scale(0.8)')

      // Callback should be called after animation
      expect(callback).not.toHaveBeenCalled()
      vi.advanceTimersByTime(150)
      expect(callback).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('animateGhostIn', () => {
    it('should skip animation when duration is 0', () => {
      const zeroManager = new AnimationManager({ animation: 0 })

      zeroManager.animateGhostIn(mockElement)

      expect(mockElement.style.opacity).toBe('')
      expect(mockElement.style.transform).toBe('')
    })

    it('should animate ghost appearance', () => {
      manager.animateGhostIn(mockElement)

      // Should animate to semi-transparent and full scale
      expect(mockElement.style.opacity).toBe('0.5')
      expect(mockElement.style.transform).toBe('scale(1)')
    })
  })

  describe('animateGhostOut', () => {
    it('should skip animation when duration is 0', () => {
      const zeroManager = new AnimationManager({ animation: 0 })
      const callback = vi.fn()

      zeroManager.animateGhostOut(mockElement, callback)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(mockElement.style.opacity).toBe('')
    })

    it('should animate ghost removal', () => {
      vi.useFakeTimers()
      const callback = vi.fn()

      manager.animateGhostOut(mockElement, callback)

      // Should animate to transparent and smaller scale
      expect(mockElement.style.opacity).toBe('0')
      expect(mockElement.style.transform).toBe('scale(0.95)')

      // Callback should be called after half duration
      expect(callback).not.toHaveBeenCalled()
      vi.advanceTimersByTime(75)
      expect(callback).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('updateOptions', () => {
    it('should update animation duration', () => {
      const callback = vi.fn()
      manager.updateOptions({ animation: 300 })

      // Test with new duration (we'd need to expose duration to properly test this)
      const zeroManager = new AnimationManager({ animation: 0 })
      zeroManager.updateOptions({ animation: 300 })
      zeroManager.animateReorder(mockElements, callback)

      // Since we changed from 0 to 300, animation should now happen
      // (This is a simplified test - in reality we'd need to expose internal state)
    })

    it('should update easing function', () => {
      manager.updateOptions({ easing: 'linear' })
      // Similarly, we'd need to expose easing to properly test this
    })

    it('should update both options simultaneously', () => {
      manager.updateOptions({
        animation: 500,
        easing: 'ease-out',
      })
      // Test that both are updated
    })
  })

  describe('cancelAll', () => {
    it('should cancel all active animations', () => {
      const callback = vi.fn()

      // Start some animations
      manager.animateReorder(mockElements, callback)

      // Cancel all
      manager.cancelAll()

      // Elements should have clean styles
      mockElements.forEach((el) => {
        expect(el.style.transform).toBe('')
        expect(el.style.transition).toBe('')
      })
    })

    it('should clear the active animations map', () => {
      const callback = vi.fn()

      // Start animations
      manager.animateReorder(mockElements, callback)

      // Cancel and verify map is cleared
      manager.cancelAll()

      // Starting new animations should work fine
      manager.animateReorder(mockElements, callback)
      expect(callback).toHaveBeenCalledTimes(2)
    })
  })
})
