// Future integration with SelectionManager and AnimationManager

/**
 * Manages visual effects for multi-drag operations
 *
 * @remarks
 * This class handles the visual aspects of multi-drag functionality:
 * - "Folding" animation where selected items visually collapse into the primary drag element
 * - Composite drag images using setDragImage() for native browser drag support
 * - Visual indicators showing selection count during drag operations
 * - Smooth unfolding animations when drag completes
 *
 * Based on legacy Sortable.js MultiDrag plugin but improved with:
 * - Modern TypeScript architecture
 * - Integration with existing AnimationManager
 * - Memory-efficient state management with Maps
 * - Native browser drag image support
 *
 * @internal
 */
export class MultiDragVisualManager {
  private foldingStates = new Map<HTMLElement, FoldState>()
  private isFolding = false
  private compositeDragImage: HTMLElement | null = null

  constructor() {
    // SelectionManager and AnimationManager integration coming in future phases
  }

  /**
   * Initiate visual folding animation for selected items
   *
   * @remarks
   * This method creates the signature "folding" effect where all selected items
   * visually animate to the position of the primary drag element, creating
   * the appearance that they are stacking together for the drag operation.
   *
   * @param primaryItem - The main item being dragged
   * @param selectedItems - All selected items including the primary
   */
  public async initiateVisualFold(
    primaryItem: HTMLElement,
    selectedItems: HTMLElement[]
  ): Promise<void> {
    if (selectedItems.length <= 1 || this.isFolding) {
      return
    }

    this.isFolding = true

    try {
      // Capture initial positions before folding
      this.captureInitialStates(selectedItems, primaryItem)

      // Get the target position (primary item's rect)
      const primaryRect = primaryItem.getBoundingClientRect()

      // Animate all secondary items to fold into primary position
      await this.animateFolding(selectedItems, primaryItem, primaryRect)

      // Hide folded items from DOM (they're now visually at primary position)
      this.hideFoldedItems(selectedItems, primaryItem)

      // Folding animation complete - keep folding state active until unfold
      // Note: isFolding remains true until resetFolding() or animateUnfold() is called
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error during visual fold animation:', error)
      this.resetFolding()
    }
  }

  /**
   * Create composite drag image for native browser drag
   *
   * @remarks
   * Generates a visual representation of all selected items stacked together
   * and uses DataTransfer.setDragImage() to provide native browser drag support.
   * This allows dragging beyond the viewport edges and provides better UX.
   *
   * @param items - Selected items to include in composite image
   * @returns The composite drag image element
   */
  public createCompositeDragImage(items: HTMLElement[]): HTMLElement | null {
    if (items.length <= 1) {
      return null
    }

    try {
      // Create container for composite image
      const composite = document.createElement('div')
      composite.className = 'sortable-multidrag-composite'
      composite.style.cssText = `
        position: absolute;
        top: -1000px;
        left: -1000px;
        pointer-events: none;
        z-index: 100000;
        opacity: 0.8;
      `

      // Add visual indicator for selection count
      this.addSelectionCountIndicator(composite, items.length)

      // Clone and stack the first few items for visual effect
      const maxVisibleItems = Math.min(items.length, 3)
      for (let i = 0; i < maxVisibleItems; i++) {
        const clone = items[i].cloneNode(true) as HTMLElement
        this.prepareCloneForComposite(clone, i, maxVisibleItems)
        composite.appendChild(clone)
      }

      // Add to DOM temporarily for measurement
      document.body.appendChild(composite)
      this.compositeDragImage = composite

      return composite
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error creating composite drag image:', error)
      return null
    }
  }

  /**
   * Setup native drag image with DataTransfer.setDragImage()
   *
   * @param dataTransfer - The DataTransfer object from drag event
   * @param dragImage - The composite drag image element
   */
  public setupNativeDragImage(
    dataTransfer: DataTransfer,
    dragImage: HTMLElement
  ): void {
    try {
      // Use setDragImage for native browser drag beyond viewport
      const rect = dragImage.getBoundingClientRect()
      const offsetX = rect.width / 2
      const offsetY = rect.height / 2

      dataTransfer.setDragImage(dragImage, offsetX, offsetY)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error setting native drag image:', error)
    }
  }

