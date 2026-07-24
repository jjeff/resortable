import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  Sortable,
  PluginSystem,
  SortableError,
  DragManager,
} from '../../src/index'
import type {
  SortablePlugin,
  SortableOptions,
  SortableEvent,
} from '../../src/types/index'

/**
 * jsdom in this project has no `DragEvent`/`DataTransfer` constructors, so
 * every HTML5-path test falls back to a plain `Event` cast to `DragEvent` —
 * same technique as `tests/unit/on-move.spec.ts`. The DragManager code under
 * test only reads whatever properties are actually present on the event, so
 * the fallback still exercises the real `onDragStart`/`onDragOver` handlers.
 */
function makeDragEvent(type: string): DragEvent {
  try {
    return new DragEvent(type, { bubbles: true, cancelable: true })
  } catch {
    return new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  }
}

/** Pointer event helper for the pointer-driven drag pipeline (delay, fallbackClass). */
function mkPointer(
  type: string,
  clientX = 0,
  clientY = 0,
  id = 1
): PointerEvent {
  let e: PointerEvent
  try {
    e = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: id,
      isPrimary: true,
      button: 0,
    })
  } catch {
    e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
    }) as unknown as PointerEvent
    Object.defineProperties(e, {
      pointerId: { value: id },
      isPrimary: { value: true },
    })
  }
  Object.defineProperties(e, {
    clientX: { value: clientX, configurable: true },
    clientY: { value: clientY, configurable: true },
  })
  return e
}

/**
 * `sortable.option(name, value)` is strongly overloaded per-key
 * (`SortableOptions[K]`), which is exactly right for call sites that know
 * their key statically. A table-driven test pairs arbitrary keys with
 * arbitrary values, which TS can't correlate across a heterogeneous tuple
 * array — this helper is the one deliberate cast that bridges that gap.
 */
