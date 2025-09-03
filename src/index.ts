/**
 * @fileoverview Resortable - Modern TypeScript rewrite of Sortable.js
 * @author Jeff Robbins
 * @version 2.0.0-alpha.1
 * @since 2.0.0
 *
 * @example Basic Usage
 * ```typescript
 * import { Sortable } from 'resortable';
 *
 * const sortable = new Sortable(document.getElementById('my-list'), {
 *   animation: 150,
 *   ghostClass: 'sortable-ghost',
 *   chosenClass: 'sortable-chosen'
 * });
 * ```
 *
 * @example Advanced Configuration
 * ```typescript
 * import { Sortable, SortableOptions } from 'resortable';
 *
 * const options: SortableOptions = {
 *   group: 'shared',
 *   animation: 300,
 *   multiDrag: true,
 *   onEnd: (event) => {
 *     console.log('Drag ended:', event);
 *   }
 * };
 *
 * const sortable = new Sortable(element, options);
 * ```
 */

export * from './types/index.js'
import { DragManager } from './core/DragManager.js'
import { DropZone } from './core/DropZone.js'
import { EventSystem } from './core/EventSystem.js'
import { SortableOptions, type SortableEvents } from './types/index.js'
import { toArray as domToArray } from './utils/dom.js'

/**
 * @beta
 * Main Sortable class for creating drag-and-drop sortable lists
 *
 * @remarks
 * This is the main entry point for the Resortable library. It provides a modern,
 * TypeScript-first approach to creating sortable drag-and-drop interfaces.
 *
 * Unlike the original Sortable.js, this version:
 * - Uses modern ES modules
 * - Provides full TypeScript support
 * - Implements a plugin-based architecture
 * - Uses modern DOM APIs
 *
 * @example Creating a basic sortable list
 * ```typescript
 * const sortable = new Sortable(document.getElementById('items'), {
 *   animation: 150,
 *   onEnd: (evt) => {
 *     console.log(`Item moved from ${evt.oldIndex} to ${evt.newIndex}`);
 *   }
 * });
 * ```
 *
 * @public
 */
export class Sortable {
  /**
   * The DOM element that this Sortable instance is bound to
   * @readonly
   */
  public readonly element: HTMLElement

  /**
   * Current configuration options for this Sortable instance
   * @readonly
   */
  public readonly options: SortableOptions

  private dropZone: DropZone
  private dragManager: DragManager
  private eventSystem: EventSystem<SortableEvents>

  /**
   * Creates a new Sortable instance
   *
   * @param element - The DOM element to make sortable
   * @param options - Configuration options for the sortable behavior
   *
   * @throws {@link SortableError}
   * When the provided element is invalid or options are malformed
   *
   * @example
   * ```typescript
   * // Basic usage
   * const sortable = new Sortable(document.getElementById('list'));
   *
   * // With options
   * const sortable = new Sortable(element, {
   *   animation: 150,
   *   ghostClass: 'ghost',
   *   chosenClass: 'chosen'
   * });
   * ```
   */
  constructor(element: HTMLElement, options: Partial<SortableOptions> = {}) {
    if (!element || !(element instanceof HTMLElement)) {
      throw new SortableError(
        'Invalid element provided to Sortable constructor'
      )
    }

    this.element = element
    this.options = { ...defaultOptions, ...options }

    this.dropZone = new DropZone(this.element)
    this.eventSystem = new EventSystem<SortableEvents>()
    const groupName = resolveGroupName(this.options.group)
    this.dragManager = new DragManager(
      this.dropZone,
      this.eventSystem,
      groupName,
      {
        enableAccessibility: this.options.enableAccessibility,
        multiSelect: this.options.multiDrag,
        selectedClass: this.options.selectedClass,
        focusClass: this.options.focusClass
      }
    )
    this.dragManager.attach()

    if (this.options.onStart) {
      this.eventSystem.on('start', this.options.onStart)
    }
    if (this.options.onUpdate) {
      this.eventSystem.on('update', this.options.onUpdate)
    }
    if (this.options.onEnd) {
      this.eventSystem.on('end', this.options.onEnd)
    }
    if (this.options.onAdd) {
      this.eventSystem.on('add', this.options.onAdd)
    }
    if (this.options.onRemove) {
      this.eventSystem.on('remove', this.options.onRemove)
    }
    if (this.options.onSelect) {
      this.eventSystem.on('select', this.options.onSelect as any)
    }
  }

  /**
   * Destroys the Sortable instance and removes all event listeners
   *
   * @remarks
   * After calling this method, the Sortable instance should not be used.
   * All event listeners will be removed and the element will no longer be sortable.
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element);
   * // ... use sortable ...
   * sortable.destroy(); // Clean up when done
   * ```
   *
   * @public
   */
  public destroy(): void {
    this.dragManager.detach()
  }

  /**
   * Gets the current order of elements as an array of data-id attributes
   *
   * @returns Array of string IDs representing the current order
   *
   * @remarks
   * This method reads the `data-id` attribute from each sortable item.
   * If an item doesn't have a `data-id` attribute, its index will be used.
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element);
   * const order = sortable.toArray();
   * console.log('Current order:', order); // ['item-1', 'item-2', 'item-3']
   * ```
   *
   * @public
   */
  public toArray(): string[] {
    return domToArray(this.element)
  }
}

/**
 * Custom error class for Sortable-specific errors
 *
 * @public
 */
export class SortableError extends Error {
  /**
   * Optional underlying cause of the error
   */
  public cause?: Error

  /**
   * Creates a new SortableError
   * @param message - Error message
   * @param cause - Optional underlying cause of the error
   */
  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'SortableError'
    this.cause = cause
  }
}

/**
 * Default configuration options for Sortable instances
 * @internal
 */
const defaultOptions: SortableOptions = {
  animation: 150,
  ghostClass: 'sortable-ghost',
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag',
  group: 'default',
  sort: true,
  disabled: false,
  multiDrag: false,
  enableAccessibility: true,
  selectedClass: 'sortable-selected',
  focusClass: 'sortable-focused',
}

/** Resolve the group name from group option */
function resolveGroupName(group: SortableOptions['group']): string {
  if (!group) return 'default'
  if (typeof group === 'string') return group
  return group.name || 'default'
}
