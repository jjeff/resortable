import { describe, it, expect } from 'vitest'
import { DropZone } from '../../src/core/DropZone'

function createContainer(count = 3): HTMLElement {
  const container = document.createElement('div')
  for (let i = 1; i <= count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `${i}`
    container.appendChild(el)
  }
  return container
}

function getOrder(zone: DropZone): string[] {
  return zone.getItems().map((el) => el.dataset.id!)
}

describe('DropZone', () => {
  it('moves elements to new index', () => {
    const container = createContainer()
    const zone = new DropZone(container)
    const first = container.children[0] as HTMLElement
    zone.move(first, 2)
    const order = Array.from(container.children).map(
      (c) => (c as HTMLElement).dataset.id
    )
    expect(order).toEqual(['2', '3', '1'])
  })

  describe('moveMultiple', () => {
    it('moves multiple items to target index preserving relative order', () => {
      const container = createContainer(5)
      const zone = new DropZone(container)
      const items = zone.getItems()
      // Move items at index 0,1 to index 2 (among remaining [3,4,5], insert before index 2 = before 5)
      zone.moveMultiple([items[0], items[1]], 2)
      expect(getOrder(zone)).toEqual(['3', '4', '1', '2', '5'])
    })

    it('moves non-contiguous selected items preserving relative order', () => {
      const container = createContainer(5)
      const zone = new DropZone(container)
      const items = zone.getItems()
      // Move items at index 0,2 to index 2 (among remaining [2,4,5], insert before index 2 = before 5)
      zone.moveMultiple([items[0], items[2]], 2)
      expect(getOrder(zone)).toEqual(['2', '4', '1', '3', '5'])
    })

    it('moves items to the beginning', () => {
      const container = createContainer(5)
      const zone = new DropZone(container)
      const items = zone.getItems()
      // Move items at index 3,4 to index 0
      zone.moveMultiple([items[3], items[4]], 0)
      expect(getOrder(zone)).toEqual(['4', '5', '1', '2', '3'])
    })

    it('moves items to the end', () => {
      const container = createContainer(5)
      const zone = new DropZone(container)
      const items = zone.getItems()
      // Move items at index 0,1 to index 5
      zone.moveMultiple([items[0], items[1]], 5)
      expect(getOrder(zone)).toEqual(['3', '4', '5', '1', '2'])
    })

    it('handles single item (delegates to move)', () => {
      const container = createContainer(5)
      const zone = new DropZone(container)
      const items = zone.getItems()
      // Move item at index 0 to index 2 — delegates to move(), which places at sortable index 2
      zone.moveMultiple([items[0]], 2)
      expect(getOrder(zone)).toEqual(['2', '3', '1', '4', '5'])
    })

    it('handles empty items array', () => {
      const container = createContainer(5)
      const zone = new DropZone(container)
      zone.moveMultiple([], 2)
      expect(getOrder(zone)).toEqual(['1', '2', '3', '4', '5'])
    })
  })
})
