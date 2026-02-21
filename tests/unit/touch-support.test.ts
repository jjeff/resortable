import { describe, it, expect, beforeEach } from 'vitest'
import { DragManager } from '../../src/core/DragManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'
import type { SortableEvents } from '../../src/types/index'

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
})
