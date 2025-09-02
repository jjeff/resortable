import { describe, it, expect } from 'vitest'
import { DropZone } from '../../src/core/DropZone'

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  for (let i = 1; i <= 3; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `item-${i}`
    container.appendChild(el)
  }
  return container
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
    expect(order).toEqual(['item-2', 'item-3', 'item-1'])
  })
})
