import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Sortable, PluginSystem } from '../../src/index'
import type { SortablePlugin } from '../../src/types/index'

function createContainer(count = 3): HTMLElement {
  const container = document.createElement('div')
  for (let i = 1; i <= count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `item-${i}`
    container.appendChild(el)
  }
  document.body.appendChild(container)
  return container
}

describe('Sortable API', () => {
  let container: HTMLElement
  let sortable: Sortable

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  afterEach(() => {
    sortable?.destroy()
    // Clean up any registered test plugins
    PluginSystem.unregister('TestPlugin')
    PluginSystem.unregister('TestPlugin2')
  })

  describe('Sortable.mount()', () => {
    it('registers a single plugin', () => {
      const testPlugin: SortablePlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }

      Sortable.mount(testPlugin)
      expect(PluginSystem.get('TestPlugin')).toBe(testPlugin)
    })

    it('registers multiple plugins at once', () => {
      const plugin1: SortablePlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }
      const plugin2: SortablePlugin = {
        name: 'TestPlugin2',
        version: '1.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }

      Sortable.mount([plugin1, plugin2])
      expect(PluginSystem.get('TestPlugin')).toBe(plugin1)
      expect(PluginSystem.get('TestPlugin2')).toBe(plugin2)
    })

    it('overwrites existing plugin registration', () => {
      const v1: SortablePlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }
      const v2: SortablePlugin = {
        name: 'TestPlugin',
        version: '2.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }

      Sortable.mount(v1)
      Sortable.mount(v2)
      expect(PluginSystem.get('TestPlugin')).toBe(v2)
    })

    it('mounted plugin can be used by instances', () => {
      const installFn = vi.fn()
      const testPlugin: SortablePlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        install: installFn,
        uninstall: vi.fn(),
      }

      Sortable.mount(testPlugin)
      sortable = new Sortable(container)
      sortable.usePlugin('TestPlugin')

      expect(installFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('save()', () => {
    it('calls store.set when save is invoked', () => {
      const setFn = vi.fn()
      sortable = new Sortable(container, {
        store: { set: setFn },
      })

      sortable.save()
      expect(setFn).toHaveBeenCalledTimes(1)
      expect(setFn).toHaveBeenCalledWith(sortable)
    })

    it('does nothing when no store is configured', () => {
      sortable = new Sortable(container)
      expect(() => sortable.save()).not.toThrow()
    })

    it('store.set receives instance with toArray()', () => {
      const setFn = vi.fn()
      sortable = new Sortable(container, {
        store: { set: setFn },
      })

      sortable.save()

      const receivedInstance = setFn.mock.calls[0][0] as {
        toArray: () => string[]
      }
      expect(receivedInstance.toArray()).toEqual(['item-1', 'item-2', 'item-3'])
    })

    it('store.get restores order on initialization', () => {
      const getFn = vi.fn().mockReturnValue(['item-3', 'item-1', 'item-2'])
      sortable = new Sortable(container, {
        store: { get: getFn },
      })

      expect(getFn).toHaveBeenCalledTimes(1)
      const order = sortable.toArray()
      expect(order).toEqual(['item-3', 'item-1', 'item-2'])
    })

    it('store.get with empty array does not reorder', () => {
      const getFn = vi.fn().mockReturnValue([])
      sortable = new Sortable(container, {
        store: { get: getFn },
      })

      expect(sortable.toArray()).toEqual(['item-1', 'item-2', 'item-3'])
    })
  })

  describe('setData option', () => {
    it('accepts setData in options without error', () => {
      const setDataFn = vi.fn()
      sortable = new Sortable(container, {
        setData: setDataFn,
      })

      // setData is wired through to DragManager — we can verify it's accepted
      expect(sortable.options.setData).toBe(setDataFn)
    })
  })

  describe('onSpill option', () => {
    it('accepts onSpill callback in options', () => {
      const onSpillFn = vi.fn()
      sortable = new Sortable(container, {
        onSpill: onSpillFn,
      })

      expect(sortable.options.onSpill).toBe(onSpillFn)
    })

    it('registers onSpill handler on event system', () => {
      const onSpillFn = vi.fn()
      sortable = new Sortable(container, {
        onSpill: onSpillFn,
      })

      // Emit a spill event
      sortable.eventSystem.emit('spill', {
        item: container.children[0] as HTMLElement,
        items: [container.children[0] as HTMLElement],
        from: container,
        to: container,
      })

      expect(onSpillFn).toHaveBeenCalledTimes(1)
    })
  })
})
