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

  describe('setDuplicate / applyDuplicate', () => {
    it('setDuplicate toggles the duplicate flag', () => {
      const item = mockElement('div')
      const zone = mockElement('div')
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag-dup1', item, zone, dm, 'group1', 0, es)
      expect(
        globalDragState.getActiveDrag('drag-dup1')!.duplicate
      ).toBeUndefined()

      globalDragState.setDuplicate('drag-dup1', true)
      expect(globalDragState.getActiveDrag('drag-dup1')!.duplicate).toBe(true)

      globalDragState.setDuplicate('drag-dup1', false)
      expect(globalDragState.getActiveDrag('drag-dup1')!.duplicate).toBe(false)
    })

    it('applyDuplicate sets pullMode to clone and stores the clones', () => {
      const item = mockElement('div')
      const clone = mockElement('div', 'clone1')
      const zone = mockElement('div')
      const dm = mockDragManager()
      const es = mockEventSystem()

      globalDragState.startDrag('drag-dup2', item, zone, dm, 'group1', 0, es)
      globalDragState.applyDuplicate('drag-dup2', [clone])

      const drag = globalDragState.getActiveDrag('drag-dup2')
      expect(drag!.pullMode).toBe('clone')
      expect(drag!.clones).toEqual([clone])
    })
  })

  describe('endDrag - same-zone duplicate', () => {
    it('fires clone, sort, update, change (in order) then unchoose, end; no add', () => {
      const item = mockElement('div', 'orig')
      const clone = mockElement('div', 'copy')
      const zone = mockElement('div')
      // DragManager already did the DOM surgery before applyDuplicate/endDrag:
      // original stays at its slot, copy is inserted right after it.
      zone.appendChild(item)
      zone.appendChild(clone)
      const dm = mockDragManager(zone)
      // getIndex should report the copy's live position (index 1)
      ;(dm.zone.getIndex as ReturnType<typeof vi.fn>).mockImplementation(
        (el: HTMLElement) => Array.from(zone.children).indexOf(el)
      )
      const es = mockEventSystem()

      globalDragState.startDrag('drag-dup3', item, zone, dm, 'group1', 0, es)
      globalDragState.setDuplicate('drag-dup3', true)
      globalDragState.applyDuplicate('drag-dup3', [clone])

      globalDragState.endDrag('drag-dup3')

      const calls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      expect(calls.map((c) => c[0])).toEqual([
        'clone',
        'sort',
        'update',
        'change',
        'unchoose',
        'end',
      ])

      for (const name of ['clone', 'sort', 'update', 'change']) {
        const call = calls.find((c) => c[0] === name)!
        expect(call[1].item).toBe(item)
        expect(call[1].from).toBe(zone)
        expect(call[1].to).toBe(zone)
        expect(call[1].oldIndex).toBe(0)
        expect(call[1].newIndex).toBe(1)
        // Payload symmetry with the controlled branch — consumers get the
        // same index arrays either way.
        expect(call[1].oldIndexes).toEqual([0])
        expect(call[1].newIndexes).toEqual([1])
        expect(call[1].clone).toBe(clone)
        expect(call[1].pullMode).toBe('clone')
      }

      expect(calls.some((c) => c[0] === 'add')).toBe(false)
    })

    it('does not fire the duplicate branch when duplicate is false, even with clones present', () => {
      // Simulates a group pull:'clone' drag that crossed zones and was
      // returned home — clones exist, but this must not be mistaken for a
      // same-zone duplicate.
      const item = mockElement('div', 'orig2')
      const clone = mockElement('div', 'copy2')
      const zone = mockElement('div')
      zone.appendChild(item)
      const dm = mockDragManager(zone)
      const es = mockEventSystem()

      globalDragState.startDrag('drag-dup4', item, zone, dm, 'group1', 0, es)
      // clones exist (e.g. from a cross-zone pull:'clone' setPutTarget call)
      // but duplicate was never armed.
      globalDragState.applyDuplicate('drag-dup4', [clone])
      globalDragState.setDuplicate('drag-dup4', false)

      globalDragState.endDrag('drag-dup4')

      const calls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      expect(calls.map((c) => c[0])).toEqual(['unchoose', 'end'])
    })
  })

  describe('endControlledDrag - same-zone duplicate index math', () => {
    it('computes newIndex/newIndexes with the offset formula ([A..F], drag C to end)', () => {
      const items = [
        mockElement('div', 'A'),
        mockElement('div', 'B'),
        mockElement('div', 'C'),
        mockElement('div', 'D'),
        mockElement('div', 'E'),
        mockElement('div', 'F'),
      ]
      const zone = mockElement('div')
      const dm = mockDragManager(zone)
      const es = mockEventSystem()

      // Drag item C (start index 2) to the end (pending.index 5), controlled.
      globalDragState.startDrag(
        'drag-cdup1',
        items[2],
        zone,
        dm,
        'group1',
        2,
        es,
        true
      )
      globalDragState.setDuplicate('drag-cdup1', true)
      globalDragState.setPending('drag-cdup1', { zone, index: 5 })

      globalDragState.endDrag('drag-cdup1')

      const calls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      expect(calls.map((c) => c[0])).toEqual([
        'clone',
        'sort',
        'update',
        'change',
        'unchoose',
        'end',
      ])

      const cloneCall = calls.find((c) => c[0] === 'clone')!
      expect(cloneCall[1].newIndex).toBe(6) // offset 1 -> 5 + 1
      expect(cloneCall[1].newIndexes).toEqual([6])
      expect(cloneCall[1].pullMode).toBe('clone')
      expect(cloneCall[1].clone).toBeUndefined()
    })

    it('computes offset 0 when the drop point is before the original (drag item 4 to index 1)', () => {
      const item = mockElement('div', 'item4')
      const zone = mockElement('div')
      const dm = mockDragManager(zone)
      const es = mockEventSystem()

      globalDragState.startDrag(
        'drag-cdup2',
        item,
        zone,
        dm,
        'group1',
        4,
        es,
        true
      )
      globalDragState.setDuplicate('drag-cdup2', true)
      globalDragState.setPending('drag-cdup2', { zone, index: 1 })

      globalDragState.endDrag('drag-cdup2')

      const calls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      const cloneCall = calls.find((c) => c[0] === 'clone')!
      expect(cloneCall[1].newIndex).toBe(1) // offset 0 -> 1 + 0
      expect(cloneCall[1].newIndexes).toEqual([1])
    })

    it('multi-drag: offsets against the REDUCED list, not the full one', () => {
      // List of 5. Drag items at full-list indices 0 and 2. DropZone hides
      // the dragged items, so `getControlledIndex` reports positions in the
      // reduced list [1, 3, 4] — dropping before item 3 gives pending.index
      // 1, NOT 3. Expected result once the consumer inserts the copies:
      // [0, 1, 2, copy0, copy2, 3, 4] -> newIndex 3, newIndexes [3, 4].
      // Comparing raw startIndices against that reduced index used to yield
      // 2 / [2, 3].
      const items = [mockElement('div', 'm0'), mockElement('div', 'm2')]
      const zone = mockElement('div')
      const dm = mockDragManager(zone)
      const es = mockEventSystem()

      globalDragState.startDrag(
        'drag-cdup4',
        items,
        zone,
        dm,
        'group1',
        [0, 2],
        es,
        true
      )
      globalDragState.setDuplicate('drag-cdup4', true)
      globalDragState.setPending('drag-cdup4', { zone, index: 1 })

      globalDragState.endDrag('drag-cdup4')

      const calls = (es.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      const cloneCall = calls.find((c) => c[0] === 'clone')!
      expect(cloneCall[1].oldIndexes).toEqual([0, 2])
      expect(cloneCall[1].newIndex).toBe(3)
      expect(cloneCall[1].newIndexes).toEqual([3, 4])
    })
  })

  describe('endControlledDrag - cross-zone duplicate=true without pullMode', () => {
    it('takes the clone path (not remove) when duplicate is true even though pullMode is unset', () => {
      const item = mockElement('div', 'xitem')
      const sourceZone = mockElement('div')
      const targetZone = mockElement('div')
      const sourceEs = mockEventSystem()
      const sourceDm = mockDragManager(sourceZone, sourceEs)

      globalDragState.startDrag(
        'drag-cdup3',
        item,
        sourceZone,
        sourceDm,
        'group1',
        0,
        sourceEs,
        true
      )
      globalDragState.setDuplicate('drag-cdup3', true)
      // Cross-zone: pending points at the target zone. pullMode is
      // deliberately left unset — never touched by setPutTarget here — to
      // prove `duplicate` alone (not `pullMode`) drives the clone path.
      globalDragState.setPending('drag-cdup3', { zone: targetZone, index: 0 })
      expect(
        globalDragState.getActiveDrag('drag-cdup3')!.pullMode
      ).toBeUndefined()

      globalDragState.endDrag('drag-cdup3')

      const sourceCalls = (sourceEs.emit as ReturnType<typeof vi.fn>).mock
        .calls as EmitCall[]
      expect(sourceCalls[0][0]).toBe('clone')
      expect(sourceCalls[0][1].pullMode).toBe('clone')
      expect(sourceCalls.some((c) => c[0] === 'remove')).toBe(false)
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
