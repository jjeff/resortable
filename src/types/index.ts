/**
 * @fileoverview Type definitions for Resortable library
 * @author Resortable Team
 * @since 2.0.0
 *
 * This file contains all the TypeScript type definitions used throughout
 * the Resortable library, providing excellent IntelliSense support.
 */

/**
 * Configuration options for Sortable instances
 *
 * @remarks
 * These options control the behavior and appearance of sortable lists.
 * Most options have sensible defaults and can be omitted for basic usage.
 *
 * @example Basic configuration
 * ```typescript
 * const options: SortableOptions = {
 *   animation: 150,
 *   ghostClass: 'my-ghost-class'
 * };
 * ```
 *
 * @example Advanced configuration
 * ```typescript
 * const options: SortableOptions = {
 *   group: {
 *     name: 'shared',
 *     pull: true,
 *     put: ['other-group']
 *   },
 *   multiDrag: true,
 *   selectedClass: 'selected',
 *   onEnd: (evt) => console.log('Drag ended', evt)
 * };
 * ```
 *
 * @public
 */
export interface SortableOptions {
  /**
   * CSS class applied to the ghost element during drag
   * @defaultValue 'sortable-ghost'
   *
   * @example
   * ```typescript
   * { ghostClass: 'my-ghost-style' }
   * ```
   */
  ghostClass?: string

  /**
   * CSS class applied to the chosen element when drag starts
   * @defaultValue 'sortable-chosen'
   */
  chosenClass?: string

  /**
   * CSS class applied to the dragging element
   * @defaultValue 'sortable-drag'
   */
  dragClass?: string

  /**
   * Animation duration in milliseconds. Set to 0 to disable animations.
   * @defaultValue 150
   */
  animation?: number

  /**
   * CSS easing function for animations
   * @defaultValue 'cubic-bezier(0.4, 0.0, 0.2, 1)'
   *
   * @example
   * ```typescript
   * { easing: 'ease-in-out' }
   * { easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' }
   * ```
   */
  easing?: string

  /**
   * Group name or configuration for sharing items between lists
   * @defaultValue 'default'
   *
   * @example Simple group name
   * ```typescript
   * { group: 'my-group' }
   * ```
   *
   * @example Advanced group configuration
   * ```typescript
   * {
   *   group: {
   *     name: 'shared',
   *     pull: 'clone',
   *     put: ['other-group']
   *   }
   * }
   * ```
   */
  group?: string | SortableGroup

  /**
   * Whether sorting is enabled within the list
   * @defaultValue true
   */
  sort?: boolean

  /**
   * Whether the sortable is disabled
   * @defaultValue false
   */
  disabled?: boolean

  /**
   * Enable multi-drag functionality
   * @defaultValue false
   */
  multiDrag?: boolean

  /**
   * CSS class for selected items in multi-drag mode
   * @defaultValue 'sortable-selected'
   */
  selectedClass?: string

  /**
   * Clear selection when clicking outside the sortable container
   * @defaultValue true
   */
  deselectOnClickOutside?: boolean

  /**
   * Callback fired when drag operation ends
   *
   * @param event - The sortable event containing drag details
   *
   * @example
   * ```typescript
   * {
   *   onEnd: (evt) => {
   *     console.log(`Moved from ${evt.oldIndex} to ${evt.newIndex}`);
   *     console.log('Item:', evt.item);
   *   }
   * }
   * ```
   */
  onEnd?: (event: SortableEvent) => void

  /**
   * Callback fired when drag operation starts
   * @param event - The sortable event
   */
  onStart?: (event: SortableEvent) => void

  /**
   * Callback fired when an item is added from another list
   * @param event - The sortable event
   */
  onAdd?: (event: SortableEvent) => void

  /**
   * Callback fired when sorting changes within the same list
   * @param event - The sortable event
   */
  onUpdate?: (event: SortableEvent) => void

  /**
   * Callback fired when an item is removed to another list
   * @param event - The sortable event
   */
  onRemove?: (event: SortableEvent) => void

  /**
   * Enable accessibility features (keyboard navigation, ARIA attributes)
   * @defaultValue true
   */
  enableAccessibility?: boolean

