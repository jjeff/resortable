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
   * Animation duration in milliseconds when sorting
   * @defaultValue 150
   *
   * @example
   * ```typescript
   * // Smooth 300ms animation
   * { animation: 300 }
   *
   * // No animation
   * { animation: 0 }
   * ```
   */
  animation?: number

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
   * - `true` when moving
   * - `false` or undefined for same-list operations
   */
  pullMode?: boolean | 'clone'

  /**
   * Array of selected elements (multi-drag mode)
   */
  items: HTMLElement[]
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
  install(sortable: unknown): void // Using unknown to avoid circular dependency

  /**
   * Uninstall the plugin from a Sortable instance
   * @param sortable - The sortable instance to uninstall from
   */
  uninstall(sortable: unknown): void // Using unknown to avoid circular dependency
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
  /** Fired when an item is moved during drag */
  update: SortableEvent
  /** Fired when drag ends */
  end: SortableEvent
  /** Fired on the list receiving an item from another list */
  add: SortableEvent
  /** Fired on the list an item is dragged from when moved to another list */
  remove: SortableEvent
  /** Fired when items are selected or deselected */
  select: Partial<SortableEvent>
  /** Allow additional custom events */
  [key: string]: unknown
}
