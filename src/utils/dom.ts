/** DOM utility helpers */

/** Add an event listener and return unsubscriber */
export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | Document,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void
): () => void {
  el.addEventListener(type, handler as unknown as EventListener)
  return () => el.removeEventListener(type, handler as unknown as EventListener)
}

/** Remove a previously-registered event listener. Symmetric to `on`. */
export function off<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | Document,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void
): void {
  el.removeEventListener(type, handler as unknown as EventListener)
}

/**
 * Walk up from `el` and return the nearest ancestor (including `el` itself)
 * matching `selector`. If `ctx` is supplied, the search is bounded to that
 * subtree — ancestors above `ctx` are not considered, and `null` is returned
 * if no match is found within it.
 */
export function closest(
  el: HTMLElement | null,
  selector: string,
  ctx?: HTMLElement
): HTMLElement | null {
  let current: HTMLElement | null = el
  while (current && current !== ctx?.parentElement) {
    if (current.matches?.(selector)) return current
    if (current === ctx) return null
    current = current.parentElement
  }
  return null
}

/**
 * Toggle a CSS class on `el`. If `force` is provided, behaves like
 * `classList.toggle(name, force)` — adds when `true`, removes when `false`.
 */
export function toggleClass(
  el: HTMLElement,
  name: string,
  force?: boolean
): void {
  if (force === undefined) {
    el.classList.toggle(name)
  } else {
    el.classList.toggle(name, force)
  }
}

/** Deep-clone an element (`cloneNode(true)`). Returns the same element type. */
export function clone<T extends HTMLElement>(el: T): T {
  return el.cloneNode(true) as T
}

/**
 * Whether the given modifier key is held on `e`. Shared by any input
 * handler that needs to check a configured modifier (multi-drag selection,
 * duplicate-on-drop) against either a `PointerEvent` or a `KeyboardEvent`.
 */
export function isModifierHeld(
  e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  key: 'ctrl' | 'meta' | 'shift' | 'alt'
): boolean {
  switch (key) {
    case 'ctrl':
      return e.ctrlKey
    case 'meta':
      return e.metaKey
    case 'shift':
      return e.shiftKey
    case 'alt':
      return e.altKey
  }
}

/**
 * Build a drag clone of `item`: a deep copy with its `id` stripped and any
 * drag-state classes removed, so the copy doesn't carry stale identity or
 * transient styling into its new home. `sortable-selected` is stripped too —
 * SelectionManager never learns about the copy, so a highlight it can't
 * clear (`deselectAll` walks its own set) would be stuck on forever.
 *
 * Only the DEFAULT class names are stripped. A consumer that renamed them
 * (`selectedClass`, `chosenClass`, …) sees the custom class survive on the
 * copy — a pre-existing limitation shared with the `group.pull: 'clone'`
 * path, since this helper has no access to the instance's options.
 */
export function createDragClone(item: HTMLElement): HTMLElement {
  const clone = item.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  clone.classList.remove(
    'sortable-chosen',
    'sortable-drag',
    'sortable-ghost',
    'sortable-multi-drag-source',
    'sortable-selected'
  )
  return clone
}

/** Get index of element within its parent */
export function getIndex(el: HTMLElement): number {
  if (!el.parentElement) return -1
  return Array.from(el.parentElement.children).indexOf(el)
}

/** Insert element at specific index in parent */
export function insertAt(
  parent: HTMLElement,
  el: HTMLElement,
  index: number
): void {
  const children = Array.from(parent.children)
  const currentIndex = children.indexOf(el)

  // If element is already at the target index, do nothing
  if (currentIndex === index) return

  // Remove element from current position
  if (el.parentElement === parent) {
    parent.removeChild(el)
  }

  // Get children after removal
  const updatedChildren = Array.from(parent.children)

  if (index >= updatedChildren.length) {
    parent.appendChild(el)
  } else {
    parent.insertBefore(el, updatedChildren[index])
  }
}

/** Convert children to array of data-id or index */
export function toArray(parent: HTMLElement, dataIdAttr = 'data-id'): string[] {
  return Array.from(parent.children).map((child, i) => {
    const el = child as HTMLElement
    // Remove 'data-' prefix if present
    const attrName = dataIdAttr.startsWith('data-')
      ? dataIdAttr.slice(5)
      : dataIdAttr
    return el.dataset[attrName] ?? el.getAttribute(dataIdAttr) ?? String(i)
  })
}

/**
 * CSS class marking items hidden for an active controlled-mode drag.
 * Index math (DropZone.getControlledIndex) excludes items carrying it.
 */
export const CONTROLLED_HIDDEN_CLASS = 'sortable-controlled-hidden'

/**
 * CSS class applied to the ghost and placeholder while duplicate mode is
 * armed (the configured `duplicateKey` is held during an active drag).
 */
export const DUPLICATE_CLASS = 'sortable-duplicate'

/**
 * Hide elements for a controlled-mode drag (visual removal without touching
 * their structural position). Returns the original inline `display` values
 * so {@link restoreControlledHidden} can put them back exactly.
 */
export function hideControlled(items: HTMLElement[]): Map<HTMLElement, string> {
  const saved = new Map<HTMLElement, string>()
  for (const item of items) {
    saved.set(item, item.style.display)
    item.classList.add(CONTROLLED_HIDDEN_CLASS)
    item.style.display = 'none'
  }
  return saved
}

/**
 * Re-hide or un-hide the elements tracked by a {@link hideControlled} map,
 * keeping the saved `display` values so the drag can toggle repeatedly and
 * still restore exactly at the end.
 *
 * This previews duplicate mode: while the `duplicateKey` modifier is held the
 * drop will LEAVE the original where it is, so the original must stay visible
 * in its home slot and the placeholder alone previews the incoming copy.
 * Releasing the modifier re-hides it and the preview reverts to a move.
 *
 * Index math is unaffected — `DropZone.getVisibleItems` is always passed the
 * dragged items as an explicit `exclude` argument, so a visible original is
 * still excluded from `getControlledIndex`.
 */
export function setControlledHidden(
  saved: Map<HTMLElement, string>,
  hidden: boolean
): void {
  saved.forEach((display, item) => {
    item.classList.toggle(CONTROLLED_HIDDEN_CLASS, hidden)
    item.style.display = hidden ? 'none' : display
  })
}

/** Restore elements hidden by {@link hideControlled}. */
export function restoreControlledHidden(saved: Map<HTMLElement, string>): void {
  saved.forEach((display, item) => {
    item.classList.remove(CONTROLLED_HIDDEN_CLASS)
    item.style.display = display
  })
  saved.clear()
}
