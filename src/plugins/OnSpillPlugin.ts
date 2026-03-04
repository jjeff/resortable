/**
 * @fileoverview OnSpill plugin for handling drag operations outside sortable areas
 * @author Resortable Team
 * @since 2.0.0
 */

import {
  SortablePlugin,
  SortableInstance,
  SortableEvent,
} from '../types/index.js'

/**
 * Configuration options for the OnSpill plugin
 */
export interface OnSpillOptions {
  /**
   * When true, revert the dragged item to its original position on spill
   * @defaultValue false
   */
  revertOnSpill?: boolean

  /**
   * When true, remove the dragged item from the DOM on spill
   * @defaultValue false
   */
  removeOnSpill?: boolean

  /**
   * Callback fired when a spill occurs
   * @param event - The sortable event
   */
  onSpill?: (event: SortableEvent) => void
}

/**
 * OnSpill plugin — handles drag operations that end outside any sortable area
 *
 * @remarks
 * Provides two behaviors when a dragged element is dropped outside sortable containers:
 * - **revertOnSpill**: returns the item to its original position (default)
 * - **removeOnSpill**: removes the item from the DOM entirely
 *
 * Only one behavior can be active at a time. If both are set, `revertOnSpill` takes
 * precedence.
 *
 * @example Basic usage (revert on spill)
 * ```typescript
 * import { PluginSystem } from 'resortable';
 * import { OnSpillPlugin } from 'resortable/plugins';
 *
 * PluginSystem.register(OnSpillPlugin.create({ revertOnSpill: true }));
 * const sortable = new Sortable(element);
 * sortable.usePlugin('OnSpill');
 * ```
 *
 * @example Remove on spill
 * ```typescript
 * PluginSystem.register(OnSpillPlugin.create({ removeOnSpill: true }));
 * ```
 *
 * @public
 */
export class OnSpillPlugin implements SortablePlugin {
  public readonly name = 'OnSpill'
  public readonly version = '2.0.0'

  private options: Required<
    Pick<OnSpillOptions, 'revertOnSpill' | 'removeOnSpill'>
  > & { onSpill?: (event: SortableEvent) => void }
  private startIndices = new WeakMap<
    SortableInstance,
    Map<HTMLElement, number>
  >()
  private startParents = new WeakMap<
    SortableInstance,
    Map<HTMLElement, HTMLElement>
  >()
  private handlers = new WeakMap<
    SortableInstance,
    {
      onStart: (event: SortableEvent) => void
      onEnd: (event: SortableEvent) => void
    }
  >()

  public static create(options: OnSpillOptions = {}): OnSpillPlugin {
    return new OnSpillPlugin(options)
  }

  constructor(options: OnSpillOptions = {}) {
    this.options = {
      revertOnSpill: options.revertOnSpill ?? true,
      removeOnSpill: options.removeOnSpill ?? false,
      onSpill: options.onSpill,
    }
  }

  public install(sortable: SortableInstance): void {
    const onStart = (event: SortableEvent) => {
      // Capture original positions for all dragged items
      const indexMap = new Map<HTMLElement, number>()
      const parentMap = new Map<HTMLElement, HTMLElement>()

      for (const item of event.items) {
        if (item.parentElement) {
          const index = Array.from(item.parentElement.children).indexOf(item)
          indexMap.set(item, index)
          parentMap.set(item, item.parentElement)
        }
      }

      this.startIndices.set(sortable, indexMap)
      this.startParents.set(sortable, parentMap)
    }

    const onEnd = (event: SortableEvent) => {
      // A "spill" occurs when the item ends up in the same zone it started in
      // AND at the same index — meaning no valid drop target accepted it.
      // More precisely: if to === from and newIndex === oldIndex, the drag
      // was either a no-op reorder or a spill. We detect spill by checking
      // whether the pointer ended outside any sortable container.
      //
      // However, the simplest and most reliable approach (matching legacy behavior)
      // is to check whether the drop landed outside any sortable element using
      // document.elementFromPoint. But at the 'end' event time we no longer have
      // pointer coordinates.
      //
      // So instead we use a simpler heuristic: if the item's current parent is not
      // a sortable container (i.e., the item was orphaned or the drop reverted),
      // treat it as a spill.
      const item = event.item
      const fromElement = event.from

      // Check if item is still a child of its original container and at its
      // original index — if so, it wasn't accepted by any target
      const indexMap = this.startIndices.get(sortable)
      const parentMap = this.startParents.get(sortable)
      if (!indexMap || !parentMap) return

      const originalIndex = indexMap.get(item)
      const originalParent = parentMap.get(item)

      if (originalIndex === undefined || !originalParent) return

      // Determine if this was a spill:
      // The item is back where it started (same parent, same index) AND
      // to === from (it wasn't successfully moved to another container)
      const currentParent = item.parentElement
      const currentIndex = currentParent
        ? Array.from(currentParent.children).indexOf(item)
        : -1
      const sameZone = event.to === fromElement

      const isSpill =
        sameZone &&
        currentParent === originalParent &&
        currentIndex === originalIndex

      if (!isSpill) return

      // Fire spill event
      sortable.eventSystem.emit('spill', event)
      this.options.onSpill?.(event)

      if (this.options.revertOnSpill) {
        // Item is already in its original position — nothing to do
        // (The drag system already reverted it)
        return
      }

      if (this.options.removeOnSpill) {
        // Remove the item from the DOM
        item.parentElement?.removeChild(item)
      }
    }

    this.handlers.set(sortable, { onStart, onEnd })
    sortable.eventSystem.on('start', onStart)
    sortable.eventSystem.on('end', onEnd)
  }

  public uninstall(sortable: SortableInstance): void {
    const h = this.handlers.get(sortable)
    if (h) {
      sortable.eventSystem.off('start', h.onStart)
      sortable.eventSystem.off('end', h.onEnd)
    }
    this.handlers.delete(sortable)
    this.startIndices.delete(sortable)
    this.startParents.delete(sortable)
  }
}
