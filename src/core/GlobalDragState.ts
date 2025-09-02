import { type SortableEventSystem } from './EventSystem.js'

interface DragManager {
  zone: { getIndex: (item: HTMLElement) => number }
  events: SortableEventSystem
}

/**
 * Manages global drag state across all Sortable instances
 * Enables cross-group drag and drop functionality
 * @internal
 */
class GlobalDragStateManager {
  private activeDrag: {
    item: HTMLElement
    fromZone: HTMLElement
    fromDragManager: DragManager
    groupName: string
    startIndex: number
    eventSystem: SortableEventSystem
  } | null = null

  private putTarget: {
    zone: HTMLElement
    dragManager: DragManager
    groupName: string
  } | null = null

  /** Start a drag operation */
  public startDrag(
    item: HTMLElement,
    fromZone: HTMLElement,
    fromDragManager: DragManager,
    groupName: string,
    startIndex: number,
    eventSystem: SortableEventSystem
  ): void {
    this.activeDrag = {
      item,
      fromZone,
      fromDragManager,
      groupName,
      startIndex,
      eventSystem,
    }
    this.putTarget = null
  }

  /** Set the current drop target */
  public setPutTarget(
    zone: HTMLElement,
    dragManager: DragManager,
    groupName: string
  ): void {
    // Only allow drops to same group
    if (this.activeDrag && this.canAcceptDrop(groupName)) {
      this.putTarget = { zone, dragManager, groupName }
    }
  }

  /** Clear the current drop target */
  public clearPutTarget(): void {
    this.putTarget = null
  }

  /** End drag operation and handle cross-zone drops */
  public endDrag(): void {
    if (!this.activeDrag) return

    const isDifferentZone =
      this.putTarget && this.putTarget.zone !== this.activeDrag.fromZone

    if (isDifferentZone && this.putTarget) {
      // Cross-zone drop - handle add/remove events
      const newIndex = this.putTarget.dragManager.zone.getIndex(
        this.activeDrag.item
      )

      // Fire remove event on source
      this.activeDrag.eventSystem.emit('remove', {
        item: this.activeDrag.item,
        items: [this.activeDrag.item],
        from: this.activeDrag.fromZone,
        to: this.putTarget.zone,
        oldIndex: this.activeDrag.startIndex,
        newIndex,
      })

      // Fire add event on target (if different event system)
      if (this.putTarget.dragManager.events !== this.activeDrag.eventSystem) {
        this.putTarget.dragManager.events.emit('add', {
          item: this.activeDrag.item,
          items: [this.activeDrag.item],
          from: this.activeDrag.fromZone,
          to: this.putTarget.zone,
          oldIndex: this.activeDrag.startIndex,
          newIndex,
        })
      }
    }

    // Fire end event
    const finalIndex = this.activeDrag.item.parentElement
      ? Array.from(this.activeDrag.item.parentElement.children).indexOf(
          this.activeDrag.item
        )
      : -1

    this.activeDrag.eventSystem.emit('end', {
      item: this.activeDrag.item,
      items: [this.activeDrag.item],
      from: this.activeDrag.fromZone,
      to: this.putTarget?.zone || this.activeDrag.fromZone,
      oldIndex: this.activeDrag.startIndex,
      newIndex: finalIndex,
    })

    this.activeDrag = null
    this.putTarget = null
  }

  /** Check if current drag can be accepted by a group */
  public canAcceptDrop(targetGroupName: string): boolean {
    return this.activeDrag?.groupName === targetGroupName
  }

  /** Get current active drag info */
  public getActiveDrag() {
    return this.activeDrag
  }

  /** Check if there's an active drag */
  public hasDrag(): boolean {
    return this.activeDrag !== null
  }

  /** Get current put target */
  public getPutTarget() {
    return this.putTarget
  }
}

// Export singleton instance
export const globalDragState = new GlobalDragStateManager()
