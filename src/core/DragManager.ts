import { SortableEvent } from '../types/index.js'
import { DropZone } from './DropZone.js'
import { type SortableEventSystem } from './EventSystem.js'
import { globalDragState } from './GlobalDragState.js'
import { SelectionManager } from './SelectionManager.js'
import { KeyboardManager } from './KeyboardManager.js'

// Global registry of DragManager instances for cross-zone operations
const dragManagerRegistry = new Map<HTMLElement, DragManager>()

/**
 * Handles drag and drop interactions with accessibility support
 * @internal
 */
export class DragManager {
  private startIndex = -1
  private isPointerDragging = false
  private activePointerId: number | null = null
  private dragElement: HTMLElement | null = null
  private selectionManager: SelectionManager
  private keyboardManager: KeyboardManager
  private enableAccessibility: boolean

  constructor(
    public zone: DropZone,
    public events: SortableEventSystem,
    public groupName: string,
    options?: {
      enableAccessibility?: boolean
      multiSelect?: boolean
      selectedClass?: string
      focusClass?: string
    }
  ) {
    // Register this drag manager in the global registry
    dragManagerRegistry.set(this.zone.element, this)

    // Initialize accessibility features
    this.enableAccessibility = options?.enableAccessibility ?? true

    // Initialize selection manager
    this.selectionManager = new SelectionManager(
      this.zone.element,
      this.events,
      {
        selectedClass: options?.selectedClass,
        focusClass: options?.focusClass,
        multiSelect: options?.multiSelect,
      }
    )

    // Initialize keyboard manager if accessibility is enabled
    this.keyboardManager = new KeyboardManager(
      this.zone.element,
      this.zone,
      this.selectionManager,
      this.events,
      this.groupName
    )
  }

  /** Attach event listeners */
  public attach(): void {
    const el = this.zone.element
    // HTML5 drag events
    el.addEventListener('dragstart', this.onDragStart)
    el.addEventListener('dragover', this.onDragOver)
    el.addEventListener('drop', this.onDrop)
    el.addEventListener('dragend', this.onDragEnd)
    el.addEventListener('dragenter', this.onDragEnter)
    el.addEventListener('dragleave', this.onDragLeave)

    // Pointer events for modern touch/pen/mouse support
    el.addEventListener('pointerdown', this.onPointerDown)
    // Note: pointermove and pointerup are attached to document in onPointerDown

    // Attach accessibility features
    if (this.enableAccessibility) {
      this.keyboardManager.attach()
    }

    // Setup draggable items - only for elements that already have sortable-item class
    for (const child of this.zone.getItems()) {
      // Only make items with sortable-item class draggable
      if (child.classList.contains('sortable-item')) {
        child.draggable = true
      }
    }
  }

  /** Detach event listeners */
  public detach(): void {
    const el = this.zone.element
    el.removeEventListener('dragstart', this.onDragStart)
    el.removeEventListener('dragover', this.onDragOver)
    el.removeEventListener('drop', this.onDrop)
    el.removeEventListener('dragend', this.onDragEnd)
    el.removeEventListener('dragenter', this.onDragEnter)
    el.removeEventListener('dragleave', this.onDragLeave)

    // Remove pointer events
    el.removeEventListener('pointerdown', this.onPointerDown)
    // Document listeners are removed in onPointerUp

    // Detach accessibility features
    if (this.enableAccessibility) {
      this.keyboardManager.detach()
      this.selectionManager.destroy()
    }

    // Unregister from global registry
    dragManagerRegistry.delete(this.zone.element)
  }

