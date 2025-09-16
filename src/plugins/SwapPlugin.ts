/**
 * @fileoverview Swap plugin for swap-based sorting instead of insertion
 * @author Resortable Team
 * @since 2.0.0
 */

import { SortablePlugin } from '../types/index.js'

/**
 * Configuration options for the Swap plugin
 */
export interface SwapOptions {
  /**
   * Swap threshold (0-1) - how much elements must overlap to trigger swap
   * @defaultValue 0.5
   */
  swapThreshold?: number

  /**
   * CSS class applied to elements during swap operation
   * @defaultValue 'sortable-swap-highlight'
   */
  swapClass?: string

  /**
   * Enable swap animations
   * @defaultValue true
   */
  animation?: boolean

  /**
   * Animation duration for swap operations
   * @defaultValue 150
   */
  animationDuration?: number

  /**
   * Only allow swapping between items of the same type
   * @defaultValue false
   */
  restrictToSameType?: boolean

  /**
   * Data attribute to use for type checking when restrictToSameType is true
   * @defaultValue 'data-swap-type'
   */
  typeAttribute?: string
}

/**
 * Swap plugin for swap-based sorting instead of insertion-based sorting
 *
 * @remarks
 * This plugin changes the default sorting behavior from insertion-based
 * to swap-based. Instead of inserting items at new positions, items
 * swap places with each other.
 *
 * @example Basic usage
 * ```typescript
 * import { PluginSystem, SwapPlugin } from 'resortable';
 *
 * // Register the plugin
 * PluginSystem.register(SwapPlugin.create());
 *
 * // Install on sortable
 * const sortable = new Sortable(element);
 * PluginSystem.install(sortable, 'Swap');
 * ```
 *
 * @example With custom options
 * ```typescript
 * PluginSystem.register(SwapPlugin.create({
 *   swapThreshold: 0.7,
 *   restrictToSameType: true,
 *   typeAttribute: 'data-item-type'
 * }));
 * ```
 *
 * @public
 */
export class SwapPlugin implements SortablePlugin {
  public readonly name = 'Swap'
  public readonly version = '2.0.0'

  private options: Required<SwapOptions>
  private currentSwapTarget = new WeakMap<object, HTMLElement | null>()
  private originalMoveMethod = new WeakMap<object, Function>()

  /**
   * Create a Swap plugin instance
   *
   * @param options - Configuration options for swap behavior
   * @returns SwapPlugin instance
   */
  public static create(options: SwapOptions = {}): SwapPlugin {
    return new SwapPlugin(options)
  }

  constructor(options: SwapOptions = {}) {
    this.options = {
      swapThreshold: 0.5,
      swapClass: 'sortable-swap-highlight',
      animation: true,
      animationDuration: 150,
      restrictToSameType: false,
      typeAttribute: 'data-swap-type',
      ...options,
    }
  }

  /**
   * Install the plugin on a Sortable instance
   */
  public install(sortable: any): void {
    // Override the DropZone's move method to implement swap behavior
    this.overrideDropZoneMove(sortable)

    // Listen for drag events
    sortable.eventSystem.on('start', this.handleDragStart.bind(this, sortable))
    sortable.eventSystem.on('end', this.handleDragEnd.bind(this, sortable))

    // Add move event handling for swap previews
    this.attachMoveHandlers(sortable)
  }

  /**
   * Uninstall the plugin from a Sortable instance
   */
  public uninstall(sortable: any): void {
    // Restore original move method
    this.restoreDropZoneMove(sortable)

    // Remove move handlers
    this.detachMoveHandlers(sortable)

    // Clean up tracking
    this.currentSwapTarget.delete(sortable)
    this.originalMoveMethod.delete(sortable)
  }

  /**
   * Override DropZone's move method to implement swap behavior
   */
  private overrideDropZoneMove(sortable: any): void {
    const dropZone = sortable.dropZone
    if (!dropZone) {
      return
    }

    // Store original method
    this.originalMoveMethod.set(sortable, dropZone.move.bind(dropZone))

    // Override with swap behavior
    dropZone.move = (items: HTMLElement[], targetIndex: number) => {
      if (items.length === 0) {
        return
      }

      const targetElement = this.getElementAtIndex(dropZone, targetIndex)
      if (!targetElement) {
        // No target to swap with, fall back to original behavior
        return this.originalMoveMethod.get(sortable)?.(items, targetIndex)
      }

      // Check if swap is allowed
      if (!this.canSwap(items[0], targetElement)) {
        return
      }

      // Perform the swap
      this.performSwap(dropZone, items, targetElement)
    }
  }

