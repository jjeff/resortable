import { beforeEach, vi } from 'vitest'

// Mock DOM methods that might not be available in jsdom
beforeEach(() => {
  // Mock requestAnimationFrame
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return setTimeout(cb, 16) // ~60fps
  })

  // Mock cancelAnimationFrame
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    clearTimeout(id)
  })

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock getBoundingClientRect
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: vi.fn(),
  }))

  // Mock scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()

  // Reset all mocks before each test
  vi.clearAllMocks()
})
