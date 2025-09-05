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
