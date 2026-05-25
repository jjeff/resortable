import { describe, it, expect, beforeEach } from 'vitest'
import { DragManager } from '../../src/core/DragManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'
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
