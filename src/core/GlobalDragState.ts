import { type SortableEventSystem } from './EventSystem.js'
import { createDragClone } from '../utils/dom.js'

interface DragManager {
  zone: { getIndex: (item: HTMLElement) => number }
  events: SortableEventSystem
  getGroupManager?: () => {
    getName: () => string
    canPullTo: (targetGroupName: string) => boolean
    shouldClone: () => boolean
    getPullMode: (targetGroupName: string) => 'move' | 'clone'
  }
}

interface ActiveDrag {
  id: string // Unique identifier for this drag (e.g., pointerId)
  items: HTMLElement[]
  fromZone: HTMLElement
  fromDragManager: DragManager
  groupName: string
  startIndices: number[]
  eventSystem: SortableEventSystem
  clones?: HTMLElement[] // Cloned elements for clone operations
  pullMode?: 'move' | 'clone' // How these items were pulled
  duplicate?: boolean // duplicateKey held; state at drop decides
  controlled?: boolean // Controlled mode: no consumer-DOM mutation, intent-only events
  // Controlled mode: where the placeholder currently sits. Set/updated by the
  // drag pipelines; endDrag() emits indices from here instead of the DOM.
  // Cleared (left undefined) on cancel/revert so end reports newIndex = oldIndex.
  pending?: { zone: HTMLElement; index: number }
}

interface PutTarget {
  zone: HTMLElement
  dragManager: DragManager
  groupName: string
}

/**
 * Manages global drag state across all Sortable instances
 * Enables cross-group drag and drop functionality with multi-touch support
 * @internal
 */
class GlobalDragStateManager {
  private activeDrags = new Map<string, ActiveDrag>()
  private putTargets = new Map<string, PutTarget>()

  /** Start a drag operation */
  public startDrag(
    dragId: string,
    items: HTMLElement | HTMLElement[],
    fromZone: HTMLElement,
    fromDragManager: DragManager,
    groupName: string,
    startIndex: number | number[],
    eventSystem: SortableEventSystem,
    controlled = false
  ): void {
    const itemsArray = Array.isArray(items) ? items : [items]
    const indicesArray = Array.isArray(startIndex) ? startIndex : [startIndex]
    this.activeDrags.set(dragId, {
      id: dragId,
      items: itemsArray,
      fromZone,
      fromDragManager,
      groupName,
      startIndices: indicesArray,
      eventSystem,
      controlled,
      // Controlled drags start with the placeholder at the item's own spot.
      pending: controlled
        ? { zone: fromZone, index: indicesArray[0] }
        : undefined,
    })
    // Clear any existing put target for this drag
    this.putTargets.delete(dragId)
  }

  /** Controlled mode: record where the placeholder currently sits */
  public setPending(
    dragId: string,
    pending: { zone: HTMLElement; index: number }
  ): void {
    const activeDrag = this.activeDrags.get(dragId)
    if (activeDrag) activeDrag.pending = pending
  }

  /** Controlled mode: read the current placeholder position */
  public getPending(
    dragId: string
  ): { zone: HTMLElement; index: number } | undefined {
    return this.activeDrags.get(dragId)?.pending
  }

  /** Controlled mode: cancel — end will report newIndex = oldIndex */
  public clearPending(dragId: string): void {
    const activeDrag = this.activeDrags.get(dragId)
    if (activeDrag) activeDrag.pending = undefined
  }