  /**
   * CSS class for focused items during keyboard navigation
   * @defaultValue 'sortable-focused'
   */
  focusClass?: string

  /**
   * Callback fired when items are selected/deselected
   * @param event - The sortable event
   */
  onSelect?: (event: Partial<SortableEvent>) => void

  /**
   * CSS selector for drag handle
   * When specified, drag can only be initiated from matching elements
   * @defaultValue undefined
   *
   * @example
   * ```typescript
   * // Only allow dragging from elements with class 'drag-handle'
   * { handle: '.drag-handle' }
   *
   * // Multiple handles using a more complex selector
   * { handle: '.drag-handle, .drag-icon' }
   * ```
   */
  handle?: string

  /**
   * CSS selector for elements that should not trigger drag
   * @defaultValue undefined
   *
   * @example
   * ```typescript
   * // Prevent dragging when clicking on input elements
   * { filter: 'input, textarea, button' }
   * ```
   */
  filter?: string

  /**
   * Callback fired when a filtered element is clicked
   * @param event - The original mouse/touch event
   */
  onFilter?: (event: Event) => void

  /**
   * CSS selector for draggable items
   * @defaultValue '.sortable-item'
   *
   * @example
   * ```typescript
   * // Only allow specific items to be draggable
   * { draggable: '.draggable-item' }
   * ```
   */
  draggable?: string

  /**
   * Delay in milliseconds before drag starts
   * @defaultValue 0
   *
   * @example
   * ```typescript
   * // 300ms delay before drag starts
   * { delay: 300 }
   * ```
   */
  delay?: number

  /**
   * Delay on touch devices (fallback to `delay` if not specified)
   * @defaultValue delay || 0
   *
   * @example
   * ```typescript
   * // Different delays for mouse and touch
   * { delay: 0, delayOnTouchOnly: 300 }
   * ```
   */
  delayOnTouchOnly?: number

  /**
   * Pixels of movement allowed before cancelling delayed drag event
   * @defaultValue 5
   *
   * @example
   * ```typescript
   * // Allow 10px of movement before cancelling delayed drag
   * { touchStartThreshold: 10 }
   * ```
   */
  touchStartThreshold?: number

  /**
   * Threshold of the swap zone (0-1)
   * @defaultValue 1
   *
   * @example
   * ```typescript
   * // Swap when dragged element overlaps 50% with target
   * { swapThreshold: 0.5 }
   * ```
   */
  swapThreshold?: number

  /**
   * Inverts the swap threshold behavior
   * @defaultValue false
   *
   * @example
   * ```typescript
   * // Invert swap behavior for drop zones
   * { invertSwap: true }
   * ```
   */
  invertSwap?: boolean

  /**
   * Threshold when swap is inverted (0-1)
   * @defaultValue swapThreshold
   *
   * @example
   * ```typescript
   * // Different threshold when inverted
   * { invertedSwapThreshold: 0.3 }
   * ```
   */
  invertedSwapThreshold?: number

  /**
   * Direction of sortable ('vertical' or 'horizontal')
   * @defaultValue 'vertical'
   *
   * @example
   * ```typescript
   * // Horizontal sorting for image gallery
   * { direction: 'horizontal' }
   * ```
   */
  direction?: 'vertical' | 'horizontal'

  /**
   * Enable fallback for browsers without native drag support
   * @defaultValue true
   *
   * @example
   * ```typescript
   * // Disable fallback to use native HTML5 drag only
   * { forceFallback: false }
   * ```
   */
  forceFallback?: boolean

  /**
   * CSS class for fallback ghost element
   * @defaultValue 'sortable-fallback'
   */
  fallbackClass?: string

  /**
   * Use fallback on touch devices
   * @defaultValue false
   */
  fallbackOnBody?: boolean

  /**
   * Fallback tolerance in pixels
   * @defaultValue 0
   */
  fallbackTolerance?: number

  /**
   * X-axis offset for fallback ghost
   * @defaultValue 0
   */
  fallbackOffsetX?: number

  /**
   * Y-axis offset for fallback ghost
   * @defaultValue 0
   */
  fallbackOffsetY?: number

  /**
   * Allow dragover event to bubble
   * @defaultValue false
   */
  dragoverBubble?: boolean

