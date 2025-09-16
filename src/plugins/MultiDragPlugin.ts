/**
 * @fileoverview MultiDrag plugin for dragging multiple selected items
 * @author Resortable Team
 * @since 2.0.0
 */

import { SortablePlugin, SortableInstance } from '../types/index.js'

/**
 * Configuration options for the MultiDrag plugin
 */
export interface MultiDragOptions {
  /**
   * CSS class for selected items
   * @defaultValue 'sortable-selected'
   */
  selectedClass?: string

  /**
   * Maximum number of items that can be selected
   * @defaultValue Infinity
   */
  maxSelections?: number

  /**
   * Enable automatic selection on drag start
   * @defaultValue true
   */
  autoSelect?: boolean

  /**
   * Key modifier required for multi-selection
   * @defaultValue 'ctrlKey'
   */
  multiSelectKey?: 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'

  /**
   * Allow range selection with shift+click
   * @defaultValue true
   */
  allowRangeSelection?: boolean
}

/**
 * MultiDrag plugin for selecting and dragging multiple items
 *
 * @remarks
 * This plugin extends the core selection functionality to support
 * dragging multiple selected items as a group. It integrates with
 * the existing SelectionManager and provides visual feedback.
 *
 * @example Basic usage
 * ```typescript
 * import { PluginSystem, MultiDragPlugin } from 'resortable';
 *
 * // Register the plugin
 * PluginSystem.register(MultiDragPlugin.create());
 *
 * // Install on sortable with multi-drag enabled
 * const sortable = new Sortable(element, { multiDrag: true });
 * PluginSystem.install(sortable, 'MultiDrag');
 * ```
 *
 * @example With custom options
 * ```typescript
 * PluginSystem.register(MultiDragPlugin.create({
 *   maxSelections: 5,
 *   multiSelectKey: 'metaKey'
 * }));
 * ```
 *
 * @public
 */
export class MultiDragPlugin implements SortablePlugin {
  public readonly name = 'MultiDrag'
  public readonly version = '2.0.0'

  private options: Required<MultiDragOptions>
  private lastSelected = new WeakMap<object, HTMLElement | null>()

  /**
   * Create a MultiDrag plugin instance
   *
   * @param options - Configuration options for multi-drag behavior
   * @returns MultiDragPlugin instance
   */
  public static create(options: MultiDragOptions = {}): MultiDragPlugin {
    return new MultiDragPlugin(options)
  }

  constructor(options: MultiDragOptions = {}) {
    this.options = {
      selectedClass: 'sortable-selected',
      maxSelections: Infinity,
      autoSelect: true,
      multiSelectKey: 'ctrlKey',
      allowRangeSelection: true,
      ...options,
    }
  }

  /**
   * Install the plugin on a Sortable instance
   */
  public install(sortable: SortableInstance): void {
    // Only install if multiDrag is enabled
    if (!sortable.options.multiDrag) {
      console.warn('MultiDrag plugin requires multiDrag option to be enabled')
      return
    }

    // Enhance selection behavior
    this.enhanceSelectionManager(sortable)

    // Listen for drag events to handle multi-item dragging
    sortable.eventSystem.on('start', this.handleDragStart.bind(this, sortable))
    sortable.eventSystem.on('end', this.handleDragEnd.bind(this, sortable))

    // Add click handling for multi-selection
    this.attachClickHandlers(sortable)
  }

  /**
   * Uninstall the plugin from a Sortable instance
   */
  public uninstall(sortable: SortableInstance): void {
    // Remove click handlers
    this.detachClickHandlers(sortable)

    // Clean up last selected tracking
    this.lastSelected.delete(sortable)
  }

  /**
   * Enhance the existing SelectionManager with multi-drag features
   */
  private enhanceSelectionManager(sortable: SortableInstance): void {
    const selectionManager = sortable.dragManager?.selectionManager
    if (!selectionManager) {
      return
    }

    // Override selection limits
    const originalSelect = selectionManager.select.bind(selectionManager)
    selectionManager.select = (
      element: HTMLElement,
      addToSelection = false
    ) => {
      // Check selection limit
      if (
        !addToSelection ||
        selectionManager.selectedElements.size < this.options.maxSelections
      ) {
        return originalSelect(element, addToSelection)
      }
      return false
    }

    // Store reference for cleanup
    ;(sortable as any)._multiDragEnhanced = true
  }

