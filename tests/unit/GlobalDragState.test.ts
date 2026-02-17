import { describe, it, expect, vi, beforeEach } from 'vitest'
import { globalDragState } from '../../src/core/GlobalDragState'
import type { ActiveDrag } from '../../src/core/GlobalDragState'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmitCall = [string, Record<string, any>]

// Helper to create a mock HTMLElement
function mockElement(tag = 'div', id?: string): HTMLElement {
  const el = document.createElement(tag)
  if (id) el.id = id
  return el
}

// Helper to create a mock event system
function mockEventSystem() {
  return {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  } as unknown as import('../../src/core/EventSystem').SortableEventSystem
}

// Helper to create a mock DragManager
function mockDragManager(
  _zone?: HTMLElement,
  events?: ReturnType<typeof mockEventSystem>,
  groupConfig?: {
    name?: string
    canPullTo?: boolean
    shouldClone?: boolean
    pullMode?: 'move' | 'clone'
  }
) {
  const ev = events || mockEventSystem()
  return {
    zone: {
      getIndex: vi.fn(() => 0),
    },
    events: ev,
    getGroupManager: groupConfig
      ? () => ({
          getName: () => groupConfig.name || 'default',
          canPullTo: () => groupConfig.canPullTo ?? true,
          shouldClone: () => groupConfig.shouldClone ?? false,
          getPullMode: () => groupConfig.pullMode || 'move',
        })
      : undefined,
  }
}

