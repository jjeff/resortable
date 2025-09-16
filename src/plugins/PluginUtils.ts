/**
 * @fileoverview Utility functions for plugin development
 * @author Resortable Team
 * @since 2.0.0
 */

import { SortablePlugin } from '../types/index.js'

/**
 * Base class for plugins that provides common functionality
 *
 * @remarks
 * This abstract class provides a foundation for building plugins with
 * common patterns like state management, event handling, and cleanup.
 *
 * @example
 * ```typescript
 * class MyPlugin extends BasePlugin {
 *   public readonly name = 'MyPlugin'
 *   public readonly version = '1.0.0'
 *
 *   protected onInstall(sortable: any): void {
 *     this.addEventListener(sortable, 'start', this.handleStart)
 *   }
 *
 *   private handleStart = (event: any) => {
 *     console.log('Drag started')
 *   }
 * }
 * ```
 *
 * @public
 */
export abstract class BasePlugin implements SortablePlugin {
  public abstract readonly name: string
  public abstract readonly version: string

  private eventListeners = new WeakMap<any, Map<string, EventListener>>()
  private domListeners = new WeakMap<
    any,
    Map<string, { element: Element; listener: EventListener }>
  >()
  private timers = new WeakMap<any, Set<number>>()
  private states = new WeakMap<any, any>()

  /**
   * Install the plugin on a sortable instance
   */
  public install(sortable: any): void {
    try {
      this.onInstall(sortable)
    } catch (error) {
      console.error(`Plugin ${this.name} installation failed:`, error)
      this.uninstall(sortable) // Cleanup on failure
    }
  }

  /**
   * Uninstall the plugin from a sortable instance
   */
  public uninstall(sortable: any): void {
    try {
      this.onUninstall(sortable)
    } catch (error) {
      console.error(`Plugin ${this.name} uninstallation failed:`, error)
    } finally {
      this.cleanup(sortable)
    }
  }

  /**
   * Override this method to implement plugin installation logic
   */
  protected abstract onInstall(sortable: any): void

  /**
   * Override this method to implement plugin uninstallation logic
   */
  protected onUninstall(_sortable: any): void {
    // Default implementation does nothing
  }

  /**
   * Add an event listener to the sortable's event system
   */
  protected addEventListener(
    sortable: any,
    eventName: string,
    listener: EventListener
  ): void {
    if (!sortable.eventSystem) {
      console.warn(`Plugin ${this.name}: No event system available`)
      return
    }

    let listeners = this.eventListeners.get(sortable)
    if (!listeners) {
      listeners = new Map()
      this.eventListeners.set(sortable, listeners)
    }

    listeners.set(eventName, listener)
    sortable.eventSystem.on(eventName, listener)
  }

  /**
   * Add a DOM event listener
   */
  protected addDOMListener(
    sortable: any,
    element: Element,
    eventName: string,
    listener: EventListener
  ): void {
    let listeners = this.domListeners.get(sortable)
    if (!listeners) {
      listeners = new Map()
      this.domListeners.set(sortable, listeners)
    }

    const key = `${eventName}:${element.tagName}:${element.className}`
    listeners.set(key, { element, listener })
    element.addEventListener(eventName, listener)
  }

  /**
   * Set a timeout and track it for cleanup
   */
  protected setTimeout(
    sortable: any,
    callback: () => void,
    delay: number
  ): number {
    let timers = this.timers.get(sortable)
    if (!timers) {
      timers = new Set()
      this.timers.set(sortable, timers)
    }

    const timerId = window.setTimeout(() => {
      timers?.delete(timerId)
      callback()
    }, delay)

    timers.add(timerId)
    return timerId
  }

  /**
   * Set an interval and track it for cleanup
   */
  protected setInterval(
    sortable: any,
    callback: () => void,
    interval: number
  ): number {
    let timers = this.timers.get(sortable)
    if (!timers) {
      timers = new Set()
      this.timers.set(sortable, timers)
    }

    const timerId = window.setInterval(callback, interval)
    timers.add(timerId)
    return timerId
  }

  /**
   * Get or set plugin state for a sortable instance
   */
  protected getState<T = any>(sortable: any): T | undefined
  protected getState<T = any>(sortable: any, defaultValue: T): T
  protected getState<T = any>(sortable: any, defaultValue?: T): T | undefined {
    let state = this.states.get(sortable)
    if (state === undefined && defaultValue !== undefined) {
      state = defaultValue
      this.states.set(sortable, state)
    }
    return state
  }

  /**
   * Set plugin state for a sortable instance
   */
  protected setState<T = any>(sortable: any, state: T): void {
    this.states.set(sortable, state)
  }

  /**
   * Check if sortable has required features
   */
  protected requiresFeature(sortable: any, feature: string): boolean {
    switch (feature) {
      case 'eventSystem':
        return !!sortable.eventSystem
      case 'multiDrag':
        return !!sortable.options.multiDrag
      case 'animation':
        return !!sortable.animationManager
      case 'selectionManager':
        return !!sortable.dragManager?.selectionManager
      default:
        return false
    }
  }

