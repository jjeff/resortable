import type { AnimationManager } from '../animation/AnimationManager.js'
import { insertAt } from '../utils/dom.js'

/**
 * Manages sortable container and basic DOM operations
 * @internal
 */
export class DropZone {
  private animationManager?: AnimationManager
  private draggableSelector: string = '.sortable-item'

  constructor(
    public readonly element: HTMLElement,
    animationManager?: AnimationManager
  ) {
    this.animationManager = animationManager
  }

  /** Set the selector for draggable items */
  public setDraggableSelector(selector: string): void {
    this.draggableSelector = selector
  }

  /** Get sortable items (only elements matching the draggable selector) */
  public getItems(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll(this.draggableSelector))
  }

  /** Get index of an item within container */
  public getIndex(item: HTMLElement): number {
    return this.getItems().indexOf(item)
  }

  /** Move item to new index within container (among sortable items only) */
  public move(item: HTMLElement, toIndex: number): void {
    const items = this.getItems()
    const currentIndex = items.indexOf(item)

    // If already at target position, do nothing
    if (currentIndex === toIndex) return

    // Calculate the actual DOM index, accounting for non-sortable children
    const allChildren = Array.from(this.element.children)

    // Map the sortable index to actual DOM index
    // We need to place the item at the position where it would be the nth sortable item
    let targetDOMIndex: number

    // Remove the current item from the sortableIndices calculation to get clean target position
    const currentDOMIndex = allChildren.indexOf(item)
    const sortableIndicesWithoutCurrent = allChildren
      .map((child, index) => {
        if (index === currentDOMIndex) return -1 // Skip current item
        return child.matches(this.draggableSelector) ? index : -1
      })
      .filter((index) => index !== -1)

    // toIndex represents where we want the item to be among sortable items
    // toIndex=0 means first, toIndex=1 means second, etc.
    if (toIndex >= sortableIndicesWithoutCurrent.length) {
      // Append after all sortable items
      if (sortableIndicesWithoutCurrent.length > 0) {
        targetDOMIndex =
          sortableIndicesWithoutCurrent[
            sortableIndicesWithoutCurrent.length - 1
          ] + 1
      } else {
        targetDOMIndex = allChildren.length
      }
    } else {
      // Insert at the position of the item that's currently at toIndex
      targetDOMIndex = sortableIndicesWithoutCurrent[toIndex]

      // Adjust for the fact that we'll remove the current item first
      // If current item is before the target, the target index shifts down by 1
      if (currentDOMIndex < targetDOMIndex) {
        targetDOMIndex--
      }
    }

    // If we have an animation manager, animate the reordering
    if (this.animationManager) {
      // Get all sortable items that might be affected by this move
      const affectedItems = this.getItems()

      // Temporarily disable pointer events on the moving item to prevent interference
      const originalPointerEvents = item.style.pointerEvents
      item.style.pointerEvents = 'none'

      // Use FLIP animation for smooth reordering
      this.animationManager.animateReorder(affectedItems, () => {
        insertAt(this.element, item, targetDOMIndex)
      })

      // Restore pointer events after animation starts
      // Using requestAnimationFrame to ensure it happens after the animation begins
      window.requestAnimationFrame(() => {
        item.style.pointerEvents = originalPointerEvents
      })
    } else {
      // No animation, just do the move
      insertAt(this.element, item, targetDOMIndex)
    }
  }
}