  /** Set the current drop target for a specific drag */
  public setPutTarget(
    dragId: string,
    zone: HTMLElement,
    dragManager: DragManager,
    groupName: string
  ): void {
    const activeDrag = this.activeDrags.get(dragId)
    // Only allow drops to compatible groups
    if (activeDrag && this.canAcceptDrop(dragId, groupName)) {
      // Check if we need to create a clone for this operation
      const isDifferentZone = zone !== activeDrag.fromZone
      if (isDifferentZone && !activeDrag.clones) {
        try {
          const sourceGroupManager =
            activeDrag.fromDragManager.getGroupManager?.()
          if (sourceGroupManager) {
            const pullMode = sourceGroupManager.getPullMode(groupName)
            activeDrag.pullMode = pullMode

            // Controlled mode never materializes clone nodes — `pullMode:
            // 'clone'` is reported in the events and the consumer's state
            // update inserts the copy.
            if (pullMode === 'clone' && !activeDrag.controlled) {
              // Create clones of all dragged items
              activeDrag.clones = activeDrag.items.map((item) =>
                createDragClone(item)
              )
            }
          } else {
            // Fallback: assume move operation
            activeDrag.pullMode = 'move'
          }
        } catch (err) {
          // Fallback: assume move operation. GroupManager.getPullMode throws
          // deliberately for a config-blocked pull, so log it — silently
          // demoting to a move hides a misconfigured `group.pull`.
          // eslint-disable-next-line no-console
          console.warn(
            '[resortable] getPullMode threw, falling back to move:',
            err
          )
          activeDrag.pullMode = 'move'
        }
      }

      this.putTargets.set(dragId, { zone, dragManager, groupName })
    }
  }

  /** Clear the current drop target for a specific drag */
  public clearPutTarget(dragId: string): void {
    this.putTargets.delete(dragId)
  }

  /** Live-track whether the configured duplicateKey is currently held */
  public setDuplicate(dragId: string, active: boolean): void {
    const activeDrag = this.activeDrags.get(dragId)
    if (activeDrag) activeDrag.duplicate = active
  }

  /**
   * Record a drop-time duplicate. Called by DragManager AFTER it has already
   * performed the DOM surgery (inserting `clones` alongside the originals),
   * so endDrag sees the same state the group `pull: 'clone'` flow produces.
   */
  public applyDuplicate(dragId: string, clones: HTMLElement[]): void {
    const activeDrag = this.activeDrags.get(dragId)
    if (!activeDrag) return
    activeDrag.pullMode = 'clone'
    activeDrag.clones = clones
  }

