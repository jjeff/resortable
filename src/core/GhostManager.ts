/**
 * Options accepted by {@link GhostManager.createGhost} and
 * {@link GhostManager.createStackedGhost}.
 *
 * Promoted from a positional `fallbackClass?: string` parameter (PR1 #29)
 * to an options bag when `fallbackOnBody` and `fallbackOffset{X,Y}` joined
 * the fallback option family in PR2 #29. Future additions (e.g.
 * `fallbackTolerance` pre-commit motion in PR3) should slot in here.
 */
export interface CreateGhostOptions {
  /**
   * Class added to the ghost element alongside `ghostClass` so fallback-mode
   * styles can target a stable hook (legacy parity for `forceFallback`).
   */
  fallbackClass?: string
  /**
   * Parent element the ghost is appended to. Defaults to `document.body`,
   * matching the legacy `fallbackOnBody: true` behaviour. Callers wanting the
   * legacy `fallbackOnBody: false` semantics should pass the sortable zone's
   * root element instead.
   *
   * Note: when the chosen parent has `overflow: hidden`, the ghost will be
   * clipped at the zone boundary. This is the legacy behaviour, not a bug.
   */
  appendTo?: HTMLElement
  /**
   * Horizontal pixel offset applied to the ghost relative to the cursor.
   * Positive values shift the ghost to the right of where it would otherwise
   * sit; negative values shift it to the left. Matches legacy
   * `fallbackOffset.x` direction (see `legacy-sortable/src/Sortable.js`
   * `_onTouchMove`).
   */
  offsetX?: number
  /**
   * Vertical pixel offset applied to the ghost relative to the cursor.
   * Positive values shift the ghost down; negative values shift it up.
   * Matches legacy `fallbackOffset.y` direction.
   */
  offsetY?: number
  /**
   * The data-attribute name configured by `dataIdAttr` on the parent
   * Sortable. When the ghost lives inside the sortable zone (legacy
   * `fallbackOnBody: false`, the new PR2 default), it would otherwise share
   * this attribute with the original element — yielding duplicate matches in
   * DOM queries like `[data-id="foo"]`. The attribute is stripped from the
   * ghost clone so identity queries continue to address only the real item.
   */
  dataIdAttr?: string
  /**
   * Cursor position to anchor the grab-point offset to, when it differs
   * from the triggering event's position. With `fallbackTolerance > 0` the
   * drag commits only after the pointer has already traveled several
   * pixels — anchoring to the commit event would shift the ghost by that
   * traveled distance. Pass the pointerdown position instead.
   */
  cursorOrigin?: { x: number; y: number }
}

/**
 * Strip identity attributes from a clone of a sortable item. Any attribute
 * that uniquely identifies the original would otherwise produce duplicate
 * matches in DOM queries (notably `[data-id="..."]` lookups in tests and
 * consumer code). Duplicate `id` is invalid HTML in any case; the ARIA /
 * tabindex state describes the *real* element's user-facing semantics and
 * has no meaning on a visual-only clone.
 */
function stripIdentity(clone: HTMLElement, dataIdAttr: string): HTMLElement {
  clone.removeAttribute('id')
  clone.removeAttribute(dataIdAttr)
  clone.removeAttribute('aria-grabbed')
  clone.removeAttribute('aria-selected')
  clone.removeAttribute('aria-posinset')
  clone.removeAttribute('aria-setsize')
  clone.removeAttribute('tabindex')
  // Descendant `id`s would also be duplicated; clear them too.
  clone
    .querySelectorAll<HTMLElement>('[id]')
    .forEach((el) => el.removeAttribute('id'))
  return clone
}

/**
 * GhostManager handles the creation and management of ghost elements during drag operations.
 * The ghost element is a visual clone that follows the cursor during dragging.
 */
export class GhostManager {
  private ghostElement: HTMLElement | null = null
  private placeholderElement: HTMLElement | null = null
  // Distance from the cursor at drag start to the dragged element's top-left.
  // Captured once in createGhost and reused on every updateGhostPosition call
  // so the ghost tracks the cursor without snapping.
  private cursorOffsetX: number = 0
  private cursorOffsetY: number = 0
  // Configured `fallbackOffsetX` / `fallbackOffsetY` — additive shift applied
  // on top of the cursor-tracking position. Mirrors legacy `fallbackOffset`
  // (positive x = ghost moves right of cursor; positive y = down).
  private fallbackOffsetX: number = 0
  private fallbackOffsetY: number = 0
  private ghostClass: string
  private chosenClass: string
  private dragClass: string

  constructor(
    ghostClass: string = 'sortable-ghost',
    chosenClass: string = 'sortable-chosen',
    dragClass: string = 'sortable-drag'
  ) {
    this.ghostClass = ghostClass
    this.chosenClass = chosenClass
    this.dragClass = dragClass
  }

