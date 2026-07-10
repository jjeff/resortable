/**
 * @fileoverview Element → Sortable instance registry
 *
 * Lives in its own module (rather than as a private WeakMap in `index.ts`)
 * so plugins can resolve an arbitrary DOM node to its owning Sortable
 * instance without importing the main entry point (which imports the
 * plugins — a cycle).
 *
 * @internal
 */
import type { SortableInstance } from '../types/index.js'

const instances = new WeakMap<HTMLElement, SortableInstance>()

/** Register an instance under its container element. */
export function registerInstance(
  element: HTMLElement,
  instance: SortableInstance
): void {
  instances.set(element, instance)
}

/** Remove an instance's registration (called from destroy()). */
export function unregisterInstance(element: HTMLElement): void {
  instances.delete(element)
}

/** Look up the instance bound to exactly this element. */
export function getInstance(
  element: HTMLElement
): SortableInstance | undefined {
  return instances.get(element)
}

/**
 * Resolve the Sortable instance that owns a node: the nearest ancestor
 * (starting at the node itself) registered as a sortable container.
 */
export function findOwningInstance(
  node: Element | null
): SortableInstance | undefined {
  for (
    let el = node instanceof HTMLElement ? node : node?.parentElement;
    el;
    el = el.parentElement
  ) {
    const instance = instances.get(el)
    if (instance) return instance
  }
  return undefined
}
