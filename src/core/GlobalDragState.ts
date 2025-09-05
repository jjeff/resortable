import { type SortableEventSystem } from './EventSystem.js'

interface DragManager {
  zone: { getIndex: (item: HTMLElement) => number }
  events: SortableEventSystem
}

interface ActiveDrag {
  id: string // Unique identifier for this drag (e.g., pointerId)
  item: HTMLElement
  fromZone: HTMLElement
  fromDragManager: DragManager
  groupName: string
  startIndex: number
  eventSystem: SortableEventSystem
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
    item: HTMLElement,
    fromZone: HTMLElement,
    fromDragManager: DragManager,
    groupName: string,
    startIndex: number,
    eventSystem: SortableEventSystem
  ): void {
    this.activeDrags.set(dragId, {
      id: dragId,
      item,
      fromZone,
      fromDragManager,
      groupName,
      startIndex,
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
    // Only allow drops to same group
    if (activeDrag && this.canAcceptDrop(dragId, groupName)) {
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
      // Cross-zone drop - handle add/remove events
      const newIndex = putTarget.dragManager.zone.getIndex(activeDrag.item)

      // Fire remove event on source
      activeDrag.eventSystem.emit('remove', {
        item: activeDrag.item,
        items: [activeDrag.item],
        from: activeDrag.fromZone,
        to: putTarget.zone,
        oldIndex: activeDrag.startIndex,
        newIndex,
      })

      // Fire add event on target (if different event system)
      if (putTarget.dragManager.events !== activeDrag.eventSystem) {
        putTarget.dragManager.events.emit('add', {
          item: activeDrag.item,
          items: [activeDrag.item],
          from: activeDrag.fromZone,
          to: putTarget.zone,
          oldIndex: activeDrag.startIndex,
          newIndex,
        })
      }
    }

    // Fire unchoose event before end
    activeDrag.eventSystem.emit('unchoose', {
      item: activeDrag.item,
      items: [activeDrag.item],
      from: activeDrag.fromZone,
      to: putTarget?.zone || activeDrag.fromZone,
      oldIndex: activeDrag.startIndex,
      newIndex: -1,
    })

    // Fire end event
    const finalIndex = activeDrag.item.parentElement
      ? Array.from(activeDrag.item.parentElement.children).indexOf(
          activeDrag.item
        )
      : -1

    activeDrag.eventSystem.emit('end', {
      item: activeDrag.item,
      items: [activeDrag.item],
      from: activeDrag.fromZone,
      to: putTarget?.zone || activeDrag.fromZone,
      oldIndex: activeDrag.startIndex,
      newIndex: finalIndex,
    })

    this.activeDrags.delete(dragId)
    this.putTargets.delete(dragId)
  }

  /** Check if a specific drag can be accepted by a group */
  public canAcceptDrop(dragId: string, targetGroupName: string): boolean {
    const activeDrag = this.activeDrags.get(dragId)
    return activeDrag?.groupName === targetGroupName
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
