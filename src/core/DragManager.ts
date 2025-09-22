import {
  DragManagerInterface,
  SelectionManagerInterface,
  SortableEvent,
  SortableGroup,
} from '../types/index.js'
import { DropZone } from './DropZone.js'
import { type SortableEventSystem } from './EventSystem.js'
import { GhostManager } from './GhostManager.js'
import { globalDragState } from './GlobalDragState.js'
import { GroupManager } from './GroupManager.js'
import { KeyboardManager } from './KeyboardManager.js'
import { SelectionManager } from './SelectionManager.js'

/**
 * Handles drag and drop interactions with accessibility support
 * @internal
 */
export class DragManager implements DragManagerInterface {
  /**
   * Global registry of DragManager instances for cross-zone operations
   * @internal
   */
  private static registry = new Map<HTMLElement, DragManager>()

  private startIndex = -1
  private isPointerDragging = false
  private activePointerId: number | null = null
  private dragElement: HTMLElement | null = null
  private lastHoveredElement: HTMLElement | null = null
  private originalMouseDownTarget: HTMLElement | null = null
  private lastMoveTime = 0
  private _selectionManager: SelectionManager
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
  // private swapThreshold?: number  // Not used anymore
  // private invertSwap: boolean  // Not used anymore
  // private invertedSwapThreshold?: number  // Not used anymore
  // private direction: 'vertical' | 'horizontal'  // Not used anymore
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

  /**
   * Cached reference to the global "dragover" event handler used by DragManager.
   *
   * This is the bound function that is added to / removed from the global
   * dragover listener (e.g. on document or window). Keeping the reference
   * allows removeEventListener to unregister the exact handler that was added.
   *
   * The handler receives the DragEvent and is expected to perform any
   * DragManager-specific logic (commonly calling e.preventDefault() to
   * allow drop) and return void.
   *
   * When no global handler is registered this field is null.
   *
   * @private
   */
  private _globalDragOverHandler: ((e: DragEvent) => void) | null = null

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

  private groupManager: GroupManager

  constructor(
    public zone: DropZone,
    public events: SortableEventSystem,
    groupConfig: string | SortableGroup | undefined,
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
    // Initialize group manager
    this.groupManager = new GroupManager(groupConfig)

    // Register this drag manager in the global registry
    DragManager.registry.set(this.zone.element, this)

    // Initialize accessibility features
    this.enableAccessibility = options?.enableAccessibility ?? true

    // Initialize handle and filter options
    this.handle = options?.handle
    this.filter = options?.filter
    this.onFilter = options?.onFilter

    // Initialize draggable selector and delay options
    this.draggable = options?.draggable || '.sortable-item'
    // Set the draggable selector on the drop zone
    this.zone.setDraggableSelector(this.draggable)
    this.delay = options?.delay || 0
    this.delayOnTouchOnly = options?.delayOnTouchOnly ?? options?.delay ?? 0
    this.touchStartThreshold = options?.touchStartThreshold || 5

    // Initialize swap behavior options - commented out as not used anymore
    // this.swapThreshold = options?.swapThreshold
    // this.invertSwap = options?.invertSwap ?? false
    // this.invertedSwapThreshold = options?.invertedSwapThreshold
    // this.direction = options?.direction ?? 'vertical'  // Not used anymore

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
    this._selectionManager = new SelectionManager(
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
      this._selectionManager,
      this.events,
      this.groupManager.getName()
    )
  }

