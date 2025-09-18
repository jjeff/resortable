/**
 * GhostManager handles the creation and management of ghost elements during drag operations.
 * The ghost element is a visual clone that follows the cursor during dragging.
 */
export class GhostManager {
  private ghostElement: HTMLElement | null = null
  private placeholderElement: HTMLElement | null = null
  private offsetX: number = 0
  private offsetY: number = 0
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
   * Creates a ghost element from the dragged element
   * @param draggedElement - The element being dragged
   * @param event - The drag event containing position information
   * @returns The created ghost element
   */
  createGhost(
    draggedElement: HTMLElement,
    event: MouseEvent | DragEvent | PointerEvent
  ): HTMLElement {
    // Clean up any existing ghost
    this.destroyGhost()

    // Clone the dragged element
    this.ghostElement = draggedElement.cloneNode(true) as HTMLElement

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
    this.ghostElement.style.position = 'fixed'
    this.ghostElement.style.pointerEvents = 'none'
    this.ghostElement.style.zIndex = '100000'
    this.ghostElement.style.opacity = '0.8' // Slightly higher opacity to see the styles better
    this.ghostElement.style.margin = '0' // Reset margin as it's positioned absolutely
    this.ghostElement.style.transform = 'none' // Reset any transforms
    this.ghostElement.style.transition = 'none' // Disable transitions during drag

    // Calculate offset from cursor to element top-left
    this.offsetX = event.clientX - rect.left
    this.offsetY = event.clientY - rect.top

    // Set initial position
    this.updateGhostPosition(event.clientX, event.clientY)

    // Add to document body
    document.body.appendChild(this.ghostElement)

    // Apply chosen class to the original element
    draggedElement.classList.add(this.chosenClass)

    // Apply drag class to hide the original element during drag
    draggedElement.classList.add(this.dragClass)

    return this.ghostElement
  }

  /**
   * Creates a placeholder element to show where the item will be dropped
   * @param referenceElement - Element to base the placeholder on
   * @returns The created placeholder element
   */
  createPlaceholder(referenceElement: HTMLElement): HTMLElement {
    // Clean up any existing placeholder
    this.destroyPlaceholder()

    // Create placeholder element
    this.placeholderElement = document.createElement(referenceElement.tagName)

    // Copy dimensions
    const rect = referenceElement.getBoundingClientRect()
    this.placeholderElement.style.width = `${rect.width}px`
    this.placeholderElement.style.height = `${rect.height}px`

    // Apply ghost class for styling
    this.placeholderElement.classList.add(this.ghostClass)

    // Make it semi-transparent
    this.placeholderElement.style.opacity = '0.4'
    this.placeholderElement.style.background = '#e0e0e0'

    return this.placeholderElement
  }

  /**
   * Updates the position of the ghost element
   * @param clientX - Mouse X position
   * @param clientY - Mouse Y position
   */
  updateGhostPosition(clientX: number, clientY: number): void {
    if (!this.ghostElement) return

    this.ghostElement.style.left = `${clientX - this.offsetX}px`
    this.ghostElement.style.top = `${clientY - this.offsetY}px`
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
  /**
   * Get the ghost element if it exists
   * @returns The ghost element or null
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