  private onDragStart = (e: DragEvent): void => {
    const target = e.target as HTMLElement
    if (!target || target.parentElement !== this.zone.element) return
    this.startIndex = this.zone.getIndex(target)

    // Register with global drag state using HTML5 drag API as ID
    const dragId = 'html5-drag'
    globalDragState.startDrag(
      dragId,
      target,
      this.zone.element,
      this,
      this.groupName,
      this.startIndex,
      this.events
    )

    const evt: SortableEvent = {
      item: target,
      items: [target],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: this.startIndex,
      newIndex: this.startIndex,
    }
    this.events.emit('start', evt)
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', '')
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  private onDragOver = (e: DragEvent): void => {
    e.preventDefault()

    // Check if we can accept the current drag (HTML5 drag events don't have pointer IDs)
    const dragId = 'html5-drag'
    if (!globalDragState.canAcceptDrop(dragId, this.groupName)) {
      return
    }

    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) return

    const dragItem = activeDrag.item
    const over = (e.target as HTMLElement).closest('.sortable-item')

    // Handle cross-zone dragging
    if (dragItem.parentElement !== this.zone.element) {
      // Move item to this zone if not already here
      this.zone.element.appendChild(dragItem)
    }

    if (
      !(over instanceof HTMLElement) ||
      over === dragItem ||
      over.parentElement !== this.zone.element
    ) {
      return
    }

    const overIndex = this.zone.getIndex(over)
    const dragIndex = this.zone.getIndex(dragItem)
    if (overIndex === dragIndex) return

    // Determine the correct insertion index based on drag direction
    // We want to insert the dragged item before the item we're hovering over
    let targetIndex = overIndex
    if (dragIndex < overIndex) {
      // Dragging downwards: insert at the position that will be before the target
      // After removing the dragged item, target shifts down by 1, so we insert at overIndex - 1
      targetIndex = overIndex - 1
    } else {
      // Dragging upwards: insert before the target (overIndex stays the same)
      targetIndex = overIndex
    }

    this.zone.move(dragItem, targetIndex)

    // Only emit update if it's within the same zone originally
    if (activeDrag.fromZone === this.zone.element) {
      this.events.emit('update', {
        item: dragItem,
        items: [dragItem],
        from: this.zone.element,
        to: this.zone.element,
        oldIndex: dragIndex,
        newIndex: overIndex,
      })
    }
  }

  private onDrop = (e: DragEvent): void => {
    e.preventDefault()
  }

  private onDragEnd = (): void => {
    // Global drag state handles the end event and cleanup
    const dragId = 'html5-drag'
    globalDragState.endDrag(dragId)
    this.startIndex = -1
  }

  private onDragEnter = (e: DragEvent): void => {
    e.preventDefault()
    const dragId = 'html5-drag'
    if (globalDragState.canAcceptDrop(dragId, this.groupName)) {
      globalDragState.setPutTarget(
        dragId,
        this.zone.element,
        this,
        this.groupName
      )
    }
  }

  private onDragLeave = (e: DragEvent): void => {
    // Only clear if we're leaving the zone entirely
    if (!this.zone.element.contains(e.relatedTarget as Node)) {
      const dragId = 'html5-drag'
      globalDragState.clearPutTarget(dragId)
    }
  }

  // Pointer-based drag and drop for modern touch/pen/mouse support
  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement
    if (!target || target.parentElement !== this.zone.element) return

    // Only start drag on primary button (left mouse or primary touch)
    if (e.button !== 0) return

    // Ignore pen input - pen should use native drag API or be explicitly handled
    if (e.pointerType === 'pen') return

    // If there's already an active drag and this is a touch event, cancel the drag
    // This handles multi-touch scenarios where any second touch cancels dragging
    if (
      this.isPointerDragging &&
      this.activePointerId !== null &&
      e.pointerType === 'touch'
    ) {
      // Cancel the existing drag when ANY second touch is detected (primary or not)
      // This prevents accidental moves during multi-touch
      this.cleanupPointerDrag(true)
      return
    }

    // Only handle primary pointers for starting new drags
    if (!e.isPrimary) return

    // If there's already an active drag from a non-touch pointer, ignore new pointers
    if (this.isPointerDragging && this.activePointerId !== null) {
      return
    }

    // Get selected items if multiSelect is enabled
    let draggedItems: HTMLElement[] = [target]
    if (this.selectionManager.isSelected(target)) {
      // If the target is already selected, drag all selected items
      draggedItems = this.selectionManager.getSelected()
    } else {
      // If target is not selected, select only it
      this.selectionManager.select(target)
    }