  /**
   * Clean up all resources for a sortable instance
   */
  private cleanup(sortable: any): void {
    // Clean up event listeners
    const eventListeners = this.eventListeners.get(sortable)
    if (eventListeners && sortable.eventSystem) {
      eventListeners.forEach((listener, eventName) => {
        sortable.eventSystem.off(eventName, listener)
      })
      this.eventListeners.delete(sortable)
    }

    // Clean up DOM listeners
    const domListeners = this.domListeners.get(sortable)
    if (domListeners) {
      domListeners.forEach(({ element, listener }, key) => {
        const eventName = key.split(':')[0]
        element.removeEventListener(eventName, listener)
      })
      this.domListeners.delete(sortable)
    }

    // Clean up timers
    const timers = this.timers.get(sortable)
    if (timers) {
      timers.forEach((timerId) => {
        clearTimeout(timerId)
        clearInterval(timerId)
      })
      this.timers.delete(sortable)
    }

    // Clean up state
    this.states.delete(sortable)
  }
}

/**
 * Utility functions for plugin development
 */
export class PluginUtils {
  /**
   * Check if an element matches a selector
   */
  public static matches(element: Element, selector: string): boolean {
    return element.matches(selector)
  }

  /**
   * Find the closest element matching a selector
   */
  public static closest(element: Element, selector: string): Element | null {
    return element.closest(selector)
  }

  /**
   * Get the bounding rectangle of an element
   */
  public static getRect(element: Element): DOMRect {
    return element.getBoundingClientRect()
  }

  /**
   * Check if two rectangles overlap
   */
  public static rectsOverlap(rect1: DOMRect, rect2: DOMRect): boolean {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    )
  }

  /**
   * Calculate overlap percentage between two rectangles
   */
  public static calculateOverlap(rect1: DOMRect, rect2: DOMRect): number {
    if (!this.rectsOverlap(rect1, rect2)) {
      return 0
    }

    const overlapWidth =
      Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left)
    const overlapHeight =
      Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top)
    const overlapArea = overlapWidth * overlapHeight

    const rect1Area = rect1.width * rect1.height
    const rect2Area = rect2.width * rect2.height
    const smallerArea = Math.min(rect1Area, rect2Area)

    return smallerArea > 0 ? overlapArea / smallerArea : 0
  }

  /**
   * Debounce a function
   */
  public static debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => func(...args), delay)
    }
  }

  /**
   * Throttle a function
   */
  public static throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0
    return (...args: Parameters<T>) => {
      const now = Date.now()
      if (now - lastCall >= delay) {
        lastCall = now
        func(...args)
      }
    }
  }

  /**
   * Create a unique ID
   */
  public static generateId(prefix = 'plugin'): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if an element is visible
   */
  public static isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element)
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    )
  }

  /**
   * Get scrollable parent elements
   */
  public static getScrollableParents(element: Element): Element[] {
    const parents: Element[] = []
    let parent = element.parentElement

    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent)
      if (
        style.overflow === 'auto' ||
        style.overflow === 'scroll' ||
        style.overflowX === 'auto' ||
        style.overflowX === 'scroll' ||
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll'
      ) {
        parents.push(parent)
      }
      parent = parent.parentElement
    }

    return parents
  }

  /**
   * Animate an element using CSS transitions
   */
  public static animate(
    element: HTMLElement,
    properties: Partial<CSSStyleDeclaration>,
    duration = 300,
    easing = 'ease'
  ): Promise<void> {
    return new Promise((resolve) => {
      const originalTransition = element.style.transition

      element.style.transition = `all ${duration}ms ${easing}`

      Object.assign(element.style, properties)

      const cleanup = () => {
        element.style.transition = originalTransition
        element.removeEventListener('transitionend', cleanup)
        resolve()
      }

      element.addEventListener('transitionend', cleanup)

      // Fallback timeout
      setTimeout(cleanup, duration + 50)
    })
  }

  /**
   * Check if a feature is supported
   */
  public static isFeatureSupported(feature: string): boolean {
    switch (feature) {
      case 'pointerEvents':
        return 'PointerEvent' in window
      case 'touchEvents':
        return 'ontouchstart' in window
      case 'dragAndDrop':
        return 'draggable' in document.createElement('div')
      case 'intersectionObserver':
        return 'IntersectionObserver' in window
      case 'resizeObserver':
        return 'ResizeObserver' in window
      default:
        return false
    }
  }
}

/**
 * Plugin factory for creating simple plugins
 */
export class PluginFactory {
  /**
   * Create a simple event-based plugin
   */
  public static createEventPlugin(
    name: string,
    version: string,
    handlers: Record<string, (event: any) => void>
  ): SortablePlugin {
    return {
      name,
      version,
      install(sortable: any) {
        Object.entries(handlers).forEach(([eventName, handler]) => {
          sortable.eventSystem?.on(eventName, handler)
        })
      },
      uninstall(sortable: any) {
        Object.entries(handlers).forEach(([eventName, handler]) => {
          sortable.eventSystem?.off(eventName, handler)
        })
      },
    }
  }

  /**
   * Create a plugin that adds CSS classes
   */
  public static createCSSPlugin(
    name: string,
    version: string,
    className: string,
    events: { add: string[]; remove: string[] }
  ): SortablePlugin {
    return {
      name,
      version,
      install(sortable: any) {
        events.add.forEach((eventName) => {
          sortable.eventSystem?.on(eventName, (event: any) => {
            event.item?.classList.add(className)
          })
        })
        events.remove.forEach((eventName) => {
          sortable.eventSystem?.on(eventName, (event: any) => {
            event.item?.classList.remove(className)
          })
        })
      },
      uninstall() {
        // Event listeners are cleaned up automatically
      },
    }
  }
}
