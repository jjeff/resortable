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
import {
  SortableOptions,
  type SortablePlugin,
  type SortableEvents,
} from './types/index.js'
import {
  toArray as domToArray,
  on,
  off,
  getIndex,
  insertAt,
  closest as domClosest,
  toggleClass,
  clone as domClone,
} from './utils/dom.js'

// Export PluginSystem
export { PluginSystem }

// Re-export core classes that are part of the public plugin-author surface.
// `Sortable` exposes these as properties (`sortable.eventSystem`,
// `sortable.dragManager`, `sortable.dropZone`) and the Plugin Development
// Guide documents using them — so they need to be in the public type surface
// (and in the generated API docs). Their transitive dependencies
// (SelectionManager, KeyboardManager, GroupManager, AnimationManager) are
// re-exported for the same reason — they appear on the typed public surface
// returned by getters like `dragManager.selectionManager`.
export { DragManager } from './core/DragManager.js'
export { DropZone } from './core/DropZone.js'
export {
  EventSystem,
  type Listener,
  type SortableEventSystem,
} from './core/EventSystem.js'
export { SelectionManager } from './core/SelectionManager.js'
export { KeyboardManager } from './core/KeyboardManager.js'
export { GroupManager } from './core/GroupManager.js'
export { AnimationManager } from './animation/AnimationManager.js'

