import { SortableEvent } from '../types/index.js'
import { SortableEventSystem } from './EventSystem.js'

/**
 * Manages selection state for sortable items
 * Supports single and multi-select operations
 * @internal
 */
export class SelectionManager {
  private selectedItems = new Set<HTMLElement>()
  private lastSelectedItem: HTMLElement | null = null
  private selectedClass: string
  private focusedItem: HTMLElement | null = null
  private focusClass: string

  constructor(
    private container: HTMLElement,
    private events: SortableEventSystem,
    options?: {
      selectedClass?: string
      focusClass?: string
      multiSelect?: boolean
    }
  ) {
    this.selectedClass = options?.selectedClass || 'sortable-selected'
    this.focusClass = options?.focusClass || 'sortable-focused'
  }

  /**
   * Select an item (optionally adding to existing selection)
   */
  public select(item: HTMLElement, addToSelection = false): void {
    if (!this.isValidItem(item)) return

    if (!addToSelection) {
      this.clearSelection()
    }

    this.selectedItems.add(item)
    item.classList.add(this.selectedClass)
    item.setAttribute('aria-selected', 'true')
    this.lastSelectedItem = item

    this.emitSelectionEvent()
  }

  /**
   * Toggle selection of an item
   */
  public toggle(item: HTMLElement): void {
    if (!this.isValidItem(item)) return

    if (this.selectedItems.has(item)) {
      this.deselect(item)
    } else {
      this.select(item, true)
    }
  }

  /**
   * Deselect an item
   */
  public deselect(item: HTMLElement): void {
    this.selectedItems.delete(item)
    item.classList.remove(this.selectedClass)
    item.setAttribute('aria-selected', 'false')

    if (this.lastSelectedItem === item) {
      this.lastSelectedItem = this.selectedItems.size > 0
        ? Array.from(this.selectedItems)[this.selectedItems.size - 1]
        : null
    }

    this.emitSelectionEvent()
  }

  /**
   * Select a range of items (for Shift+Click functionality)
   */
  public selectRange(from: HTMLElement, to: HTMLElement): void {
    if (!this.isValidItem(from) || !this.isValidItem(to)) return

    const items = this.getSortableItems()
    const fromIndex = items.indexOf(from)
    const toIndex = items.indexOf(to)

    if (fromIndex === -1 || toIndex === -1) return

    const startIndex = Math.min(fromIndex, toIndex)
    const endIndex = Math.max(fromIndex, toIndex)

    this.clearSelection()
    for (let i = startIndex; i <= endIndex; i++) {
      this.select(items[i], true)
    }
  }

  /**
   * Clear all selections
   */
  public clearSelection(): void {
    this.selectedItems.forEach(item => {
      item.classList.remove(this.selectedClass)
      item.setAttribute('aria-selected', 'false')
    })
    this.selectedItems.clear()
    this.lastSelectedItem = null
    this.emitSelectionEvent()
  }

  /**
   * Get all selected items
   */
  public getSelected(): HTMLElement[] {
    return Array.from(this.selectedItems)
  }

  /**
   * Check if an item is selected
   */
  public isSelected(item: HTMLElement): boolean {
    return this.selectedItems.has(item)
  }

  /**
   * Get the count of selected items
   */
  public getSelectedCount(): number {
    return this.selectedItems.size
  }

  /**
   * Set focus to an item (for keyboard navigation)
   */
  public setFocus(item: HTMLElement | null): void {
    // Remove focus from previous item
    if (this.focusedItem) {
      this.focusedItem.classList.remove(this.focusClass)
      this.focusedItem.setAttribute('tabindex', '-1')
    }

    // Set focus to new item
    if (item && this.isValidItem(item)) {
      this.focusedItem = item
      item.classList.add(this.focusClass)
      item.setAttribute('tabindex', '0')
      item.focus()
    } else {
      this.focusedItem = null
    }
  }

  /**
   * Get the currently focused item
   */
  public getFocused(): HTMLElement | null {
    return this.focusedItem
  }

  /**
   * Get the last selected item
   */
  public getLastSelected(): HTMLElement | null {
    return this.lastSelectedItem
  }

  /**
   * Clear focus from all items
   */
  public clearFocus(): void {
    if (this.focusedItem) {
      this.focusedItem.classList.remove(this.focusClass)
      this.focusedItem.setAttribute('tabindex', '-1')
      this.focusedItem = null
    }
  }

  /**
   * Move focus to the next item
   */
  public focusNext(): void {
    const items = this.getSortableItems()
    if (items.length === 0) return

    const currentIndex = this.focusedItem ? items.indexOf(this.focusedItem) : -1
    const nextIndex = (currentIndex + 1) % items.length
    this.setFocus(items[nextIndex])
  }

  /**
   * Move focus to the previous item
   */
  public focusPrevious(): void {
    const items = this.getSortableItems()
    if (items.length === 0) return

    const currentIndex = this.focusedItem ? items.indexOf(this.focusedItem) : 0
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
    this.setFocus(items[prevIndex])
  }

  /**
   * Get all sortable items in the container
   */
  private getSortableItems(): HTMLElement[] {
    return Array.from(this.container.querySelectorAll('.sortable-item'))
  }

  /**
   * Check if an item is a valid sortable item
   */
  private isValidItem(item: HTMLElement): boolean {
    return item.classList.contains('sortable-item') && 
           this.container.contains(item)
  }

  /**
   * Emit a selection change event
   */
  private emitSelectionEvent(): void {
    const selected = this.getSelected()
    const event: Partial<SortableEvent> = {
      items: selected,
      item: selected[0] || null as any,
    }
    this.events.emit('select', event)
  }


  /**
   * Cleanup and remove all event listeners
   */
  public destroy(): void {
    this.clearSelection()
    this.setFocus(null)
  }
}