function setOption(
  s: Sortable,
  name: keyof SortableOptions,
  value: unknown
): void {
  s.option(name, value as SortableOptions[keyof SortableOptions])
}

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
    vi.restoreAllMocks()
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
    it('is invoked with the DataTransfer and dragged element on dragstart', () => {
      const setDataFn = vi.fn()
      sortable = new Sortable(container, {
        setData: setDataFn,
      })

      const item = container.children[0] as HTMLElement
      // jsdom has no DataTransfer constructor (see makeDragEvent) — attach a
      // minimal stand-in so the `e.dataTransfer && ghost` branch in
      // `onDragStart` is truthy and actually calls through to `setData`.
      const fakeDataTransfer = {
        setData: vi.fn(),
        effectAllowed: '',
      } as unknown as DataTransfer
      const evt = makeDragEvent('dragstart')
      Object.defineProperty(evt, 'dataTransfer', {
        value: fakeDataTransfer,
        configurable: true,
      })

      item.dispatchEvent(evt)

      expect(setDataFn).toHaveBeenCalledTimes(1)
      expect(setDataFn).toHaveBeenCalledWith(fakeDataTransfer, item)
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

  describe('Sortable.closest()', () => {
    it('returns null when given a falsy element', () => {
      expect(Sortable.closest(null as unknown as HTMLElement)).toBeNull()
    })

    it('returns the instance mounted directly on the element', () => {
      sortable = new Sortable(container)
      expect(Sortable.closest(container)).toBe(sortable)
    })

    it('walks up the tree to find an ancestor Sortable instance', () => {
      sortable = new Sortable(container)
      const item = container.children[0] as HTMLElement
      const nested = document.createElement('span')
      item.appendChild(nested)

      expect(Sortable.closest(nested)).toBe(sortable)
    })

    it('returns null when no ancestor has a Sortable instance', () => {
      const orphan = document.createElement('div')
      document.body.appendChild(orphan)

      expect(Sortable.closest(orphan)).toBeNull()
    })

    it('filters by selector, skipping ancestors that do not match it', () => {
      sortable = new Sortable(container)
      container.classList.add('my-sortable')
      const item = container.children[0] as HTMLElement

      // container carries a Sortable instance but doesn't match this selector
      expect(Sortable.closest(item, '.does-not-exist')).toBeNull()
      // ...and does once the selector actually matches it
      expect(Sortable.closest(item, '.my-sortable')).toBe(sortable)
    })
  })

  describe('constructor validation', () => {
    it('throws a SortableError when given a non-HTMLElement', () => {
      expect(() => new Sortable(null as unknown as HTMLElement)).toThrow(
        SortableError
      )
      expect(() => new Sortable({} as HTMLElement)).toThrow(SortableError)
    })

    it('SortableError carries the expected name and message', () => {
      let caught: unknown
      try {
        new Sortable({} as HTMLElement)
      } catch (e) {
        caught = e
      }

      expect(caught).toBeInstanceOf(SortableError)
      expect(caught).toBeInstanceOf(Error)
      const err = caught as SortableError
      expect(err.name).toBe('SortableError')
      expect(err.message).toBe(
        'Invalid element provided to Sortable constructor'
      )
      expect(err.cause).toBeUndefined()
    })

    it('SortableError stores an optional cause', () => {
      const cause = new Error('root cause')
      const err = new SortableError('wrapped message', cause)

      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('SortableError')
      expect(err.message).toBe('wrapped message')
      expect(err.cause).toBe(cause)
    })
  })

  describe('plugin management (removePlugin / hasPlugin / getPlugins)', () => {
    it('reflects install/uninstall state and removePlugin uninstalls', () => {
      const plugin: SortablePlugin = {
        name: 'TestPlugin',
        version: '1.0.0',
        install: vi.fn(),
        uninstall: vi.fn(),
      }
      Sortable.mount(plugin)
      sortable = new Sortable(container)

      expect(sortable.hasPlugin('TestPlugin')).toBe(false)
      expect(sortable.getPlugins()).not.toContain('TestPlugin')

      sortable.usePlugin('TestPlugin')
      expect(sortable.hasPlugin('TestPlugin')).toBe(true)
      expect(sortable.getPlugins()).toContain('TestPlugin')

      const removed = sortable.removePlugin('TestPlugin')
      expect(removed).toBe(true)
      expect(sortable.hasPlugin('TestPlugin')).toBe(false)
      expect(sortable.getPlugins()).not.toContain('TestPlugin')
    })

    it('removePlugin returns false for a plugin that was never installed', () => {
      sortable = new Sortable(container)
      expect(sortable.removePlugin('NeverInstalled')).toBe(false)
    })
  })

  describe('option()', () => {
    it('get form returns the current value', () => {
      sortable = new Sortable(container, { animation: 250 })
      expect(sortable.option('animation')).toBe(250)
    })

    it('set form updates the stored option value', () => {
      sortable = new Sortable(container)
      sortable.option('animation', 400)

      expect(sortable.option('animation')).toBe(400)
      expect(sortable.options.animation).toBe(400)
    })

    it('disabled toggles the sortable-disabled class on the element', () => {
      sortable = new Sortable(container)
      expect(container.classList.contains('sortable-disabled')).toBe(false)

      sortable.option('disabled', true)
      expect(container.classList.contains('sortable-disabled')).toBe(true)

      sortable.option('disabled', false)
      expect(container.classList.contains('sortable-disabled')).toBe(false)
    })
  })

  describe('option() DragManager rebuild branches', () => {
    // Every key here shares one switch-case block in src/index.ts that tears
    // down and reconstructs `dragManager`. The realistic bug this guards
    // against is a typo'd/missing case label silently skipping the rebuild
    // for one particular key.
    const rebuildCases: Array<[keyof SortableOptions, unknown]> = [
      ['handle', '.handle'],
      ['filter', '.filtered'],
      ['onFilter', vi.fn()],
      ['ignore', ''],
      ['draggable', '.custom-item'],
      ['delay', 10],
      ['delayOnTouchOnly', 10],
      ['touchStartThreshold', 10],
      ['swapThreshold', 0.5],
      ['invertSwap', true],
      ['invertedSwapThreshold', 0.3],
      ['direction', 'horizontal'],
      ['forceFallback', true],
      ['fallbackClass', 'fb'],
      ['fallbackOnBody', true],
      ['fallbackTolerance', 5],
      ['fallbackOffsetX', 5],
      ['fallbackOffsetY', 5],
    ]

    for (const [name, value] of rebuildCases) {
      it(`tears down and rebuilds the DragManager when "${String(name)}" changes`, () => {
        sortable = new Sortable(container)
        const oldDragManager = sortable.dragManager
        const detachSpy = vi.spyOn(oldDragManager, 'detach')
        const attachSpy = vi.spyOn(DragManager.prototype, 'attach')

        setOption(sortable, name, value)

        expect(detachSpy).toHaveBeenCalledTimes(1)
        expect(sortable.dragManager).not.toBe(oldDragManager)
        expect(attachSpy).toHaveBeenCalledTimes(1)
      })
    }
  })

  describe('option() rebuild — the new value actually takes effect', () => {
    it('handle: refuses a drag started outside the new handle, allows one from it', () => {
      sortable = new Sortable(container)
      const item = container.children[0] as HTMLElement
      const handleEl = document.createElement('span')
      handleEl.className = 'handle'
      item.insertBefore(handleEl, item.firstChild)
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      sortable.eventSystem.on('choose', chooseFn)

      sortable.option('handle', '.handle')

      // Starting from the item body (outside the handle) must be refused.
      item.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).not.toHaveBeenCalled()

      // Starting from the handle itself must succeed.
      handleEl.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).toHaveBeenCalledTimes(1)
    })

    it('filter + onFilter: refuses a drag from a filtered target and invokes onFilter', () => {
      sortable = new Sortable(container)
      const item = container.children[0] as HTMLElement
      const filtered = document.createElement('span')
      filtered.className = 'no-drag'
      item.appendChild(filtered)
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      const onFilterFn = vi.fn()
      sortable.eventSystem.on('choose', chooseFn)

      sortable.option('filter', '.no-drag')
      sortable.option('onFilter', onFilterFn)

      filtered.dispatchEvent(makeDragEvent('dragstart'))

      expect(chooseFn).not.toHaveBeenCalled()
      expect(onFilterFn).toHaveBeenCalledTimes(1)
    })

    it('ignore: allows a drag from a target previously excluded by the default ignore list', () => {
      sortable = new Sortable(container)
      const item = container.children[0] as HTMLElement
      const anchor = document.createElement('a')
      item.appendChild(anchor)
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      sortable.eventSystem.on('choose', chooseFn)

      // Default ignore ('a, img') refuses drags starting on an <a>.
      anchor.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).not.toHaveBeenCalled()

      sortable.option('ignore', '')

      anchor.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).toHaveBeenCalledTimes(1)
    })

    it('draggable: changes which elements are eligible to start a drag', () => {
      sortable = new Sortable(container)
      const special = document.createElement('div')
      special.className = 'special-item'
      container.appendChild(special)
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      sortable.eventSystem.on('choose', chooseFn)

      special.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).not.toHaveBeenCalled()

      sortable.option('draggable', '.special-item')

      special.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).toHaveBeenCalledTimes(1)
    })

    it('forceFallback: removes native HTML5 drag listeners so dragstart no longer starts a drag', () => {
      sortable = new Sortable(container)
      const item = container.children[0] as HTMLElement
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      sortable.eventSystem.on('choose', chooseFn)

      sortable.option('forceFallback', true)

      item.dispatchEvent(makeDragEvent('dragstart'))
      expect(chooseFn).not.toHaveBeenCalled()
    })

    it('fallbackClass: applies the new class to the ghost element on the next pointer drag', () => {
      sortable = new Sortable(container)
      sortable.option('fallbackClass', 'my-fallback')

      const item = container.children[0] as HTMLElement
      item.dispatchEvent(mkPointer('pointerdown'))

      expect(document.querySelector('.my-fallback')).not.toBeNull()

      document.dispatchEvent(mkPointer('pointerup'))
    })

    it('delay: defers drag commit until the configured delay elapses', () => {
      sortable = new Sortable(container)
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      sortable.eventSystem.on('choose', chooseFn)

      sortable.option('delay', 50)

      vi.useFakeTimers()
      try {
        const item = container.children[0] as HTMLElement
        item.dispatchEvent(mkPointer('pointerdown'))
        expect(chooseFn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(50)
        expect(chooseFn).toHaveBeenCalledTimes(1)

        document.dispatchEvent(mkPointer('pointerup'))
      } finally {
        vi.useRealTimers()
      }
    })

    it('touchStartThreshold: cancels a delayed drag once the pointer moves past it', () => {
      sortable = new Sortable(container)
      const chooseFn = vi.fn<(evt: SortableEvent) => void>()
      sortable.eventSystem.on('choose', chooseFn)

      sortable.option('delay', 1000)
      sortable.option('touchStartThreshold', 5)

      vi.useFakeTimers()
      try {
        const item = container.children[0] as HTMLElement
        item.dispatchEvent(mkPointer('pointerdown', 0, 0))
        document.dispatchEvent(mkPointer('pointermove', 50, 0))

        vi.advanceTimersByTime(1000)
        expect(chooseFn).not.toHaveBeenCalled()

        document.dispatchEvent(mkPointer('pointerup', 50, 0))
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('option() group rebuild', () => {
    it('allows a cross-zone drop once switched to a compatible group', () => {
      const target = document.createElement('div')
      document.body.appendChild(target)
      const other = new Sortable(target, { animation: 0, group: 'zone-b' })
      sortable = new Sortable(container, { animation: 0, group: 'zone-a' })
      const item1 = container.children[0] as HTMLElement

      // Incompatible groups: cross-zone drop is rejected, item stays put.
      item1.dispatchEvent(makeDragEvent('dragstart'))
      target.dispatchEvent(makeDragEvent('dragover'))
      expect(item1.parentElement).toBe(container)
      item1.dispatchEvent(makeDragEvent('dragend'))

      sortable.option('group', 'zone-b')

      // Same drag, now group-compatible: item moves into the target zone.
      item1.dispatchEvent(makeDragEvent('dragstart'))
      target.dispatchEvent(makeDragEvent('dragover'))
      expect(target.contains(item1)).toBe(true)

      other.destroy()
    })
  })
})
