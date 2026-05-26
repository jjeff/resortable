import {
  SortableEvent,
  SortableGroup,
  SelectionManagerInterface,
  DragManagerInterface,
  MoveEvent,
} from '../types/index.js'
import { DropZone } from './DropZone.js'
import { type SortableEventSystem } from './EventSystem.js'
import { globalDragState } from './GlobalDragState.js'
import { SelectionManager } from './SelectionManager.js'
import { KeyboardManager } from './KeyboardManager.js'
import { GhostManager } from './GhostManager.js'
import { GroupManager } from './GroupManager.js'

// Global registry of DragManager instances for cross-zone operations
const dragManagerRegistry = new Map<HTMLElement, DragManager>()

/**
 * Handles drag and drop interactions with accessibility support
 * @internal
 */
export class DragManager implements DragManagerInterface {
  private startIndex = -1
  private isPointerDragging = false
  private activePointerId: number | null = null
  // Pre-commit capture phase target — non-null while pointer is captured but
  // the drag has NOT yet committed (gated by `fallbackTolerance`). Distinct
  // from `dragElement`, which only becomes non-null at commit. PR3 #29.
  private pointerCaptureTarget: HTMLElement | null = null
  private dragElement: HTMLElement | null = null
  private draggedItems: HTMLElement[] = []
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
  private swapThreshold?: number
  private invertSwap: boolean
  private invertedSwapThreshold?: number
  private direction: 'vertical' | 'horizontal'
  // Fallback system properties.
  //
  // `_forceFallback` / `_fallbackClass` are wired into the pointer drag
  // pipeline (see `attach()` and `startPointerDrag()`). Resortable's
  // pointer-driven path already implements what legacy Sortable calls
  // "fallback mode" — a ghost element following the cursor, no HTML5 DnD.
  // Setting `forceFallback: true` therefore just suppresses the native
  // `dragstart`/`dragover`/etc. listeners so the pointer path is the only
  // active code path. The legacy `_fallbackClone` field is intentionally
  // omitted: `this.ghostManager.getGhostElement()` is the single source of
  // truth for the fallback ghost.
  private _forceFallback: boolean
  private _fallbackClass?: string
  // `_fallbackOnBody` chooses where the pointer-driven ghost is appended:
  // `true` → `document.body` (legacy `fallbackOnBody: true`); `false`
  // (default) → the sortable zone's root element. See PR2 #29.
  private _fallbackOnBody: boolean
  // `_fallbackTolerance` is the minimum Chebyshev pixel distance the pointer
  // must move from pointerdown before the drag actually *commits* — a ghost
  // is created, `choose` / `start` events fire, and `globalDragState`
  // registers an active drag. Below the threshold the pointer is *captured*
  // but no drag side-effects occur (cf. legacy `Sortable.js:826-831`).
  // Default `0` — drag commits immediately, identical to pre-PR3 behaviour.
  // Distinct from `touchStartThreshold`, which *cancels* a delayed-drag if
  // the pointer moves before the hold timer fires (drag-prevention guard).
  // Ordering with `delay`: pointerdown → delay timer → capture phase →
  // (distance reached) → commit phase. See PR3 #29.
  private _fallbackTolerance: number
  // `_fallbackOffsetX` / `_fallbackOffsetY` shift the ghost by a fixed pixel
  // offset relative to the cursor. Positive values move it right / down;
  // negative values move it left / up. Matches legacy `fallbackOffset.x` /
  // `fallbackOffset.y` direction. See PR2 #29.
  private _fallbackOffsetX: number
  private _fallbackOffsetY: number
  private _dragoverBubble: boolean
  private _dropBubble: boolean
  // _removeCloneOnHide is accepted on the public API but is currently a
  // no-op — Resortable has no clone hide/show cycle yet (clones are
  // created on drag start and removed on drag end). Wired here so future
  // implementations of hide/show have an obvious place to read it.
  // @ts-expect-error - kept on the instance so hide/show flow can read it later
  private _removeCloneOnHide: boolean
  private _emptyInsertThreshold: number
  private preventOnFilter: boolean
  // `_dataIdAttr` is the configured `data-*` attribute name used as the
  // identity column by toArray() / sort(). It is also forwarded to
  // GhostManager so the ghost clone can strip the original's identity
  // attribute and avoid duplicate matches in DOM queries when the ghost
  // lives inside the zone (PR2 #29 — `fallbackOnBody: false` default).
  private _dataIdAttr: string
  private _setData?: (dataTransfer: DataTransfer, dragEl: HTMLElement) => void
  // `onMove` is invoked synchronously inside the dragover-driven reorder
  // path with `(MoveEvent, originalEvent)`. Its return value controls the
  // move:
  //   `false`            — cancel (no placeholder shift, no sort/update/change)
  //   `-1`               — force insert BEFORE related (override heuristic)
  //   `1`                — force insert AFTER related (override heuristic)
  //   `void` / `true`    — proceed with the natural heuristic
  // The event-system `'move'` channel is still emitted for internal /
  // plugin subscribers (notification only — cannot cancel). See #33.
  private _onMove?: (
    event: MoveEvent,
    originalEvent: Event
  ) => boolean | -1 | 1 | void
  private ghostManager: GhostManager

