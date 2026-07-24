import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AnimationManager } from '../../src/animation/AnimationManager.js'
import { JSDOM } from 'jsdom'

describe('AnimationManager Integration Tests', () => {
  let dom: JSDOM
  let document: Document
  let container: HTMLElement
  let items: HTMLElement[]
  let animationManager: AnimationManager

  beforeEach(() => {
    // Set up a real DOM environment
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <body>
        <ul id="container">
          <li class="item" data-id="1">Item 1</li>
          <li class="item" data-id="2">Item 2</li>
          <li class="item" data-id="3">Item 3</li>
          <li class="item" data-id="4">Item 4</li>
          <li class="item" data-id="5">Item 5</li>
        </ul>
      </body>
    `,
      { url: 'http://localhost' }
    )

    document = dom.window.document
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, no-undef
    global.document = document as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, no-undef
    global.window = dom.window as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, no-undef
    global.HTMLElement = dom.window.HTMLElement as any

    // Mock the animate method since JSDOM doesn't support Web Animations API
    HTMLElement.prototype.animate = vi.fn().mockReturnValue({
      addEventListener: vi.fn((event, callback) => {
        if (event === 'finish') {
          // eslint-disable-next-line no-undef
          setTimeout(callback as () => void, 50)
        }
      }),
      cancel: vi.fn(),
      finish: vi.fn(),
    })

    container = document.getElementById('container') as HTMLElement
    items = Array.from(document.querySelectorAll('.item'))

    // Create animation manager with short duration for tests
    animationManager = new AnimationManager({ animation: 50 })
  })

  afterEach(() => {
    dom.window.close()
  })

  it('should handle FLIP animation for reordering real DOM elements', () => {
    // Mock different positions before and after to trigger animations
    const initialPositions = [0, 50, 100, 150, 200]
    const finalPositions = [50, 100, 150, 200, 0] // First item moves to end

    // Set initial positions
    items.forEach((item, i) => {
      let callCount = 0
      Object.defineProperty(item, 'getBoundingClientRect', {
        value: () => {
          // Return different values for initial vs final measurement
          const isInitial = callCount === 0
          callCount++
          return {
            top: isInitial ? initialPositions[i] : finalPositions[i],
            left: 0,
            width: 100,
            height: 40,
            bottom: (isInitial ? initialPositions[i] : finalPositions[i]) + 40,
            right: 100,
            x: 0,
            y: isInitial ? initialPositions[i] : finalPositions[i],
          }
        },
        configurable: true,
      })
    })

    let reorderCallbackCalled = false

    animationManager.animateReorder(items, () => {
      reorderCallbackCalled = true
      // Simulate reordering - move first item to end
      const firstItem = items[0]
      container.appendChild(firstItem)
    })

    // Callback should have been called
    expect(reorderCallbackCalled).toBe(true)

    // Check that animate was called on elements that moved
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(HTMLElement.prototype.animate).toHaveBeenCalled()

    // Every item's mocked initial/final rect differs (see initialPositions/
    // finalPositions above), so animate() must fire on each of the 5 real
    // elements, in order — not just "on something, somewhere" (the
    // tautological `.filter(() => true)` this replaced).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const animateContexts = vi.mocked(HTMLElement.prototype.animate).mock
      .contexts
    expect(animateContexts).toHaveLength(items.length)
    animateContexts.forEach((ctx, i) => {
      expect(ctx).toBe(items[i])
    })
  })

  it('should apply insert animation to new elements', () => {
    const newItem = document.createElement('li')
    newItem.className = 'item'
    newItem.textContent = 'New Item'

    animationManager.animateInsert(newItem)

    // Check that initial animation styles were applied
    expect(newItem.style.opacity).toBe('1')
    expect(newItem.style.transform).toBe('scale(1)')
    expect(newItem.style.transition).toContain('opacity')
    expect(newItem.style.transition).toContain('transform')
  })

  it('should apply remove animation to elements', async () => {
    const itemToRemove = items[2]
    let callbackCalled = false

    animationManager.animateRemove(itemToRemove, () => {
      callbackCalled = true
    })

    // Check that removal animation styles were applied
    expect(itemToRemove.style.opacity).toBe('0')
    expect(itemToRemove.style.transform).toBe('scale(0.8)')
    expect(itemToRemove.style.transition).toContain('opacity')
    expect(itemToRemove.style.transition).toContain('transform')

    // Wait for animation callback to be called
    await new Promise((resolve) => {
      // eslint-disable-next-line no-undef
      setTimeout(() => {
        expect(callbackCalled).toBe(true)
        resolve(undefined)
      }, 60)
    })
  })

  it('should handle ghost element animations', () => {
    const ghostElement = document.createElement('li')
    ghostElement.className = 'item ghost'

    // Animate ghost in
    animationManager.animateGhostIn(ghostElement)

    expect(ghostElement.style.opacity).toBe('0.5')
    expect(ghostElement.style.transform).toBe('scale(1)')

    // Animate ghost out
    animationManager.animateGhostOut(ghostElement, () => {
      // Callback for ghost removal
    })

    expect(ghostElement.style.opacity).toBe('0')
    expect(ghostElement.style.transform).toBe('scale(0.95)')
  })

  it('should skip animations when duration is 0', () => {
    const noAnimManager = new AnimationManager({ animation: 0 })

    // Test reorder with no animation
    const reorderCallback = vi.fn()
    noAnimManager.animateReorder(items, reorderCallback)

    // Callback should be called immediately
    expect(reorderCallback).toHaveBeenCalledTimes(1)

    // No transforms should be applied
    items.forEach((item) => {
      expect(item.style.transform).toBe('')
    })

    // Test insert with no animation
    const newItem = document.createElement('li')
    noAnimManager.animateInsert(newItem)

    expect(newItem.style.opacity).toBe('')
    expect(newItem.style.transform).toBe('')
    expect(newItem.style.transition).toBe('')
  })

  it('should cancel all active animations', () => {
    // Create fresh elements for this test
    const testItems = [
      document.createElement('li'),
      document.createElement('li'),
      document.createElement('li'),
    ]

    // Start a reorder animation that can be cancelled
    animationManager.animateReorder(testItems, () => {
      // Simulate reorder
    })

    // Cancel all animations
    animationManager.cancelAll()

    // All animation styles should be cleared on elements that were being animated
    testItems.forEach((item) => {
      // After cancellation, transform and transition should be cleared
      expect(item.style.transform).toBe('')
      expect(item.style.transition).toBe('')
    })
  })

  it('should update animation options at runtime', () => {
    // AnimationManager exposes no getter for duration/easing, so the only
    // way to prove updateOptions() actually mutated them is to force a real
    // animate() call afterward and inspect what reached it. Start at
    // animation: 0 (skips animating) so a later animate() call can only be
    // explained by the updateOptions() calls below having taken effect.
    const rtManager = new AnimationManager({ animation: 0 })

    rtManager.updateOptions({ animation: 200 })
    rtManager.updateOptions({ easing: 'linear' })
    rtManager.updateOptions({
      animation: 300,
      easing: 'ease-in-out',
    })

    const testItems = [
      document.createElement('li'),
      document.createElement('li'),
    ]
    testItems.forEach((item) => container.appendChild(item))

    // Give each item a distinct initial vs. final rect so animateReorder
    // treats them as moved.
    const positions = [0, 100]
    testItems.forEach((item, i) => {
      let callCount = 0
      Object.defineProperty(item, 'getBoundingClientRect', {
        value: () => {
          const top = callCount === 0 ? positions[i] : positions[1 - i]
          callCount++
          return {
            top,
            left: 0,
            width: 100,
            height: 40,
            bottom: top + 40,
            right: 100,
            x: 0,
            y: top,
          }
        },
        configurable: true,
      })
    })

    rtManager.animateReorder(testItems, () => {})

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(HTMLElement.prototype.animate).toHaveBeenCalled()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const [, options] = vi.mocked(HTMLElement.prototype.animate).mock.calls[0]
    expect(options).toMatchObject({ duration: 300, easing: 'ease-in-out' })
  })
})
