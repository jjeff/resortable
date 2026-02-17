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

  /** Whether FLIP animations are currently in progress */
  public get isAnimating(): boolean {
    return this.animationManager?.isAnimating ?? false
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

      // Use FLIP animation for smooth reordering
      this.animationManager.animateReorder(affectedItems, () => {
        insertAt(this.element, item, targetDOMIndex)
      })
    } else {
      // No animation, just do the move
      insertAt(this.element, item, targetDOMIndex)
    }
  }

  /** Move multiple items to a target index, preserving their relative order */
  public moveMultiple(items: HTMLElement[], toIndex: number): void {
    if (items.length === 0) return
    if (items.length === 1) {
      this.move(items[0], toIndex)
      return
    }

    // Sort items by their current index to preserve relative order
    const sortedItems = [...items].sort(
      (a, b) => this.getIndex(a) - this.getIndex(b)
    )

    // Remove all selected items from DOM
    sortedItems.forEach((item) => item.remove())

    // Get remaining items after removal
    const remaining = this.getItems()

    // Clamp toIndex to valid range
    const insertIndex = Math.min(toIndex, remaining.length)

    // Determine the reference node to insert before
    const refNode =
      insertIndex < remaining.length ? remaining[insertIndex] : null

    // Insert all items in order at the target position
    if (this.animationManager) {
      const allItems = [...remaining]
      allItems.splice(insertIndex, 0, ...sortedItems)

      this.animationManager.animateReorder(allItems, () => {
        sortedItems.forEach((item) => {
          if (refNode) {
            this.element.insertBefore(item, refNode)
          } else {
            this.element.appendChild(item)
          }
        })
      })
    } else {
      sortedItems.forEach((item) => {
        if (refNode) {
          this.element.insertBefore(item, refNode)
        } else {
          this.element.appendChild(item)
        }
      })
    }
  }
}
