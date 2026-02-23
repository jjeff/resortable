/**
 * @fileoverview MarqueeSelectPlugin — rubber-band (lasso) selection for sortable lists
 * @author Resortable Team
 * @since 2.0.0
 *
 * Provides Finder/Explorer-style marquee selection:
 *  - Click+drag on empty space to draw a selection rectangle
 *  - Alt+drag on items to start marquee instead of dragging
 *  - Shift held = additive, Alt held = subtractive
 */

import type { SortableInstance } from '../types/index.js'
import { BasePlugin, PluginUtils } from './PluginUtils.js'

/** Filter config for include/exclude CSS selectors */
export interface MarqueeFilterConfig {
  /** Only allow when target matches this selector */
  include?: string
  /** Block when target matches this selector */
  exclude?: string
}

export interface MarqueeSelectOptions {
  /** CSS class applied to the marquee rectangle element */
  marqueeClass?: string
  /** Minimum pixels of movement before marquee activates */
  threshold?: number
  /** Allow Alt+drag on items to start marquee instead of item drag */
  altDragOnItems?: boolean
  /** Root element for the pointerdown listener. HTMLElement or CSS selector. Default: 'html' */
  marqueeArea?: HTMLElement | string
  /** Filter where marquee can start. Draggable items are always implicitly excluded. */
  marqueeFilter?: MarqueeFilterConfig
  /** Clear selection on click-away (sub-threshold click on non-item space). Default: true */
  deselectOnClickAway?: boolean
  /** Filter where click-away deselection is suppressed. */
  deselectFilter?: MarqueeFilterConfig
  /** Hold delay in ms before marquee starts on touch devices. Default: 300 */
  touchHoldDelay?: number
  /** Pixels of movement allowed during touch hold before cancelling. Default: 10 */
  touchHoldThreshold?: number
}

interface MarqueeState {
  active: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
  marqueeEl: HTMLElement | null
  pointerId: number | null
  initialSelectionSnapshot: Set<HTMLElement>
  anchorGroupName: string | null
  /** Touch hold timer ID (waiting for hold to confirm marquee intent) */
  holdTimer: number | null
  /** Whether marquee was triggered via touch hold */
  isTouchHold: boolean
}

type DocumentHandlers = {
  moveHandler: (e: PointerEvent) => void
  upHandler: (e: PointerEvent) => void
}

type TouchDocumentHandlers = {
  moveHandler: (e: TouchEvent) => void
  upHandler: (e: TouchEvent) => void
}

const DEFAULT_OPTIONS: Required<MarqueeSelectOptions> = {
  marqueeClass: 'sortable-marquee',
  threshold: 5,
  altDragOnItems: true,
  marqueeArea: 'html',
  marqueeFilter: {},
  deselectOnClickAway: true,
  deselectFilter: {},
  touchHoldDelay: 300,
  touchHoldThreshold: 10,
}

function createDefaultState(): MarqueeState {
  return {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    marqueeEl: null,
    pointerId: null,
    initialSelectionSnapshot: new Set(),
    anchorGroupName: null,
    holdTimer: null,
    isTouchHold: false,
  }
}

function getMarqueeRect(state: MarqueeState): DOMRect {
  const x = Math.min(state.startX, state.currentX)
  const y = Math.min(state.startY, state.currentY)
  const w = Math.abs(state.currentX - state.startX)
  const h = Math.abs(state.currentY - state.startY)
  return new DOMRect(x, y, w, h)
}

function resolveMarqueeArea(area: HTMLElement | string): HTMLElement {
  if (area instanceof HTMLElement) return area
  const el = document.querySelector<HTMLElement>(area)
  if (!el)
    throw new Error(
      `MarqueeSelectPlugin: marqueeArea selector "${area}" matched no element`
    )
  return el
}

function isGlobalArea(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body
}

/** Suppress text selection (iOS Safari requires the -webkit- prefix) */
function suppressTextSelection(): void {
  window.getSelection()?.removeAllRanges()
  document.body.style.userSelect = 'none'
  document.body.style.setProperty('-webkit-user-select', 'none')
}

