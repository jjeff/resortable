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
  // No scrolling until a real cursor position has been observed —
  // lastMousePosition starts at (0,0), and scrolling toward the top-left
  // corner on drag start yanked scrollable ancestors (and the window) to
  // the top.
  private cursorSeen = false
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
    // Drop explicit-undefined entries — spreading them would clobber the
    // defaults (speed: undefined → NaN scroll amounts, which coerce
    // scrollTop/scrollLeft to 0 and yank containers to their origin).
    const defined = Object.fromEntries(
      Object.entries(options).filter(([, v]) => v !== undefined)
    )
    this.options = {
      speed: 10,
      sensitivity: 100,
      scrollX: true,
      scrollY: true,
      maxSpeed: 50,
      acceleration: 1.2,
      ...defined,
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
   * Attach pointer tracking for auto-scroll
   */
  private attachMouseTracking(sortable: SortableInstance): void {
    const handlePointerMove = (event: PointerEvent | DragEvent) => {
      this.lastMousePosition = { x: event.clientX, y: event.clientY }
      this.cursorSeen = true
    }

    // Store the handler for cleanup using explicit type extension
    const sortableWithAutoScroll = sortable as SortableInstance & {
      _autoScrollPointerHandler?: (event: PointerEvent) => void
    }
    if (!sortableWithAutoScroll._autoScrollPointerHandler) {
      sortableWithAutoScroll._autoScrollPointerHandler = handlePointerMove
      document.addEventListener('pointermove', handlePointerMove)
      // Native HTML5 drags suppress pointermove — track dragover too.
      document.addEventListener('dragover', handlePointerMove)
    }
  }

  /**
   * Detach pointer tracking
   */
  private detachMouseTracking(sortable: SortableInstance): void {
    const sortableWithAutoScroll = sortable as SortableInstance & {
      _autoScrollPointerHandler?: (event: PointerEvent) => void
    }
    if (sortableWithAutoScroll._autoScrollPointerHandler) {
      document.removeEventListener(
        'pointermove',
        sortableWithAutoScroll._autoScrollPointerHandler
      )
      document.removeEventListener(
        'dragover',
        sortableWithAutoScroll._autoScrollPointerHandler as EventListener
      )
      delete sortableWithAutoScroll._autoScrollPointerHandler
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

      // Never scroll on a stale/unseen cursor position.
      if (this.cursorSeen) {
        this.scrollNearCursor(sortable)
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
   * Scroll every scrollable ancestor (the sortable element first, walking
   * up to the window) whose edge the cursor is near — but ONLY along axes
   * that element can actually scroll further in that direction.
   *
   * Two properties matter here, both learned the hard way:
   *
   * - The per-element sensitivity is clamped to a third of the element's
   *   size. A fixed sensitivity larger than the element (e.g. 200px against
   *   a 90px-tall clip row) makes the "near top" test true EVERYWHERE, and
   *   the plugin permanently scrolls up — on drag start this yanked every
   *   scrollable ancestor and the window to the top.
   * - An element that cannot scroll further in the wanted direction is
   *   skipped (instead of feeding `scrollBy` no-ops and then unconditionally
   *   scrolling the window as a "last resort").
   */
  private scrollNearCursor(sortable: SortableInstance): void {
    const mouse = this.lastMousePosition

    let el: HTMLElement | null = sortable.element
    while (el && el !== document.body && el !== document.documentElement) {
      this.scrollElementIfNearEdge(el, mouse)
      el = el.parentElement
    }

    // Window: same edge rules against the viewport.
    const doc = document.documentElement
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (this.options.scrollX && doc.scrollWidth > vw) {
      const sens = Math.min(this.options.sensitivity, vw / 3)
      if (mouse.x < sens && window.scrollX > 0) {
        window.scrollBy(-this.calculateSpeed(sens - mouse.x), 0)
      } else if (mouse.x > vw - sens && window.scrollX + vw < doc.scrollWidth) {
        window.scrollBy(this.calculateSpeed(mouse.x - (vw - sens)), 0)
      }
    }
    if (this.options.scrollY && doc.scrollHeight > vh) {
      const sens = Math.min(this.options.sensitivity, vh / 3)
      if (mouse.y < sens && window.scrollY > 0) {
        window.scrollBy(0, -this.calculateSpeed(sens - mouse.y))
      } else if (
        mouse.y > vh - sens &&
        window.scrollY + vh < doc.scrollHeight
      ) {
        window.scrollBy(0, this.calculateSpeed(mouse.y - (vh - sens)))
      }
    }
  }

  /** Edge-scroll a single element along the axes it can actually scroll. */
  private scrollElementIfNearEdge(
    el: HTMLElement,
    mouse: { x: number; y: number }
  ): void {
    const style = window.getComputedStyle(el)
    const scrollableX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth
    const scrollableY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    if (!scrollableX && !scrollableY) return

    const rect = el.getBoundingClientRect()

    if (this.options.scrollX && scrollableX) {
      const sens = Math.min(this.options.sensitivity, rect.width / 3)
      if (mouse.x < rect.left + sens && el.scrollLeft > 0) {
        el.scrollLeft -= this.calculateSpeed(rect.left + sens - mouse.x)
      } else if (
        mouse.x > rect.right - sens &&
        el.scrollLeft + el.clientWidth < el.scrollWidth
      ) {
        el.scrollLeft += this.calculateSpeed(mouse.x - (rect.right - sens))
      }
    }

    if (this.options.scrollY && scrollableY) {
      const sens = Math.min(this.options.sensitivity, rect.height / 3)
      if (mouse.y < rect.top + sens && el.scrollTop > 0) {
        el.scrollTop -= this.calculateSpeed(rect.top + sens - mouse.y)
      } else if (
        mouse.y > rect.bottom - sens &&
        el.scrollTop + el.clientHeight < el.scrollHeight
      ) {
        el.scrollTop += this.calculateSpeed(mouse.y - (rect.bottom - sens))
      }
    }
  }

  /**
   * Calculate scroll speed based on distance from edge
   */
  private calculateSpeed(distance: number): number {
    const factor = Math.min(distance / this.options.sensitivity, 1)
    const speed = this.options.speed * factor * this.options.acceleration
    return Math.min(speed, this.options.maxSpeed)
  }
}
