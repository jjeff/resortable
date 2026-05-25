import { describe, it, expect, beforeEach } from 'vitest'
import { DragManager } from '../../src/core/DragManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'
import { GhostManager } from '../../src/core/GhostManager'
import type { SortableEvents } from '../../src/types/index'

/**
 * Unit coverage for #29 PR1 — `forceFallback` skips HTML5 listener
 * registration on the container so the pointer pipeline is the sole drag
 * code path. JSDOM does not expose attached listeners, so we spy on
 * `addEventListener` / `removeEventListener` on the container element
 * during attach/detach and inspect the recorded event types.
 */

const HTML5_DRAG_EVENTS = [
  'dragstart',
  'dragover',
  'drop',
  'dragend',
  'dragenter',
  'dragleave',
]

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

interface ListenerSpy {
  events: string[]
  restore: () => void
}

function spyAddEventListener(el: HTMLElement): ListenerSpy {
  const events: string[] = []
  const original = el.addEventListener.bind(el)
  el.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    events.push(type)
    return original(type, listener, options)
  } as typeof el.addEventListener
  return {
    events,
    restore: () => {
      el.addEventListener = original
    },
  }
}

describe('forceFallback (#29 PR1)', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  describe('listener registration', () => {
    it('registers HTML5 drag listeners by default (forceFallback: false)', () => {
      const spy = spyAddEventListener(container)
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        delayOnTouchOnly: 0,
      })
      dm.attach()

      for (const evt of HTML5_DRAG_EVENTS) {
        expect(spy.events).toContain(evt)
      }
      // Pointer pipeline should still be active.
      expect(spy.events).toContain('pointerdown')

      dm.detach()
      spy.restore()
    })

    it('skips HTML5 drag listeners when forceFallback: true', () => {
      const spy = spyAddEventListener(container)
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        delayOnTouchOnly: 0,
        forceFallback: true,
      })
      dm.attach()

      for (const evt of HTML5_DRAG_EVENTS) {
        expect(spy.events).not.toContain(evt)
      }
      // Pointer pipeline is the sole drag code path in fallback mode.
      expect(spy.events).toContain('pointerdown')

      dm.detach()
      spy.restore()
    })

    it('detach() mirrors attach() — does not remove listeners it never added', () => {
      const zone = new DropZone(container)
      const events = new EventSystem<SortableEvents>()
      const dm = new DragManager(zone, events, undefined, {
        delayOnTouchOnly: 0,
        forceFallback: true,
      })
      dm.attach()

      // Spy installed AFTER attach so we only capture detach() activity.
      const removed: string[] = []
      const originalRemove = container.removeEventListener.bind(container)
      container.removeEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions
      ): void {
        removed.push(type)
        return originalRemove(type, listener, options)
      } as typeof container.removeEventListener

      dm.detach()

      for (const evt of HTML5_DRAG_EVENTS) {
        expect(removed).not.toContain(evt)
      }
      expect(removed).toContain('pointerdown')

      container.removeEventListener = originalRemove
    })
  })
})

/**
 * Unit coverage for #29 PR2 — `fallbackOnBody`, `fallbackOffsetX`,
 * `fallbackOffsetY`. Verifies the options bag is threaded from
 * {@link GhostManager.createGhost} through to (a) where the ghost is appended
 * and (b) the inline `left` / `top` set on each `updateGhostPosition` call.
 */
describe('fallback options (#29 PR2)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function makeTarget(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.style.position = 'absolute'
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.width = '100px'
    el.style.height = '50px'
    document.body.appendChild(el)
    return el
  }

  function makePointerEvent(x: number, y: number): PointerEvent {
    // jsdom supports the PointerEvent constructor in recent versions; if it
    // doesn't, fall back to MouseEvent (the GhostManager only reads
    // `clientX` / `clientY`).
    try {
      return new PointerEvent('pointerdown', { clientX: x, clientY: y })
    } catch {
      return new MouseEvent('pointerdown', {
        clientX: x,
        clientY: y,
      }) as unknown as PointerEvent
    }
  }

  describe('appendTo (fallbackOnBody)', () => {
    it('defaults to document.body when no appendTo is supplied', () => {
      const gm = new GhostManager()
      const target = makeTarget()
      const ghost = gm.createGhost(target, makePointerEvent(10, 10))
      expect(ghost.parentElement).toBe(document.body)
      gm.destroy(target)
    })

    it('appends to the supplied container when appendTo is provided', () => {
      const gm = new GhostManager()
      const zone = document.createElement('div')
      zone.id = 'zone'
      document.body.appendChild(zone)
      const target = document.createElement('div')
      target.className = 'sortable-item'
      target.style.width = '100px'
      target.style.height = '50px'
      zone.appendChild(target)

      const ghost = gm.createGhost(target, makePointerEvent(10, 10), {
        appendTo: zone,
      })
      expect(ghost.parentElement).toBe(zone)
      gm.destroy(target)
    })
  })

  describe('offsetX / offsetY', () => {
    it('passes through to updateGhostPosition (additive shift)', () => {
      const gm = new GhostManager()
      const target = makeTarget()
      // Cursor starts at (50, 25) — element top-left is (0, 0), so the grab
      // offset captured by createGhost is (50, 25). With fallback offsets of
      // (+20, -10), the inline position at the same cursor should be
      // (50 - 50 + 20, 25 - 25 - 10) = (20, -10).
      const ghost = gm.createGhost(target, makePointerEvent(50, 25), {
        offsetX: 20,
        offsetY: -10,
      })
      expect(ghost.style.left).toBe('20px')
      expect(ghost.style.top).toBe('-10px')

      // Subsequent updates apply the same additive shift on top of the
      // cursor-relative position.
      gm.updateGhostPosition(150, 125)
      expect(ghost.style.left).toBe('120px') // 150 - 50 + 20
      expect(ghost.style.top).toBe('90px') // 125 - 25 + (-10) = 90
      gm.destroy(target)
    })

    it('default offset of zero matches pre-PR2 behaviour', () => {
      const gm = new GhostManager()
      const target = makeTarget()
      const ghost = gm.createGhost(target, makePointerEvent(50, 25))
      // No offset → ghost top-left tracks the element top-left exactly.
      expect(ghost.style.left).toBe('0px')
      expect(ghost.style.top).toBe('0px')

      gm.updateGhostPosition(100, 60)
      expect(ghost.style.left).toBe('50px')
      expect(ghost.style.top).toBe('35px')
      gm.destroy(target)
    })
  })
})