  /**
   * Restore original DropZone move method
   */
  private restoreDropZoneMove(sortable: any): void {
    const dropZone = sortable.dropZone
    const originalMethod = this.originalMoveMethod.get(sortable)

    if (dropZone && originalMethod) {
      dropZone.move = originalMethod
    }
  }

  /**
   * Attach handlers for move events and swap previews
   */
  private attachMoveHandlers(sortable: any): void {
    const handleDragOver = (event: DragEvent) => {
      const target = this.findSwapTarget(sortable, event)
      this.updateSwapPreview(sortable, target)
    }

    sortable._swapDragOverHandler = handleDragOver
    sortable.element.addEventListener('dragover', handleDragOver)
  }

  /**
   * Detach move handlers
   */
  private detachMoveHandlers(sortable: any): void {
    if (sortable._swapDragOverHandler) {
      sortable.element.removeEventListener(
        'dragover',
        sortable._swapDragOverHandler
      )
      delete sortable._swapDragOverHandler
    }
  }

  /**
   * Handle drag start
   */
  private handleDragStart(sortable: any): void {
    // Initialize swap tracking
    this.currentSwapTarget.set(sortable, null)
  }

  /**
   * Handle drag end
   */
  private handleDragEnd(sortable: any): void {
    // Clear swap preview
    this.clearSwapPreview(sortable)
    this.currentSwapTarget.set(sortable, null)
  }

  /**
   * Find potential swap target based on mouse position
   */
  private findSwapTarget(sortable: any, event: DragEvent): HTMLElement | null {
    const element = document.elementFromPoint(
      event.clientX,
      event.clientY
    ) as HTMLElement
    if (!element) {
      return null
    }

    // Find the draggable item
    const draggableSelector = sortable.options.draggable || '.sortable-item'
    const target = element.closest(draggableSelector) as HTMLElement

    if (!target || !sortable.element.contains(target)) {
      return null
    }

    // Check if this is a valid swap target
    const draggedItem = sortable.dragManager?.draggedElement
    if (!draggedItem || target === draggedItem) {
      return null
    }

    // Check overlap threshold
    if (!this.checkSwapThreshold(draggedItem, target, event)) {
      return null
    }

    return target
  }

  /**
   * Check if elements overlap enough to trigger swap
   */
  private checkSwapThreshold(
    _draggedItem: HTMLElement,
    target: HTMLElement,
    event: DragEvent
  ): boolean {
    const targetRect = target.getBoundingClientRect()
    const mouseX = event.clientX
    const mouseY = event.clientY

    // Simple threshold check based on mouse position within target
    const withinX = mouseX >= targetRect.left && mouseX <= targetRect.right
    const withinY = mouseY >= targetRect.top && mouseY <= targetRect.bottom

    if (!withinX || !withinY) {
      return false
    }

    // Calculate overlap percentage
    const centerX = targetRect.left + targetRect.width / 2
    const centerY = targetRect.top + targetRect.height / 2
    const distanceFromCenter = Math.sqrt(
      Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
    )
    const maxDistance = Math.sqrt(
      Math.pow(targetRect.width / 2, 2) + Math.pow(targetRect.height / 2, 2)
    )

    const overlap = 1 - distanceFromCenter / maxDistance
    return overlap >= this.options.swapThreshold
  }

  /**
   * Update swap preview visual feedback
   */
  private updateSwapPreview(sortable: any, target: HTMLElement | null): void {
    const currentTarget = this.currentSwapTarget.get(sortable)

    // Remove previous preview
    if (currentTarget && currentTarget !== target) {
      currentTarget.classList.remove(this.options.swapClass)
    }

    // Add new preview
    if (target && target !== currentTarget) {
      target.classList.add(this.options.swapClass)
    }

    this.currentSwapTarget.set(sortable, target)
  }

  /**
   * Clear swap preview
   */
  private clearSwapPreview(sortable: any): void {
    const currentTarget = this.currentSwapTarget.get(sortable)
    if (currentTarget) {
      currentTarget.classList.remove(this.options.swapClass)
    }
  }