  private groupManager: GroupManager

  private originalTouchActions = new Map<HTMLElement, string>()

  private holdTarget: HTMLElement | null = null
  private holdOriginalStyles: {
    transform: string
    boxShadow: string
    transition: string
  } | null = null
  private savedBodyUserSelect: string = ''

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
      dropBubble?: boolean
      removeCloneOnHide?: boolean
      emptyInsertThreshold?: number
      preventOnFilter?: boolean
      dataIdAttr?: string
      ghostClass?: string
      chosenClass?: string
      dragClass?: string
      deselectOnClickOutside?: boolean
      setData?: (dataTransfer: DataTransfer, dragEl: HTMLElement) => void
      onMove?: (
        event: MoveEvent,
        originalEvent: Event
      ) => boolean | -1 | 1 | void
    }
  ) {
    // Initialize group manager
    this.groupManager = new GroupManager(groupConfig)

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
    // Set the draggable selector on the drop zone
    this.zone.setDraggableSelector(this.draggable)
    this.delay = options?.delay || 0
    this.delayOnTouchOnly = options?.delayOnTouchOnly ?? 200
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
    this._dropBubble = options?.dropBubble ?? false
    this._removeCloneOnHide = options?.removeCloneOnHide ?? true
    this._emptyInsertThreshold = options?.emptyInsertThreshold ?? 5

    // Initialize other options
    this.preventOnFilter = options?.preventOnFilter ?? true
    this._dataIdAttr = options?.dataIdAttr ?? 'data-id'
    this._setData = options?.setData
    this._onMove = options?.onMove

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
      this.groupManager.getName(),
      {
        deselectOnClickOutside: options?.deselectOnClickOutside,
        multiDrag: options?.multiSelect,
      }
    )
  }

  /** Attach event listeners */
  public attach(): void {
    const el = this.zone.element
    // HTML5 drag events — skipped entirely when `forceFallback: true`. In
    // fallback mode the pointer pipeline below is the only drag code path,
    // mirroring legacy Sortable's `forceFallback` semantics.
    if (!this._forceFallback) {
      el.addEventListener('dragstart', this.onDragStart)
      el.addEventListener('dragover', this.onDragOver)
      el.addEventListener('drop', this.onDrop)
      el.addEventListener('dragend', this.onDragEnd)
      el.addEventListener('dragenter', this.onDragEnter)
      el.addEventListener('dragleave', this.onDragLeave)
    }

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
    // Restore original touch-action values
    this.originalTouchActions.forEach((originalValue, element) => {
      element.style.touchAction = originalValue
    })
    this.originalTouchActions.clear()

    const el = this.zone.element
    // Mirror `attach()` — only remove HTML5 listeners we actually registered.
    if (!this._forceFallback) {
      el.removeEventListener('dragstart', this.onDragStart)
      el.removeEventListener('dragover', this.onDragOver)
      el.removeEventListener('drop', this.onDrop)
      el.removeEventListener('dragend', this.onDragEnd)
      el.removeEventListener('dragenter', this.onDragEnter)
      el.removeEventListener('dragleave', this.onDragLeave)
    }

    // Remove pointer events
    el.removeEventListener('pointerdown', this.onPointerDown)
    // Document listeners are removed in onPointerUp

    // Cancel any pending drag delay
    this.cancelDragDelay()
    document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)
    // Tear down any in-flight fallback-tolerance capture phase (PR3 #29)
    if (this.pointerCaptureTarget) this.teardownCapturePhase()

    // Detach accessibility features
    if (this.enableAccessibility) {
      this.keyboardManager.detach()
      this._selectionManager.destroy()
    }

    // Unregister from global registry
    dragManagerRegistry.delete(this.zone.element)
  }

  private onDragStart = (e: DragEvent): void => {
    // If pointer-based drag is already active, prevent HTML5 drag from interfering
    if (this.isPointerDragging) {
      e.preventDefault()
      return
    }

    // On touch-capable devices, always prevent HTML5 drag — use pointer events instead
    if (navigator.maxTouchPoints > 0) {
      e.preventDefault()
      return
    }

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

    // Skip drag when modifier keys are held — these indicate selection intent
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
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

    // Create ghost element (but for HTML5 drag, we'll use it as a placeholder)
    // The actual dragging visual is handled by the browser
    const placeholder = this.ghostManager.createPlaceholder(target)
    // Insert placeholder where the item was
    target.parentElement?.insertBefore(placeholder, target)

    // Apply chosen class to the dragged element
    target.classList.add(this.ghostManager.getChosenClass())
    const ghost = this.ghostManager.createGhost(target, e)

    // For HTML5 drag API, we can optionally set the drag image
    if (e.dataTransfer && ghost) {
      // Hide the ghost since browser will show its own drag image
      ghost.style.display = 'none'
      // Set drag data — use custom setData if provided, otherwise default
      if (this._setData) {
        this._setData(e.dataTransfer, target)
      } else {
        e.dataTransfer.setData('text/plain', '')
      }
      e.dataTransfer.effectAllowed = 'move'
      // Apply drag class to the original element
      target.classList.add(this.ghostManager.getDragClass())
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

  /**
   * Notify all `move` subscribers (event-system channel, notification only)
   * and invoke the `onMove` option (cancellation / override channel).
   * Returns the option's return value verbatim so the caller can branch on
   * it: `false` (cancel), `-1` (force before related), `1` (force after
   * related), or `true` / `void` (proceed). See #33.
   */
  private dispatchMove(
    moveEvent: MoveEvent,
    originalEvent: Event
  ): boolean | -1 | 1 | void {
    // Side-channel notification — never cancels, never overrides.
    this.events.emit('move', moveEvent)
    // Option callback — the cancellation / override contract lives here.
    return this._onMove?.(moveEvent, originalEvent)
  }

  private onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    // Stop the event from bubbling to ancestor sortables unless the user
    // opted into nested-sortable propagation via `dragoverBubble: true`.
    if (!this._dragoverBubble) e.stopPropagation()

    // Check if we can accept the current drag (HTML5 drag events don't have pointer IDs)
    const dragId = 'html5-drag'
    if (!globalDragState.canAcceptDrop(dragId, this.groupManager.getName())) {
      return
    }

    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) return

    // Ensure put target is set for cross-zone operations (in case onDragEnter wasn't called)
    const isDifferentZone =
      activeDrag.items[0].parentElement !== this.zone.element
    if (isDifferentZone) {
      globalDragState.setPutTarget(
        dragId,
        this.zone.element,
        this,
        this.groupManager.getName()
      )
    }

    const originalItem = activeDrag.items[0]
    // Determine which item to use for positioning (original or clone)
    let dragItem = originalItem
    if (
      activeDrag.pullMode === 'clone' &&
      activeDrag.clones?.[0] &&
      activeDrag.clones[0].parentElement === this.zone.element
    ) {
      dragItem = activeDrag.clones[0]
    }

    const over = (e.target as HTMLElement).closest(this.draggable)

    // Handle cross-zone dragging
    if (originalItem.parentElement !== this.zone.element) {
      // Check if this is a clone operation
      let itemToInsert = originalItem
      if (activeDrag.pullMode === 'clone' && activeDrag.clones?.[0]) {
        // Use the clone for display in the target zone
        itemToInsert = activeDrag.clones[0]
        dragItem = itemToInsert // Update reference for subsequent operations
      }

      // Move item (or clone) to this zone if not already here
      if (itemToInsert.parentElement !== this.zone.element) {
        this.zone.element.appendChild(itemToInsert)
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

    // Natural insertion direction — dragging downwards inserts after the
    // related item; dragging upwards inserts before.
    const naturalAfter = dragIndex < overIndex

    // Create MoveEvent for onMove callback (always use original item for events)
    const moveEvent: MoveEvent = {
      item: originalItem,
      items: [originalItem],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: dragIndex,
      newIndex: overIndex,
      related: over,
      willInsertAfter: naturalAfter,
      draggedRect: dragRect,
      targetRect,
    }

    // Dispatch move — emits the `'move'` channel (notification) AND invokes
    // the `onMove` option (cancellation / override). Performed BEFORE any
    // placeholder mutation so `false` is a true no-op for this tick. See #33.
    const moveResult = this.dispatchMove(moveEvent, e)
    if (moveResult === false) {
      // Cancelled — skip placeholder move + sort/update/change emissions.
      return
    }

    // Honor `-1` / `1` override — force the insertion side relative to the
    // related item, regardless of the natural drag direction.
    const insertAfter =
      moveResult === 1 ? true : moveResult === -1 ? false : naturalAfter

    // Update placeholder position to reflect the (possibly overridden)
    // insertion point. Hoisted to AFTER dispatchMove so cancellation is
    // observable (no DOM mutation when onMove returns false).
    const placeholder = this.ghostManager.getPlaceholderElement()
    if (placeholder) {
      if (insertAfter) {
        over.parentElement?.insertBefore(placeholder, over.nextSibling)
      } else {
        over.parentElement?.insertBefore(placeholder, over)
      }
    }

    // Don't actually move the item yet, just track where it should go
    // this.zone.move(dragItem, targetIndex) // Commented out - will do on drop

    // Emit sort event (always fired when sorting changes) - use original item for events
    this.events.emit('sort', {
      item: originalItem,
      items: [originalItem],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: dragIndex,
      newIndex: overIndex,
    })

    // Only emit update if it's within the same zone originally
    if (activeDrag.fromZone === this.zone.element) {
      this.events.emit('update', {
        item: originalItem,
        items: [originalItem],
        from: this.zone.element,
        to: this.zone.element,
        oldIndex: dragIndex,
        newIndex: overIndex,
      })

      // Emit change event when order changes within same list
      this.events.emit('change', {
        item: originalItem,
        items: [originalItem],
        from: this.zone.element,
        to: this.zone.element,
        oldIndex: dragIndex,
        newIndex: overIndex,
      })
    }
  }

  private onDrop = (e: DragEvent): void => {
    e.preventDefault()
    // Stop the event from bubbling to ancestor sortables unless the user
    // opted into nested-sortable propagation via `dropBubble: true`.
    if (!this._dropBubble) e.stopPropagation()

    const dragId = 'html5-drag'
    const activeDrag = globalDragState.getActiveDrag(dragId)
    if (!activeDrag) return

    const originalItem = activeDrag.items[0]
    const placeholder = this.ghostManager.getPlaceholderElement()

    if (placeholder && placeholder.parentElement === this.zone.element) {
      // Get the target index based on placeholder position
      const items = this.zone.getItems()
      const placeholderIndex = Array.from(this.zone.element.children).indexOf(
        placeholder
      )

      // Remove the placeholder
      placeholder.remove()

      // Determine which item to use (original or clone)
      let itemToPlace = originalItem
      const isDifferentZone = originalItem.parentElement !== this.zone.element
      if (
        isDifferentZone &&
        activeDrag.pullMode === 'clone' &&
        activeDrag.clones?.[0]
      ) {
        // For cross-zone clone operations, use the clone
        itemToPlace = activeDrag.clones[0]
      }

      // Now calculate where to insert the item
      const currentIndex = items.indexOf(itemToPlace)
      let targetIndex = 0

      // Count how many draggable items come before the placeholder position
      const children = Array.from(this.zone.element.children)
      for (let i = 0; i < placeholderIndex && i < children.length; i++) {
        if (
          children[i].matches(this.draggable) &&
          children[i] !== itemToPlace
        ) {
          targetIndex++
        }
      }

      // Perform the actual placement with animation
      if (currentIndex !== targetIndex || itemToPlace !== originalItem) {
        // For clone operations, we need to handle positioning differently
        if (itemToPlace === activeDrag.clones?.[0]) {
          // For clones, use the zone's move method to position correctly
          if (currentIndex !== targetIndex) {
            this.zone.move(itemToPlace, targetIndex)
          }
        } else if (currentIndex !== targetIndex) {
          // Move existing item to new position
          this.zone.move(itemToPlace, targetIndex)
        }
      }
    }
  }

  private onDragEnd = (): void => {
    // Global drag state handles the end event and cleanup
    const dragId = 'html5-drag'
    const activeDrag = globalDragState.getActiveDrag(dragId)

    // Clean up ghost elements
    if (activeDrag) {
      this.ghostManager.destroy(activeDrag.items[0])
    }

    globalDragState.endDrag(dragId)
    this.startIndex = -1
  }

  private onDragEnter = (e: DragEvent): void => {
    e.preventDefault()
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

    // Skip drag when modifier keys are held — these indicate selection intent
    // (Ctrl/Cmd+Click for toggle, Shift+Click for range selection)
    if (e.ctrlKey || e.metaKey || e.shiftKey) return

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

      // For touch with a delay, do NOT preventDefault — allow the browser to
      // scroll/pan normally. The drag will only start after the hold timer fires.
      // For mouse with a delay, still prevent default to avoid text selection.
      if (!isTouch) {
        e.preventDefault()
      }
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

  /**
   * Entry point after pointerdown (and after any `delay` timer). When
   * `fallbackTolerance > 0` the drag enters a *capture* phase first: the
   * pointer is captured, but no ghost / events / global state — the drag
   * only *commits* once the pointer travels at least `fallbackTolerance`
   * pixels (Chebyshev) from the pointerdown position (legacy
   * `Sortable.js:826-831`). With tolerance `0` (default) commit is
   * immediate — behaviour unchanged from pre-PR3.
   */
  private startPointerDrag(e: PointerEvent, target: HTMLElement): void {
    // Clear any delay timer / pre-drag listener — we're past that window.
    this.cancelDragDelay()
    document.removeEventListener('pointermove', this.onPointerMoveBeforeDrag)

    if (this._fallbackTolerance <= 0) {
      this.commitPointerDrag(e, target)
      return
    }
    // Capture phase: pointer held, drag NOT yet committed. setPointerCapture
    // pins subsequent events to `target` and suppresses default touch panning
    // on iOS during the tolerance gap. Firefox throws on synthetic events.
    this.pointerCaptureTarget = target
    this.activePointerId = e.pointerId
    this.dragStartPosition = { x: e.clientX, y: e.clientY }
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events in Firefox */
    }
    document.addEventListener('pointermove', this.onPointerMoveCapture)
    document.addEventListener('pointerup', this.onPointerUpCapture)
    document.addEventListener('pointercancel', this.onPointerUpCapture)
  }

  private onPointerMoveCapture = (e: PointerEvent): void => {
    const origin = this.dragStartPosition
    const target = this.pointerCaptureTarget
    if (!origin || !target || e.pointerId !== this.activePointerId) return
    // Chebyshev distance — matches legacy `Math.max(|dx|, |dy|) < tolerance`
    // at Sortable.js:827.
    if (
      Math.max(Math.abs(e.clientX - origin.x), Math.abs(e.clientY - origin.y)) <
      this._fallbackTolerance
    )
      return
    this.teardownCapturePhase()
    this.commitPointerDrag(e, target)
  }

  // Pointer released (or cancelled) BEFORE the tolerance threshold — treat
  // as a click, not a drag. No `choose` / `start` / `end` events fired;
  // no DOM changes; just tear the capture state down.
  private onPointerUpCapture = (e: PointerEvent): void => {
    if (e.pointerId === this.activePointerId) this.teardownCapturePhase()
  }

  private teardownCapturePhase(): void {
    const t = this.pointerCaptureTarget
    if (t && this.activePointerId !== null) {
      try {
        t.releasePointerCapture(this.activePointerId)
      } catch {
        /* already released */
      }
    }
    document.removeEventListener('pointermove', this.onPointerMoveCapture)
    document.removeEventListener('pointerup', this.onPointerUpCapture)
    document.removeEventListener('pointercancel', this.onPointerUpCapture)
    this.pointerCaptureTarget = null
    this.activePointerId = null
    this.dragStartPosition = undefined
  }

  /**
   * Commit phase — the actual drag start. Creates the ghost, fires events,
   * registers with `globalDragState`. Reachable directly (tolerance 0) or
   * via {@link onPointerMoveCapture} after the tolerance threshold is met.
   */
  private commitPointerDrag(e: PointerEvent, target: HTMLElement): void {
    // Prevent text selection during drag (especially needed on iOS Safari)
    window.getSelection()?.removeAllRanges()
    this.savedBodyUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.setProperty('-webkit-user-select', 'none')

    // Get selected items if multiSelect is enabled
    this.draggedItems = [target]
    if (this._selectionManager.isSelected(target)) {
      // If the target is already selected, drag all selected items
      this.draggedItems = this._selectionManager.getSelected()
    } else {
      // If target is not selected, select only it
      this._selectionManager.select(target)
    }

    // Dim non-anchor selected items
    this.draggedItems.forEach((item) => {
      if (item !== target) {
        item.classList.add('sortable-multi-drag-source')
      }
    })

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
      this.draggedItems,
      this.zone.element,
      this,
      this.groupManager.getName(),
      this.draggedItems.map((item) => this.zone.getIndex(item)),
      this.events
    )

    const evt: SortableEvent = {
      item: target,
      items: this.draggedItems,
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: this.startIndex,
      newIndex: this.startIndex,
    }
    // Emit choose event first
    this.events.emit('choose', evt)

    // Create ghost element for visual feedback. `fallbackClass` is applied
    // alongside `ghostClass` so fallback-mode styles can target a stable hook
    // (legacy parity for `forceFallback` UX). `fallbackOnBody` selects the
    // ghost's parent — `document.body` when true, the sortable zone's root
    // element when false (legacy default). `fallbackOffsetX` /
    // `fallbackOffsetY` shift the ghost relative to the cursor (additive,
    // matching legacy `fallbackOffset.x` / `.y`).
    const ghostOptions = {
      fallbackClass: this._fallbackClass,
      appendTo: this._fallbackOnBody ? document.body : this.zone.element,
      offsetX: this._fallbackOffsetX,
      offsetY: this._fallbackOffsetY,
      dataIdAttr: this._dataIdAttr,
    }
    if (this.draggedItems.length > 1) {
      this.ghostManager.createStackedGhost(
        target,
        this.draggedItems.length,
        e,
        ghostOptions
      )
    } else {
      this.ghostManager.createGhost(target, e, ghostOptions)
    }
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
    const over = elementUnderMouse?.closest(
      this.draggable
    ) as HTMLElement | null

    // Resolve the target sortable container. When `over` is non-null this is
    // simply its parent. When it's null we may still be hovering over an
    // empty sortable container — walk up `elementUnderMouse` ancestors and
    // look for one registered with the drag-manager registry (#32). The
    // helper also widens its search to empty containers within their
    // `emptyInsertThreshold` of the cursor (#31).
    let targetZoneElement: HTMLElement | null
    if (over) {
      targetZoneElement = over.parentElement
    } else {
      targetZoneElement = this.findSortableContainerUnder(
        elementUnderMouse,
        e.clientX,
        e.clientY
      )
    }
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
        const targetDragManager = this.findDragManagerForZone(targetZoneElement)
        const dragId = `pointer-${this.activePointerId}`

        // Register put target so GlobalDragState can determine clone vs move
        if (targetDragManager) {
          globalDragState.setPutTarget(
            dragId,
            targetZoneElement,
            targetDragManager,
            targetDragManager.groupManager.getName()
          )
        } else {
          globalDragState.setPutTarget(
            dragId,
            targetZoneElement,
            this,
            this.groupManager.getName()
          )
        }

        // Determine which element to insert: clone or original
        const currentActiveDrag = globalDragState.getActiveDrag(dragId)
        if (
          currentActiveDrag?.pullMode === 'clone' &&
          currentActiveDrag.clones
        ) {
          // Clone operation: insert all clones into the target zone
          currentActiveDrag.clones.forEach((clone) => {
            if (clone.parentElement !== targetZoneElement) {
              targetZoneElement.insertBefore(clone, over)
            }
          })
        } else {
          // Move operation: move all dragged items to the target zone
          this.draggedItems.forEach((item) => {
            targetZoneElement.insertBefore(item, over)
          })
        }
      }
    } else {
      // Same zone movement — determine whether we're moving the clone or original
      const currentActiveDrag = globalDragState.getActiveDrag(dragId)
      const movingElement =
        currentActiveDrag?.pullMode === 'clone' &&
        currentActiveDrag.clones?.[0]?.parentElement === targetZoneElement
          ? currentActiveDrag.clones[0]
          : this.dragElement

      // Same-zone movement only meaningful when hovering over a draggable
      // sibling. With an empty container or padding hit, `over` is null —
      // there's no reorder to do, skip.
      if (over && over !== movingElement) {
        // Find the target DragManager's zone for proper index tracking
        const targetDragManager = this.findDragManagerForZone(targetZoneElement)
        const targetZone = targetDragManager?.zone ?? this.zone

        // Skip move if FLIP animations are still in progress — prevents oscillation
        // caused by elementFromPoint detecting elements at their animated positions
        if (targetZone.isAnimating) return

        const currentItems = targetZone.getItems()
        const currentIndex = currentItems.indexOf(movingElement)
        const overIndex = currentItems.indexOf(over)

        if (
          currentIndex !== -1 &&
          overIndex !== -1 &&
          currentIndex !== overIndex
        ) {
          // Dispatch move BEFORE mutating the DOM so cancellation is a true
          // no-op for this tick (#33). Pointer pipeline uses the live
          // `PointerEvent` as `originalEvent`.
          const naturalAfter = currentIndex < overIndex
          const moveEvent: MoveEvent = {
            item: this.dragElement,
            items:
              this.draggedItems.length > 0
                ? this.draggedItems
                : [this.dragElement],
            from: targetZoneElement,
            to: targetZoneElement,
            oldIndex: currentIndex,
            newIndex: overIndex,
            related: over,
            willInsertAfter: naturalAfter,
            draggedRect: movingElement.getBoundingClientRect(),
            targetRect: over.getBoundingClientRect(),
          }
          const moveResult = this.dispatchMove(moveEvent, e)
          if (moveResult === false) {
            // Cancelled — skip DOM move + downstream emissions for this tick.
            return
          }

          // Apply `-1` / `1` override by adjusting the target index relative
          // to the natural insertion point. See #33.
          let targetIndex = overIndex
          if (moveResult === 1 && !naturalAfter) targetIndex = overIndex + 1
          else if (moveResult === -1 && naturalAfter)
            targetIndex = overIndex - 1

          // Use the DropZone's move method to get animations
          if (this.draggedItems.length > 1) {
            targetZone.moveMultiple(this.draggedItems, targetIndex)
          } else {
            targetZone.move(movingElement, targetIndex)
          }

          // Only emit update if it's within the original zone
          if (activeDrag.fromZone === targetZoneElement) {
            this.events.emit('update', {
              item: this.dragElement,
              items:
                this.draggedItems.length > 0
                  ? this.draggedItems
                  : [this.dragElement],
              from: targetZoneElement,
              to: targetZoneElement,
              oldIndex: this.startIndex,
              newIndex: targetIndex,
            })
          }
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
    // Remove multi-drag-source class from all items
    this.draggedItems.forEach((item) => {
      item.classList.remove('sortable-multi-drag-source')
    })

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
        // If this was a clone operation, remove the clone from the target
        if (activeDrag.pullMode === 'clone' && activeDrag.clones) {
          activeDrag.clones.forEach((clone) => clone.remove())
        }

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

    // Animate ghost to final element position before destroying
    const ghost = this.ghostManager.getGhostElement()
    const dragEl = this.dragElement
    if (ghost && dragEl && !revert) {
      const finalRect = dragEl.getBoundingClientRect()
      const ghostRect = ghost.getBoundingClientRect()
      const deltaX = finalRect.left - ghostRect.left
      const deltaY = finalRect.top - ghostRect.top

      // Only animate if ghost is far enough from target
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        ghost.style.transition = 'transform 150ms cubic-bezier(0.2, 0, 0, 1)'
        ghost.style.transform = `translate(${deltaX}px, ${deltaY}px)`

        // After animation, clean up
        const cleanup = () => {
          this.ghostManager.destroy(dragEl)
        }
        ghost.addEventListener('transitionend', cleanup, { once: true })
        // Fallback timeout in case transitionend doesn't fire
        window.setTimeout(cleanup, 200)
      } else {
        this.ghostManager.destroy(dragEl)
      }
    } else if (dragEl) {
      this.ghostManager.destroy(dragEl)
    }

    // Global drag state handles the end event and cleanup
    if (this.activePointerId !== null) {
      const dragId = `pointer-${this.activePointerId}`
      globalDragState.endDrag(dragId)
    }
    // Restore text selection ability
    document.body.style.userSelect = this.savedBodyUserSelect
    document.body.style.setProperty(
      '-webkit-user-select',
      this.savedBodyUserSelect || ''
    )
    this.savedBodyUserSelect = ''

    this.startIndex = -1
    this.isPointerDragging = false
    this.activePointerId = null
    this.dragElement = null
    this.draggedItems = []
  }

  /** Find the DragManager instance that manages a specific zone */
  private findDragManagerForZone(targetZone: HTMLElement): DragManager | null {
    return dragManagerRegistry.get(targetZone) || null
  }

  /**
   * Resolve the sortable container the pointer is currently targeting.
   *
   * 1. Walk up `el`'s ancestor chain looking for a registered sortable
   *    container (#32 — covers both populated containers and empties the
   *    cursor is directly inside).
   * 2. If no ancestor matches and cursor coordinates were supplied, scan
   *    registered *empty* sortables and pick the first one whose bounding
   *    rect — expanded by its `emptyInsertThreshold` — contains the
   *    cursor (#31 — covers \"close enough to count\" UX).
   */
  private findSortableContainerUnder(
    el: Element | null,
    x?: number,
    y?: number
  ): HTMLElement | null {
    let cur: Element | null = el
    while (cur) {
      if (cur instanceof HTMLElement && dragManagerRegistry.has(cur)) {
        return cur
      }
      cur = cur.parentElement
    }

    if (x === undefined || y === undefined) return null

    for (const [zoneEl, manager] of dragManagerRegistry) {
      // Only widen for empty containers — non-empty ones would have been
      // caught by the elementFromPoint ancestor walk above.
      if (zoneEl.querySelector(manager.draggable)) continue
      const threshold = manager._emptyInsertThreshold
      if (!threshold) continue
      const rect = zoneEl.getBoundingClientRect()
      if (
        x >= rect.left - threshold &&
        x <= rect.right + threshold &&
        y >= rect.top - threshold &&
        y <= rect.bottom + threshold
      ) {
        return zoneEl
      }
    }
    return null
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
  private canDropInZoneHeuristic(_targetZone: HTMLElement): boolean {
    // Without a registered DragManager for the target zone, we cannot
    // determine group compatibility. Return false to be safe.
    return false
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
        // Don't set draggable=true on touch devices — it triggers HTML5 DnD
        // which has zero mobile browser support and interferes with pointer events
        const isTouchDevice = navigator.maxTouchPoints > 0
        item.draggable = !isTouchDevice

        // Set touch-action on draggable items / handles.
        // When a touch delay is configured, use 'manipulation' (allows scroll/tap
        // but disables double-tap-zoom) so the page remains scrollable while the
        // hold timer decides whether a drag is intended. Without a delay, use 'none'
        // so the browser doesn't intercept the touch for scrolling.
        const hasTouchDelay = this.delayOnTouchOnly > 0
        const touchActionValue = hasTouchDelay ? 'manipulation' : 'none'

        if (this.handle) {
          const handles = item.querySelectorAll(this.handle)
          handles.forEach((handle) => {
            if (handle instanceof HTMLElement) {
              this.originalTouchActions.set(handle, handle.style.touchAction)
              handle.style.touchAction = touchActionValue
            }
          })
        } else {
          this.originalTouchActions.set(item, item.style.touchAction)
          item.style.touchAction = touchActionValue
        }
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
    target: HTMLElement,
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

    // Apply hold feedback for touch
    if (isTouch) {
      this.holdTarget = target
      this.holdOriginalStyles = {
        transform: target.style.transform,
        boxShadow: target.style.boxShadow,
        transition: target.style.transition,
      }
      target.classList.add('sortable-holding')
      target.style.transition = 'transform 150ms ease, box-shadow 150ms ease'
      target.style.transform = 'scale(1.03)'
      target.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
    }

    // Set up delay timer
    this.dragStartTimer = window.setTimeout(() => {
      this.dragStartTimer = undefined
      this.dragStartPosition = undefined
      this.clearHoldFeedback()
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
    this.clearHoldFeedback()
  }

  /**
   * Clear hold-to-drag visual feedback
   */
  private clearHoldFeedback(): void {
    if (this.holdTarget && this.holdOriginalStyles) {
      this.holdTarget.classList.remove('sortable-holding')
      this.holdTarget.style.transform = this.holdOriginalStyles.transform
      this.holdTarget.style.boxShadow = this.holdOriginalStyles.boxShadow
      this.holdTarget.style.transition = this.holdOriginalStyles.transition
    }
    this.holdTarget = null
    this.holdOriginalStyles = null
  }
}
