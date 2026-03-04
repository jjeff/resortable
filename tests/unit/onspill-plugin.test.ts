import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OnSpillPlugin } from '../../src/plugins/OnSpillPlugin'
import { EventSystem } from '../../src/core/EventSystem'
import type { SortableEvents, SortableInstance } from '../../src/types/index'

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

function createMockSortable(container: HTMLElement): SortableInstance {
  return {
    element: container,
    options: {},
    eventSystem: new EventSystem<SortableEvents>(),
  } as unknown as SortableInstance
}

describe('OnSpillPlugin', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  it('has correct name and version', () => {
    const plugin = OnSpillPlugin.create()
    expect(plugin.name).toBe('OnSpill')
    expect(plugin.version).toBe('2.0.0')
  })

  it('can be created with static factory method', () => {
    const plugin = OnSpillPlugin.create({ revertOnSpill: true })
    expect(plugin).toBeInstanceOf(OnSpillPlugin)
  })

  it('installs and uninstalls without error', () => {
    const plugin = OnSpillPlugin.create()
    const sortable = createMockSortable(container)
    expect(() => plugin.install(sortable)).not.toThrow()
    expect(() => plugin.uninstall(sortable)).not.toThrow()
  })

  it('fires spill event when item returns to original position', () => {
    const plugin = OnSpillPlugin.create({ revertOnSpill: true })
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))
    const spillHandler = vi.fn()
    sortable.eventSystem.on('spill', spillHandler)

    // Simulate drag start
    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    // Simulate drag end at same position (spill)
    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    expect(spillHandler).toHaveBeenCalledTimes(1)

    plugin.uninstall(sortable)
  })

  it('does not fire spill event when item moves to new position', () => {
    const plugin = OnSpillPlugin.create({ revertOnSpill: true })
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))
    const spillHandler = vi.fn()
    sortable.eventSystem.on('spill', spillHandler)

    // Simulate drag start
    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    // Move item to position 2 in DOM
    container.appendChild(items[0])

    // Simulate drag end at new position (not a spill)
    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 2,
    })

    expect(spillHandler).not.toHaveBeenCalled()

    plugin.uninstall(sortable)
  })

  it('calls onSpill callback when spill occurs', () => {
    const onSpillCb = vi.fn()
    const plugin = OnSpillPlugin.create({
      revertOnSpill: true,
      onSpill: onSpillCb,
    })
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))

    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    expect(onSpillCb).toHaveBeenCalledTimes(1)

    plugin.uninstall(sortable)
  })

  it('removes item from DOM with removeOnSpill', () => {
    const plugin = OnSpillPlugin.create({
      removeOnSpill: true,
      revertOnSpill: false,
    })
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))

    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    // Item should be removed from DOM
    expect(items[0].parentElement).toBeNull()
    expect(container.children.length).toBe(2)

    plugin.uninstall(sortable)
  })

  it('keeps item in place with revertOnSpill (default)', () => {
    const plugin = OnSpillPlugin.create({ revertOnSpill: true })
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))

    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    // Item should still be in DOM at original position
    expect(items[0].parentElement).toBe(container)
    expect(container.children.length).toBe(3)
    expect(container.children[0]).toBe(items[0])

    plugin.uninstall(sortable)
  })

  it('defaults to revertOnSpill when neither option is set', () => {
    const plugin = OnSpillPlugin.create()
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))

    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    // Default is revert, so item should stay in DOM
    expect(items[0].parentElement).toBe(container)
    expect(container.children.length).toBe(3)

    plugin.uninstall(sortable)
  })

  it('cleans up event listeners on uninstall', () => {
    const plugin = OnSpillPlugin.create()
    const sortable = createMockSortable(container)
    plugin.install(sortable)

    const spillHandler = vi.fn()
    sortable.eventSystem.on('spill', spillHandler)

    plugin.uninstall(sortable)

    const items = Array.from(container.querySelectorAll('.sortable-item'))

    // After uninstall, drag events should not trigger spill
    sortable.eventSystem.emit('start', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    sortable.eventSystem.emit('end', {
      item: items[0],
      items: [items[0]],
      from: container,
      to: container,
      oldIndex: 0,
      newIndex: 0,
    })

    expect(spillHandler).not.toHaveBeenCalled()
  })
})