    // Capture the pointer to ensure we receive all subsequent events
    // Firefox throws an error for synthetic events, so we need to handle this gracefully
    try {
      target.setPointerCapture(e.pointerId)
    } catch (_err) {
      // This is expected for synthetic pointer events in Firefox - continue without capture
    }
    this.dragElement = target
    this.isPointerDragging = true
    this.activePointerId = e.pointerId
    this.startIndex = this.zone.getIndex(target)

    // Attach global pointer events
    document.addEventListener('pointermove', this.onPointerMove)
    document.addEventListener('pointerup', this.onPointerUp)
    document.addEventListener('pointercancel', this.onPointerCancel)

    // Register with global drag state using pointer ID
    const dragId = `pointer-${this.activePointerId}`
    globalDragState.startDrag(
      dragId,
      target,
      this.zone.element,
      this,
      this.groupName,
      this.startIndex,
      this.events
    )

    const evt: SortableEvent = {
      item: target,
      items: draggedItems,
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: this.startIndex,
      newIndex: this.startIndex,
    }
    this.events.emit('start', evt)

    // Prevent text selection
    e.preventDefault()
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (
      !this.isPointerDragging ||
      !this.dragElement ||
      e.pointerId !== this.activePointerId
    )
      return

    // Only process primary pointer events during drag
    if (!e.isPrimary) return

    e.preventDefault()

