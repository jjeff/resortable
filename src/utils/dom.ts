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
  const children = Array.from(parent.children).filter((c) => c !== el)
  if (index >= children.length) {
    parent.appendChild(el)
  } else {
    parent.insertBefore(el, children[index])
  }
}

/** Convert children to array of data-id or index */
export function toArray(parent: HTMLElement): string[] {
  return Array.from(parent.children).map((child, i) => {
    const el = child as HTMLElement
    return el.dataset.id ?? String(i)
  })
}
