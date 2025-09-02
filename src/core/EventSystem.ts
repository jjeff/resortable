import type { SortableEvents } from '../types/index.js'

type Listener<T> = (event: T) => void

/**
 * Basic event emitter system used by Sortable
 * @internal
 */
export class EventSystem<E extends Record<string, unknown>> {
  private listeners: Map<keyof E, Listener<unknown>[]> = new Map()

  /**
   * Register an event listener
   * @param type - Event name
   * @param listener - Callback to invoke
   * @returns Function to unregister the listener
   */
  public on<K extends keyof E>(type: K, listener: Listener<E[K]>): () => void {
    const arr = this.listeners.get(type) ?? []
    arr.push(listener as Listener<unknown>)
    this.listeners.set(type, arr)
    return () => this.off(type, listener)
  }

  /**
   * Remove a previously registered listener
   */
  public off<K extends keyof E>(type: K, listener: Listener<E[K]>): void {
    const arr = this.listeners.get(type)
    if (!arr) return
    const idx = arr.indexOf(listener as Listener<unknown>)
    if (idx !== -1) arr.splice(idx, 1)
  }

  /**
   * Emit an event to all registered listeners
   */
  public emit<K extends keyof E>(type: K, event: E[K]): void {
    const arr = this.listeners.get(type) as Listener<E[K]>[] | undefined
    if (!arr) return
    for (const l of [...arr]) l(event)
  }
}

export type SortableEventSystem = EventSystem<SortableEvents>