  /** Attach event listeners */
  public attach(): void {
    const el = this.zone.element

    // Mark container as a drop zone
    el.dataset.dropZone = 'true'
    el.dataset.sortableGroup = this.groupManager.getName()

    // Ensure container can receive drag events when empty
    // Add a class that ensures the container is a valid drop target
    el.classList.add('sortable-drop-zone')

    // Check if container is initially empty and add helper if needed
    this.ensureEmptyContainerDropTarget()

    // HTML5 drag events - use bubble phase (false) for better compatibility
    // Using capture phase can prevent events from reaching the container properly
    el.addEventListener('dragstart', this.onDragStart, false)
    el.addEventListener('dragover', this.onDragOver, false)
    el.addEventListener('drop', this.onDrop, false)
    el.addEventListener('dragend', this.onDragEnd, false)
    el.addEventListener('dragenter', this.onDragEnter, false)
    el.addEventListener('dragleave', this.onDragLeave, false)

    // Also add a global dragover handler during drags to catch events on empty containers
    // This is a workaround for browsers not firing dragover on empty elements
    const globalDragOverHandler = (e: DragEvent) => {
      // Check if we're over this container
      const rect = el.getBoundingClientRect()
      const x = e.clientX
      const y = e.clientY

      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        // We're over this container, handle it
        // Call preventDefault to allow drops
        e.preventDefault()
        this.onDragOver(e)
      }
    }

    // Store the handler so we can remove it later
    this._globalDragOverHandler = globalDragOverHandler

    // Pointer events for modern touch/pen/mouse support
    el.addEventListener('pointerdown', this.onPointerDown)
    // Note: pointermove and pointerup are attached to document in onPointerDown

    // Attach accessibility features
    if (this.enableAccessibility) {
      this.keyboardManager.attach()
    }

