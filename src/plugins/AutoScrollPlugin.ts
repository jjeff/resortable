/**
 * @fileoverview AutoScroll plugin for automatic scrolling during drag operations
 * @author Resortable Team
 * @since 2.0.0
 */

import { SortablePlugin, SortableInstance } from '../types/index.js'

/**
 * Configuration options for the AutoScroll plugin
 */
export interface AutoScrollOptions {
  /**
   * Scrolling speed (pixels per frame)
   * @defaultValue 10
   */
  speed?: number

  /**
   * Sensitivity for edge detection (pixels from edge)
   * @defaultValue 100
   */
  sensitivity?: number

  /**
   * Enable auto-scroll on X axis
   * @defaultValue true
   */
  scrollX?: boolean

  /**
   * Enable auto-scroll on Y axis
   * @defaultValue true
   */
  scrollY?: boolean

  /**
   * Maximum scroll speed
   * @defaultValue 50
   */
  maxSpeed?: number

  /**
   * Scroll acceleration factor
   * @defaultValue 1.2
   */
  acceleration?: number
}

/**
 * AutoScroll plugin for automatic scrolling during drag operations
 *
 * @remarks
 * This plugin automatically scrolls containers when dragging near edges,
 * making it easier to drag items to areas outside the current viewport.
 *
 * @example Basic usage
 * ```typescript
 * import { PluginSystem, AutoScrollPlugin } from 'resortable';
 *
 * // Register the plugin
 * PluginSystem.register(AutoScrollPlugin.create());
 *
 * // Install on sortable
 * const sortable = new Sortable(element);
 * PluginSystem.install(sortable, 'AutoScroll');
 * ```
 *
 * @example With custom options
 * ```typescript
 * PluginSystem.register(AutoScrollPlugin.create({
 *   speed: 20,
 *   sensitivity: 50
 * }));
 * ```
 *
 * @public
 */
export class AutoScrollPlugin implements SortablePlugin {
  public readonly name = 'AutoScroll'
  public readonly version = '2.0.0'

  private options: Required<AutoScrollOptions>
  private scrollIntervals = new WeakMap<object, number>()
  private lastMousePosition = { x: 0, y: 0 }
  private animationFrame: number | null = null

  /**
   * Create an AutoScroll plugin instance
   *
   * @param options - Configuration options for auto-scroll behavior
   * @returns AutoScrollPlugin instance
   */
  public static create(options: AutoScrollOptions = {}): AutoScrollPlugin {
    return new AutoScrollPlugin(options)
  }

  constructor(options: AutoScrollOptions = {}) {
    this.options = {
      speed: 10,
      sensitivity: 100,
      scrollX: true,
      scrollY: true,
      maxSpeed: 50,
      acceleration: 1.2,
      ...options,
    }
  }

  /**
   * Install the plugin on a Sortable instance
   */
  public install(sortable: SortableInstance): void {
    // Listen for drag start to begin auto-scroll
    sortable.eventSystem.on('start', this.handleDragStart.bind(this, sortable))
    sortable.eventSystem.on('end', this.handleDragEnd.bind(this, sortable))

    // Track mouse movement during drag
    this.attachMouseTracking(sortable)
  }

  /**
   * Uninstall the plugin from a Sortable instance
   */
  public uninstall(sortable: SortableInstance): void {
    // Stop any active scrolling
    this.stopAutoScroll(sortable)

    // Remove event listeners
    this.detachMouseTracking(sortable)

    // Clean up intervals
    this.scrollIntervals.delete(sortable)
  }

  /**
   * Handle drag start event
   */
  private handleDragStart(sortable: SortableInstance): void {
    this.startAutoScroll(sortable)
  }

  /**
   * Handle drag end event
   */
  private handleDragEnd(sortable: SortableInstance): void {
    this.stopAutoScroll(sortable)
  }

  /**
   * Attach mouse tracking for auto-scroll
   */
  private attachMouseTracking(sortable: SortableInstance): void {
    const handleMouseMove = (event: MouseEvent) => {
      this.lastMousePosition = { x: event.clientX, y: event.clientY }
    }

    // Store the handler for cleanup
    if (!(sortable as any)._autoScrollMouseHandler) {
      ;(sortable as any)._autoScrollMouseHandler = handleMouseMove
      document.addEventListener('mousemove', handleMouseMove)
    }
  }