  /**
   * Check if two elements can be swapped
   */
  private canSwap(item1: HTMLElement, item2: HTMLElement): boolean {
    if (!this.options.restrictToSameType) {
      return true
    }

    const type1 = item1.getAttribute(this.options.typeAttribute)
    const type2 = item2.getAttribute(this.options.typeAttribute)

    return type1 === type2
  }

  /**
   * Perform the actual swap operation
   */
  private performSwap(
    _dropZone: any,
    items: HTMLElement[],
    targetElement: HTMLElement
  ): void {
    if (items.length === 0) {
      return
    }

    const sourceElement = items[0]
    const parent = sourceElement.parentElement

    if (!parent || sourceElement === targetElement) {
      return
    }

    // Create placeholders to preserve positions
    const sourcePlaceholder = document.createElement('div')
    const targetPlaceholder = document.createElement('div')

    // Insert placeholders
    parent.insertBefore(sourcePlaceholder, sourceElement)
    parent.insertBefore(targetPlaceholder, targetElement)

    // Perform the swap with animation if enabled
    if (this.options.animation) {
      this.animatedSwap(
        sourceElement,
        targetElement,
        sourcePlaceholder,
        targetPlaceholder
      )
    } else {
      this.immediateSwap(
        sourceElement,
        targetElement,
        sourcePlaceholder,
        targetPlaceholder
      )
    }
  }

  /**
   * Perform immediate swap without animation
   */
  private immediateSwap(
    sourceElement: HTMLElement,
    targetElement: HTMLElement,
    sourcePlaceholder: HTMLElement,
    targetPlaceholder: HTMLElement
  ): void {
    // Swap positions
    sourcePlaceholder.parentElement?.insertBefore(
      targetElement,
      sourcePlaceholder
    )
    targetPlaceholder.parentElement?.insertBefore(
      sourceElement,
      targetPlaceholder
    )

    // Remove placeholders
    sourcePlaceholder.remove()
    targetPlaceholder.remove()
  }

  /**
   * Perform animated swap
   */
  private animatedSwap(
    sourceElement: HTMLElement,
    targetElement: HTMLElement,
    sourcePlaceholder: HTMLElement,
    targetPlaceholder: HTMLElement
  ): void {
    // Get initial positions
    const sourceRect = sourceElement.getBoundingClientRect()
    const targetRect = targetElement.getBoundingClientRect()

    // Swap positions in DOM
    this.immediateSwap(
      sourceElement,
      targetElement,
      sourcePlaceholder,
      targetPlaceholder
    )

    // Get final positions
    const sourceFinalRect = sourceElement.getBoundingClientRect()
    const targetFinalRect = targetElement.getBoundingClientRect()

    // Calculate deltas
    const sourceDeltaX = sourceRect.left - sourceFinalRect.left
    const sourceDeltaY = sourceRect.top - sourceFinalRect.top
    const targetDeltaX = targetRect.left - targetFinalRect.left
    const targetDeltaY = targetRect.top - targetFinalRect.top

    // Apply initial transforms
    sourceElement.style.transform = `translate(${sourceDeltaX}px, ${sourceDeltaY}px)`
    targetElement.style.transform = `translate(${targetDeltaX}px, ${targetDeltaY}px)`

    // Animate to final positions
    sourceElement.style.transition = `transform ${this.options.animationDuration}ms ease`
    targetElement.style.transition = `transform ${this.options.animationDuration}ms ease`

    // Trigger reflow
    sourceElement.offsetHeight
    targetElement.offsetHeight

    // Remove transforms to animate to final position
    sourceElement.style.transform = ''
    targetElement.style.transform = ''

    // Clean up after animation
    setTimeout(() => {
      sourceElement.style.transition = ''
      targetElement.style.transition = ''
    }, this.options.animationDuration)
  }

  /**
   * Get element at specific index in the container
   */
  private getElementAtIndex(dropZone: any, index: number): HTMLElement | null {
    const draggableSelector =
      dropZone.element.getAttribute('data-draggable') || '.sortable-item'
    const children = Array.from(
      dropZone.element.querySelectorAll(draggableSelector)
    )
    return (children[index] as HTMLElement) || null
  }
}
