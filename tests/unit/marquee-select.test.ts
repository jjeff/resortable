/**
 * @fileoverview Unit tests for MarqueeSelectPlugin
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Test mocks need 'any' for flexibility */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Test accessing internal properties */
/* eslint-disable @typescript-eslint/no-unsafe-return -- Test mock return values */
/* eslint-disable @typescript-eslint/no-unsafe-argument -- Test mock arguments */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Test mock assignments */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- Test assertions */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MarqueeSelectPlugin } from '../../src/plugins/MarqueeSelectPlugin.js'
import type { SortableInstance } from '../../src/types/index.js'

function createMockSelectionManager() {
  const selected = new Set<HTMLElement>()
  return {
    selectedElements: selected,
    select(item: HTMLElement, addToSelection = false) {
      if (!addToSelection) {
        selected.clear()
      }
      selected.add(item)
    },
    deselect(item: HTMLElement) {
      selected.delete(item)
    },
    isSelected(item: HTMLElement) {
      return selected.has(item)
    },
    clearSelection() {
      selected.clear()
    },
  }
}

function createMockSortable(items: HTMLElement[]): SortableInstance {
  const container = document.createElement('div')
  items.forEach((item) => container.appendChild(item))

  const eventHandlers = new Map<string, Set<(...args: any[]) => void>>()

  return {
    element: container,
    options: {
      draggable: '.sortable-item',
      multiDrag: true,
      selectedClass: 'sortable-selected',
    },
    eventSystem: {
      on(event: string, handler: (...args: any[]) => void) {
        if (!eventHandlers.has(event)) eventHandlers.set(event, new Set())
        eventHandlers.get(event)!.add(handler)
      },
      off(event: string, handler?: (...args: any[]) => void) {
        if (handler) {
          eventHandlers.get(event)?.delete(handler)
        } else {
          eventHandlers.delete(event)
        }
      },
      emit(event: string, ...args: any[]) {
        eventHandlers.get(event)?.forEach((h) => h(...args))
      },
    },
    dragManager: {
      isDragging: false,
      selectionManager: createMockSelectionManager(),
      getGroupManager() {
        return { getName: () => 'test-group' }
      },
    },
  } as any
}

function createItems(count: number): HTMLElement[] {
  return Array.from({ length: count }, (_, i) => {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `item-${i + 1}`
    el.textContent = `Item ${i + 1}`
    return el
  })
}

function mockItemRects(
  items: HTMLElement[],
  rects: { x: number; y: number; width: number; height: number }[]
) {
  items.forEach((item, i) => {
    if (rects[i]) {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(rects[i].x, rects[i].y, rects[i].width, rects[i].height)
      )
    }
  })
}

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
      params: PointerEventInit & Record<string, any> = {}
    ) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? true
      this.width = params.width ?? 1
      this.height = params.height ?? 1
      this.pressure = params.pressure ?? 0
      this.tiltX = params.tiltX ?? 0
      this.tiltY = params.tiltY ?? 0
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as any
}

function pointerEvent(
  type: string,
  opts: Partial<PointerEventInit> & Record<string, any> = {}
): PointerEvent {
  return new PointerEvent(type, {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    bubbles: true,
    ...opts,
  })
}

// Mock getComputedStyle for isVisible checks
const originalGetComputedStyle = window.getComputedStyle
beforeEach(() => {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    // Return visible styles for sortable items
    if (el.classList.contains('sortable-item')) {
      return {
        display: 'block',
        visibility: 'visible',
        opacity: '1',
      } as CSSStyleDeclaration
    }
    return originalGetComputedStyle(el)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  // Clean up any marquee elements left on body
  document.querySelectorAll('.sortable-marquee').forEach((el) => el.remove())
})