/** Restore text selection to a previously saved value */
function restoreTextSelection(saved: string): void {
  document.body.style.userSelect = saved
  document.body.style.setProperty('-webkit-user-select', saved || '')
}

/** Module-level lock: only one marquee can be active at a time across all instances */
let activeMarqueeInstance: SortableInstance | null = null

export class MarqueeSelectPlugin extends BasePlugin {
  public readonly name = 'MarqueeSelect'
  public readonly version = '2.0.0'

  private opts: Required<MarqueeSelectOptions>
  private documentHandlers = new WeakMap<SortableInstance, DocumentHandlers>()
  private captureHandler = new WeakMap<
    SortableInstance,
    (e: PointerEvent) => void
  >()
  private areaElement = new WeakMap<SortableInstance, HTMLElement>()
  private areaHandler = new WeakMap<
    SortableInstance,
    (e: PointerEvent) => void
  >()
  private savedUserSelect = new WeakMap<SortableInstance, string>()
  private touchDocumentHandlers = new WeakMap<
    SortableInstance,
    TouchDocumentHandlers
  >()
  private throttledUpdateSelection: WeakMap<
    SortableInstance,
    (sortable: SortableInstance, state: MarqueeState, e: PointerEvent) => void
  > = new WeakMap()

  public static create(options?: MarqueeSelectOptions): MarqueeSelectPlugin {
    return new MarqueeSelectPlugin(options)
  }

  constructor(options?: MarqueeSelectOptions) {
    super()
    this.opts = { ...DEFAULT_OPTIONS, ...options }
  }

  protected onInstall(sortable: SortableInstance): void {
    this.setState(sortable, createDefaultState())

    // Throttled selection update (~60fps)
    const throttled = PluginUtils.throttle((...args: unknown[]) => {
      const [s, st, ev] = args as [SortableInstance, MarqueeState, PointerEvent]
      this.updateSelection(s, st, ev)
    }, 16)
    this.throttledUpdateSelection.set(
      sortable,
      throttled as (
        s: SortableInstance,
        st: MarqueeState,
        e: PointerEvent
      ) => void
    )

    // Resolve and store the marquee area element
    const area = resolveMarqueeArea(this.opts.marqueeArea)
    this.areaElement.set(sortable, area)

    // Attach pointerdown on the resolved area (manual, not addDOMListener,
    // to avoid key collisions when multiple instances target <html>)
    const areaHandler = (e: PointerEvent) => this.onAreaPointerDown(e, sortable)
    this.areaHandler.set(sortable, areaHandler)
    area.addEventListener('pointerdown', areaHandler)

    // Document capture-phase pointerdown — Alt+item marquee
    if (this.opts.altDragOnItems) {
      const handler = (e: PointerEvent) =>
        this.onDocumentCapturePointerDown(e, sortable)
      this.captureHandler.set(sortable, handler)
      document.addEventListener('pointerdown', handler, true)
    }

    // Signal to KeyboardManager that this plugin handles click-away
    if (this.opts.deselectOnClickAway) {
      sortable.element.dataset.marqueeClickAway = 'true'
    }
  }

  protected onUninstall(sortable: SortableInstance): void {
    this.endMarquee(sortable)

    // Clean up area pointerdown handler
    const area = this.areaElement.get(sortable)
    const areaH = this.areaHandler.get(sortable)
    if (area && areaH) {
      area.removeEventListener('pointerdown', areaH)
      this.areaElement.delete(sortable)
      this.areaHandler.delete(sortable)
    }

    // Clean up capture handler (not tracked by BasePlugin since it's on document)
    const handler = this.captureHandler.get(sortable)
    if (handler) {
      document.removeEventListener('pointerdown', handler, true)
      this.captureHandler.delete(sortable)
    }

    // Remove data attribute
    delete sortable.element.dataset.marqueeClickAway
  }

  // ── Pointer-down paths ─────────────────────────────────────