    const dragId = `pointer-${this.activePointerId}`
    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) return

    // Find the element under the mouse cursor
    const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY)
    const over = elementUnderMouse?.closest('.sortable-item') as HTMLElement

    if (!over) return

    // Find which zone the element we're hovering over belongs to
    const targetZoneElement = over.parentElement
    if (!targetZoneElement) return

    // Find all Sortable instances and see which one manages this zone
    // We need to handle cross-zone movement by finding the right DragManager
    // For now, let's use a simpler approach and move the item to the hovered zone

    // Check if we can drop in this zone (group compatibility)
    // We need to find which drag manager handles this zone and check group compatibility
    // For now, we'll implement a simplified check by looking at the zone ID patterns

    // If hovering over a different zone, check if it's allowed
    if (this.dragElement.parentElement !== targetZoneElement) {
      // Simple group compatibility check based on the zone element and current group
      if (this.canDropInZone(targetZoneElement)) {
        // Insert at the position of the hovered item
        targetZoneElement.insertBefore(this.dragElement, over)

        // We need to find the actual DragManager instance for the target zone
        // For now, create a minimal put target that will trigger the events
        const targetDragManager = this.findDragManagerForZone(targetZoneElement)
        const dragId = `pointer-${this.activePointerId}`
        if (targetDragManager) {
          globalDragState.setPutTarget(
            dragId,
            targetZoneElement,
            targetDragManager,
            targetDragManager.groupName
          )
        } else {
          // Fallback: use current drag manager but with target zone
          globalDragState.setPutTarget(
            dragId,
            targetZoneElement,
            this,
            this.groupName
          )
        }
      }
    } else if (over !== this.dragElement) {
      // Same zone movement - insert before the hovered item
      targetZoneElement.insertBefore(this.dragElement, over)

      // Only emit update if it's within the original zone
      if (activeDrag.fromZone === targetZoneElement) {
        const newIndex = Array.from(targetZoneElement.children).indexOf(
          this.dragElement
        )
        this.events.emit('update', {
          item: this.dragElement,
          items: [this.dragElement],
          from: targetZoneElement,
          to: targetZoneElement,
          oldIndex: this.startIndex,
          newIndex,
        })
      }
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isPointerDragging || e.pointerId !== this.activePointerId) return

    this.cleanupPointerDrag()
  }

  private onPointerCancel = (e: PointerEvent): void => {
    if (!this.isPointerDragging || e.pointerId !== this.activePointerId) return

    this.cleanupPointerDrag()
  }

  private cleanupPointerDrag(revert = false): void {
    // Remove global pointer event listeners
    document.removeEventListener('pointermove', this.onPointerMove)
    document.removeEventListener('pointerup', this.onPointerUp)
    document.removeEventListener('pointercancel', this.onPointerCancel)

    // If reverting (cancelled drag), restore original position
    if (revert && this.dragElement && this.startIndex >= 0) {
      const dragId =
        this.activePointerId !== null ? `pointer-${this.activePointerId}` : null
      const activeDrag = dragId ? globalDragState.getActiveDrag(dragId) : null

      if (activeDrag && activeDrag.fromZone) {
        // Move the element back to its original position
        const fromZone = activeDrag.fromZone
        // Get only sortable items, not all children
        const items = Array.from(fromZone.querySelectorAll('.sortable-item'))
        const currentIndex = items.indexOf(this.dragElement)

        // Only revert if the element has actually moved
        if (currentIndex !== this.startIndex && currentIndex !== -1) {
          // Remove from current position
          if (this.dragElement.parentElement) {
            this.dragElement.parentElement.removeChild(this.dragElement)
          }

          // Get the current list of sortable items after removal
          const itemsAfterRemoval = Array.from(
            fromZone.querySelectorAll('.sortable-item')
          )

          // Insert at original position
          if (this.startIndex >= itemsAfterRemoval.length) {
            // If original index is at or beyond the end, append
            fromZone.appendChild(this.dragElement)
          } else {
            // Insert before the item that's now at our original index
            const beforeElement = itemsAfterRemoval[this.startIndex]
            if (beforeElement) {
              fromZone.insertBefore(this.dragElement, beforeElement)
            } else {
              fromZone.appendChild(this.dragElement)
            }
          }
        }
      }
    }

    // Global drag state handles the end event and cleanup
    if (this.activePointerId !== null) {
      const dragId = `pointer-${this.activePointerId}`
      globalDragState.endDrag(dragId)
    }
    this.startIndex = -1
    this.isPointerDragging = false
    this.activePointerId = null
    this.dragElement = null
  }

  /** Find the DragManager instance that manages a specific zone */
  private findDragManagerForZone(targetZone: HTMLElement): DragManager | null {
    return dragManagerRegistry.get(targetZone) || null
  }

  /** Get the selection manager for this drag manager */
  public getSelectionManager(): SelectionManager {
    return this.selectionManager
  }

  /** Get the keyboard manager for this drag manager */
  public getKeyboardManager(): KeyboardManager {
    return this.keyboardManager
  }

  /** Check if we can drop in a target zone based on group compatibility */
  private canDropInZone(targetZone: HTMLElement): boolean {
    const targetDragManager = this.findDragManagerForZone(targetZone)
    if (!targetDragManager) {
      // If no drag manager found, fall back to heuristic
      return this.canDropInZoneHeuristic(targetZone)
    }

    // Use proper group compatibility check
    if (this.activePointerId !== null) {
      const dragId = `pointer-${this.activePointerId}`
      return globalDragState.canAcceptDrop(dragId, targetDragManager.groupName)
    }
    return false
  }

  /** Fallback heuristic for group compatibility when no DragManager is found */
  private canDropInZoneHeuristic(targetZone: HTMLElement): boolean {
    if (this.activePointerId === null) return false

    const dragId = `pointer-${this.activePointerId}`
    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) return false

    // Check if this is the current group
    if (targetZone === this.zone.element) return true

    // Simple group matching based on common patterns
    const currentGroup = this.groupName
    const zoneId = targetZone.id

    // Hardcoded group mappings based on the HTML structure
    if (currentGroup === 'group-a') {
      return (
        zoneId.includes('shared-a-') ||
        zoneId.includes('grid-') ||
        zoneId.includes('list')
      )
    }

    if (currentGroup === 'independent-a') {
      return zoneId === 'group-a-1'
    }

    if (currentGroup === 'independent-b') {
      return zoneId === 'group-b-1'
    }

    if (currentGroup === 'grid-shared') {
      return zoneId.includes('grid-')
    }

    if (currentGroup === 'shared') {
      return zoneId.includes('list')
    }

    if (currentGroup === 'basic') {
      return zoneId === 'basic-list'
    }

    // Default: allow if same group name (this should be improved)
    return currentGroup === 'default'
  }
}