describe('MarqueeSelectPlugin', () => {
  let plugin: MarqueeSelectPlugin
  let items: HTMLElement[]
  let sortable: SortableInstance

  beforeEach(() => {
    // Use marqueeArea: container for backward-compatible tests
    // (JSDOM disconnected elements don't bubble to document.documentElement)
    items = createItems(6)
    sortable = createMockSortable(items)
    plugin = MarqueeSelectPlugin.create({ marqueeArea: sortable.element })

    // Lay items out in a 2-column grid, 100x40 each, starting at (50, 50)
    mockItemRects(
      items,
      items.map((_, i) => ({
        x: 50 + (i % 2) * 110,
        y: 50 + Math.floor(i / 2) * 50,
        width: 100,
        height: 40,
      }))
    )
  })

  afterEach(() => {
    plugin.uninstall(sortable)
  })

  describe('Initiation', () => {
    it('starts marquee on empty space pointerdown + move', () => {
      plugin.install(sortable)

      // Pointerdown on the container (empty space)
      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      // Move past threshold
      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      // Marquee element should be added to body
      const marquee = document.querySelector('.sortable-marquee')
      expect(marquee).not.toBeNull()
    })

    it('does NOT start marquee when clicking an item without Alt', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 100, clientY: 70 })
      Object.defineProperty(down, 'target', { value: items[0] })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 110, clientY: 80 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })

    it('starts marquee with Alt+drag on item via capture handler', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', {
        clientX: 100,
        clientY: 70,
        altKey: true,
      })
      // Simulate target being an item inside the container
      Object.defineProperty(down, 'target', { value: items[0] })
      document.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 110, clientY: 80 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()
    })

    it('does not activate until threshold is met', () => {
      plugin = MarqueeSelectPlugin.create({
        threshold: 10,
        marqueeArea: sortable.element,
      })
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      // Move less than threshold
      const move = pointerEvent('pointermove', { clientX: 14, clientY: 14 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()

      // Move past threshold
      const move2 = pointerEvent('pointermove', { clientX: 25, clientY: 25 })
      document.dispatchEvent(move2)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()
    })
  })

  describe('Conflict avoidance', () => {
    it('does not start marquee when isDragging is true', () => {
      plugin.install(sortable)
      ;(sortable.dragManager as any).isDragging = true

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })

    it('ignores non-primary pointers', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', {
        clientX: 10,
        clientY: 10,
        isPrimary: false,
      })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })

    it('ignores non-primary button (right click)', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', {
        clientX: 10,
        clientY: 10,
        button: 2,
      })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })
  })

  describe('Visual', () => {
    it('applies marquee CSS class', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeClass: 'my-marquee',
        marqueeArea: sortable.element,
      })
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 5, clientY: 5 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      const marquee = document.querySelector('.my-marquee')
      expect(marquee).not.toBeNull()
    })

    it('updates marquee position on move', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 100, clientY: 80 })
      document.dispatchEvent(move)

      const marquee = document.querySelector('.sortable-marquee') as HTMLElement
      expect(marquee).not.toBeNull()
      expect(marquee.style.left).toBe('10px')
      expect(marquee.style.top).toBe('10px')
      expect(marquee.style.width).toBe('90px')
      expect(marquee.style.height).toBe('70px')
    })

    it('removes marquee on pointerup', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()

      const up = pointerEvent('pointerup', { clientX: 20, clientY: 20 })
      document.dispatchEvent(up)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })
  })

  describe('Hit testing', () => {
    it('selects items within marquee rect', () => {
      plugin.install(sortable)

      // Draw marquee covering items 0 and 1 (row 0: y=50..90)
      const down = pointerEvent('pointerdown', { clientX: 40, clientY: 40 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 270, clientY: 95 })
      document.dispatchEvent(move)

      const sm = sortable.dragManager!.selectionManager
      expect(sm.selectedElements.has(items[0])).toBe(true)
      expect(sm.selectedElements.has(items[1])).toBe(true)
      // Items in row 1 (y=100..140) should not be selected
      expect(sm.selectedElements.has(items[2])).toBe(false)
    })

    it('does not select invisible items', () => {
      // Make item 0 invisible
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
        if (el === items[0]) {
          return {
            display: 'none',
            visibility: 'visible',
            opacity: '1',
          } as CSSStyleDeclaration
        }
        return {
          display: 'block',
          visibility: 'visible',
          opacity: '1',
        } as CSSStyleDeclaration
      })

      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 40, clientY: 40 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 270, clientY: 95 })
      document.dispatchEvent(move)

      const sm = sortable.dragManager!.selectionManager
      expect(sm.selectedElements.has(items[0])).toBe(false)
      expect(sm.selectedElements.has(items[1])).toBe(true)
    })
  })

  describe('Modifiers', () => {
    it('replace mode: clears previous selection, selects only intersected', () => {
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      // Pre-select item 4
      sm.select(items[4], true)
      expect(sm.selectedElements.has(items[4])).toBe(true)

      // Draw marquee over items 0-1
      const down = pointerEvent('pointerdown', { clientX: 40, clientY: 40 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 270, clientY: 95 })
      document.dispatchEvent(move)

      expect(sm.selectedElements.has(items[0])).toBe(true)
      expect(sm.selectedElements.has(items[1])).toBe(true)
      expect(sm.selectedElements.has(items[4])).toBe(false)
    })

    it('shift mode: adds intersected to snapshot selection', () => {
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      // Pre-select item 4
      sm.select(items[4], true)

      // Draw marquee over items 0-1 with Shift
      const down = pointerEvent('pointerdown', { clientX: 40, clientY: 40 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', {
        clientX: 270,
        clientY: 95,
        shiftKey: true,
      })
      document.dispatchEvent(move)

      expect(sm.selectedElements.has(items[0])).toBe(true)
      expect(sm.selectedElements.has(items[1])).toBe(true)
      // Snapshot had item 4 selected, so it should remain
      expect(sm.selectedElements.has(items[4])).toBe(true)
    })

    it('alt mode: removes intersected from snapshot selection', () => {
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      // Pre-select items 0, 1, 2
      sm.select(items[0], true)
      sm.select(items[1], true)
      sm.select(items[2], true)

      // Draw marquee over items 0-1 with Alt
      const down = pointerEvent('pointerdown', { clientX: 40, clientY: 40 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', {
        clientX: 270,
        clientY: 95,
        altKey: true,
      })
      document.dispatchEvent(move)

      // Items 0 and 1 should be deselected (intersected + alt = subtract)
      expect(sm.selectedElements.has(items[0])).toBe(false)
      expect(sm.selectedElements.has(items[1])).toBe(false)
      // Item 2 should remain from snapshot
      expect(sm.selectedElements.has(items[2])).toBe(true)
    })
  })

  describe('Cleanup', () => {
    it('removes document listeners on pointerup', () => {
      plugin.install(sortable)
      const removeSpy = vi.spyOn(document, 'removeEventListener')

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      const up = pointerEvent('pointerup', { clientX: 20, clientY: 20 })
      document.dispatchEvent(up)

      const removedEvents = removeSpy.mock.calls.map((c) => c[0])
      expect(removedEvents).toContain('pointermove')
      expect(removedEvents).toContain('pointerup')
    })

    it('restores userSelect on pointerup', () => {
      document.body.style.userSelect = 'auto'
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      expect(document.body.style.userSelect).toBe('none')

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      const up = pointerEvent('pointerup', { clientX: 20, clientY: 20 })
      document.dispatchEvent(up)

      expect(document.body.style.userSelect).toBe('auto')
    })

    it('cleans up when uninstall is called mid-marquee', () => {
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()

      plugin.uninstall(sortable)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })
  })

  describe('Events', () => {
    it('emits marqueeStart when marquee activates', () => {
      plugin.install(sortable)
      const handler = vi.fn()
      sortable.eventSystem.on('marqueeStart', handler)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(handler).toHaveBeenCalledOnce()
    })

    it('emits marqueeEnd on pointerup after active marquee', () => {
      plugin.install(sortable)
      const handler = vi.fn()
      sortable.eventSystem.on('marqueeEnd', handler)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      const up = pointerEvent('pointerup', { clientX: 20, clientY: 20 })
      document.dispatchEvent(up)

      expect(handler).toHaveBeenCalledOnce()
    })

    it('does not emit marqueeEnd if marquee never activated', () => {
      plugin.install(sortable)
      const handler = vi.fn()
      sortable.eventSystem.on('marqueeEnd', handler)

      // Pointerdown + up without crossing threshold
      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const up = pointerEvent('pointerup', { clientX: 11, clientY: 11 })
      document.dispatchEvent(up)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  // ── New tests for marqueeArea, filters, click-away, multi-instance ──

  describe('marqueeArea option', () => {
    it('accepts an HTMLElement directly', () => {
      const customArea = document.createElement('div')
      document.body.appendChild(customArea)

      plugin = MarqueeSelectPlugin.create({ marqueeArea: customArea })
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      customArea.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()

      plugin.uninstall(sortable)
      customArea.remove()
    })

    it('resolves a CSS selector string', () => {
      const customArea = document.createElement('div')
      customArea.id = 'marquee-test-area'
      document.body.appendChild(customArea)

      plugin = MarqueeSelectPlugin.create({ marqueeArea: '#marquee-test-area' })
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      customArea.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()

      plugin.uninstall(sortable)
      customArea.remove()
    })

    it('defaults to html element', () => {
      plugin = MarqueeSelectPlugin.create()
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      document.documentElement.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()

      plugin.uninstall(sortable)
    })

    it('fails gracefully for an unresolvable selector', () => {
      plugin = MarqueeSelectPlugin.create({ marqueeArea: '#nonexistent-xyz' })
      // BasePlugin.install catches errors and calls uninstall, so no throw
      // but the plugin should not function (no marquee on pointerdown)
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      document.documentElement.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })
  })

  describe('marqueeFilter', () => {
    it('exclude blocks marquee on matching elements', () => {
      const toolbar = document.createElement('div')
      toolbar.className = 'toolbar'
      sortable.element.appendChild(toolbar)

      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        marqueeFilter: { exclude: '.toolbar' },
      })
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      Object.defineProperty(down, 'target', { value: toolbar })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })

    it('include restricts marquee start to matching areas', () => {
      const allowedZone = document.createElement('div')
      allowedZone.className = 'marquee-zone'
      sortable.element.appendChild(allowedZone)

      const outsideZone = document.createElement('div')
      outsideZone.className = 'other-zone'
      sortable.element.appendChild(outsideZone)

      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        marqueeFilter: { include: '.marquee-zone' },
      })
      plugin.install(sortable)

      // Click on area outside include zone — should not start
      const down1 = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      Object.defineProperty(down1, 'target', { value: outsideZone })
      sortable.element.dispatchEvent(down1)

      const move1 = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move1)

      expect(document.querySelector('.sortable-marquee')).toBeNull()

      // Click on included zone — should start
      const down2 = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      Object.defineProperty(down2, 'target', { value: allowedZone })
      sortable.element.dispatchEvent(down2)

      const move2 = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move2)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()
    })

    it('always excludes draggable items regardless of include filter', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        marqueeFilter: { include: '.sortable-item' },
      })
      plugin.install(sortable)

      const down = pointerEvent('pointerdown', { clientX: 100, clientY: 70 })
      Object.defineProperty(down, 'target', { value: items[0] })
      sortable.element.dispatchEvent(down)

      const move = pointerEvent('pointermove', { clientX: 110, clientY: 80 })
      document.dispatchEvent(move)

      // Despite the include filter matching, draggable items are always excluded
      expect(document.querySelector('.sortable-marquee')).toBeNull()
    })
  })

  describe('deselectOnClickAway', () => {
    it('clears selection on sub-threshold click in empty space', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: true,
      })
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      // Pre-select items
      sm.select(items[0], true)
      sm.select(items[1], true)
      expect(sm.selectedElements.size).toBe(2)

      // Sub-threshold pointerdown + pointerup on empty space
      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const up = pointerEvent('pointerup', { clientX: 11, clientY: 11 })
      document.dispatchEvent(up)

      expect(sm.selectedElements.size).toBe(0)
    })

    it('does not deselect when clicking on a draggable item', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: true,
      })
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      sm.select(items[0], true)
      sm.select(items[1], true)
      expect(sm.selectedElements.size).toBe(2)

      // Click on a draggable item
      const down = pointerEvent('pointerdown', { clientX: 100, clientY: 70 })
      Object.defineProperty(down, 'target', { value: items[2] })
      sortable.element.dispatchEvent(down)

      const up = pointerEvent('pointerup', { clientX: 100, clientY: 70 })
      Object.defineProperty(up, 'target', { value: items[2] })
      document.dispatchEvent(up)

      // Selection should not be cleared
      expect(sm.selectedElements.size).toBe(2)
    })

    it('does not deselect when option is disabled', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: false,
      })
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      sm.select(items[0], true)
      expect(sm.selectedElements.size).toBe(1)

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down)

      const up = pointerEvent('pointerup', { clientX: 11, clientY: 11 })
      document.dispatchEvent(up)

      expect(sm.selectedElements.size).toBe(1)
    })
  })

  describe('deselectFilter', () => {
    it('exclude prevents deselection on specific elements', () => {
      const toolbar = document.createElement('div')
      toolbar.className = 'toolbar'
      sortable.element.appendChild(toolbar)

      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: true,
        deselectFilter: { exclude: '.toolbar' },
      })
      plugin.install(sortable)
      const sm = sortable.dragManager!.selectionManager

      sm.select(items[0], true)
      expect(sm.selectedElements.size).toBe(1)

      // Click on toolbar (excluded from deselection)
      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      Object.defineProperty(down, 'target', { value: toolbar })
      sortable.element.dispatchEvent(down)

      const up = pointerEvent('pointerup', { clientX: 11, clientY: 11 })
      Object.defineProperty(up, 'target', { value: toolbar })
      document.dispatchEvent(up)

      expect(sm.selectedElements.size).toBe(1)
    })
  })

  describe('Multi-instance lock', () => {
    it('prevents duplicate marquees from two instances', () => {
      const items2 = createItems(3)
      const sortable2 = createMockSortable(items2)
      mockItemRects(
        items2,
        items2.map((_, i) => ({
          x: 300 + i * 110,
          y: 50,
          width: 100,
          height: 40,
        }))
      )

      const plugin2 = MarqueeSelectPlugin.create({
        marqueeArea: sortable2.element,
      })

      plugin.install(sortable)
      plugin2.install(sortable2)

      // Start marquee on first instance
      const down1 = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      sortable.element.dispatchEvent(down1)

      const move1 = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move1)

      expect(document.querySelector('.sortable-marquee')).not.toBeNull()

      // Try to start marquee on second instance — should be blocked
      const down2 = pointerEvent('pointerdown', {
        clientX: 300,
        clientY: 50,
        pointerId: 2,
      })
      sortable2.element.dispatchEvent(down2)

      const move2 = pointerEvent('pointermove', {
        clientX: 310,
        clientY: 60,
        pointerId: 2,
      })
      document.dispatchEvent(move2)

      // Should still only have one marquee
      const marquees = document.querySelectorAll('.sortable-marquee')
      expect(marquees.length).toBe(1)

      // End first marquee
      const up1 = pointerEvent('pointerup', { clientX: 20, clientY: 20 })
      document.dispatchEvent(up1)

      plugin2.uninstall(sortable2)
    })
  })

  describe('KeyboardManager coordination', () => {
    it('sets data attribute when deselectOnClickAway is enabled', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: true,
      })
      plugin.install(sortable)

      expect(sortable.element.dataset.marqueeClickAway).toBe('true')
    })

    it('does not set data attribute when deselectOnClickAway is disabled', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: false,
      })
      plugin.install(sortable)

      expect(sortable.element.dataset.marqueeClickAway).toBeUndefined()
    })

    it('removes data attribute on uninstall', () => {
      plugin = MarqueeSelectPlugin.create({
        marqueeArea: sortable.element,
        deselectOnClickAway: true,
      })
      plugin.install(sortable)
      expect(sortable.element.dataset.marqueeClickAway).toBe('true')

      plugin.uninstall(sortable)
      expect(sortable.element.dataset.marqueeClickAway).toBeUndefined()
    })
  })

  describe('Global area (html) behavior', () => {
    it('defers user-select disabling until threshold for global areas', () => {
      plugin = MarqueeSelectPlugin.create() // defaults to html
      plugin.install(sortable)

      document.body.style.userSelect = 'auto'

      const down = pointerEvent('pointerdown', { clientX: 10, clientY: 10 })
      document.documentElement.dispatchEvent(down)

      // user-select should NOT be disabled yet (global area defers)
      expect(document.body.style.userSelect).toBe('auto')

      // Move past threshold
      const move = pointerEvent('pointermove', { clientX: 20, clientY: 20 })
      document.dispatchEvent(move)

      // Now user-select should be disabled
      expect(document.body.style.userSelect).toBe('none')

      const up = pointerEvent('pointerup', { clientX: 20, clientY: 20 })
      document.dispatchEvent(up)

      expect(document.body.style.userSelect).toBe('auto')

      plugin.uninstall(sortable)
    })
  })
})
