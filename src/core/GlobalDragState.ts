import { type SortableEventSystem } from './EventSystem.js'

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
    eventSystem: SortableEventSystem
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
    })
    // Clear any existing put target for this drag
    this.putTargets.delete(dragId)
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

            if (pullMode === 'clone') {
              // Create clones of all dragged items
              const clones = activeDrag.items.map((item) => {
                const clone = item.cloneNode(true) as HTMLElement
                // Clear any IDs to avoid duplicates
                clone.removeAttribute('id')
                // Remove any drag-related classes
                clone.classList.remove(
                  'sortable-chosen',
                  'sortable-drag',
                  'sortable-ghost'
                )
                return clone
              })
              activeDrag.clones = clones
            }
          } else {
            // Fallback: assume move operation
            activeDrag.pullMode = 'move'
          }
        } catch {
          // Fallback: assume move operation
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

  /** End drag operation and handle cross-zone drops */
  public endDrag(dragId: string): void {
    const activeDrag = this.activeDrags.get(dragId)
    if (!activeDrag) return

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