  /**
   * Creates a ghost element from the dragged element.
   *
   * @param draggedElement - The element being dragged
   * @param event - The drag event containing position information
   * @param options - Optional configuration. See {@link CreateGhostOptions}.
   *   When omitted, the ghost is appended to `document.body` with no
   *   fallback class and zero offset (the pre-PR2 default).
   * @returns The created ghost element
   */
  createGhost(
    draggedElement: HTMLElement,
    event: MouseEvent | DragEvent | PointerEvent,
    options?: CreateGhostOptions
  ): HTMLElement {
    const fallbackClass = options?.fallbackClass
    const appendTo = options?.appendTo ?? document.body
    this.fallbackOffsetX = options?.offsetX ?? 0
    this.fallbackOffsetY = options?.offsetY ?? 0
    const dataIdAttr = options?.dataIdAttr ?? 'data-id'
    // Clean up any existing ghost
    this.destroyGhost()

    // Clone the dragged element
    this.ghostElement = stripIdentity(
      draggedElement.cloneNode(true) as HTMLElement,
      dataIdAttr
    )
    // The clone keeps the original's classes for its looks, so it can match
    // the consumer's `draggable` selector. Mark it so DropZone.getItems()
    // (and index math built on it) always excludes it — with
    // `fallbackOnBody: false` the ghost lives INSIDE the zone element and
    // would otherwise be counted as a real item.
    this.ghostElement.setAttribute('data-resortable-ghost', '')

    // Get computed styles from the original element
    const computedStyle = window.getComputedStyle(draggedElement)
    const rect = draggedElement.getBoundingClientRect()

    // Copy important computed styles to preserve appearance
    // We need to copy these because the clone loses context-dependent styles
    const stylesToCopy = [
      'background',
      'backgroundColor',
      'backgroundImage',
      'backgroundSize',
      'backgroundPosition',
      'backgroundRepeat',
      'border',
      'borderRadius',
      'boxShadow',
      'color',
      'font',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'padding',
      'textAlign',
      'textDecoration',
      'textTransform',
      'letterSpacing',
      'wordSpacing',
      'whiteSpace',
      'width',
      'height',
      'minWidth',
      'minHeight',
      'maxWidth',
      'maxHeight',
    ]

    // Apply computed styles to ghost element
    stylesToCopy.forEach((prop) => {
      if (this.ghostElement) {
        const styleValue = computedStyle.getPropertyValue(
          prop.replace(/([A-Z])/g, '-$1').toLowerCase()
        )
        this.ghostElement.style.setProperty(
          prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
          styleValue
        )
      }
    })

    // Set the exact dimensions to match the original
    this.ghostElement.style.width = `${rect.width}px`
    this.ghostElement.style.height = `${rect.height}px`

    // Apply ghost-specific styling (these override the copied styles)
    this.ghostElement.classList.add(this.ghostClass)
    if (fallbackClass) {
      this.ghostElement.classList.add(fallbackClass)
    }
    this.ghostElement.style.position = 'fixed'
    this.ghostElement.style.pointerEvents = 'none'
    this.ghostElement.style.zIndex = '100000'
    this.ghostElement.style.opacity = '0.8' // Slightly higher opacity to see the styles better
    this.ghostElement.style.margin = '0' // Reset margin as it's positioned absolutely
    this.ghostElement.style.transform = 'none' // Reset any transforms
    this.ghostElement.style.transition = 'none' // Disable transitions during drag

    // Calculate offset from cursor to element top-left. Anchor to the
    // original grab point when provided (see CreateGhostOptions.cursorOrigin).
    const anchorX = options?.cursorOrigin?.x ?? event.clientX
    const anchorY = options?.cursorOrigin?.y ?? event.clientY
    this.cursorOffsetX = anchorX - rect.left
    this.cursorOffsetY = anchorY - rect.top

    // Set initial position
    this.updateGhostPosition(event.clientX, event.clientY)

    // Append to the configured parent (defaults to document.body — matches
    // legacy `fallbackOnBody: true`). When `fallbackOnBody` is false, callers
    // pass the sortable zone's root element instead. The ghost uses
    // `position: fixed` so layout positioning is unaffected by the parent;
    // however, an ancestor with `overflow: hidden` (or a `transform` /
    // `filter` / `will-change: transform` style that establishes a containing
    // block for fixed-position descendants) will clip the ghost. That is the
    // legacy behaviour as well — documented in PR2 #29.
    appendTo.appendChild(this.ghostElement)

    // Apply chosen class to the original element
    draggedElement.classList.add(this.chosenClass)

    // Apply drag class to hide the original element during drag
    draggedElement.classList.add(this.dragClass)

    return this.ghostElement
  }

  /**
   * Creates a stacked ghost for multi-item drag.
   * Shows the anchor item with a count badge and stacked shadow effect.
   */
  createStackedGhost(
    anchorElement: HTMLElement,
    itemCount: number,
    event: MouseEvent | DragEvent | PointerEvent,
    options?: CreateGhostOptions
  ): HTMLElement {
    // Create the base ghost from anchor
    const ghost = this.createGhost(anchorElement, event, options)

    // Add stacked class
    ghost.classList.add('sortable-ghost-stacked')

    // Add subtle stacked shadow to suggest multiple items
    ghost.style.boxShadow =
      '3px 3px 0 rgba(0,0,0,0.1), 6px 6px 0 rgba(0,0,0,0.05)'

    // Create count badge
    const badge = document.createElement('span')
    badge.className = 'sortable-drag-count'
    badge.textContent = String(itemCount)
    badge.style.position = 'absolute'
    badge.style.top = '-8px'
    badge.style.right = '-8px'
    badge.style.minWidth = '20px'
    badge.style.height = '20px'
    badge.style.borderRadius = '10px'
    badge.style.backgroundColor = '#4A90D9'
    badge.style.color = 'white'
    badge.style.fontSize = '12px'
    badge.style.fontWeight = 'bold'
    badge.style.display = 'flex'
    badge.style.alignItems = 'center'
    badge.style.justifyContent = 'center'
    badge.style.lineHeight = '1'
    badge.style.pointerEvents = 'none'
    ghost.appendChild(badge)

    return ghost
  }