  /**
   * Detach mouse tracking
   */
  private detachMouseTracking(sortable: SortableInstance): void {
    const sortableAny = sortable as any
    if (sortableAny._autoScrollMouseHandler) {
      document.removeEventListener(
        'mousemove',
        sortableAny._autoScrollMouseHandler
      )
      delete sortableAny._autoScrollMouseHandler
    }
  }

  /**
   * Start auto-scroll for a sortable instance
   */
  private startAutoScroll(sortable: SortableInstance): void {
    this.stopAutoScroll(sortable) // Clean up any existing scroll

    const scroll = () => {
      if (!this.shouldAutoScroll(sortable)) {
        return
      }

      const scrollAmount = this.calculateScrollAmount(sortable)

      if (scrollAmount.x !== 0 || scrollAmount.y !== 0) {
        this.performScroll(sortable, scrollAmount)
      }

      this.animationFrame = window.requestAnimationFrame(scroll)
    }

    this.animationFrame = window.requestAnimationFrame(scroll)
  }

  /**
   * Stop auto-scroll for a sortable instance
   */
  private stopAutoScroll(_sortable: SortableInstance): void {
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  /**
   * Check if auto-scroll should be active
   */
  private shouldAutoScroll(sortable: SortableInstance): boolean {
    // Check if dragging is active
    return Boolean(sortable.dragManager?.isDragging)
  }

  /**
   * Calculate scroll amount based on mouse position
   */
  private calculateScrollAmount(sortable: SortableInstance): {
    x: number
    y: number
  } {
    const container = sortable.element
    const rect = container.getBoundingClientRect()
    const mouse = this.lastMousePosition

    let scrollX = 0
    let scrollY = 0

    // Calculate X-axis scroll
    if (this.options.scrollX) {
      if (mouse.x < rect.left + this.options.sensitivity) {
        // Scroll left
        const distance = rect.left + this.options.sensitivity - mouse.x
        scrollX = -this.calculateSpeed(distance)
      } else if (mouse.x > rect.right - this.options.sensitivity) {
        // Scroll right
        const distance = mouse.x - (rect.right - this.options.sensitivity)
        scrollX = this.calculateSpeed(distance)
      }
    }

    // Calculate Y-axis scroll
    if (this.options.scrollY) {
      if (mouse.y < rect.top + this.options.sensitivity) {
        // Scroll up
        const distance = rect.top + this.options.sensitivity - mouse.y
        scrollY = -this.calculateSpeed(distance)
      } else if (mouse.y > rect.bottom - this.options.sensitivity) {
        // Scroll down
        const distance = mouse.y - (rect.bottom - this.options.sensitivity)
        scrollY = this.calculateSpeed(distance)
      }
    }

    return { x: scrollX, y: scrollY }
  }

  /**
   * Calculate scroll speed based on distance from edge
   */
  private calculateSpeed(distance: number): number {
    const factor = Math.min(distance / this.options.sensitivity, 1)
    const speed = this.options.speed * factor * this.options.acceleration
    return Math.min(speed, this.options.maxSpeed)
  }

  /**
   * Perform the actual scrolling
   */
  private performScroll(
    sortable: SortableInstance,
    amount: { x: number; y: number }
  ): void {
    const container = sortable.element

    // Scroll the container
    if (amount.x !== 0) {
      container.scrollLeft += amount.x
    }
    if (amount.y !== 0) {
      container.scrollTop += amount.y
    }

    // Also scroll parent containers if needed
    this.scrollParents(container, amount)
  }

  /**
   * Scroll parent containers
   */
  private scrollParents(
    element: HTMLElement,
    amount: { x: number; y: number }
  ): void {
    let parent = element.parentElement

    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent)
      const hasScrollX =
        style.overflowX === 'auto' || style.overflowX === 'scroll'
      const hasScrollY =
        style.overflowY === 'auto' || style.overflowY === 'scroll'

      if (hasScrollX && amount.x !== 0) {
        parent.scrollLeft += amount.x
      }
      if (hasScrollY && amount.y !== 0) {
        parent.scrollTop += amount.y
      }

      parent = parent.parentElement
    }

    // Scroll the window as last resort
    if (amount.x !== 0 || amount.y !== 0) {
      window.scrollBy(amount.x, amount.y)
    }
  }
}
