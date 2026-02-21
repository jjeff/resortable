import { describe, it, expect, beforeEach } from 'vitest'
import { DragManager } from '../../src/core/DragManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'
import type { SortableEvents } from '../../src/types/index'

// JSDOM doesn't have PointerEvent — polyfill for tests
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    readonly width: number
    readonly height: number
    readonly pressure: number
    readonly tiltX: number
    readonly tiltY: number

    constructor(
      type: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: PointerEventInit & Record<string, any> = {}
    ) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? ''
      this.isPrimary = params.isPrimary ?? false
      this.width = params.width ?? 1
      this.height = params.height ?? 1
      this.pressure = params.pressure ?? 0
      this.tiltX = params.tiltX ?? 0
      this.tiltY = params.tiltY ?? 0
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  globalThis.PointerEvent = PointerEventPolyfill as any
}

function createContainer(count = 3): HTMLElement {
  const container = document.createElement('div')
  for (let i = 1; i <= count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `${i}`
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

describe('Touch Support', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  describe('touch-action CSS', () => {
    it('sets touch-action: none on draggable items during attach', () => {
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined)
      dm.attach()

      const items = container.querySelectorAll('.sortable-item')
      items.forEach((item) => {
        expect((item as HTMLElement).style.touchAction).toBe('none')
      })

      dm.detach()
    })

    it('restores original touch-action on detach', () => {
      const items = container.querySelectorAll('.sortable-item')
      ;(items[0] as HTMLElement).style.touchAction = 'auto'

      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined)
      dm.attach()
      expect((items[0] as HTMLElement).style.touchAction).toBe('none')

      dm.detach()
      expect((items[0] as HTMLElement).style.touchAction).toBe('auto')
    })

    it('sets touch-action: none only on handles when handle option is set', () => {
      // Add handles to items
      container.querySelectorAll('.sortable-item').forEach((item) => {
        const handle = document.createElement('span')
        handle.className = 'drag-handle'
        item.appendChild(handle)
      })

      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        handle: '.drag-handle',
      })
      dm.attach()

      // Items should NOT have touch-action: none
      container.querySelectorAll('.sortable-item').forEach((item) => {
        expect((item as HTMLElement).style.touchAction).not.toBe('none')
      })

      // Handles SHOULD have touch-action: none
      container.querySelectorAll('.drag-handle').forEach((handle) => {
        expect((handle as HTMLElement).style.touchAction).toBe('none')
      })

      dm.detach()
    })
  })

  describe('hold-to-drag feedback', () => {
    it('adds sortable-holding class during touch delay', () => {
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        delayOnTouchOnly: 200,
      })
      dm.attach()

      const item = container.querySelector('.sortable-item') as HTMLElement

      // Simulate touch pointerdown
      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 50,
        clientY: 50,
        bubbles: true,
        isPrimary: true,
        button: 0,
      })
      item.dispatchEvent(pointerDown)

      // During delay, item should have the holding class
      expect(item.classList.contains('sortable-holding')).toBe(true)

      // Clean up
      dm.detach()
    })

    it('removes sortable-holding class when delay is cancelled by movement', () => {
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        delayOnTouchOnly: 200,
        touchStartThreshold: 5,
      })
      dm.attach()

      const item = container.querySelector('.sortable-item') as HTMLElement

      // Simulate touch pointerdown
      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 50,
        clientY: 50,
        bubbles: true,
        isPrimary: true,
        button: 0,
      })
      item.dispatchEvent(pointerDown)
      expect(item.classList.contains('sortable-holding')).toBe(true)

      // Simulate move beyond threshold to cancel
      const pointerMove = new PointerEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 50,
        clientY: 100, // 50px movement > 5px threshold
        bubbles: true,
      })
      document.dispatchEvent(pointerMove)

      expect(item.classList.contains('sortable-holding')).toBe(false)

      dm.detach()
    })

    it('applies default hold styles (scale + shadow)', () => {
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        delayOnTouchOnly: 200,
      })
      dm.attach()

      const item = container.querySelector('.sortable-item') as HTMLElement

      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'touch',
        clientX: 50,
        clientY: 50,
        bubbles: true,
        isPrimary: true,
        button: 0,
      })
      item.dispatchEvent(pointerDown)

      // Check for scale transform and shadow
      expect(item.style.transform).toContain('scale')
      expect(item.style.boxShadow).toBeTruthy()

      dm.detach()
    })
  })

  describe('HTML5 DnD suppression', () => {
    it('does not set draggable=true on touch-capable devices', () => {
      // Simulate touch capability
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 5,
        configurable: true,
      })

      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined)
      dm.attach()

      const items = container.querySelectorAll('.sortable-item')
      items.forEach((item) => {
        expect((item as HTMLElement).draggable).toBe(false)
      })

      dm.detach()

      // Clean up
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      })
    })

    it('sets draggable=true on non-touch devices', () => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        configurable: true,
      })

      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined)
      dm.attach()

      const items = container.querySelectorAll('.sortable-item')
      items.forEach((item) => {
        expect((item as HTMLElement).draggable).toBe(true)
      })

      dm.detach()
    })
  })
})
