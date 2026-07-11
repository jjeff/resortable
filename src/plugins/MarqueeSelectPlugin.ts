/**
 * @fileoverview MarqueeSelectPlugin — rubber-band (lasso) selection for sortable lists
 * @author Resortable Team
 * @since 2.0.0
 *
 * Provides Finder/Explorer-style marquee selection:
 *  - Click+drag on empty space to draw a selection rectangle
 *  - Alt+drag on items to start marquee instead of dragging
 *  - Shift held at marquee start = additive, Alt held = subtractive
 *    (cached at start — releasing the key mid-drag doesn't flip the mode)
 *  - Optional multi-list `scope`: one marquee selects across MANY sortable
 *    lists (each item's owning instance resolved via the instance
 *    registry), with the first intersected kind locking the mode
 *  - Optional `scrollContainer`: the marquee anchors to the container's
 *    content (it stretches while the container scrolls) and dragging near
 *    the container's top/bottom edge auto-scrolls it
 */

import type {
  SelectionManagerInterface,
  SortableInstance,
} from '../types/index.js'
import { findOwningInstance } from '../core/InstanceRegistry.js'
import { BasePlugin, PluginUtils } from './PluginUtils.js'

/** Filter config for include/exclude CSS selectors */
export interface MarqueeFilterConfig {
  /** Only allow when target matches this selector */
  include?: string
  /** Block when target matches this selector */
  exclude?: string
}

/**
 * One kind of selectable item participating in a multi-list marquee.
 * Kinds are mutually exclusive per marquee: the first kind the rectangle
 * touches locks the mode until the selection is cleared (Finder-style
 * "you're selecting clips OR songs, never both").
 */
export interface MarqueeScopeEntry {
  /** CSS selector matching the participating items (e.g. `.clip`) */
  itemSelector: string
  /**
   * Sub-element of the item that must intersect the marquee (e.g. a drag
   * handle). Items without a match never intersect.
   */
  hitSelector?: string
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
  /**
   * Multi-list scope. When set, the marquee hit-tests every element
   * matching each entry's `itemSelector` inside the marquee area, resolves
   * each item's owning Sortable instance, and applies selection through
   * that instance (so per-instance `select` events fire normally). When
   * omitted, only the installing instance's own items participate.
   */
  scope?: MarqueeScopeEntry[]
  /**
   * Scrollable container to anchor the marquee to. The marquee element is
   * appended inside it (content coordinates, so it stretches while the
   * container scrolls) and pointer positions near the container's top or
   * bottom edge auto-scroll it. HTMLElement or CSS selector.
   */
  scrollContainer?: HTMLElement | string
  /** Distance (px) from the scrollContainer edge that triggers auto-scroll. Default: 30 */
  autoScrollDistance?: number
  /** Auto-scroll speed in px per millisecond. Default: 0.3 */
  autoScrollSpeed?: number
}

type ResolvedMarqueeOptions = Required<
  Omit<MarqueeSelectOptions, 'scope' | 'scrollContainer'>
> &
  Pick<MarqueeSelectOptions, 'scope' | 'scrollContainer'>

/** A scoped item with its owning instance and scope-entry index. */
interface ScopedItem {
  el: HTMLElement
  instance: SortableInstance
  kind: number
}