  /**
   * Remove clone element when it's not showing
   * @defaultValue true
   */
  removeCloneOnHide?: boolean

  /**
   * Distance mouse must move from empty sortable to insert drag element into it
   * @defaultValue 5
   */
  emptyInsertThreshold?: number

  /**
   * Call preventDefault when filter is triggered
   * @defaultValue true
   */
  preventOnFilter?: boolean

  /**
   * HTML attribute used to track element IDs
   * @defaultValue 'data-id'
   */
  dataIdAttr?: string

  /**
   * Callback fired when an element is chosen
   * @param event - The sortable event
   */
  onChoose?: (event: SortableEvent) => void

  /**
   * Callback fired when an element is unchosen
   * @param event - The sortable event
   */
  onUnchoose?: (event: SortableEvent) => void

  /**
   * Callback fired when sorting changes
   * @param event - The sortable event
   */
  onSort?: (event: SortableEvent) => void

  /**
   * Callback fired during move operations
   * @param event - The move event with related element
   * @param originalEvent - The original drag event
   * @returns false to cancel move
   */
  onMove?: (event: MoveEvent, originalEvent: Event) => boolean | void

  /**
   * Callback fired when an element is cloned
   * @param event - The sortable event with clone
   */
  onClone?: (event: SortableEvent) => void

  /**
   * Callback fired when the sort order has changed
   * @param event - The sortable event
   */
  onChange?: (event: SortableEvent) => void
}

/**
 * Group configuration for sharing items between sortable lists
 *
 * @remarks
 * Groups allow you to drag items between different sortable lists.
 * You can control which lists can give/receive items and whether
 * items are moved or cloned.
 *
 * @example
 * ```typescript
 * const group: SortableGroup = {
 *   name: 'shared-list',
 *   pull: 'clone',  // Clone items when dragging out
 *   put: true       // Accept items from other lists
 * };
 * ```
 *
 * @public
 */
export interface SortableGroup {
  /**
   * Name of the group
   */
  name: string

  /**
   * Whether items can be dragged out of this list
   * - `true`: Items can be moved out
   * - `false`: Items cannot be dragged out
   * - `'clone'`: Items are cloned when dragged out
   * - `string[]`: Array of group names that can receive items
   */
  pull?: boolean | 'clone' | string[]

  /**
   * Whether items can be dragged into this list
   * - `true`: Accept items from any group
   * - `false`: Don't accept items from other lists
   * - `string[]`: Array of group names to accept items from
   */
  put?: boolean | string[]

  /**
   * Revert cloned element to initial position after moving to another list
   * @defaultValue false
   */
  revertClone?: boolean
}

/**
 * Event object passed to Sortable event callbacks
 *
 * @remarks
 * This object contains information about the drag operation,
 * including the affected elements and their positions.
 *
 * @public
 */
export interface SortableEvent {
  /**
   * The dragged element
   */
  item: HTMLElement

  /**
   * The list that the element was dragged to
   */
  to: HTMLElement

  /**
   * The list that the element was dragged from
   */
  from: HTMLElement

  /**
   * Old index of the element (before drag)
   * @remarks May be undefined for add/remove operations
   */
  oldIndex?: number

  /**
   * New index of the element (after drag)
   * @remarks May be undefined for add/remove operations
   */
  newIndex?: number

  /**
   * Old index among draggable elements only
   * @remarks Excludes non-draggable items from count
   */
  oldDraggableIndex?: number

  /**
   * New index among draggable elements only
   * @remarks Excludes non-draggable items from count
   */
  newDraggableIndex?: number

  /**
   * Cloned element (when using group.pull: 'clone')
   * @remarks Only present in clone operations
   */
  clone?: HTMLElement

  /**
   * Pull mode used for this operation
   * @remarks
   * - `'clone'` when cloning
   * - `'move'` or `true` when moving
   * - `false` or undefined for same-list operations
   */
  pullMode?: boolean | 'clone' | 'move'

  /**
   * Array of selected elements (multi-drag mode)
   */
  items: HTMLElement[]
}

/**
 * Move event object passed to onMove callback
 *
 * @remarks
 * This event provides information about move operations during drag,
 * allowing you to control whether the move should be allowed.
 *
 * @public
 */