  private onAreaPointerDown(e: PointerEvent, sortable: SortableInstance): void {
    if (!this.canStartMarquee(e, sortable)) return
    if (!this.shouldAllowMarqueeStart(e, sortable)) return

    // Touch devices: require a hold before starting marquee so scrolling
    // is not interrupted. The hold timer fires after touchHoldDelay ms;
    // if the finger moves beyond touchHoldThreshold, the hold is cancelled.
    if (e.pointerType === 'touch' && this.opts.touchHoldDelay > 0) {
      this.beginTouchHold(e, sortable)
      return
    }

    const area = this.areaElement.get(sortable)

    // For global areas (html/body), do NOT preventDefault — that would break
    // inputs, scrolling, etc. We defer user-select handling to threshold.
    // For container-scoped areas, prevent default immediately.
    if (area && !isGlobalArea(area)) {
      e.preventDefault()
    }

    this.beginMarquee(e, sortable)
  }

  // ── Touch hold ───────────────────────────────────────────

  /**
   * Start a hold timer for touch-based marquee. During the hold period the
   * browser is free to scroll; we only commit to marquee once the timer fires.
   *
   * Uses touch events instead of pointer events throughout because iOS fires
   * `pointercancel` when its gesture recognizer claims the touch for potential
   * scrolling, killing all subsequent pointer events. Touch events are immune
   * to this — they continue being delivered regardless of the browser's scroll
   * decision.
   */
  private beginTouchHold(e: PointerEvent, sortable: SortableInstance): void {
    activeMarqueeInstance = sortable

    const startX = e.clientX
    const startY = e.clientY
    const pointerId = e.pointerId

    // Prevent compatibility mouse events (click, mousedown, etc.)
    e.preventDefault()

    const sm = sortable.dragManager?.selectionManager
    const snapshot = new Set<HTMLElement>()
    if (sm) {
      sm.selectedElements.forEach((el) => snapshot.add(el))
    }

    const state: MarqueeState = {
      active: false,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      marqueeEl: null,
      pointerId,
      initialSelectionSnapshot: snapshot,
      anchorGroupName: null,
      holdTimer: null,
      isTouchHold: true,
    }

    // ── Hold-period listeners (touch events, NOT pointer events) ──

    const onHoldTouchMove = (ev: TouchEvent): void => {
      const touch = ev.touches[0]
      if (!touch) return
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.sqrt(dx * dx + dy * dy) > this.opts.touchHoldThreshold) {
        // Finger moved beyond threshold — user wants to scroll, not marquee
        cancelHold()
      } else {
        // Finger still within threshold — suppress scrolling during hold
        ev.preventDefault()
      }
    }