  /** End drag operation and handle cross-zone drops */
  public endDrag(dragId: string): void {
    const activeDrag = this.activeDrags.get(dragId)
    if (!activeDrag) return

    if (activeDrag.controlled) {
      this.endControlledDrag(activeDrag)
      this.activeDrags.delete(dragId)
      this.putTargets.delete(dragId)
      return
    }

    const putTarget = this.putTargets.get(dragId)
    const isDifferentZone = putTarget && putTarget.zone !== activeDrag.fromZone

    if (isDifferentZone && putTarget) {
      // Cross-zone drop - handle clone or move operations
      const isCloneOperation = activeDrag.pullMode === 'clone'
      let targetItem: HTMLElement

      if (isCloneOperation && activeDrag.clones?.[0]) {
        // For clone operations, use the first clone as the target item
        targetItem = activeDrag.clones[0]
        const newIndex = putTarget.dragManager.zone.getIndex(targetItem)

        // Fire clone event on source
        activeDrag.eventSystem.emit('clone', {
          item: activeDrag.items[0],
          items: activeDrag.items,
          from: activeDrag.fromZone,
          to: putTarget.zone,
          oldIndex: activeDrag.startIndices[0],
          newIndex,
          clone: targetItem,
          pullMode: 'clone',
        })

        // Fire add event on target for the cloned item
        if (putTarget.dragManager.events !== activeDrag.eventSystem) {
          putTarget.dragManager.events.emit('add', {
            item: targetItem,
            items: activeDrag.items,
            from: activeDrag.fromZone,
            to: putTarget.zone,
            oldIndex: activeDrag.startIndices[0],
            newIndex,
            clone: targetItem,
            pullMode: 'clone',
          })
        }
      } else {
        // For move operations, use the original item
        targetItem = activeDrag.items[0]
        const newIndex = putTarget.dragManager.zone.getIndex(targetItem)

        // Fire remove event on source
        activeDrag.eventSystem.emit('remove', {
          item: activeDrag.items[0],
          items: activeDrag.items,
          from: activeDrag.fromZone,
          to: putTarget.zone,
          oldIndex: activeDrag.startIndices[0],
          newIndex,
          pullMode: activeDrag.pullMode || true,
        })

        // Fire add event on target (if different event system)
        if (putTarget.dragManager.events !== activeDrag.eventSystem) {
          putTarget.dragManager.events.emit('add', {
            item: activeDrag.items[0],
            items: activeDrag.items,
            from: activeDrag.fromZone,
            to: putTarget.zone,
            oldIndex: activeDrag.startIndices[0],
            newIndex,
            pullMode: activeDrag.pullMode || true,
          })
        }
      }
    } else if (activeDrag.duplicate && activeDrag.clones?.[0]) {
      // Same-zone duplicate: DragManager has already inserted the copy into
      // the DOM and called applyDuplicate(), so the index is read live from
      // the zone rather than computed here. Gated on `duplicate`, NOT on the
      // mere presence of `clones` — a group `pull: 'clone'` drag that
      // crossed zones and was returned home also carries clones, and must
      // not double-fire this branch.
      const clone = activeDrag.clones[0]
      // Read every copy's settled DOM index so multi-drag consumers get the
      // same `oldIndexes`/`newIndexes` shape the controlled branch emits.
      const newIndexes = activeDrag.clones.map((c) =>
        activeDrag.fromDragManager.zone.getIndex(c)
      )
      const duplicateEvent = {
        item: activeDrag.items[0],
        items: activeDrag.items,
        from: activeDrag.fromZone,
        to: activeDrag.fromZone,
        oldIndex: activeDrag.startIndices[0],
        newIndex: newIndexes[0],
        oldIndexes: [...activeDrag.startIndices],
        newIndexes,
        clone,
        pullMode: 'clone' as const,
      }
      // Deliberately no 'add' event: this is the same instance/zone, so
      // firing 'add' too would double-insert for consumers wired to both
      // onClone and onAdd.
      activeDrag.eventSystem.emit('clone', duplicateEvent)
      activeDrag.eventSystem.emit('sort', duplicateEvent)
      activeDrag.eventSystem.emit('update', duplicateEvent)
      activeDrag.eventSystem.emit('change', duplicateEvent)
    }

    // Fire unchoose event before end
    activeDrag.eventSystem.emit('unchoose', {
      item: activeDrag.items[0],
      items: activeDrag.items,
      from: activeDrag.fromZone,
      to: putTarget?.zone || activeDrag.fromZone,
      oldIndex: activeDrag.startIndices[0],
      newIndex: -1,
    })

    // Fire end event
    const finalIndex = activeDrag.items[0].parentElement
      ? Array.from(activeDrag.items[0].parentElement.children).indexOf(
          activeDrag.items[0]
        )
      : -1

    activeDrag.eventSystem.emit('end', {
      item: activeDrag.items[0],
      items: activeDrag.items,
      from: activeDrag.fromZone,
      to: putTarget?.zone || activeDrag.fromZone,
      oldIndex: activeDrag.startIndices[0],
      newIndex: finalIndex,
    })

    this.activeDrags.delete(dragId)
    this.putTargets.delete(dragId)
  }

