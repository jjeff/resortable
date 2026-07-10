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
    return Array.from(
      this.element.querySelectorAll<HTMLElement>(this.draggableSelector)
    ).filter((el) => !el.hasAttribute('data-resortable-placeholder'))
  }

  /**
   * Controlled-mode view of the list: draggable items excluding the
   * placeholder (already filtered by getItems), items hidden for the active
   * controlled drag, and any explicitly excluded elements (the dragged
   * items — the HTML5 pipeline leaves them visible in place).
   */
  public getVisibleItems(exclude: HTMLElement[] = []): HTMLElement[] {
    const excluded = new Set(exclude)
    return this.getItems().filter(
      (el) =>
        !excluded.has(el) &&
        !el.classList.contains('sortable-controlled-hidden')
    )
  }

  /**
   * Controlled-mode drop index: the index the dragged item(s) will occupy
   * in this list AFTER the consumer commits the move — i.e. the count of
   * visible draggable siblings (see {@link getVisibleItems}) before
   * `placeholder`.
   */
  public getControlledIndex(
    placeholder: HTMLElement,
    exclude: HTMLElement[] = []
  ): number {
    const visible = new Set(this.getVisibleItems(exclude))
    let index = 0
    for (const child of Array.from(this.element.children)) {
      if (child === placeholder) return index
      if (child instanceof HTMLElement && visible.has(child)) {
        index++
      }
    }
    return index
  }

  /** Get index of an item within container */
  public getIndex(item: HTMLElement): number {
    return this.getItems().indexOf(item)
  }

  /**
   * Insert `node` before `ref` (append when null), FLIP-animating the
   * displaced items. Controlled mode uses this to move the placeholder.
   */
  public insertWithAnimation(node: HTMLElement, ref: Node | null): void {
    const doInsert = () => this.element.insertBefore(node, ref)
    if (this.animationManager) {
      this.animationManager.animateReorder(this.getItems(), doInsert)
    } else {
      doInsert()
    }
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

    // DOM manipulation: remove items and reinsert at target position
    const doMove = () => {
      sortedItems.forEach((item) => item.remove())
      const remaining = this.getItems()
      const insertIndex = Math.min(toIndex, remaining.length)
      const refNode =
        insertIndex < remaining.length ? remaining[insertIndex] : null

      sortedItems.forEach((item) => {
        if (refNode) {
          this.element.insertBefore(item, refNode)
        } else {
          this.element.appendChild(item)
        }
      })
    }

    if (this.animationManager) {
      // All items currently in the container need FLIP positions captured
      // BEFORE any DOM changes — this is critical for correct animation origins
      const allItems = this.getItems()
      this.animationManager.animateReorder(allItems, doMove)
    } else {
      doMove()
    }
  }
}
