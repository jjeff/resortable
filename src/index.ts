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
import { AnimationManager } from './animation/AnimationManager.js'
import { DragManager } from './core/DragManager.js'
import { DropZone } from './core/DropZone.js'
import { EventSystem } from './core/EventSystem.js'
import { PluginSystem } from './core/PluginSystem.js'
import { SortableOptions, type SortableEvents } from './types/index.js'
import { toArray as domToArray } from './utils/dom.js'

// Export PluginSystem
export { PluginSystem }

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
   * WeakMap to track Sortable instances by their elements
   * @internal
   */
  private static instances = new WeakMap<HTMLElement, Sortable>()

  /**
   * The currently active Sortable instance (if any drag is in progress)
   * @readonly
   */
  public static active: Sortable | null = null

  /**
   * The currently dragged element (if any)
   * @readonly
   */
  public static dragged: HTMLElement | null = null

  /**
   * Finds the closest Sortable instance to a given element
   *
   * @param element - The element to start searching from
   * @param selector - Optional CSS selector to filter parent elements
   * @returns The closest Sortable instance, or null if none found
   *
   * @example
   * ```typescript
   * const sortable = Sortable.closest(draggedElement);
   * if (sortable) {
   *   console.log('Found sortable:', sortable);
   * }
   * ```
   *
   * @example With selector
   * ```typescript
   * const sortable = Sortable.closest(element, '.sortable-container');
   * ```
   *
   * @public
   */
  public static closest(
    element: HTMLElement,
    selector?: string
  ): Sortable | null {
    if (!element) return null

    let current: HTMLElement | null = element
    while (current) {
      // Check if current element matches selector (if provided)
      if (selector && !current.matches(selector)) {
        current = current.parentElement
        continue
      }

      // Check if current element has a Sortable instance
      const sortable = Sortable.instances.get(current)
      if (sortable) {
        return sortable
      }

      current = current.parentElement
    }

    return null
  }
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

  public readonly dropZone: DropZone
  public dragManager: DragManager // Made non-readonly to allow replacement
  public readonly eventSystem: EventSystem<SortableEvents>
  private animationManager: AnimationManager

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

    // Track this instance
    Sortable.instances.set(element, this)

    // Create animation manager first
    this.animationManager = new AnimationManager({
      animation: this.options.animation,
      easing: this.options.easing,
    })

    // Pass animation manager to DropZone
    this.dropZone = new DropZone(this.element, this.animationManager)
    this.eventSystem = new EventSystem<SortableEvents>()
    this.dragManager = new DragManager(
      this.dropZone,
      this.eventSystem,
      this.options.group,
      {
        enableAccessibility: this.options.enableAccessibility,
        multiSelect: this.options.multiDrag,
        selectedClass: this.options.selectedClass,
        focusClass: this.options.focusClass,
        handle: this.options.handle,
        filter: this.options.filter,
        onFilter: this.options.onFilter,
        draggable: this.options.draggable,
        delay: this.options.delay,
        delayOnTouchOnly: this.options.delayOnTouchOnly,
        touchStartThreshold: this.options.touchStartThreshold,
        swapThreshold: this.options.swapThreshold,
        invertSwap: this.options.invertSwap,
        invertedSwapThreshold: this.options.invertedSwapThreshold,
        direction: this.options.direction,
        forceFallback: this.options.forceFallback,
        fallbackClass: this.options.fallbackClass,
        fallbackOnBody: this.options.fallbackOnBody,
        fallbackTolerance: this.options.fallbackTolerance,
        fallbackOffsetX: this.options.fallbackOffsetX,
        fallbackOffsetY: this.options.fallbackOffsetY,
        dragoverBubble: this.options.dragoverBubble,
        removeCloneOnHide: this.options.removeCloneOnHide,
        emptyInsertThreshold: this.options.emptyInsertThreshold,
        preventOnFilter: this.options.preventOnFilter,
        dataIdAttr: this.options.dataIdAttr,
        ghostClass: this.options.ghostClass,
        chosenClass: this.options.chosenClass,
        dragClass: this.options.dragClass,
      }
    )
    this.dragManager.attach()

    // Set up internal handlers for static properties
    this.eventSystem.on('start', (event) => {
      Sortable.active = this
      Sortable.dragged = event.item
      if (this.options.onStart) {
        this.options.onStart(event)
      }
    })

    this.eventSystem.on('end', (event) => {
      Sortable.active = null
      Sortable.dragged = null
      if (this.options.onEnd) {
        this.options.onEnd(event)
      }
    })

    if (this.options.onChoose) {
      this.eventSystem.on('choose', this.options.onChoose)
    }
    if (this.options.onUnchoose) {
      this.eventSystem.on('unchoose', this.options.onUnchoose)
    }
    if (this.options.onUpdate) {
      this.eventSystem.on('update', this.options.onUpdate)
    }
    if (this.options.onSort) {
      this.eventSystem.on('sort', this.options.onSort)
    }
    if (this.options.onAdd) {
      this.eventSystem.on('add', this.options.onAdd)
    }
    if (this.options.onRemove) {
      this.eventSystem.on('remove', this.options.onRemove)
    }
    if (this.options.onSelect) {
      this.eventSystem.on('select', this.options.onSelect)
    }
    // Note: onMove is handled specially in DragManager as it needs the original event too
    // TODO: Implement proper onMove handling with original event parameter
    if (this.options.onClone) {
      this.eventSystem.on('clone', this.options.onClone)
    }
    if (this.options.onChange) {
      this.eventSystem.on('change', this.options.onChange)
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
    // Uninstall all plugins
    PluginSystem.uninstallAll(this)

    this.dragManager.detach()
    // Remove from instance tracking
    Sortable.instances.delete(this.element)
  }

  /**
   * Install a plugin on this Sortable instance
   *
   * @param name - Name of the plugin to install
   * @throws Error if plugin is not registered or already installed
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element);
   * sortable.usePlugin('AutoScroll');
   * ```
   *
   * @public
   */
  public usePlugin(name: string): void {
    PluginSystem.install(this, name)
  }

  /**
   * Uninstall a plugin from this Sortable instance
   *
   * @param name - Name of the plugin to uninstall
   * @returns true if plugin was found and uninstalled, false otherwise
   *
   * @example
   * ```typescript
   * sortable.removePlugin('AutoScroll');
   * ```
   *
   * @public
   */
  public removePlugin(name: string): boolean {
    return PluginSystem.uninstall(this, name)
  }

  /**
   * Check if a plugin is installed on this instance
   *
   * @param name - Name of the plugin to check
   * @returns true if plugin is installed, false otherwise
   *
   * @example
   * ```typescript
   * if (sortable.hasPlugin('AutoScroll')) {
   *   console.log('AutoScroll is active');
   * }
   * ```
   *
   * @public
   */
  public hasPlugin(name: string): boolean {
    return PluginSystem.isInstalled(this, name)
  }

  /**
   * Get all installed plugin names for this instance
   *
   * @returns Array of installed plugin names
   *
   * @example
   * ```typescript
   * const plugins = sortable.getPlugins();
   * console.log('Installed plugins:', plugins);
   * ```
   *
   * @public
   */
  public getPlugins(): string[] {
    return PluginSystem.getInstalled(this)
  }

  /**
   * Gets the current order of elements as an array of data-id attributes
   *
   * @returns Array of string IDs representing the current order
   *
   * @remarks
   * This method reads the `data-id` attribute from each sortable item.
   * If an item doesn't have a `data-id` attribute, its index will be used.
   * The attribute name can be customized using the `dataIdAttr` option.
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element);
   * const order = sortable.toArray();
   * console.log('Current order:', order); // ['item-1', 'item-2', 'item-3']
   * ```
   *
   * @example With custom data attribute
   * ```typescript
   * const sortable = new Sortable(element, { dataIdAttr: 'data-item-id' });
   * const order = sortable.toArray();
   * ```
   *
   * @public
   */
  public toArray(): string[] {
    return domToArray(this.element, this.options.dataIdAttr)
  }

  /**
   * Gets or sets a configuration option at runtime
   *
   * @param name - The option name to get or set
   * @param value - The value to set (omit to get the current value)
   * @returns The current value of the option (when getting)
   *
   * @example Getting an option value
   * ```typescript
   * const animationDuration = sortable.option('animation');
   * console.log('Animation duration:', animationDuration);
   * ```
   *
   * @example Setting an option value
   * ```typescript
   * sortable.option('animation', 300);
   * sortable.option('disabled', true);
   * ```
   *
   * @public
   */
  public option<K extends keyof SortableOptions>(name: K): SortableOptions[K]
  public option<K extends keyof SortableOptions>(
    name: K,
    value: SortableOptions[K]
  ): void
  public option<K extends keyof SortableOptions>(
    name: K,
    value?: SortableOptions[K]
  ): SortableOptions[K] | void {
    if (arguments.length === 1) {
      // Get option
      return this.options[name]
    }

    // Set option
    this.options[name] = value as SortableOptions[K]

    // Handle special cases that need immediate updates
    switch (name) {
      case 'disabled':
        // Update draggable state on all items
        if (value) {
          this.element.classList.add('sortable-disabled')
        } else {
          this.element.classList.remove('sortable-disabled')
        }
        break

      case 'handle':
      case 'filter':
      case 'onFilter':
      case 'draggable':
      case 'delay':
      case 'delayOnTouchOnly':
      case 'touchStartThreshold':
      case 'swapThreshold':
      case 'invertSwap':
      case 'invertedSwapThreshold':
      case 'direction': {
        // Re-create drag manager with new options
        this.dragManager.detach()
        this.dragManager = new DragManager(
          this.dropZone,
          this.eventSystem,
          this.options.group,
          {
            enableAccessibility: this.options.enableAccessibility,
            multiSelect: this.options.multiDrag,
            selectedClass: this.options.selectedClass,
            focusClass: this.options.focusClass,
            handle: this.options.handle,
            filter: this.options.filter,
            onFilter: this.options.onFilter,
            draggable: this.options.draggable,
            delay: this.options.delay,
            delayOnTouchOnly: this.options.delayOnTouchOnly,
            touchStartThreshold: this.options.touchStartThreshold,
            swapThreshold: this.options.swapThreshold,
            invertSwap: this.options.invertSwap,
            invertedSwapThreshold: this.options.invertedSwapThreshold,
            direction: this.options.direction,
            ghostClass: this.options.ghostClass,
            chosenClass: this.options.chosenClass,
            dragClass: this.options.dragClass,
          }
        )
        this.dragManager.attach()
        break
      }

      case 'group':
        // Re-create drag manager with new group configuration
        this.dragManager.detach()
        this.dragManager = new DragManager(
          this.dropZone,
          this.eventSystem,
          value as SortableOptions['group'],
          {
            enableAccessibility: this.options.enableAccessibility,
            multiSelect: this.options.multiDrag,
            selectedClass: this.options.selectedClass,
            focusClass: this.options.focusClass,
            handle: this.options.handle,
            filter: this.options.filter,
            onFilter: this.options.onFilter,
            draggable: this.options.draggable,
            delay: this.options.delay,
            delayOnTouchOnly: this.options.delayOnTouchOnly,
            touchStartThreshold: this.options.touchStartThreshold,
            swapThreshold: this.options.swapThreshold,
            invertSwap: this.options.invertSwap,
            invertedSwapThreshold: this.options.invertedSwapThreshold,
            direction: this.options.direction,
            ghostClass: this.options.ghostClass,
            chosenClass: this.options.chosenClass,
            dragClass: this.options.dragClass,
          }
        )
        this.dragManager.attach()
        break

      case 'animation':
      case 'easing':
        // Update animation manager options
        this.animationManager.updateOptions({
          animation: name === 'animation' ? (value as number) : undefined,
          easing: name === 'easing' ? (value as string) : undefined,
        })
        break
    }
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
  easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
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

// Default export for compatibility
export default Sortable