  /**
   * Controlled-mode drag end: the caller (drag pipeline) has already
   * restored the DOM (placeholder removed, hidden items shown), so every
   * index here comes from `pending`, never from the DOM. Events carry the
   * full intent (`oldIndexes`/`newIndexes`); the consumer commits it by
   * updating state. A cleared `pending` means cancelled — report
   * newIndex = oldIndex so consumers can no-op.
   */
  private endControlledDrag(activeDrag: ActiveDrag): void {
    const putTarget = this.putTargets.get(activeDrag.id)
    const { pending } = activeDrag
    const oldIndex = activeDrag.startIndices[0]
    const oldIndexes = [...activeDrag.startIndices]
    const toZone = pending?.zone ?? activeDrag.fromZone
    const newIndex = pending?.index ?? oldIndex
    const newIndexes = pending
      ? activeDrag.items.map((_, i) => pending.index + i)
      : oldIndexes
    const isDifferentZone = toZone !== activeDrag.fromZone

    const base = {
      item: activeDrag.items[0],
      items: activeDrag.items,
      from: activeDrag.fromZone,
      to: toZone,
      oldIndex,
      newIndex,
      oldIndexes,
      newIndexes,
    }

    if (isDifferentZone) {
      const isClone =
        activeDrag.pullMode === 'clone' || activeDrag.duplicate === true
      const pullMode = isClone
        ? ('clone' as const)
        : activeDrag.pullMode || true
      if (isClone) {
        // No clone node exists in controlled mode — the event reports the
        // intent and the consumer's state insert IS the clone.
        activeDrag.eventSystem.emit('clone', { ...base, pullMode })
      } else {
        activeDrag.eventSystem.emit('remove', { ...base, pullMode })
      }
      // Fire add on the target's event system (skip if the placeholder
      // ended somewhere we never registered — shouldn't happen, but don't
      // emit into the wrong list's handlers).
      const targetEvents =
        putTarget && putTarget.zone === toZone
          ? putTarget.dragManager.events
          : null
      if (targetEvents && targetEvents !== activeDrag.eventSystem) {
        targetEvents.emit('add', { ...base, pullMode })
      }
    } else if (activeDrag.duplicate && pending) {
      // Same-zone controlled duplicate: no DOM to read from, so the copy's
      // final index has to account for the original still occupying a slot
      // ahead of the drop point (only in-list originals count — this drag's
      // own starting slots shift the copy's landing spot by one each).
      // `pending.index` is an index into the REDUCED list (getControlledIndex
      // skips the hidden dragged items), while `startIndices` are full-list
      // indices — so compare like for like: `s - k` is the k-th dragged
      // item's position once the k items before it are taken out.
      // startIndices are sorted ascending (DragManager sorts the selection by
      // zone index before starting the drag).
      const offset = activeDrag.startIndices.filter(
        (s, k) => s - k <= pending.index
      ).length
      const duplicateNewIndex = pending.index + offset
      const duplicateNewIndexes = activeDrag.items.map(
        (_, i) => pending.index + offset + i
      )
      const duplicateBase = {
        ...base,
        newIndex: duplicateNewIndex,
        newIndexes: duplicateNewIndexes,
        pullMode: 'clone' as const,
      }
      // No clone node exists in controlled mode.
      activeDrag.eventSystem.emit('clone', duplicateBase)
      activeDrag.eventSystem.emit('sort', duplicateBase)
      activeDrag.eventSystem.emit('update', duplicateBase)
      activeDrag.eventSystem.emit('change', duplicateBase)
    }

    activeDrag.eventSystem.emit('unchoose', { ...base, newIndex: -1 })
    activeDrag.eventSystem.emit('end', base)
  }

  /** Check if a specific drag can be accepted by a group */
  public canAcceptDrop(dragId: string, targetGroupName: string): boolean {
    const activeDrag = this.activeDrags.get(dragId)
    if (!activeDrag) return false

    // Same group is always compatible
    if (activeDrag.groupName === targetGroupName) return true

    // Check if source group can pull to target group
    try {
      const sourceGroupManager = activeDrag.fromDragManager.getGroupManager?.()
      if (sourceGroupManager) {
        return sourceGroupManager.canPullTo(targetGroupName)
      }
    } catch {
      // Ignore errors and fallback
    }

    // Fallback to simple group name matching
    return activeDrag.groupName === targetGroupName
  }

  /** Get specific active drag info */
  public getActiveDrag(dragId: string): ActiveDrag | undefined {
    return this.activeDrags.get(dragId)
  }

  /** Get all active drags */
  public getAllActiveDrags(): ActiveDrag[] {
    return Array.from(this.activeDrags.values())
  }

  /** Check if there's a specific active drag */
  public hasDrag(dragId: string): boolean {
    return this.activeDrags.has(dragId)
  }

  /** Check if there are any active drags */
  public hasAnyDrag(): boolean {
    return this.activeDrags.size > 0
  }

  /** Get current put target for a specific drag */
  public getPutTarget(dragId: string): PutTarget | undefined {
    return this.putTargets.get(dragId)
  }

  /** Get the number of active drags */
  public getActiveDragCount(): number {
    return this.activeDrags.size
  }
}

// Export singleton instance
export const globalDragState = new GlobalDragStateManager()

// Export types for use by other modules
export type { ActiveDrag, PutTarget }