interface MarqueeState {
  active: boolean
  /** Start/current points — content coords when scroll-anchored, else viewport */
  startX: number
  startY: number
  currentX: number
  currentY: number
  /** Last raw pointer position (viewport coords) — drives edge auto-scroll */
  lastClientX: number
  lastClientY: number
  marqueeEl: HTMLElement | null
  pointerId: number | null
  /** Selection snapshot per participating instance, taken at marquee start */
  snapshot: Map<SortableInstance, Set<HTMLElement>>
  /** Additive (shift) / subtractive (alt) mode, cached at marquee start */
  additive: boolean
  subtractive: boolean
  /** Scope-entry index the marquee is locked to (null until first hit) */
  lockedKind: number | null
  /** Edge auto-scroll direction currently engaged */
  scrolling: 'up' | 'down' | false
  scrollRaf: number | null
  /**
   * Scroll container's content size captured at marquee start. The marquee
   * element itself lives INSIDE the container, so its growing rect inflates
   * live scrollWidth/Height — clamping against the live values let the
   * auto-scroll chase a bottom edge the marquee kept extending, scrolling
   * forever past the real content.
   */
  contentLimit: { w: number; h: number } | null
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

const DEFAULT_OPTIONS: ResolvedMarqueeOptions = {
  marqueeClass: 'sortable-marquee',
  threshold: 5,
  altDragOnItems: true,
  marqueeArea: 'html',
  marqueeFilter: {},
  deselectOnClickAway: true,
  deselectFilter: {},
  touchHoldDelay: 300,
  touchHoldThreshold: 10,
  scope: undefined,
  scrollContainer: undefined,
  autoScrollDistance: 30,
  autoScrollSpeed: 0.3,
}

function createDefaultState(): MarqueeState {
  return {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    lastClientX: 0,
    lastClientY: 0,
    marqueeEl: null,
    pointerId: null,
    snapshot: new Map(),
    additive: false,
    subtractive: false,
    lockedKind: null,
    scrolling: false,
    scrollRaf: null,
    contentLimit: null,
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

function resolveElement(ref: HTMLElement | string, what: string): HTMLElement {
  if (ref instanceof HTMLElement) return ref
  const el = document.querySelector<HTMLElement>(ref)
  if (!el)
    throw new Error(
      `MarqueeSelectPlugin: ${what} selector "${ref}" matched no element`
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

  private opts: ResolvedMarqueeOptions
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
  private scrollElement = new WeakMap<SortableInstance, HTMLElement>()
  private savedUserSelect = new WeakMap<SortableInstance, string>()
  private touchDocumentHandlers = new WeakMap<
    SortableInstance,
    TouchDocumentHandlers
  >()
  private throttledUpdateSelection: WeakMap<
    SortableInstance,
    (sortable: SortableInstance, state: MarqueeState) => void
  > = new WeakMap()

  public static create(options?: MarqueeSelectOptions): MarqueeSelectPlugin {
    return new MarqueeSelectPlugin(options)
  }

  constructor(options?: MarqueeSelectOptions) {
    super()
    // Drop explicit-undefined entries so they can't clobber defaults.
    const defined = Object.fromEntries(
      Object.entries(options ?? {}).filter(([, v]) => v !== undefined)
    )
    this.opts = { ...DEFAULT_OPTIONS, ...defined }
  }

  protected onInstall(sortable: SortableInstance): void {
    this.setState(sortable, createDefaultState())

    // Throttled selection update (~60fps)
    const throttled = PluginUtils.throttle((...args: unknown[]) => {
      const [s, st] = args as [SortableInstance, MarqueeState]
      this.updateSelection(s, st)
    }, 16)
    this.throttledUpdateSelection.set(
      sortable,
      throttled as (s: SortableInstance, st: MarqueeState) => void
    )

    // Resolve and store the marquee area element
    const area = resolveElement(this.opts.marqueeArea, 'marqueeArea')
    this.areaElement.set(sortable, area)

    // Resolve the scroll-anchor container, when configured
    if (this.opts.scrollContainer) {
      this.scrollElement.set(
        sortable,
        resolveElement(this.opts.scrollContainer, 'scrollContainer')
      )
    }

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
    this.scrollElement.delete(sortable)

    // Clean up capture handler (not tracked by BasePlugin since it's on document)
    const handler = this.captureHandler.get(sortable)
    if (handler) {
      document.removeEventListener('pointerdown', handler, true)
      this.captureHandler.delete(sortable)
    }

    // Remove data attribute
    delete sortable.element.dataset.marqueeClickAway
  }

  // ── Scope resolution ───────────────────────────────────────

  /** The item kinds this marquee selects across (single-list fallback). */
  private scopeEntries(sortable: SortableInstance): MarqueeScopeEntry[] {
    if (this.opts.scope && this.opts.scope.length > 0) return this.opts.scope
    return [{ itemSelector: sortable.options.draggable ?? '.sortable-item' }]
  }

  /** Root under which scoped items are queried. */
  private scopeRoot(sortable: SortableInstance): ParentNode {
    const scroll = this.scrollElement.get(sortable)
    if (scroll) return scroll
    const area = this.areaElement.get(sortable)
    if (area && !isGlobalArea(area)) return area
    return document
  }

  /**
   * Collect every participating item with its owning instance. In
   * single-list mode the owner is always the installing instance; in
   * multi-list `scope` mode it's resolved via the instance registry.
   */
  private collectScopedItems(sortable: SortableInstance): ScopedItem[] {
    const entries = this.scopeEntries(sortable)
    const root = this.scopeRoot(sortable)
    const out: ScopedItem[] = []
    entries.forEach((entry, kind) => {
      root.querySelectorAll<HTMLElement>(entry.itemSelector).forEach((el) => {
        if (
          el.hasAttribute('data-resortable-placeholder') ||
          el.hasAttribute('data-resortable-ghost')
        )
          return
        const instance = this.opts.scope
          ? findOwningInstance(el)
          : sortable.element.contains(el)
            ? sortable
            : undefined
        if (!instance) return
        out.push({ el, instance, kind })
      })
    })
    return out
  }

  /** Selector matching ANY scoped item (alt+drag-on-item path). */
  private scopedItemSelector(sortable: SortableInstance): string {
    return this.scopeEntries(sortable)
      .map((e) => e.itemSelector)
      .join(', ')
  }

  /**
   * Selector for surfaces that BLOCK marquee-start / click-away-deselect.
   * An entry with a `hitSelector` only claims that sub-area (a song row
   * blocks on its drag handle, but its empty body is valid marquee-start
   * space — a typical consumer blocks on `.clip, .handle`, never the
   * whole `.song` row).
   */
  private scopedBlockingSelector(sortable: SortableInstance): string {
    return this.scopeEntries(sortable)
      .map((e) =>
        e.hitSelector ? `${e.itemSelector} ${e.hitSelector}` : e.itemSelector
      )
      .join(', ')
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

    const touchScroll = this.scrollElement.get(sortable)
    const state: MarqueeState = {
      ...createDefaultState(),
      contentLimit: touchScroll
        ? { w: touchScroll.scrollWidth, h: touchScroll.scrollHeight }
        : null,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      lastClientX: startX,
      lastClientY: startY,
      pointerId,
      snapshot: this.takeSnapshot(sortable),
      isTouchHold: true,
    }
    state.lockedKind = this.kindOfSnapshot(sortable, state.snapshot)

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
      if (touch) {
        const target = document.elementFromPoint(touch.clientX, touch.clientY)
        if (
          this.shouldDeselectOnClick(
            { target } as unknown as PointerEvent,
            sortable
          )
        ) {
          this.clearScopedSelections(sortable)
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

      // Hold succeeded — commit to marquee. Anchor the start point now
      // (content coords when scroll-anchored).
      const anchored = this.toMarqueePoint(sortable, startX, startY)
      state.startX = anchored.x
      state.startY = anchored.y
      state.currentX = anchored.x
      state.currentY = anchored.y
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

    // Must be on a scoped item for the alt+item path. In single-list mode
    // the item must also live inside this instance's container.
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      this.scopedItemSelector(sortable)
    )
    if (!target) return
    if (!this.opts.scope && !sortable.element.contains(target)) return

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

    // Always exclude the participating items' grab surfaces
    if (target.closest(this.scopedBlockingSelector(sortable))) return false

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

    // Don't deselect when clicking on a participating item's grab surface
    if (target.closest(this.scopedBlockingSelector(sortable))) return false

    const filter = this.opts.deselectFilter

    // Exclude filter: suppress deselection on matching elements
    if (filter.exclude && target.closest(filter.exclude)) return false

    // Include filter: only deselect when target matches
    if (filter.include && !target.closest(filter.include)) return false

    return true
  }

  // ── Snapshot / selection helpers ───────────────────────────

  /** Current selection per participating instance. */
  private takeSnapshot(
    sortable: SortableInstance
  ): Map<SortableInstance, Set<HTMLElement>> {
    const snapshot = new Map<SortableInstance, Set<HTMLElement>>()
    for (const { instance } of this.collectScopedItems(sortable)) {
      if (snapshot.has(instance)) continue
      const sm = instance.dragManager?.selectionManager
      snapshot.set(instance, new Set(sm ? sm.selectedElements : []))
    }
    // The installing instance always participates, even when it currently
    // hosts no scoped items.
    if (!snapshot.has(sortable)) {
      const sm = sortable.dragManager?.selectionManager
      snapshot.set(sortable, new Set(sm ? sm.selectedElements : []))
    }
    return snapshot
  }

  /**
   * The scope kind of an existing selection (or null when empty) — an
   * additive/subtractive marquee stays locked to the kind already selected,
   * matching classic multi-select mode-locking.
   */
  private kindOfSnapshot(
    sortable: SortableInstance,
    snapshot: Map<SortableInstance, Set<HTMLElement>>
  ): number | null {
    const entries = this.scopeEntries(sortable)
    for (const selected of snapshot.values()) {
      for (const el of selected) {
        const kind = entries.findIndex((entry) =>
          el.matches(entry.itemSelector)
        )
        if (kind !== -1) return kind
      }
    }
    return null
  }

  /** Clear the selection of every participating instance. */
  private clearScopedSelections(sortable: SortableInstance): void {
    const seen = new Set<SortableInstance>()
    for (const { instance } of this.collectScopedItems(sortable)) {
      if (seen.has(instance)) continue
      seen.add(instance)
      instance.dragManager?.selectionManager?.clearSelection()
    }
    if (!seen.has(sortable)) {
      sortable.dragManager?.selectionManager?.clearSelection()
    }
  }

  // ── Marquee lifecycle ──────────────────────────────────────

  private beginMarquee(e: PointerEvent, sortable: SortableInstance): void {
    // Claim multi-instance lock
    activeMarqueeInstance = sortable

    // Measure the content BEFORE the marquee element exists (see
    // MarqueeState.contentLimit).
    const scroll = this.scrollElement.get(sortable)
    const contentLimit = scroll
      ? { w: scroll.scrollWidth, h: scroll.scrollHeight }
      : null

    const start = this.toMarqueePoint(sortable, e.clientX, e.clientY)
    const state: MarqueeState = {
      ...createDefaultState(),
      contentLimit,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      pointerId: e.pointerId,
      snapshot: this.takeSnapshot(sortable),
      // Modifiers are cached at start (legacy parity): releasing shift/alt
      // mid-drag must not flip the mode and blow away the selection.
      additive: e.shiftKey,
      subtractive: !e.shiftKey && e.altKey,
    }
    // Additive/subtractive marquees stay locked to the kind already
    // selected; a replace marquee re-locks on its first hit.
    state.lockedKind =
      state.additive || state.subtractive
        ? this.kindOfSnapshot(sortable, state.snapshot)
        : null
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

  /**
   * Convert a viewport point into the marquee's coordinate space:
   * content coordinates of the scroll container when scroll-anchored
   * (clamped inside the scrollable content), viewport coordinates
   * otherwise.
   */
  private toMarqueePoint(
    sortable: SortableInstance,
    clientX: number,
    clientY: number
  ): { x: number; y: number } {
    const scroll = this.scrollElement.get(sortable)
    if (!scroll) return { x: clientX, y: clientY }
    // Clamp to the content size captured at marquee start when available —
    // the live scrollWidth/Height include the marquee element itself.
    const limit = this.getState<MarqueeState>(sortable)?.contentLimit
    const maxX = (limit?.w ?? scroll.scrollWidth) - 1
    const maxY = (limit?.h ?? scroll.scrollHeight) - 1
    const rect = scroll.getBoundingClientRect()
    return {
      x: Math.max(1, Math.min(clientX - rect.left + scroll.scrollLeft, maxX)),
      y: Math.max(1, Math.min(clientY - rect.top + scroll.scrollTop, maxY)),
    }
  }

  private onPointerMove(e: PointerEvent, sortable: SortableInstance): void {
    const state = this.getState<MarqueeState>(sortable)
    if (!state || state.pointerId !== e.pointerId) return

    state.lastClientX = e.clientX
    state.lastClientY = e.clientY
    const point = this.toMarqueePoint(sortable, e.clientX, e.clientY)
    state.currentX = point.x
    state.currentY = point.y

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
      const scroll = this.scrollElement.get(sortable)
      if (scroll) {
        // Content-anchored: absolute inside the scroll container, so the
        // rectangle stretches while the container scrolls beneath the
        // pointer. The container needs a positioning context.
        state.marqueeEl.style.position = 'absolute'
        if (window.getComputedStyle(scroll).position === 'static') {
          scroll.style.position = 'relative'
        }
        scroll.appendChild(state.marqueeEl)
      } else {
        document.body.appendChild(state.marqueeEl)
      }
      sortable.eventSystem.emit('marqueeStart')
    }

    // Always update visual position (unthrottled)
    this.updateMarqueeVisual(state)

    // Edge auto-scroll of the scroll container
    this.updateAutoScroll(sortable, state)

    // Throttled hit-testing
    const throttled = this.throttledUpdateSelection.get(sortable)
    if (throttled) {
      throttled(sortable, state)
    }
  }

  private onPointerUp(e: PointerEvent, sortable: SortableInstance): void {
    const state = this.getState<MarqueeState>(sortable)
    if (!state || state.pointerId !== e.pointerId) return

    // Click-away deselection: sub-threshold click (marquee never activated)
    if (!state.active && this.shouldDeselectOnClick(e, sortable)) {
      this.clearScopedSelections(sortable)
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

    // Stop edge auto-scroll
    if (state.scrollRaf !== null) {
      window.cancelAnimationFrame(state.scrollRaf)
      state.scrollRaf = null
    }
    state.scrolling = false

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

  // ── Edge auto-scroll (scrollContainer only) ────────────────

  /**
   * Auto-scroll the anchored container while the pointer sits near its
   * top/bottom edge, stretching the marquee and re-hit-testing as content
   * moves. Time-based speed (px/ms), not per-event steps.
   */
  private updateAutoScroll(
    sortable: SortableInstance,
    state: MarqueeState
  ): void {
    const scroll = this.scrollElement.get(sortable)
    if (!scroll || !state.active) return

    state.scrolling = this.scrollDirection(state, scroll)
    if (!state.scrolling || state.scrollRaf !== null) return

    // One loop at a time (guarded by scrollRaf). The frame timestamp lives
    // in the closure — the loop is the only writer, so re-evaluating the
    // direction each frame can never reset the clock (a reset made every
    // elapsed read 0 and the marquee never actually scrolled).
    let last = 0
    const tick = (now: number): void => {
      state.scrollRaf = null
      if (!state.active) return
      state.scrolling = this.scrollDirection(state, scroll)
      if (!state.scrolling) return

      const elapsed = last === 0 ? 0 : now - last
      last = now
      const delta = Math.round(elapsed * this.opts.autoScrollSpeed)
      scroll.scrollBy(0, state.scrolling === 'up' ? -delta : delta)

      // The container moved under a stationary pointer: recompute the
      // current corner from the last raw pointer position, redraw, and
      // re-run the (throttled) hit test.
      const point = this.toMarqueePoint(
        sortable,
        state.lastClientX,
        state.lastClientY
      )
      state.currentX = point.x
      state.currentY = point.y
      this.updateMarqueeVisual(state)
      this.throttledUpdateSelection.get(sortable)?.(sortable, state)

      state.scrollRaf = window.requestAnimationFrame(tick)
    }
    state.scrollRaf = window.requestAnimationFrame(tick)
  }

  /** Edge test: which way should the container scroll for the pointer's
   *  current position — with room left to actually scroll that way. */
  private scrollDirection(
    state: MarqueeState,
    scroll: HTMLElement
  ): 'up' | 'down' | false {
    const rect = scroll.getBoundingClientRect()
    const distance = this.opts.autoScrollDistance
    if (state.lastClientY < rect.top + distance && scroll.scrollTop > 0) {
      return 'up'
    }
    // "Room to scroll down" is measured against the content captured at
    // marquee start — the marquee element inflates the live scrollHeight,
    // which made this chase a bottom edge of its own making.
    const contentHeight = state.contentLimit?.h ?? scroll.scrollHeight
    if (
      state.lastClientY > rect.bottom - distance &&
      scroll.scrollTop + scroll.clientHeight < contentHeight
    ) {
      return 'down'
    }
    return false
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

  /**
   * The marquee rectangle in VIEWPORT coordinates — computed from state
   * (not from `marqueeEl.getBoundingClientRect()`, which needs layout):
   * content coords are mapped back through the scroll container's current
   * scroll position, so the rect is correct mid-auto-scroll too.
   */
  private marqueeViewportRect(
    sortable: SortableInstance,
    state: MarqueeState
  ): DOMRect {
    const rect = getMarqueeRect(state)
    const scroll = this.scrollElement.get(sortable)
    if (!scroll) return rect
    const c = scroll.getBoundingClientRect()
    return new DOMRect(
      rect.x + c.left - scroll.scrollLeft,
      rect.y + c.top - scroll.scrollTop,
      rect.width,
      rect.height
    )
  }

  private updateSelection(
    sortable: SortableInstance,
    state: MarqueeState
  ): void {
    // Throttled — may fire after pointerup already tore the marquee down.
    if (!state.active) return

    const marqueeRect = this.marqueeViewportRect(sortable, state)

    const entries = this.scopeEntries(sortable)
    const items = this.collectScopedItems(sortable)
    let intersected = items.filter((item) => {
      if (!PluginUtils.isVisible(item.el)) return false
      const hitSelector = entries[item.kind]?.hitSelector
      const hitEl = hitSelector
        ? item.el.querySelector<HTMLElement>(hitSelector)
        : item.el
      if (!hitEl) return false
      return PluginUtils.rectsOverlap(marqueeRect, PluginUtils.getRect(hitEl))
    })

    // Mode locking: the first kind the marquee touches wins; other kinds
    // are ignored for the rest of the marquee.
    if (state.lockedKind === null && intersected.length > 0) {
      state.lockedKind = intersected[0].kind
    }
    if (state.lockedKind !== null) {
      intersected = intersected.filter((i) => i.kind === state.lockedKind)
    }

    this.applyMarqueeSelection(state, items, intersected)
  }

  /**
   * Apply the marquee result per participating instance, as a DIFF against
   * that instance's current selection — one select/deselect (and one
   * `select` event) per actual change, never a clear-and-rebuild storm.
   */
  private applyMarqueeSelection(
    state: MarqueeState,
    allItems: ScopedItem[],
    intersected: ScopedItem[]
  ): void {
    const intersectedSet = new Set(intersected.map((i) => i.el))

    // Instances that host scoped items now, plus any that had a snapshot.
    const instances = new Set<SortableInstance>(state.snapshot.keys())
    for (const item of allItems) instances.add(item.instance)

    for (const instance of instances) {
      const sm: SelectionManagerInterface | undefined =
        instance.dragManager?.selectionManager
      if (!sm) continue
      const snap = state.snapshot.get(instance) ?? new Set<HTMLElement>()
      const here = intersected
        .filter((i) => i.instance === instance)
        .map((i) => i.el)

      let wanted: Set<HTMLElement>
      if (state.subtractive) {
        wanted = new Set([...snap].filter((el) => !intersectedSet.has(el)))
      } else if (state.additive) {
        wanted = new Set([...snap, ...here])
      } else {
        wanted = new Set(here)
      }

      for (const el of Array.from(sm.selectedElements)) {
        if (!wanted.has(el)) sm.deselect(el)
      }
      for (const el of wanted) {
        if (!sm.selectedElements.has(el)) sm.select(el, true)
      }
    }
  }
}