    // Setup draggable items based on the draggable selec tor
    this.updateDraggableItems()
  }

  /** Detach event listeners */
  public detach(): void {
    const el = this.zone.element
    el.removeEventListener('dragstart', this.onDragStart, false)
    el.removeEventListener('dragover', this.onDragOver, false)
    el.removeEventListener('drop', this.onDrop, false)
    el.removeEventListener('dragend', this.onDragEnd, false)
    el.removeEventListener('dragenter', this.onDragEnter, false)
    el.removeEventListener('dragleave', this.onDragLeave, false)

    // Remove pointer events
    el.removeEventListener('pointerdown', this.onPointerDown)
    // Document listeners are removed in onPointerUp

    // Cancel any pending drag delay
    this.cancelDragDelay()
    document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)

    // Remove any empty container helper
    this.removeEmptyContainerHelper()

    // Detach accessibility features
    if (this.enableAccessibility) {
      this.keyboardManager.detach()
      this._selectionManager.destroy()
    }

    // Unregister from global registry
    DragManager.registry.delete(this.zone.element)
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
      // Clear the saved mouse down target since drag is not allowed
      this.originalMouseDownTarget = null
      return
    }

    this.startIndex = this.zone.getIndex(target)

    // For HTML5 drag API, we need to set the data FIRST
    if (e.dataTransfer) {
      // Set drag data - MUST have a value for Firefox
      e.dataTransfer.setData('text/plain', 'sortable-item')
      e.dataTransfer.effectAllowed = 'move'
    }

    // NEVER modify DOM during dragstart to avoid Chrome bug
    // The global dragover handler must ALWAYS be added for cross-container to work
    // We'll defer markEmptyContainers to the first dragover event for ALL elements

    // ALWAYS add global dragover handler - this is needed for cross-container drag
    // This doesn't modify DOM directly, just adds an event listener
    if (this._globalDragOverHandler) {
      document.addEventListener('dragover', this._globalDragOverHandler, true)
    }

    // Register with global drag state using HTML5 drag API as ID
    const dragId = 'html5-drag'
    globalDragState.startDrag(
      dragId,
      target,
      this.zone.element,
      this,
      this.groupManager.getName(),
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

    // Now handle visual feedback
    if (e.dataTransfer) {
      // Don't modify classes during dragstart to avoid Chrome bug
      // Visual feedback will be applied in onDragOver
      // For HTML5 drag, DON'T create a placeholder yet - it will be created on first dragover
      // The browser needs the original element to stay in place for the drag to work
      // We'll create the placeholder when we first detect movement
    } else {
      // For non-HTML5 drag (shouldn't happen with mouse), create ghost and placeholder
      const placeholder = this.ghostManager.createPlaceholder(target)
      target.parentElement?.insertBefore(placeholder, target)
      const ghost = this.ghostManager.createGhost(target, e)
      if (ghost) {
        ghost.style.display = 'none'
      }
    }

    // Then emit start event
    this.events.emit('start', evt)
  }

  // /**
  //  * Calculate if swap should occur based on overlap (only if threshold is set)
  //  */
  // private shouldSwap(
  //   dragRect: DOMRect,
  //   targetRect: DOMRect,
  //   _dragDirection: 'forward' | 'backward'
  // ): boolean {
  //   // If no threshold is set, always allow swap (legacy behavior)
  //   if (this.swapThreshold === undefined) {
  //     return true
  //   }

  //   // Calculate overlap percentage based on direction
  //   let overlap: number
  //   if (this.direction === 'vertical') {
  //     const overlapHeight =
  //       Math.min(dragRect.bottom, targetRect.bottom) -
  //       Math.max(dragRect.top, targetRect.top)
  //     overlap = Math.max(0, overlapHeight) / targetRect.height
  //   } else {
  //     const overlapWidth =
  //       Math.min(dragRect.right, targetRect.right) -
  //       Math.max(dragRect.left, targetRect.left)
  //     overlap = Math.max(0, overlapWidth) / targetRect.width
  //   }

  //   // Apply swap threshold logic
  //   let threshold = this.swapThreshold
  //   if (this.invertSwap) {
  //     // In inverted mode, swap occurs when overlap is less than the threshold
  //     threshold = this.invertedSwapThreshold ?? this.swapThreshold
  //     return overlap < threshold
  //   }

  //   // Normal mode: swap when overlap exceeds threshold
  //   return overlap >= threshold
  // }

  private onDragOver = (e: DragEvent): void => {
    // IMPORTANT: We must ALWAYS call preventDefault() on dragover to allow drops
    // This must happen before any other checks according to the HTML5 drag/drop spec
    e.preventDefault()
    e.stopPropagation()

    // CRITICAL: Set dropEffect to indicate this is a valid drop target
    // This MUST be set in dragover for the drop to work properly
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }

    // Check if we can accept the current drag (HTML5 drag events don't have pointer IDs)
    const dragId = 'html5-drag'
    if (!globalDragState.canAcceptDrop(dragId, this.groupManager.getName())) {
      return
    }

    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) {
      return
    }

    // Ensure put target is set for cross-zone operations (in case onDragEnter wasn't called)
    const isDifferentZone = activeDrag.item.parentElement !== this.zone.element
    if (isDifferentZone) {
      globalDragState.setPutTarget(
        dragId,
        this.zone.element,
        this,
        this.groupManager.getName()
      )
    }

    const originalItem = activeDrag.item

    // Handle deferred empty container marking on first dragover
    // This is done for ALL elements to avoid the Chrome bug where DOM modifications
    // during dragstart cause immediate dragend
    if (!originalItem.dataset.deferredSetupDone) {
      // Mark that we've done the deferred setup
      originalItem.dataset.deferredSetupDone = 'true'

      // Now it's safe to mark empty containers (drag is established)
      this.markEmptyContainers()

      // Note: global dragover handler is already added in onDragStart for all cases
    }

    // For HTML5 drag, we don't use a placeholder anymore
    // Just ensure the item is semi-transparent
    if (!originalItem.style.opacity) {
      originalItem.style.opacity = '0.5'

      // Add visual feedback classes that were deferred from dragstart
      if (
        !originalItem.classList.contains(this.ghostManager.getChosenClass())
      ) {
        originalItem.classList.add(this.ghostManager.getChosenClass())
      }
      if (!originalItem.classList.contains(this.ghostManager.getDragClass())) {
        originalItem.classList.add(this.ghostManager.getDragClass())
      }

      // Note: Setting pointerEvents='none' here can cause issues with inline-block elements
      // where the drag ends immediately. The browser needs the element to remain interactive.
      // originalItem.style.pointerEvents = 'none'
    }

    // Get the actual event target element
    const eventTarget = e.target as HTMLElement
    const over = eventTarget.closest(this.draggable)

    // Check if we're over the container itself (not a draggable item)
    const isOverContainer =
      eventTarget === this.zone.element ||
      (this.zone.element.contains(eventTarget) && !over)

    // Check if container is truly empty (no draggable children)
    const draggableChildren = Array.from(this.zone.element.children).filter(
      (child) =>
        child.matches(this.draggable) &&
        child !== originalItem &&
        child !== activeDrag.clone &&
        !child.classList.contains('sortable-empty-drop-helper') &&
        !child.classList.contains('sortable-ghost')
    )

    // Handle empty container or dragging over empty space in container
    if (isOverContainer && draggableChildren.length === 0) {
      // Container is empty - move item here if not already
      if (originalItem.parentElement !== this.zone.element) {
        // For cross-container, we need to append directly (can't use zone.move for items not in zone)
        this.zone.element.appendChild(originalItem)
        // TODO: Add animation for cross-container moves
        // Add visual indication for empty container
        this.zone.element.classList.add('sortable-empty-drop-zone')
      }

      // Mark that we're over an empty container for the drop handler
      this.zone.element.dataset.dragOverEmpty = 'true'
      return
    } else {
      // Clear the empty markers if not empty
      delete this.zone.element.dataset.dragOverEmpty
      this.zone.element.classList.remove('sortable-empty-drop-zone')
    }

    // Use placeholder for positioning calculations instead of the hidden original item
    // let dragItem = placeholder || originalItem  // Not needed anymore
    // if (
    //   activeDrag.pullMode === 'clone' &&
    //   activeDrag.clone &&
    //   activeDrag.clone.parentElement === this.zone.element
    // ) {
    //   dragItem = activeDrag.clone
    // }

    // Handle cross-zone dragging
    if (originalItem.parentElement !== this.zone.element) {
      // Check if this is a clone operation
      let itemToInsert = originalItem
      if (activeDrag.pullMode === 'clone' && activeDrag.clone) {
        // Use the clone for display in the target zone
        itemToInsert = activeDrag.clone
        // dragItem = itemToInsert // Update reference for subsequent operations - not needed anymore
      }

      // Move item (or clone) to this zone if not already here
      if (itemToInsert.parentElement !== this.zone.element) {
        this.zone.element.appendChild(itemToInsert)
        // Remove helper since container is no longer empty
        this.removeEmptyContainerHelper()
      }
    }

    // Update item position if we're over a different item
    if (
      over instanceof HTMLElement &&
      over !== originalItem &&
      !over.classList.contains('sortable-ghost')
    ) {
      if (originalItem.parentElement === this.zone.element) {
        // Get current positions
        const overRect = over.getBoundingClientRect()
        const items = this.zone.getItems()
        const currentIndex = items.indexOf(originalItem)
        const overIndex = items.indexOf(over)

        // Determine if we should move the item based on mouse position
        // Check if it's a horizontal or vertical list based on element positions
        const originalRect = originalItem.getBoundingClientRect()
        const isHorizontal = Math.abs(originalRect.top - overRect.top) < 10

        let targetIndex: number

        if (isHorizontal) {
          // Horizontal list - use X coordinates
          const mouseX = e.clientX
          const overMidpoint = overRect.left + overRect.width / 2

          if (mouseX < overMidpoint) {
            // Mouse is in left half - insert before
            targetIndex = overIndex
          } else {
            // Mouse is in right half - insert after
            targetIndex = overIndex + 1
          }
        } else {
          // Vertical list - use Y coordinates
          const mouseY = e.clientY
          const overMidpoint = overRect.top + overRect.height / 2

          if (mouseY < overMidpoint) {
            // Mouse is in upper half - insert before
            targetIndex = overIndex
          } else {
            // Mouse is in lower half - insert after
            targetIndex = overIndex + 1
          }
        }

        // Adjust target index if moving from before to after the same position
        if (currentIndex < targetIndex) {
          targetIndex--
        }

        // Use DropZone's move method to handle animation
        if (currentIndex !== targetIndex) {
          this.zone.move(originalItem, targetIndex)
        }
      }
    }

    // Emit move event if we're over an item
    if (over instanceof HTMLElement && over !== originalItem) {
      const moveEvent: import('../types/index.js').MoveEvent = {
        item: originalItem,
        items: [originalItem],
        from: this.zone.element,
        to: this.zone.element,
        oldIndex: activeDrag.startIndex,
        newIndex: this.zone.getIndex(over),
        related: over,
        willInsertAfter: false,
        draggedRect: originalItem.getBoundingClientRect(),
        targetRect: over.getBoundingClientRect(),
      }
      this.events.emit('move', moveEvent)
    }

    // Emit sort event when dragging within same container
    if (activeDrag.fromZone === this.zone.element) {
      const currentIndex = this.zone.getIndex(originalItem)
      if (currentIndex >= 0 && currentIndex !== activeDrag.startIndex) {
        this.events.emit('sort', {
          item: originalItem,
          items: [originalItem],
          from: this.zone.element,
          to: this.zone.element,
          oldIndex: activeDrag.startIndex,
          newIndex: currentIndex,
        })
      }
    }
  }

  private onDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()

    const dragId = 'html5-drag'
    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) {
      return
    }

    const originalItem = activeDrag.item

    // Clear empty container styling
    this.zone.element.classList.remove('sortable-empty-drop-zone')

    // Check if drop is on this container using multiple methods:
    // 1. Direct containment check
    // 2. Coordinate-based check for empty containers
    // 3. Check if we marked this container during dragover
    const isDropOnThisContainer =
      this.zone.element.contains(e.target as Node) ||
      this.zone.element === e.target ||
      this.zone.element.dataset.dragOverEmpty === 'true' ||
      this.isDropWithinBounds(e)

    // Handle drop in this container
    if (isDropOnThisContainer) {
      // Clear the empty marker
      delete this.zone.element.dataset.dragOverEmpty
      this.zone.element.classList.remove('sortable-empty-drop-zone')

      // The item is already in the correct position from the dragover events
      // Just handle clone mode if needed
      const isDifferentZone = activeDrag.fromZone !== this.zone.element
      if (
        isDifferentZone &&
        activeDrag.pullMode === 'clone' &&
        activeDrag.clone
      ) {
        // For cross-zone clone operations, replace original with clone
        const currentIndex = this.zone.getIndex(originalItem)
        if (currentIndex >= 0) {
          this.zone.element.replaceChild(activeDrag.clone, originalItem)
          // Put original back in source container
          activeDrag.fromZone.appendChild(originalItem)
        }
      }

      // Remove any empty container helper if needed
      const items = this.zone.getItems()
      if (items.length > 0) {
        this.removeEmptyContainerHelper()
      }
    }
  }

  private onDragEnd = (): void => {
    // Clear the saved mouse down target
    this.originalMouseDownTarget = null

    // Global drag state handles the end event and cleanup
    const dragId = 'html5-drag'
    const activeDrag = globalDragState.getActiveDrag(dragId)

    // Clean up ghost elements and restore visibility
    if (activeDrag) {
      // Restore all styles
      activeDrag.item.style.opacity = ''
      activeDrag.item.style.display = ''
      activeDrag.item.style.visibility = ''
      activeDrag.item.style.pointerEvents = ''

      // Clean up deferred setup marker
      delete activeDrag.item.dataset.deferredSetupDone

      // Remove drag-related classes
      activeDrag.item.classList.remove(this.ghostManager.getDragClass())
      activeDrag.item.classList.remove(this.ghostManager.getChosenClass())

      // Clean up any remaining ghost elements
      this.ghostManager.destroy(activeDrag.item)
    }

    // Clean up empty container markers
    this.unmarkEmptyContainers()

    // Clear any empty zone styling from all containers
    document.querySelectorAll('.sortable-empty-drop-zone').forEach((el) => {
      el.classList.remove('sortable-empty-drop-zone')
    })

    // Remove global dragover handler
    if (this._globalDragOverHandler) {
      document.removeEventListener(
        'dragover',
        this._globalDragOverHandler,
        true
      )
    }

    // Check if our container is now empty and needs helper
    this.ensureEmptyContainerDropTarget()

    globalDragState.endDrag(dragId)
    this.startIndex = -1
  }

  private onDragEnter = (e: DragEvent): void => {
    e.preventDefault()
    // Set dropEffect to indicate this is a valid drop target
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    const dragId = 'html5-drag'
    if (globalDragState.canAcceptDrop(dragId, this.groupManager.getName())) {
      globalDragState.setPutTarget(
        dragId,
        this.zone.element,
        this,
        this.groupManager.getName()
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
    // CRITICAL: For mouse events, let the native HTML5 drag API handle it
    // Only use pointer-based dragging for touch events
    if (e.pointerType === 'mouse') {
      // For mouse, save the original target for handle checking in onDragStart
      this.originalMouseDownTarget = e.target as HTMLElement
      // Don't interfere with native HTML5 drag for mouse
      return
    }

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
    if (this._selectionManager.isSelected(target)) {
      // If the target is already selected, drag all selected items
      draggedItems = this._selectionManager.getSelected()
    } else {
      // If target is not selected, select only it
      this._selectionManager.select(target)
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
      this.groupManager.getName(),
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
    // IMPORTANT: We need to temporarily hide the dragged element and ghost to get accurate hit testing
    const draggedElementPointerEvents = this.dragElement.style.pointerEvents
    const ghostElement = this.ghostManager.getGhostElement()
    const ghostPointerEvents = ghostElement?.style.pointerEvents

    // Temporarily disable pointer events on dragged element and ghost
    this.dragElement.style.pointerEvents = 'none'
    if (ghostElement) {
      ghostElement.style.pointerEvents = 'none'
    }

    const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY)

    // Restore pointer events
    this.dragElement.style.pointerEvents = draggedElementPointerEvents
    if (ghostElement) {
      ghostElement.style.pointerEvents = ghostPointerEvents || 'none'
    }

    const over = elementUnderMouse?.closest(this.draggable) as HTMLElement

    if (!over) return

    // Skip if we're hovering over the dragged element itself or the placeholder
    if (
      over === this.dragElement ||
      over === this.ghostManager.getPlaceholderElement()
    ) {
      return
    }

    // Debounce move operations to prevent jumpiness from animations
    const now = Date.now()
    const timeSinceLastMove = now - this.lastMoveTime
    const MOVE_THROTTLE_MS = 100 // Minimum time between moves

    // Skip if we're still hovering over the same element and not enough time has passed
    if (
      over === this.lastHoveredElement &&
      timeSinceLastMove < MOVE_THROTTLE_MS
    ) {
      return
    }

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
            targetDragManager.groupManager.getName()
          )
        } else {
          // Fallback: use current drag manager but with target zone
          globalDragState.setPutTarget(
            dragId,
            targetZoneElement,
            this,
            this.groupManager.getName()
          )
        }
      }
    } else if (over !== this.dragElement) {
      // Same zone movement - use DropZone.move() for animations
      const currentItems = this.zone.getItems()
      const currentIndex = currentItems.indexOf(this.dragElement)
      const targetIndex = currentItems.indexOf(over)

      if (
        currentIndex !== -1 &&
        targetIndex !== -1 &&
        currentIndex !== targetIndex
      ) {
        // Use the DropZone's move method to get animations
        this.zone.move(this.dragElement, targetIndex)

        // Update tracking variables
        this.lastHoveredElement = over
        this.lastMoveTime = Date.now()

        // Only emit update if it's within the original zone
        if (activeDrag.fromZone === targetZoneElement) {
          this.events.emit('update', {
            item: this.dragElement,
            items: [this.dragElement],
            from: targetZoneElement,
            to: targetZoneElement,
            oldIndex: this.startIndex,
            newIndex: targetIndex,
          })
        }
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
        const items = Array.from(fromZone.querySelectorAll(this.draggable))
        const currentIndex = items.indexOf(this.dragElement)

        // Only revert if the element has actually moved
        if (currentIndex !== this.startIndex && currentIndex !== -1) {
          // Remove from current position
          if (this.dragElement.parentElement) {
            this.dragElement.parentElement.removeChild(this.dragElement)
          }

          // Get the current list of sortable items after removal
          const itemsAfterRemoval = Array.from(
            fromZone.querySelectorAll(this.draggable)
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
    this.lastHoveredElement = null
    this.lastMoveTime = 0
  }

  /** Find the DragManager instance that manages a specific zone */
  private findDragManagerForZone(targetZone: HTMLElement): DragManager | null {
    return DragManager.registry.get(targetZone) || null
  }

  /** Get the selection manager for this drag manager */
  public getSelectionManager(): SelectionManager {
    return this._selectionManager
  }

  /** Get the keyboard manager for this drag manager */
  public getKeyboardManager(): KeyboardManager {
    return this.keyboardManager
  }

  /** Get the group manager for this drag manager */
  public getGroupManager(): GroupManager {
    return this.groupManager
  }

  /** Check if currently dragging */
  public get isDragging(): boolean {
    return this.isPointerDragging
  }

  /** Get the selection manager interface for plugins */
  public get selectionManager(): SelectionManagerInterface {
    return this._selectionManager
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
      return globalDragState.canAcceptDrop(
        dragId,
        targetDragManager.groupManager.getName()
      )
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
    const currentGroup = this.groupManager.getName()
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
    // For HTML5 drag (mouse), use the saved originalMouseDownTarget if available
    // This is because dragstart event.target is always the draggable element, not what was clicked
    const eventTarget =
      event.type === 'dragstart' && this.originalMouseDownTarget
        ? this.originalMouseDownTarget
        : (event.target as HTMLElement)

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
    // Only update draggable attribute for direct children of THIS container
    // Don't touch items in other containers
    const children = Array.from(this.zone.element.children)

    for (const child of children) {
      if (child instanceof HTMLElement) {
        // Skip helper elements
        if (child.classList.contains('sortable-empty-drop-helper')) {
          continue
        }

        // Set draggable based on whether it matches the selector

        if (child.matches(this.draggable)) {
          // Set draggable=true for HTML5 drag API
          // When using handle, we still need draggable=true for HTML5 drag,
          // the handle check happens in onDragStart
          child.draggable = true
        } else {
          // Not a draggable item (might be a header or other content)
          child.draggable = false
        }
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

  /**
   * Mark all empty containers that can accept drops
   */
  private markEmptyContainers(): void {
    // Find all sortable containers
    const allContainers = document.querySelectorAll('[data-drop-zone="true"]')
    allContainers.forEach((container) => {
      if (container instanceof HTMLElement) {
        // Check if this container can accept drops from our group
        const containerGroup = container.dataset.sortableGroup
        if (!containerGroup) return

        // Check if container is empty
        const draggableItems = container.querySelectorAll(this.draggable)
        if (draggableItems.length === 0) {
          container.dataset.sortableEmpty = 'true'

          // Add a temporary invisible placeholder to ensure drag events fire
          // This is needed because browsers don't always fire dragover on truly empty elements
          if (!container.querySelector('.sortable-empty-drop-helper')) {
            const helper = document.createElement('div')
            helper.className = 'sortable-empty-drop-helper'
            // Make it draggable=false and style it to catch events
            helper.draggable = false
            // Use a very faint background color instead of transparent
            // This ensures the browser sees it as a real element
            helper.style.cssText =
              'min-height: 80px; width: 100%; background: rgba(0,0,0,0.001); pointer-events: auto; user-select: none;'
            helper.setAttribute('aria-hidden', 'true')
            // Add actual content to ensure the browser sees it as a valid drop target
            helper.innerHTML =
              '<span style="color: transparent; user-select: none;">Drop zone</span>'
            container.appendChild(helper)
          }
          container.classList.add('sortable-empty-drop-zone')
        }
      }
    })
  }

  /**
   * Remove empty container markers
   */
  private unmarkEmptyContainers(): void {
    const markedContainers = document.querySelectorAll(
      '[data-sortable-empty="true"]'
    )
    markedContainers.forEach((container) => {
      if (container instanceof HTMLElement) {
        delete container.dataset.sortableEmpty
        delete container.dataset.dragOverEmpty
        container.classList.remove('sortable-empty-drop-zone')

        // Remove the helper element
        const helper = container.querySelector('.sortable-empty-drop-helper')
        if (helper) {
          helper.remove()
        }
      }
    })
  }

  /**
   * Ensure empty containers have a drop target for HTML5 drag events
   */
  private ensureEmptyContainerDropTarget(): void {
    const el = this.zone.element

    // Check if container is empty (no draggable children)
    const draggableItems = el.querySelectorAll(this.draggable)
    if (draggableItems.length === 0) {
      // Add a helper element to ensure drag events fire
      if (!el.querySelector('.sortable-empty-drop-helper')) {
        const helper = document.createElement('div')
        helper.className = 'sortable-empty-drop-helper'
        helper.draggable = false

        // CRITICAL: Use a non-zero alpha background color to ensure browser treats it as content
        // Fully transparent elements don't receive drag events in some browsers
        helper.style.cssText =
          'min-height: 60px; width: 100%; background: rgba(0,0,0,0.01); pointer-events: auto; user-select: none; position: relative;'
        helper.setAttribute('aria-hidden', 'true')

        // Add actual text content (not just hidden) to ensure it's a valid drop target
        // Use transparent color instead of visibility:hidden
        helper.innerHTML =
          '<span style="color: transparent; font-size: 1px; user-select: none;">Drop zone</span>'

        // Add dragover event listener directly to helper to ensure it receives events
        helper.addEventListener(
          'dragover',
          (e) => {
            e.preventDefault()
            e.stopPropagation()
            // Set dropEffect to indicate this is a valid drop target
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = 'move'
            }
            // Forward the event to the container's handler
            this.onDragOver(e)
          },
          true
        )

        helper.addEventListener(
          'drop',
          (e) => {
            e.preventDefault()
            e.stopPropagation()
            // Forward the event to the container's handler
            this.onDrop(e)
          },
          true
        )

        el.appendChild(helper)
      }
    }
  }

  /**
   * Remove the empty container drop helper if it exists
   */
  private removeEmptyContainerHelper(): void {
    const helper = this.zone.element.querySelector(
      '.sortable-empty-drop-helper'
    )
    if (helper) {
      // Remove all event listeners before removing the element
      helper.replaceWith(helper.cloneNode(true))
      const newHelper = this.zone.element.querySelector(
        '.sortable-empty-drop-helper'
      )
      newHelper?.remove()
    }
  }

  /**
   * Check if a drop event occurred within this container's bounds
   */
  private isDropWithinBounds(e: DragEvent): boolean {
    const rect = this.zone.element.getBoundingClientRect()
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    )
  }
}