describe('GlobalDragState', () => {
  beforeEach(() => {
    // Clean up any leftover state between tests
    for (const drag of globalDragState.getAllActiveDrags()) {
      globalDragState.endDrag(drag.id)
    }
  })

  describe('startDrag', () => {
    it('stores a single item wrapped in an array', () => {
      const item = mockElement('div', 'item1')
      const zone = mockElement('div')
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag1', item, zone, dm, 'group1', 0, es)

      const drag = globalDragState.getActiveDrag('drag1')
      expect(drag).toBeDefined()
      expect(drag!.items).toEqual([item])
      expect(drag!.startIndices).toEqual([0])
    })

    it('stores multiple items as an array', () => {
      const items = [
        mockElement('div', 'item1'),
        mockElement('div', 'item2'),
        mockElement('div', 'item3'),
      ]
      const zone = mockElement('div')
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag(
        'drag2',
        items,
        zone,
        dm,
        'group1',
        [0, 1, 2],
        es
      )

      const drag = globalDragState.getActiveDrag('drag2')
      expect(drag).toBeDefined()
      expect(drag!.items).toHaveLength(3)
      expect(drag!.items).toEqual(items)
      expect(drag!.startIndices).toEqual([0, 1, 2])
    })

    it('accepts a single index and wraps it in an array', () => {
      const item = mockElement('div')
      const zone = mockElement('div')
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag3', item, zone, dm, 'group1', 5, es)

      const drag = globalDragState.getActiveDrag('drag3')
      expect(drag!.startIndices).toEqual([5])
    })

    it('clears any existing put target for the drag', () => {
      const item = mockElement('div')
      const zone = mockElement('div')
      const dm = mockDragManager(undefined, undefined, { pullMode: 'move' })
      const es = mockEventSystem()

      globalDragState.startDrag('drag4', item, zone, dm, 'group1', 0, es)

      const targetZone = mockElement('div')
      const targetDm = mockDragManager(targetZone)
      globalDragState.setPutTarget('drag4', targetZone, targetDm, 'group1')
      expect(globalDragState.getPutTarget('drag4')).toBeDefined()

      // Starting a new drag with same ID should clear the put target
      globalDragState.startDrag('drag4', item, zone, dm, 'group1', 0, es)
      expect(globalDragState.getPutTarget('drag4')).toBeUndefined()
    })
  })

  describe('endDrag', () => {
    it('emits unchoose and end events with items array', () => {
      const item = mockElement('div', 'item1')
      const zone = mockElement('div')
      zone.appendChild(item) // So finalIndex can be computed
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag5', item, zone, dm, 'group1', 0, es)
      globalDragState.endDrag('drag5')

      // Should have emitted unchoose and end events
      const emitCalls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      expect(emitCalls.length).toBe(2)

      // unchoose event
      expect(emitCalls[0][0]).toBe('unchoose')
      expect(emitCalls[0][1].item).toBe(item)
      expect(emitCalls[0][1].items).toEqual([item])

      // end event
      expect(emitCalls[1][0]).toBe('end')
      expect(emitCalls[1][1].item).toBe(item)
      expect(emitCalls[1][1].items).toEqual([item])
    })

    it('emits events with multiple items in items array', () => {
      const items = [mockElement('div', 'a'), mockElement('div', 'b')]
      const zone = mockElement('div')
      zone.appendChild(items[0])
      zone.appendChild(items[1])
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag6', items, zone, dm, 'group1', [0, 1], es)
      globalDragState.endDrag('drag6')

      const emitCalls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]

      // unchoose event should include all items
      expect(emitCalls[0][0]).toBe('unchoose')
      expect(emitCalls[0][1].items).toEqual(items)
      expect(emitCalls[0][1].item).toBe(items[0]) // backward compat: first item

      // end event
      expect(emitCalls[1][0]).toBe('end')
      expect(emitCalls[1][1].items).toEqual(items)
      expect(emitCalls[1][1].oldIndex).toBe(0)
    })

    it('cleans up drag state after endDrag', () => {
      const item = mockElement('div')
      const zone = mockElement('div')
      zone.appendChild(item)
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag7', item, zone, dm, 'group1', 0, es)
      expect(globalDragState.hasDrag('drag7')).toBe(true)

      globalDragState.endDrag('drag7')
      expect(globalDragState.hasDrag('drag7')).toBe(false)
      expect(globalDragState.getPutTarget('drag7')).toBeUndefined()
    })

    it('does nothing for non-existent drag', () => {
      // Should not throw
      globalDragState.endDrag('nonexistent')
    })
  })

  describe('setPutTarget - clone creation', () => {
    it('creates clones for all items in a clone operation', () => {
      const items = [
        mockElement('div', 'c1'),
        mockElement('div', 'c2'),
        mockElement('div', 'c3'),
      ]
      items[0].classList.add('sortable-chosen', 'sortable-drag')
      items[1].classList.add('sortable-ghost')

      const sourceZone = mockElement('div')
      const targetZone = mockElement('div')
      const sourceDm = mockDragManager(sourceZone, undefined, {
        pullMode: 'clone',
        canPullTo: true,
      })
      const targetDm = mockDragManager(targetZone)
      const es = mockEventSystem()

      globalDragState.startDrag(
        'drag8',
        items,
        sourceZone,
        sourceDm,
        'group1',
        [0, 1, 2],
        es
      )
      globalDragState.setPutTarget('drag8', targetZone, targetDm, 'group1')

      const drag = globalDragState.getActiveDrag('drag8')
      expect(drag!.clones).toBeDefined()
      expect(drag!.clones).toHaveLength(3)
      expect(drag!.pullMode).toBe('clone')

      // Clones should not have IDs
      for (const clone of drag!.clones!) {
        expect(clone.getAttribute('id')).toBeNull()
      }

      // Clones should not have drag-related classes
      expect(drag!.clones![0].classList.contains('sortable-chosen')).toBe(false)
      expect(drag!.clones![0].classList.contains('sortable-drag')).toBe(false)
      expect(drag!.clones![1].classList.contains('sortable-ghost')).toBe(false)
    })

    it('creates a single clone for single-item clone operation', () => {
      const item = mockElement('div', 'single')
      const sourceZone = mockElement('div')
      const targetZone = mockElement('div')
      const sourceDm = mockDragManager(sourceZone, undefined, {
        pullMode: 'clone',
        canPullTo: true,
      })
      const targetDm = mockDragManager(targetZone)
      const es = mockEventSystem()

      globalDragState.startDrag(
        'drag9',
        item,
        sourceZone,
        sourceDm,
        'group1',
        0,
        es
      )
      globalDragState.setPutTarget('drag9', targetZone, targetDm, 'group1')

      const drag = globalDragState.getActiveDrag('drag9')
      expect(drag!.clones).toBeDefined()
      expect(drag!.clones).toHaveLength(1)
      expect(drag!.clones![0].getAttribute('id')).toBeNull()
    })

    it('does not create clones for move operation', () => {
      const item = mockElement('div', 'moveitem')
      const sourceZone = mockElement('div')
      const targetZone = mockElement('div')
      const sourceDm = mockDragManager(sourceZone, undefined, {
        pullMode: 'move',
        canPullTo: true,
      })
      const targetDm = mockDragManager(targetZone)
      const es = mockEventSystem()

      globalDragState.startDrag(
        'drag10',
        item,
        sourceZone,
        sourceDm,
        'group1',
        0,
        es
      )
      globalDragState.setPutTarget('drag10', targetZone, targetDm, 'group1')

      const drag = globalDragState.getActiveDrag('drag10')
      expect(drag!.clones).toBeUndefined()
      expect(drag!.pullMode).toBe('move')
    })
  })

  describe('cross-zone endDrag with clone operation', () => {
    it('emits clone and add events for clone operations', () => {
      const item = mockElement('div', 'cloneitem')
      const sourceZone = mockElement('div')
      const targetZone = mockElement('div')
      const sourceEs = mockEventSystem()
      const targetEs = mockEventSystem()
      const sourceDm = mockDragManager(sourceZone, sourceEs, {
        pullMode: 'clone',
        canPullTo: true,
      })
      const targetDm = mockDragManager(targetZone, targetEs)

      globalDragState.startDrag(
        'drag11',
        item,
        sourceZone,
        sourceDm,
        'group1',
        0,
        sourceEs
      )
      globalDragState.setPutTarget('drag11', targetZone, targetDm, 'group1')

      // Need to append item to compute finalIndex in endDrag
      sourceZone.appendChild(item)

      globalDragState.endDrag('drag11')

      const sourceEmits = (sourceEs.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      const targetEmits = (targetEs.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]

      // Source should get: clone, unchoose, end
      expect(sourceEmits[0][0]).toBe('clone')
      expect(sourceEmits[0][1].item).toBe(item)
      expect(sourceEmits[0][1].items).toEqual([item])
      expect(sourceEmits[0][1].pullMode).toBe('clone')

      // Target should get: add
      expect(targetEmits[0][0]).toBe('add')
      expect(targetEmits[0][1].items).toEqual([item])
      expect(targetEmits[0][1].pullMode).toBe('clone')
    })
  })

  describe('cross-zone endDrag with move operation', () => {
    it('emits remove and add events for move operations', () => {
      const item = mockElement('div', 'moveitem')
      const sourceZone = mockElement('div')
      const targetZone = mockElement('div')
      const sourceEs = mockEventSystem()
      const targetEs = mockEventSystem()
      const sourceDm = mockDragManager(sourceZone, sourceEs, {
        pullMode: 'move',
        canPullTo: true,
      })
      const targetDm = mockDragManager(targetZone, targetEs)

      globalDragState.startDrag(
        'drag12',
        item,
        sourceZone,
        sourceDm,
        'group1',
        0,
        sourceEs
      )
      globalDragState.setPutTarget('drag12', targetZone, targetDm, 'group1')
      targetZone.appendChild(item)

      globalDragState.endDrag('drag12')

      const sourceEmits = (sourceEs.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      const targetEmits = (targetEs.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]

      // Source should get: remove, unchoose, end
      expect(sourceEmits[0][0]).toBe('remove')
      expect(sourceEmits[0][1].item).toBe(item)
      expect(sourceEmits[0][1].items).toEqual([item])

      // Target should get: add
      expect(targetEmits[0][0]).toBe('add')
      expect(targetEmits[0][1].item).toBe(item)
      expect(targetEmits[0][1].items).toEqual([item])
    })
  })

  describe('ActiveDrag type shape', () => {
    it('exposes items and startIndices on the returned ActiveDrag', () => {
      const items = [mockElement('div'), mockElement('div')]
      const zone = mockElement('div')
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag13', items, zone, dm, 'group1', [3, 7], es)

      const drag: ActiveDrag | undefined =
        globalDragState.getActiveDrag('drag13')
      expect(drag).toBeDefined()
      // Verify the shape matches the updated interface
      expect(Array.isArray(drag!.items)).toBe(true)
      expect(Array.isArray(drag!.startIndices)).toBe(true)
      expect(drag!.items).toHaveLength(2)
      expect(drag!.startIndices).toEqual([3, 7])
    })
  })
})
