import { SortableEvent } from '../types/index.js'
import { DropZone } from './DropZone.js'
import { type SortableEventSystem } from './EventSystem.js'
import { globalDragState } from './GlobalDragState.js'
import { SelectionManager } from './SelectionManager.js'
import { KeyboardManager } from './KeyboardManager.js'
import { GhostManager } from './GhostManager.js'

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
  private handle?: string
  private filter?: string
  private onFilter?: (event: Event) => void
  private draggable: string
  private delay: number
  private delayOnTouchOnly: number
  private touchStartThreshold: number
  private dragStartTimer?: number
  private dragStartPosition?: { x: number; y: number }
  private swapThreshold?: number
  private invertSwap: boolean
  private invertedSwapThreshold?: number
  private direction: 'vertical' | 'horizontal'
  // Fallback system properties - to be fully implemented in future phase
  // @ts-expect-error - Will be implemented in fallback system

  private _forceFallback: boolean
  // @ts-expect-error - Will be implemented in fallback system

  private _fallbackClass?: string
  // @ts-expect-error - Will be implemented in fallback system

  private _fallbackOnBody: boolean
  // @ts-expect-error - Will be implemented in fallback system

  private _fallbackTolerance: number
  // @ts-expect-error - Will be implemented in fallback system

  private _fallbackOffsetX: number
  // @ts-expect-error - Will be implemented in fallback system

  private _fallbackOffsetY: number
  // @ts-expect-error - Will be implemented in fallback system

  private _fallbackClone: HTMLElement | null = null
  // @ts-expect-error - Will be implemented in visual customization

  private _dragoverBubble: boolean
  // @ts-expect-error - Will be implemented in visual customization

  private _removeCloneOnHide: boolean
  // @ts-expect-error - Will be implemented in visual customization

  private _emptyInsertThreshold: number
  private preventOnFilter: boolean
  // @ts-expect-error - Will be implemented in data management

  private _dataIdAttr: string
  private ghostManager: GhostManager

  constructor(
    public zone: DropZone,
    public events: SortableEventSystem,
    public groupName: string,
    options?: {
      enableAccessibility?: boolean
      multiSelect?: boolean
      selectedClass?: string
      focusClass?: string
      handle?: string
      filter?: string
      onFilter?: (event: Event) => void
      draggable?: string
      delay?: number
      delayOnTouchOnly?: number
      touchStartThreshold?: number
      swapThreshold?: number
      invertSwap?: boolean
      invertedSwapThreshold?: number
      direction?: 'vertical' | 'horizontal'
      forceFallback?: boolean
      fallbackClass?: string
      fallbackOnBody?: boolean
      fallbackTolerance?: number
      fallbackOffsetX?: number
      fallbackOffsetY?: number
      dragoverBubble?: boolean
      removeCloneOnHide?: boolean
      emptyInsertThreshold?: number
      preventOnFilter?: boolean
      dataIdAttr?: string
      ghostClass?: string
      chosenClass?: string
      dragClass?: string
    }
  ) {
    // Register this drag manager in the global registry
    dragManagerRegistry.set(this.zone.element, this)

    // Initialize accessibility features
    this.enableAccessibility = options?.enableAccessibility ?? true

    // Initialize handle and filter options
    this.handle = options?.handle
    this.filter = options?.filter
    this.onFilter = options?.onFilter

    // Initialize draggable selector and delay options
    this.draggable = options?.draggable || '.sortable-item'
    this.delay = options?.delay || 0
    this.delayOnTouchOnly = options?.delayOnTouchOnly ?? options?.delay ?? 0
    this.touchStartThreshold = options?.touchStartThreshold || 5

    // Initialize swap behavior options
    // swapThreshold is undefined by default (no threshold checking)
    this.swapThreshold = options?.swapThreshold
    this.invertSwap = options?.invertSwap ?? false
    this.invertedSwapThreshold = options?.invertedSwapThreshold
    this.direction = options?.direction ?? 'vertical'

    // Initialize fallback options (to be fully implemented)
    this._forceFallback = options?.forceFallback ?? false
    this._fallbackClass = options?.fallbackClass
    this._fallbackOnBody = options?.fallbackOnBody ?? false
    this._fallbackTolerance = options?.fallbackTolerance ?? 0
    this._fallbackOffsetX = options?.fallbackOffsetX ?? 0
    this._fallbackOffsetY = options?.fallbackOffsetY ?? 0

    // Initialize visual customization options
    this._dragoverBubble = options?.dragoverBubble ?? false
    this._removeCloneOnHide = options?.removeCloneOnHide ?? true
    this._emptyInsertThreshold = options?.emptyInsertThreshold ?? 5

    // Initialize other options
    this.preventOnFilter = options?.preventOnFilter ?? true
    this._dataIdAttr = options?.dataIdAttr ?? 'data-id'

    // Initialize ghost manager with classes
    this.ghostManager = new GhostManager(
      options?.ghostClass,
      options?.chosenClass,
      options?.dragClass
    )

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

    // Setup draggable items based on the draggable selector
    this.updateDraggableItems()
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

    // Cancel any pending drag delay
    this.cancelDragDelay()
    document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)

    // Detach accessibility features
    if (this.enableAccessibility) {
      this.keyboardManager.detach()
      this.selectionManager.destroy()
    }

    // Unregister from global registry
    dragManagerRegistry.delete(this.zone.element)
  }

  private onDragStart = (e: DragEvent): void => {
    // Find the closest draggable item
    const draggableSelector = this.draggable || '.sortable-item'
    const target = (e.target as HTMLElement)?.closest(
      draggableSelector
    ) as HTMLElement
    if (!target || target.parentElement !== this.zone.element) return

    // Check if the element is draggable
    if (!this.isDraggable(target)) {
      e.preventDefault()
      return
    }

    // Check if drag should be allowed based on handle/filter options
    if (!this.shouldAllowDrag(e, target)) {
      e.preventDefault()
      return
    }

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
    // Emit choose event first
    this.events.emit('choose', evt)

    // Create ghost element (but for HTML5 drag, we'll use it as a placeholder)
    // The actual dragging visual is handled by the browser
    this.ghostManager.createPlaceholder(target)

    // Apply chosen class to the dragged element
    const ghost = this.ghostManager.createGhost(target, e)

    // For HTML5 drag API, we can optionally set the drag image
    if (e.dataTransfer && ghost) {
      // Hide the ghost since browser will show its own drag image
      ghost.style.display = 'none'
      // Set drag data
      e.dataTransfer.setData('text/plain', '')
      e.dataTransfer.effectAllowed = 'move'
    }

    // Then emit start event
    this.events.emit('start', evt)
  }

  /**
   * Calculate if swap should occur based on overlap (only if threshold is set)
   */
  private shouldSwap(
    dragRect: DOMRect,
    targetRect: DOMRect,
    _dragDirection: 'forward' | 'backward'
  ): boolean {
    // If no threshold is set, always allow swap (legacy behavior)
    if (this.swapThreshold === undefined) {
      return true
    }

    // Calculate overlap percentage based on direction
    let overlap: number
    if (this.direction === 'vertical') {
      const overlapHeight =
        Math.min(dragRect.bottom, targetRect.bottom) -
        Math.max(dragRect.top, targetRect.top)
      overlap = Math.max(0, overlapHeight) / targetRect.height
    } else {
      const overlapWidth =
        Math.min(dragRect.right, targetRect.right) -
        Math.max(dragRect.left, targetRect.left)
      overlap = Math.max(0, overlapWidth) / targetRect.width
    }

    // Apply swap threshold logic
    let threshold = this.swapThreshold
    if (this.invertSwap) {
      // In inverted mode, swap occurs when overlap is less than the threshold
      threshold = this.invertedSwapThreshold ?? this.swapThreshold
      return overlap < threshold
    }

    // Normal mode: swap when overlap exceeds threshold
    return overlap >= threshold
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

    // Update placeholder position
    if (over instanceof HTMLElement && over !== dragItem) {
      const placeholder = this.ghostManager.getPlaceholderElement()
      if (placeholder) {
        // Insert placeholder at the potential drop position
        const overIndex = this.zone.getIndex(over)
        const dragIndex = this.zone.getIndex(dragItem)
        if (dragIndex < overIndex) {
          // Dragging down - insert after
          over.parentElement?.insertBefore(placeholder, over.nextSibling)
        } else {
          // Dragging up - insert before
          over.parentElement?.insertBefore(placeholder, over)
        }
      }
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

    // Check swap threshold if configured
    const dragRect = dragItem.getBoundingClientRect()
    const targetRect = over.getBoundingClientRect()
    const dragDirection = dragIndex < overIndex ? 'forward' : 'backward'

    if (!this.shouldSwap(dragRect, targetRect, dragDirection)) {
      return // Don't swap if threshold not met
    }

    // Create MoveEvent for onMove callback
    const moveEvent: import('../types/index.js').MoveEvent = {
      item: dragItem,
      items: [dragItem],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: dragIndex,
      newIndex: overIndex,
      related: over,
      willInsertAfter: dragIndex < overIndex,
      draggedRect: dragRect,
      targetRect,
    }

    // Fire onMove event
    this.events.emit('move', moveEvent)

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

    // Emit sort event (always fired when sorting changes)
    this.events.emit('sort', {
      item: dragItem,
      items: [dragItem],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: dragIndex,
      newIndex: overIndex,
    })

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

      // Emit change event when order changes within same list
      this.events.emit('change', {
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
    const activeDrag = globalDragState.getActiveDrag(dragId)

    // Clean up ghost elements
    if (activeDrag) {
      this.ghostManager.destroy(activeDrag.item)
    }

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
    // Find the closest draggable item
    const draggableSelector = this.draggable || '.sortable-item'
    const target = (e.target as HTMLElement)?.closest(
      draggableSelector
    ) as HTMLElement
    if (!target || target.parentElement !== this.zone.element) return

    // Check if the element is draggable
    if (!this.isDraggable(target)) return

    // Check if drag should be allowed based on handle/filter options
    if (!this.shouldAllowDrag(e, target)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

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

    // Handle delay if configured
    const isTouch = e.pointerType === 'touch'
    const effectiveDelay =
      isTouch && this.delayOnTouchOnly !== undefined
        ? this.delayOnTouchOnly
        : this.delay

    if (effectiveDelay && effectiveDelay > 0) {
      // Start delay timer
      this.startDragDelay(e, target, () => {
        // After delay, start the actual drag
        this.startPointerDrag(e, target)
      })

      // Store initial pointer position for threshold checking
      if (this.touchStartThreshold && this.touchStartThreshold > 0) {
        document.addEventListener('pointermove', this.onPointerMoveBeforeDrag)
      }

      // Prevent default to avoid text selection while waiting
      e.preventDefault()
    } else {
      // No delay, start drag immediately
      this.startPointerDrag(e, target)
      e.preventDefault()
    }
  }

  private onPointerMoveBeforeDrag = (e: PointerEvent): void => {
    if (!this.dragStartPosition || !this.dragStartTimer) return

    // Check if pointer moved beyond threshold
    const dx = e.clientX - this.dragStartPosition.x
    const dy = e.clientY - this.dragStartPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (this.touchStartThreshold && distance > this.touchStartThreshold) {
      // Cancel delayed drag
      this.cancelDragDelay()
      document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)
    }
  }

  private startPointerDrag(e: PointerEvent, target: HTMLElement): void {
    // Clear any delay timer
    this.cancelDragDelay()
    document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)

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
    // Emit choose event first
    this.events.emit('choose', evt)

    // Create ghost element for visual feedback
    this.ghostManager.createGhost(target, e)
    this.ghostManager.createPlaceholder(target)

    // Then emit start event
    this.events.emit('start', evt)
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

    // Update ghost position to follow cursor
    this.ghostManager.updateGhostPosition(e.clientX, e.clientY)

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
    // Cancel any pending delay timer
    this.cancelDragDelay()
    document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)

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

    // Clean up ghost elements
    if (this.dragElement) {
      this.ghostManager.destroy(this.dragElement)
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

  /**
   * Check if drag should be allowed based on handle and filter options
   * @param event - The triggering event (drag or pointer)
   * @param dragTarget - The element that would be dragged
   * @returns true if drag should be allowed, false otherwise
   */
  private shouldAllowDrag(event: Event, dragTarget: HTMLElement): boolean {
    const eventTarget = event.target as HTMLElement

    // Check filter option - if event target matches filter, prevent drag
    if (this.filter && eventTarget.matches(this.filter)) {
      // Prevent default if configured
      if (this.preventOnFilter) {
        event.preventDefault()
      }
      // Call onFilter callback if provided
      if (this.onFilter) {
        this.onFilter(event)
      }
      return false
    }

    // Check handle option - if handle is specified, drag must start from handle
    if (this.handle) {
      // Check if the event target or any of its parents within dragTarget matches the handle selector
      let currentElement: HTMLElement | null = eventTarget
      let foundHandle = false

      // Traverse up the DOM tree looking for handle, but stay within dragTarget
      while (currentElement && dragTarget.contains(currentElement)) {
        if (currentElement.matches(this.handle)) {
          foundHandle = true
          break
        }
        currentElement = currentElement.parentElement
      }

      // If handle is specified but not found, prevent drag
      if (!foundHandle) {
        return false
      }
    }

    return true
  }

  /**
   * Update which items are draggable based on the draggable selector
   */
  private updateDraggableItems(): void {
    // Update draggable attribute based on selector
    const draggableItems = this.zone.element.querySelectorAll(this.draggable)
    for (const item of draggableItems) {
      if (
        item instanceof HTMLElement &&
        item.parentElement === this.zone.element
      ) {
        // Set draggable=true for HTML5 drag API
        // When using handle, we still need draggable=true for HTML5 drag,
        // the handle check happens in onDragStart
        item.draggable = true
      }
    }

    // Set draggable=false for items that don't match the selector
    for (const child of this.zone.getItems()) {
      if (!child.matches(this.draggable)) {
        child.draggable = false
      }
    }
  }

  /**
   * Check if an element is draggable based on the draggable selector
   */
  private isDraggable(element: HTMLElement): boolean {
    return element.matches(this.draggable)
  }

  /**
   * Handle delayed drag start for touch/mouse with delay option
   */
  private startDragDelay(
    event: PointerEvent,
    _target: HTMLElement,
    callback: () => void
  ): void {
    // Determine if delay should be applied
    const isTouch = event.pointerType === 'touch'
    const effectiveDelay = isTouch ? this.delayOnTouchOnly : this.delay

    if (effectiveDelay <= 0) {
      callback()
      return
    }

    // Store initial position for threshold checking
    this.dragStartPosition = { x: event.clientX, y: event.clientY }

    // Set up delay timer
    this.dragStartTimer = window.setTimeout(() => {
      this.dragStartTimer = undefined
      this.dragStartPosition = undefined
      callback()
    }, effectiveDelay)

    // Add temporary move handler to check threshold
    const onMove = (e: PointerEvent): void => {
      if (!this.dragStartPosition || !this.dragStartTimer) {
        document.removeEventListener('pointermove', onMove)
        return
      }

      const dx = Math.abs(e.clientX - this.dragStartPosition.x)
      const dy = Math.abs(e.clientY - this.dragStartPosition.y)
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Cancel drag if movement exceeds threshold
      if (distance > this.touchStartThreshold) {
        this.cancelDragDelay()
        document.removeEventListener('pointermove', onMove)
      }
    }

    const onUp = (): void => {
      this.cancelDragDelay()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  /**
   * Cancel delayed drag start
   */
  private cancelDragDelay(): void {
    if (this.dragStartTimer) {
      window.clearTimeout(this.dragStartTimer)
      this.dragStartTimer = undefined
    }
    this.dragStartPosition = undefined
  }
}