export interface MoveEvent extends SortableEvent {
  /**
   * Element being dragged over
   */
  related: HTMLElement

  /**
   * Whether the move will result in a swap
   */
  willInsertAfter?: boolean

  /**
   * The target list element
   */
  draggedRect?: DOMRect

  /**
   * The target element's rectangle
   */
  targetRect?: DOMRect

  /**
   * The related element's rectangle
   */
  relatedRect?: DOMRect
}

/**
 * Plugin interface for extending Sortable functionality
 *
 * @remarks
 * Plugins allow you to extend Sortable with additional features
 * like auto-scroll, swap mode, or custom behaviors.
 *
 * @example
 * ```typescript
 * class MyPlugin implements SortablePlugin {
 *   name = 'my-plugin';
 *   version = '1.0.0';
 *
 *   install(sortable: Sortable): void {
 *     // Plugin initialization code
 *   }
 *
 *   uninstall(sortable: Sortable): void {
 *     // Plugin cleanup code
 *   }
 * }
 * ```
 *
 * @public
 */
/**
 * Selection manager interface for type safety
 * @public
 */
export interface SelectionManagerInterface {
  readonly selectedElements: Set<HTMLElement>
  select(item: HTMLElement, addToSelection?: boolean): void
  deselect(item: HTMLElement): void
  isSelected(item: HTMLElement): boolean
  clearSelection(): void
}

/**
 * Drag manager interface for type safety in plugins
 * @public
 */
export interface DragManagerInterface {
  readonly isDragging: boolean
  // selectionManager is always available in DragManager implementation
  readonly selectionManager: SelectionManagerInterface
}

/**
 * Event system interface for type safety
 * @public
 */
export interface EventSystemInterface {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Event system needs flexible handler types for compatibility with plugins
  on(event: string, handler: (...args: any[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Event system needs flexible handler types for compatibility with plugins
  off(event: string, handler?: (...args: any[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Event system needs flexible handler types for compatibility with plugins
  emit(event: string, ...args: any[]): void
}

/**
 * Type alias for Sortable instance used in plugins to avoid circular dependencies
 * @public
 */
export interface SortableInstance {
  /** The DOM element that this Sortable instance is bound to */
  readonly element: HTMLElement
  /** Current configuration options for this Sortable instance */
  readonly options: SortableOptions
  /** Event system for this instance */
  readonly eventSystem: EventSystemInterface
  /** Drag manager for this instance */
  dragManager?: DragManagerInterface
  /** Allow additional properties for plugin-specific extensions - justified for plugin extensibility */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface SortablePlugin {
  /**
   * Plugin name (must be unique)
   */
  readonly name: string

  /**
   * Plugin version
   */
  readonly version: string

  /**
   * Install the plugin on a Sortable instance
   * @param sortable - The sortable instance to install on
   */
  install(sortable: SortableInstance): void

  /**
   * Uninstall the plugin from a Sortable instance
   * @param sortable - The sortable instance to uninstall from
   */
  uninstall(sortable: SortableInstance): void
}

/**
 * Utility type for deep partial objects
 * @internal
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Element selector type - can be string selector or HTMLElement
 * @public
 */
export type ElementSelector = string | HTMLElement

/**
 * Mapping of event names to event payloads
 * @public
 */
export interface SortableEvents {
  /** Fired when drag starts */
  start: SortableEvent
  /** Fired when an item is chosen for dragging */
  choose: SortableEvent
  /** Fired when an item is unchosen (drag cancelled) */
  unchoose: SortableEvent
  /** Fired when an item is moved during drag */
  update: SortableEvent
  /** Fired when sorting changes */
  sort: SortableEvent
  /** Fired when drag ends */
  end: SortableEvent
  /** Fired on the list receiving an item from another list */
  add: SortableEvent
  /** Fired on the list an item is dragged from when moved to another list */
  remove: SortableEvent
  /** Fired when items are selected or deselected */
  select: Partial<SortableEvent>
  /** Fired during move operations */
  move: MoveEvent
  /** Fired when an item is cloned */
  clone: SortableEvent
  /** Fired when the sort order has changed */
  change: SortableEvent
  /** Allow additional custom events */
  [key: string]: unknown
}