  /**
   * Animate unfolding when drag operation completes
   *
   * @param targetContainer - Container where items should unfold
   * @param insertionIndex - Index where items should be inserted
   */
  public animateUnfold(): void {
    if (!this.isFolding || this.foldingStates.size === 0) {
      return
    }

    try {
      this.isFolding = false

      // For now, just clean up - proper unfolding animation to be implemented
      this.resetFolding()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error during unfold animation:', error)
      this.resetFolding()
    }
  }

  /**
   * Clean up and reset all folding state
   */
  public resetFolding(): void {
    this.isFolding = false

    // Restore visibility of folded items
    this.foldingStates.forEach((state, element) => {
      element.style.position = state.originalPosition
      element.style.display = state.originalDisplay
      element.style.transform = ''
    })

    this.foldingStates.clear()

    // Clean up composite drag image
    if (this.compositeDragImage && this.compositeDragImage.parentNode) {
      this.compositeDragImage.parentNode.removeChild(this.compositeDragImage)
      this.compositeDragImage = null
    }
  }

  /**
   * Check if currently in folding state
   */
  public isFoldingActive(): boolean {
    return this.isFolding
  }

  /**
   * Destroy the visual manager and clean up
   */
  public destroy(): void {
    this.resetFolding()
    this.foldingStates.clear()
  }

  // Private helper methods

  private captureInitialStates(
    selectedItems: HTMLElement[],
    primaryItem: HTMLElement
  ): void {
    selectedItems.forEach((item) => {
      if (item === primaryItem) return

      this.foldingStates.set(item, {
        originalRect: item.getBoundingClientRect(),
        originalPosition: item.style.position || 'static',
        originalDisplay: item.style.display || 'block',
      })
    })
  }

  private async animateFolding(
    selectedItems: HTMLElement[],
    primaryItem: HTMLElement,
    targetRect: DOMRect
  ): Promise<void> {
    const animations: Promise<void>[] = []

    selectedItems.forEach((item) => {
      if (item === primaryItem) return

      // Position item absolutely and animate to target
      item.style.position = 'absolute'
      item.style.left = `${targetRect.left}px`
      item.style.top = `${targetRect.top}px`
      item.style.width = `${targetRect.width}px`
      item.style.height = `${targetRect.height}px`

      // Create custom folding animation
      const animation = new Promise<void>((resolve) => {
        item.style.transition = `transform 300ms ease-out, opacity 300ms ease-out`
        item.style.transform = 'scale(0.1)'
        item.style.opacity = '0.5'

        window.setTimeout(resolve, 300)
      })

      animations.push(animation)
    })

    await Promise.all(animations)
  }

  private hideFoldedItems(
    selectedItems: HTMLElement[],
    primaryItem: HTMLElement
  ): void {
    selectedItems.forEach((item) => {
      if (item !== primaryItem) {
        item.style.display = 'none'
      }
    })
  }

  private addSelectionCountIndicator(
    composite: HTMLElement,
    count: number
  ): void {
    const indicator = document.createElement('div')
    indicator.className = 'sortable-multidrag-count'
    indicator.textContent = count.toString()
    indicator.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background: #007acc;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      z-index: 1;
    `
    composite.appendChild(indicator)
  }

  private prepareCloneForComposite(
    clone: HTMLElement,
    index: number,
    totalVisible: number
  ): void {
    // Clean up clone
    clone.removeAttribute('id')
    clone.classList.remove('sortable-chosen', 'sortable-drag', 'sortable-ghost')

    // Style for stacked effect
    const offset = index * 2
    clone.style.cssText = `
      position: relative;
      top: ${offset}px;
      left: ${offset}px;
      transform: scale(${1 - index * 0.05});
      z-index: ${totalVisible - index};
      opacity: ${1 - index * 0.1};
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `
  }
}

/**
 * State information captured during folding
 * @internal
 */
interface FoldState {
  originalRect: DOMRect
  originalPosition: string
  originalDisplay: string
}