// WeakMap to track Sortable instances by their elements
const sortableInstances = new WeakMap<HTMLElement, Sortable>()

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
   * The ghost element shown during drag (if any)
   * @readonly
   */
  public static ghost: HTMLElement | null = null

  /**
   * The cloned element during clone operations (if any)
   * @readonly
   */
  public static clone: HTMLElement | null = null

  /**
   * Gets the Sortable instance associated with a given element
   *
   * @param element - The DOM element to look up
   * @returns The Sortable instance, or undefined if none found
   *
   * @example
   * ```typescript
   * const sortable = Sortable.get(document.getElementById('my-list'));
   * ```
   *
   * @public
   */
  public static get(element: HTMLElement): Sortable | undefined {
    return sortableInstances.get(element)
  }

  /**
   * Utility functions for DOM operations
   * @public
   */
  public static utils = {
    /** Add an event listener and return an unsubscribe function */
    on,
    /** Remove a previously-registered event listener (symmetric to `on`) */
    off,
    /** Get the index of an element within its parent */
    index: getIndex,
    /** Insert an element at a specific index within a parent */
    insertAt,
    /** Find the nearest ancestor matching `selector`, optionally bounded by `ctx` */
    closest: domClosest,
    /** Toggle a CSS class on an element; pass `force` to set explicitly */
    toggleClass,
    /** Deep-clone an element (`cloneNode(true)`) */
    clone: domClone,
  }

  /**
   * Mount (register) a plugin globally so it can be used by any Sortable instance
   *
   * @param plugin - A SortablePlugin instance, or an array of plugins
   *
   * @example
   * ```typescript
   * import { Sortable } from 'resortable';
   * import { AutoScrollPlugin } from 'resortable/plugins';
   *
   * Sortable.mount(AutoScrollPlugin.create());
   *
   * // Mount multiple plugins at once
   * Sortable.mount([AutoScrollPlugin.create(), SwapPlugin.create()]);
   * ```
   *
   * @public
   */
  public static mount(plugin: SortablePlugin | SortablePlugin[]): void {
    const plugins = Array.isArray(plugin) ? plugin : [plugin]
    for (const p of plugins) {
      PluginSystem.register(p, { overwrite: true })
    }
  }

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
      // We'll need to track instances in a WeakMap
      const sortable = sortableInstances.get(current)
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
    sortableInstances.set(element, this)

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
        ignore: this.options.ignore,
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
        dropBubble: this.options.dropBubble,
        removeCloneOnHide: this.options.removeCloneOnHide,
        emptyInsertThreshold: this.options.emptyInsertThreshold,
        preventOnFilter: this.options.preventOnFilter,
        dataIdAttr: this.options.dataIdAttr,
        ghostClass: this.options.ghostClass,
        chosenClass: this.options.chosenClass,
        dragClass: this.options.dragClass,
        deselectOnClickOutside: this.options.deselectOnClickOutside,
        setData: this.options.setData,
        // `onMove` is threaded directly into DragManager — unlike the other
        // option callbacks which subscribe to the `EventSystem`, `onMove`
        // controls cancellation / insert-side override via its return value
        // (`false` / `-1` / `1`). The event-system can only propagate, not
        // collect a return, so we wire it through the option bag instead.
        // See #33.
        onMove: this.options.onMove,
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
      Sortable.ghost = null
      Sortable.clone = null
      if (this.options.onEnd) {
        this.options.onEnd(event)
      }
    })

    this.eventSystem.on('clone', (event) => {
      if (event.clone) {
        Sortable.clone = event.clone
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
    // `onMove` is wired directly through the DragManager constructor (above)
    // because its return value controls cancellation / insert-side override,
    // and the `EventSystem` channel cannot collect a return. The `'move'`
    // event still fires on the event system as a notification side-channel.
    // See #33.
    if (this.options.onClone) {
      this.eventSystem.on('clone', this.options.onClone)
    }
    if (this.options.onChange) {
      this.eventSystem.on('change', this.options.onChange)
    }
    if (this.options.onSpill) {
      this.eventSystem.on('spill', this.options.onSpill)
    }

    // Auto-save on sort events if store.set is configured
    if (this.options.store?.set) {
      this.eventSystem.on('sort', () => {
        this.save()
      })
    }

    // Restore order from store on initialization
    if (this.options.store?.get) {
      const order = this.options.store.get(this)
      if (order && order.length > 0) {
        this.sort(order, false)
      }
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
    sortableInstances.delete(this.element)
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
   * Sorts the elements according to the given order of data-id values
   *
   * @param order - Array of data-id values representing the desired order
   * @param useAnimation - Whether to animate the reorder (default: true)
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element);
   * sortable.sort(['item-3', 'item-1', 'item-2']);
   * ```
   *
   * @example Without animation
   * ```typescript
   * sortable.sort(['item-3', 'item-1', 'item-2'], false);
   * ```
   *
   * @public
   */
  public sort(order: string[], useAnimation = true): void {
    const dataIdAttr = this.options.dataIdAttr ?? 'data-id'
    const items = Array.from(this.element.children) as HTMLElement[]

    // Build a map from data-id to element
    const itemMap = new Map<string, HTMLElement>()
    items.forEach((item, i) => {
      const attrName = dataIdAttr.startsWith('data-')
        ? dataIdAttr.slice(5)
        : dataIdAttr
      const id =
        item.dataset[attrName] ?? item.getAttribute(dataIdAttr) ?? String(i)
      itemMap.set(id, item)
    })

    const reorder = () => {
      // Re-append elements in the desired order
      for (const id of order) {
        const item = itemMap.get(id)
        if (item) {
          this.element.appendChild(item)
        }
      }
      // Append any remaining items not in the order array
      for (const item of items) {
        if (!item.parentElement) {
          this.element.appendChild(item)
        }
      }
    }

    if (useAnimation && this.animationManager) {
      this.animationManager.animateReorder(items, reorder)
    } else {
      reorder()
    }
  }

  /**
   * Save the current sort order using the configured store
   *
   * @remarks
   * Calls the `store.set` callback with this Sortable instance if configured.
   * This allows persisting sort order to localStorage, a database, etc.
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element, {
   *   store: {
   *     get: (sortable) => {
   *       const stored = localStorage.getItem('sort-order');
   *       return stored ? JSON.parse(stored) : [];
   *     },
   *     set: (sortable) => {
   *       localStorage.setItem('sort-order', JSON.stringify(sortable.toArray()));
   *     }
   *   }
   * });
   *
   * // Later, manually trigger a save
   * sortable.save();
   * ```
   *
   * @public
   */
  public save(): void {
    this.options.store?.set?.(this)
  }

  public option<K extends keyof SortableOptions>(name: K): SortableOptions[K]
  public option<K extends keyof SortableOptions>(
    name: K,
    value: SortableOptions[K]
  ): void
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
      case 'ignore':
      case 'draggable':
      case 'delay':
      case 'delayOnTouchOnly':
      case 'touchStartThreshold':
      case 'swapThreshold':
      case 'invertSwap':
      case 'invertedSwapThreshold':
      case 'direction':
      case 'forceFallback':
      case 'fallbackClass':
      case 'fallbackOnBody':
      case 'fallbackTolerance':
      case 'fallbackOffsetX':
      case 'fallbackOffsetY': {
        // Re-create drag manager with new options. `forceFallback` changes
        // which DOM listeners get registered, so a setter at runtime must
        // tear down and rebuild — there is no in-place reconfigure path.
        // The remaining fallback options are baked into the ghost on drag
        // start, so a rebuild is the simplest way to apply them on the next
        // drag without introducing setters for every field.
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
            ignore: this.options.ignore,
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
            ghostClass: this.options.ghostClass,
            chosenClass: this.options.chosenClass,
            dragClass: this.options.dragClass,
            deselectOnClickOutside: this.options.deselectOnClickOutside,
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
            ignore: this.options.ignore,
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
            ghostClass: this.options.ghostClass,
            chosenClass: this.options.chosenClass,
            dragClass: this.options.dragClass,
            deselectOnClickOutside: this.options.deselectOnClickOutside,
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
  deselectOnClickOutside: true,
}