  /**
   * Attach click handlers for multi-selection
   */
  private attachClickHandlers(sortable: SortableInstance): void {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const draggableItem = this.findDraggableItem(sortable, target)

      if (!draggableItem) {
        return
      }

      const selectionManager = sortable.dragManager?.selectionManager
      if (!selectionManager) {
        return
      }

      // Handle different selection modes
      if (event[this.options.multiSelectKey]) {
        // Multi-select mode (Ctrl/Cmd + click)
        this.handleMultiSelect(selectionManager, draggableItem)
      } else if (this.options.allowRangeSelection && event.shiftKey) {
        // Range selection mode (Shift + click)
        this.handleRangeSelect(sortable, selectionManager, draggableItem)
      } else {
        // Single select mode
        selectionManager.select(draggableItem, false)
        this.lastSelected.set(sortable, draggableItem)
      }
    }

    // Store handler for cleanup
    ;(sortable as any)._multiDragClickHandler = handleClick
    sortable.element.addEventListener('click', handleClick)
  }

  /**
   * Detach click handlers
   */
  private detachClickHandlers(sortable: SortableInstance): void {
    const sortableAny = sortable as any
    if (sortableAny._multiDragClickHandler) {
      sortable.element.removeEventListener(
        'click',
        sortableAny._multiDragClickHandler
      )
      delete sortableAny._multiDragClickHandler
    }
  }

  /**
   * Handle multi-select (Ctrl/Cmd + click)
   */
  private handleMultiSelect(selectionManager: any, element: HTMLElement): void {
    if (selectionManager.isSelected(element)) {
      // Deselect if already selected
      selectionManager.deselect(element)
    } else {
      // Add to selection
      selectionManager.select(element, true)
    }
  }

  /**
   * Handle range selection (Shift + click)
   */
  private handleRangeSelect(
    sortable: SortableInstance,
    selectionManager: any,
    element: HTMLElement
  ): void {
    const lastSelected = this.lastSelected.get(sortable)
    if (!lastSelected) {
      // No previous selection, just select this element
      selectionManager.select(element, false)
      this.lastSelected.set(sortable, element)
      return
    }

    // Find all draggable items
    const draggableItems = this.getDraggableItems(sortable)
    const startIndex = draggableItems.indexOf(lastSelected)
    const endIndex = draggableItems.indexOf(element)

    if (startIndex === -1 || endIndex === -1) {
      return
    }

    // Select range
    const start = Math.min(startIndex, endIndex)
    const end = Math.max(startIndex, endIndex)

    // Clear current selection
    selectionManager.clearSelection()

    // Select range
    for (
      let i = start;
      i <= end &&
      selectionManager.selectedElements.size < this.options.maxSelections;
      i++
    ) {
      selectionManager.select(draggableItems[i], true)
    }
  }

  /**
   * Handle drag start for multi-item dragging
   */
  private handleDragStart(sortable: SortableInstance, event: any): void {
    const selectionManager = sortable.dragManager?.selectionManager
    if (!selectionManager) {
      return
    }

    // Auto-select the dragged item if not already selected
    if (this.options.autoSelect && !selectionManager.isSelected(event.item)) {
      selectionManager.select(event.item, false)
    }

    // Update visual feedback for all selected items
    this.updateDragVisuals(selectionManager, true)
  }

  /**
   * Handle drag end for multi-item dragging
   */
  private handleDragEnd(sortable: SortableInstance): void {
    const selectionManager = sortable.dragManager?.selectionManager
    if (!selectionManager) {
      return
    }

    // Remove drag visuals
    this.updateDragVisuals(selectionManager, false)
  }

  /**
   * Update visual feedback for dragging
   */
  private updateDragVisuals(selectionManager: any, isDragging: boolean): void {
    const className = isDragging ? 'sortable-multi-drag' : ''

    selectionManager.selectedElements.forEach((element: HTMLElement) => {
      if (isDragging) {
        element.classList.add(className)
      } else {
        element.classList.remove(className)
      }
    })
  }

  /**
   * Find the draggable item for a given element
   */
  private findDraggableItem(
    sortable: SortableInstance,
    element: HTMLElement
  ): HTMLElement | null {
    const draggableSelector = sortable.options.draggable || '.sortable-item'

    // Check if element itself is draggable
    if (element.matches(draggableSelector)) {
      return element
    }

    // Check if element is inside a draggable item
    return element.closest(draggableSelector)
  }

  /**
   * Get all draggable items in the sortable
   */
  private getDraggableItems(sortable: SortableInstance): HTMLElement[] {
    const draggableSelector = sortable.options.draggable || '.sortable-item'
    return Array.from(sortable.element.querySelectorAll(draggableSelector))
  }
}