  /**
   * Creates a placeholder element to show where the item will be dropped.
   *
   * The placeholder is a semi-transparent CLONE of the dragged element —
   * legacy-SortableJS parity, where the in-list drop indicator is the item
   * itself wearing `ghostClass`. A bare gray box (the previous behaviour)
   * reads as a rendering glitch next to rich item content like thumbnails.
   *
   * @param referenceElement - Element to base the placeholder on
   * @param options - `dataIdAttr` names the identity attribute to strip
   * @returns The created placeholder element
   */
  createPlaceholder(
    referenceElement: HTMLElement,
    options?: { dataIdAttr?: string }
  ): HTMLElement {
    // Clean up any existing placeholder
    this.destroyPlaceholder()

    this.placeholderElement = stripIdentity(
      referenceElement.cloneNode(true) as HTMLElement,
      options?.dataIdAttr ?? 'data-id'
    )

    // Mark the placeholder so index math and DropZone.getItems() always
    // exclude it — the clone keeps the original's classes, so it matches
    // the consumer's `draggable` selector (controlled mode relies on this).
    this.placeholderElement.setAttribute('data-resortable-placeholder', '')

    // Fix dimensions so it holds the original's exact footprint
    const rect = referenceElement.getBoundingClientRect()
    this.placeholderElement.style.width = `${rect.width}px`
    this.placeholderElement.style.height = `${rect.height}px`

    // Apply ghost class for styling, dim it, and keep it hit-transparent so
    // elementFromPoint / dragover resolve items and containers beneath it.
    this.placeholderElement.classList.add(this.ghostClass)
    this.placeholderElement.style.opacity = '0.4'
    this.placeholderElement.style.pointerEvents = 'none'

    return this.placeholderElement
  }

  /**
   * Updates the position of the ghost element
   * @param clientX - Mouse X position
   * @param clientY - Mouse Y position
   */
  updateGhostPosition(clientX: number, clientY: number): void {
    if (!this.ghostElement) return

    // Position = cursor minus the grab offset (so the ghost tracks the cursor
    // relative to where it was grabbed) plus the configured fallback offset.
    // Legacy adds fallbackOffset.x / .y to the resulting position
    // (see `_onTouchMove` in `legacy-sortable/src/Sortable.js`), so positive
    // offsets shift the ghost right / down of the cursor.
    this.ghostElement.style.left = `${clientX - this.cursorOffsetX + this.fallbackOffsetX}px`
    this.ghostElement.style.top = `${clientY - this.cursorOffsetY + this.fallbackOffsetY}px`
  }

  /**
   * Shows or updates the placeholder at the specified position
   * @param container - The container element
   * @param beforeElement - Insert placeholder before this element (null = append)
   */
  updatePlaceholder(
    container: HTMLElement,
    beforeElement: HTMLElement | null
  ): void {
    if (!this.placeholderElement) return

    if (beforeElement) {
      container.insertBefore(this.placeholderElement, beforeElement)
    } else {
      container.appendChild(this.placeholderElement)
    }
  }

  /**
   * Removes the ghost element and cleans up
   * @param draggedElement - Original dragged element to remove classes from
   */
  destroyGhost(draggedElement?: HTMLElement): void {
    if (this.ghostElement) {
      this.ghostElement.remove()
      this.ghostElement = null
    }

    if (draggedElement) {
      draggedElement.classList.remove(this.chosenClass)
      draggedElement.classList.remove(this.dragClass)
    }
  }

  /**
   * Removes the placeholder element
   */
  destroyPlaceholder(): void {
    if (this.placeholderElement) {
      this.placeholderElement.remove()
      this.placeholderElement = null
    }
  }

  /**
   * Cleans up all ghost-related elements
   * @param draggedElement - Original dragged element to remove classes from
   */
  destroy(draggedElement?: HTMLElement): void {
    this.destroyGhost(draggedElement)
    this.destroyPlaceholder()
  }

  /**
   * Gets the current ghost element
   */
  getGhostElement(): HTMLElement | null {
    return this.ghostElement
  }

  /**
   * Gets the current placeholder element
   */
  getPlaceholderElement(): HTMLElement | null {
    return this.placeholderElement
  }

  /**
   * Gets the chosen class name
   */
  getChosenClass(): string {
    return this.chosenClass
  }

  /**
   * Gets the drag class name
   */
  getDragClass(): string {
    return this.dragClass
  }
}