    const onHoldTouchEnd = (ev: TouchEvent): void => {
      const touch = ev.changedTouches[0]
      cancelHold()
      // Handle click-away deselection for quick taps on empty space
      if (touch && sm) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY)
        if (
          this.shouldDeselectOnClick(
            { target } as unknown as PointerEvent,
            sortable
          )
        ) {
          sm.clearSelection()
        }
      }
    }

    const cancelHold = (): void => {
      if (state.holdTimer !== null) {
        window.clearTimeout(state.holdTimer)
        state.holdTimer = null
      }
      document.removeEventListener('touchmove', onHoldTouchMove)
      document.removeEventListener('touchend', onHoldTouchEnd)
      document.removeEventListener('touchcancel', onHoldTouchEnd)
      if (activeMarqueeInstance === sortable) {
        activeMarqueeInstance = null
      }
      this.setState(sortable, createDefaultState())
    }

    state.holdTimer = window.setTimeout(() => {
      state.holdTimer = null
      document.removeEventListener('touchmove', onHoldTouchMove)
      document.removeEventListener('touchend', onHoldTouchEnd)
      document.removeEventListener('touchcancel', onHoldTouchEnd)

      // Hold succeeded — commit to marquee
      this.setState(sortable, state)
      this.savedUserSelect.set(sortable, document.body.style.userSelect)
      suppressTextSelection()

      // Attach touch handlers for marquee drawing. These adapt touch
      // coordinates into synthetic PointerEvent-like objects so the
      // existing onPointerMove/onPointerUp logic works unchanged.
      const moveHandler = (ev: TouchEvent): void => {
        const touch = ev.touches[0]
        if (!touch) return
        ev.preventDefault() // prevent scrolling while drawing marquee
        this.onPointerMove(
          {
            clientX: touch.clientX,
            clientY: touch.clientY,
            pointerId,
            shiftKey: false,
            altKey: false,
          } as unknown as PointerEvent,
          sortable
        )
      }
      const upHandler = (ev: TouchEvent): void => {
        const touch = ev.changedTouches[0]
        const target = touch
          ? document.elementFromPoint(touch.clientX, touch.clientY)
          : null
        this.onPointerUp(
          { pointerId, target } as unknown as PointerEvent,
          sortable
        )
      }
      this.touchDocumentHandlers.set(sortable, { moveHandler, upHandler })
      document.addEventListener('touchmove', moveHandler, { passive: false })
      document.addEventListener('touchend', upHandler)
      document.addEventListener('touchcancel', upHandler)

      sortable.eventSystem.emit('marqueeHoldActivated')
    }, this.opts.touchHoldDelay)

    this.setState(sortable, state)
    document.addEventListener('touchmove', onHoldTouchMove, { passive: false })
    document.addEventListener('touchend', onHoldTouchEnd)
    document.addEventListener('touchcancel', onHoldTouchEnd)
  }

  private onDocumentCapturePointerDown(
    e: PointerEvent,
    sortable: SortableInstance
  ): void {
    if (!e.altKey) return
    if (!this.canStartMarquee(e, sortable)) return

    // Only intercept if target is inside this sortable's container
    const el = sortable.element
    if (!el.contains(e.target as Node)) return

    // Must be on an actual item for alt+item path
    const draggableSelector = sortable.options.draggable ?? '.sortable-item'
    const target = (e.target as HTMLElement).closest(draggableSelector)
    if (!target) return

    // Stop propagation so DragManager never sees this event
    e.stopPropagation()
    e.preventDefault()
    this.beginMarquee(e, sortable)
  }

  // ── Shared guards ──────────────────────────────────────────

  private canStartMarquee(
    e: PointerEvent,
    sortable: SortableInstance
  ): boolean {
    if (e.button !== 0) return false
    if (!e.isPrimary) return false
    if (sortable.dragManager?.isDragging) return false

    const state = this.getState<MarqueeState>(sortable)
    if (state?.active) return false

    // Multi-instance lock: another instance already has an active marquee
    if (activeMarqueeInstance !== null && activeMarqueeInstance !== sortable)
      return false

    return true
  }

  private shouldAllowMarqueeStart(
    e: PointerEvent,
    sortable: SortableInstance
  ): boolean {
    const target = e.target as HTMLElement

    // Always exclude draggable items
    const draggableSelector = sortable.options.draggable ?? '.sortable-item'
    if (target.closest(draggableSelector)) return false

    const filter = this.opts.marqueeFilter

    // Exclude filter takes precedence
    if (filter.exclude && target.closest(filter.exclude)) return false

    // Include filter: if set, target must match
    if (filter.include && !target.closest(filter.include)) return false

    return true
  }

  private shouldDeselectOnClick(
    e: PointerEvent,
    sortable: SortableInstance
  ): boolean {
    if (!this.opts.deselectOnClickAway) return false

    const target = e.target
    // Guard: target must be an Element (not Document or other node types)
    if (!(target instanceof HTMLElement)) return true

    // Don't deselect when clicking on a draggable item
    const draggableSelector = sortable.options.draggable ?? '.sortable-item'
    if (target.closest(draggableSelector)) return false

    const filter = this.opts.deselectFilter

    // Exclude filter: suppress deselection on matching elements
    if (filter.exclude && target.closest(filter.exclude)) return false

    // Include filter: only deselect when target matches
    if (filter.include && !target.closest(filter.include)) return false

    return true
  }

  // ── Marquee lifecycle ──────────────────────────────────────

  private beginMarquee(e: PointerEvent, sortable: SortableInstance): void {
    // Claim multi-instance lock
    activeMarqueeInstance = sortable

    const sm = sortable.dragManager?.selectionManager
    const snapshot = new Set<HTMLElement>()
    if (sm) {
      sm.selectedElements.forEach((el) => snapshot.add(el))
    }

    const state: MarqueeState = {
      active: false, // becomes true after threshold
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      marqueeEl: null,
      pointerId: e.pointerId,
      initialSelectionSnapshot: snapshot,
      anchorGroupName: null,
      holdTimer: null,
      isTouchHold: false,
    }
    this.setState(sortable, state)

    const area = this.areaElement.get(sortable)
    const global = area ? isGlobalArea(area) : false

    // For container-scoped areas, disable text selection immediately.
    // For global areas, defer to threshold to avoid breaking inputs/scrolling.
    if (!global) {
      this.savedUserSelect.set(sortable, document.body.style.userSelect)
      suppressTextSelection()
    }

    // Attach document move/up handlers
    const moveHandler = (ev: PointerEvent) => this.onPointerMove(ev, sortable)
    const upHandler = (ev: PointerEvent) => this.onPointerUp(ev, sortable)
    this.documentHandlers.set(sortable, { moveHandler, upHandler })
    document.addEventListener('pointermove', moveHandler)
    document.addEventListener('pointerup', upHandler)
  }

  private onPointerMove(e: PointerEvent, sortable: SortableInstance): void {
    const state = this.getState<MarqueeState>(sortable)
    if (!state || state.pointerId !== e.pointerId) return

    state.currentX = e.clientX
    state.currentY = e.clientY

    if (!state.active) {
      const dx = state.currentX - state.startX
      const dy = state.currentY - state.startY
      if (Math.sqrt(dx * dx + dy * dy) < this.opts.threshold) return

      // Threshold met — activate
      state.active = true

      // For global areas, defer user-select disabling until threshold is met
      if (!this.savedUserSelect.has(sortable)) {
        this.savedUserSelect.set(sortable, document.body.style.userSelect)
        suppressTextSelection()
      }

      state.marqueeEl = this.createMarqueeElement()
      document.body.appendChild(state.marqueeEl)
      sortable.eventSystem.emit('marqueeStart')
    }

    // Always update visual position (unthrottled)
    this.updateMarqueeVisual(state)

    // Throttled hit-testing
    const throttled = this.throttledUpdateSelection.get(sortable)
    if (throttled) {
      throttled(sortable, state, e)
    }
  }

  private onPointerUp(e: PointerEvent, sortable: SortableInstance): void {
    const state = this.getState<MarqueeState>(sortable)
    if (!state || state.pointerId !== e.pointerId) return

    // Click-away deselection: sub-threshold click (marquee never activated)
    if (!state.active && this.shouldDeselectOnClick(e, sortable)) {
      const sm = sortable.dragManager?.selectionManager
      if (sm) sm.clearSelection()
    }

    this.endMarquee(sortable)
  }

  private endMarquee(sortable: SortableInstance): void {
    const state = this.getState<MarqueeState>(sortable)
    if (!state) return

    // Clear any pending touch hold timer
    if (state.holdTimer !== null) {
      window.clearTimeout(state.holdTimer)
      state.holdTimer = null
    }

    // Remove marquee element
    if (state.marqueeEl) {
      state.marqueeEl.remove()
    }

    // Restore userSelect
    const saved = this.savedUserSelect.get(sortable)
    if (saved !== undefined) {
      restoreTextSelection(saved)
      this.savedUserSelect.delete(sortable)
    }

    // Remove document handlers (pointer-initiated marquee)
    const handlers = this.documentHandlers.get(sortable)
    if (handlers) {
      document.removeEventListener('pointermove', handlers.moveHandler)
      document.removeEventListener('pointerup', handlers.upHandler)
      this.documentHandlers.delete(sortable)
    }

    // Remove touch document handlers (touch-initiated marquee)
    const touchHandlers = this.touchDocumentHandlers.get(sortable)
    if (touchHandlers) {
      document.removeEventListener('touchmove', touchHandlers.moveHandler)
      document.removeEventListener('touchend', touchHandlers.upHandler)
      document.removeEventListener('touchcancel', touchHandlers.upHandler)
      this.touchDocumentHandlers.delete(sortable)
    }

    const wasActive = state.active

    // Release multi-instance lock
    if (activeMarqueeInstance === sortable) {
      activeMarqueeInstance = null
    }

    // Reset state
    this.setState(sortable, createDefaultState())

    if (wasActive) {
      sortable.eventSystem.emit('marqueeEnd')
    }
  }

  // ── Visual ─────────────────────────────────────────────────

  private createMarqueeElement(): HTMLElement {
    const el = document.createElement('div')
    el.className = this.opts.marqueeClass
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      border: '1px solid rgba(74, 144, 217, 0.8)',
      backgroundColor: 'rgba(74, 144, 217, 0.15)',
      zIndex: '99999',
    })
    return el
  }

  private updateMarqueeVisual(state: MarqueeState): void {
    if (!state.marqueeEl) return
    const rect = getMarqueeRect(state)
    const s = state.marqueeEl.style
    s.left = `${rect.x}px`
    s.top = `${rect.y}px`
    s.width = `${rect.width}px`
    s.height = `${rect.height}px`
  }

  // ── Hit-testing & selection ────────────────────────────────

  private updateSelection(
    sortable: SortableInstance,
    state: MarqueeState,
    e: PointerEvent
  ): void {
    const sm = sortable.dragManager?.selectionManager
    if (!sm) return

    const marqueeRect = getMarqueeRect(state)
    const draggableSelector = sortable.options.draggable ?? '.sortable-item'
    const items = Array.from(
      sortable.element.querySelectorAll<HTMLElement>(draggableSelector)
    )

    const intersected = items.filter((item) => {
      if (!PluginUtils.isVisible(item)) return false
      const itemRect = PluginUtils.getRect(item)
      return PluginUtils.rectsOverlap(marqueeRect, itemRect)
    })

    this.applyMarqueeSelection(sm, state, intersected, e.shiftKey, e.altKey)
  }

  private applyMarqueeSelection(
    sm: {
      readonly selectedElements: Set<HTMLElement>
      select(item: HTMLElement, addToSelection?: boolean): void
      deselect(item: HTMLElement): void
      clearSelection(): void
    },
    state: MarqueeState,
    intersected: HTMLElement[],
    shiftKey: boolean,
    altKey: boolean
  ): void {
    const snapshot = state.initialSelectionSnapshot
    const intersectedSet = new Set(intersected)

    if (altKey) {
      // Subtractive: restore snapshot, then remove intersected
      // First restore any snapshot items that were deselected
      snapshot.forEach((el) => {
        if (!sm.selectedElements.has(el)) {
          sm.select(el, true)
        }
      })
      // Deselect items not in snapshot
      sm.selectedElements.forEach((el) => {
        if (!snapshot.has(el)) {
          sm.deselect(el)
        }
      })
      // Now remove intersected from selection
      intersectedSet.forEach((el) => {
        if (sm.selectedElements.has(el)) {
          sm.deselect(el)
        }
      })
    } else if (shiftKey) {
      // Additive: restore snapshot + add intersected
      snapshot.forEach((el) => {
        if (!sm.selectedElements.has(el)) {
          sm.select(el, true)
        }
      })
      // Deselect items not in snapshot that aren't intersected
      sm.selectedElements.forEach((el) => {
        if (!snapshot.has(el) && !intersectedSet.has(el)) {
          sm.deselect(el)
        }
      })
      // Add intersected
      intersectedSet.forEach((el) => {
        if (!sm.selectedElements.has(el)) {
          sm.select(el, true)
        }
      })
    } else {
      // Replace: clear all, select only intersected
      sm.clearSelection()
      intersected.forEach((el) => {
        sm.select(el, true)
      })
    }
  }
}
