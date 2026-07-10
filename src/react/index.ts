/**
 * @fileoverview React adapter for Resortable — `resortable/react`
 *
 * A single hook, {@link useSortable}, built on the core's controlled mode:
 * the library never structurally moves React-owned nodes; drags resolve to
 * one {@link SortIntent} the consumer commits by updating state.
 *
 * See docs/plans/2026-07-09-react-adapter-design.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Sortable } from 'resortable'
import type { SortableEvent, SortableOptions, MoveEvent } from 'resortable'

/**
 * The outcome of a drag, assembled from the source list's `end` event.
 * Commit it by updating state; indexes are a snapshot of drag-start /
 * drop-time positions — if your array can mutate mid-drag, apply by
 * `dataIds` lookup instead of index.
 */
export interface SortIntent {
  /** Per dragged item, read from `dataIdAttr` (default `data-id`) */
  dataIds: string[]
  from: HTMLElement
  to: HTMLElement
  /** Hook `id` of the source zone, when adapter-managed */
  fromId?: string
  /** Hook `id` of the target zone, when adapter-managed */
  toId?: string
  /** Per-item indices in `from` at drag start */
  oldIndexes: number[]
  /** Per-item indices in `to` after the commit (contiguous block) */
  newIndexes: number[]
  /** `'clone'` means the consumer inserts copies (minting new ids) */
  pullMode?: boolean | 'clone' | 'move'
}

export type UseSortableOptions = Omit<
  SortableOptions,
  'controlled' | 'onSort' | 'onEnd' | 'store'
> & {
  /** Called once per completed drag with the full intent */
  onSort: (intent: SortIntent) => void
  /** Mirrors multi-drag selection changes out as data-ids */
  onSelectionChange?: (ids: string[]) => void
  /**
   * Controlled selection: data-ids that should be selected in this list.
   * Ids not present in the list are ignored, so a consumer may pass one
   * app-wide selection array to every zone. Pair with `onSelectionChange`
   * to make consumer state the single source of truth.
   */
  selectedIds?: readonly string[]
  /** Names this zone in cross-list intents (fromId/toId) */
  id?: string
}

export interface UseSortableReturn<T extends HTMLElement = HTMLElement> {
  /** Attach to the list container element */
  ref: (el: T | null) => void
  /** Escape hatch to the raw Sortable instance (null before mount) */
  sortable: RefObject<Sortable | null>
  /** Current multi-drag selection as data-ids */
  getSelectedIds: () => string[]
  /** Programmatically set the multi-drag selection by data-ids */
  setSelectedIds: (ids: string[]) => void
}

interface ZoneRecord {
  id?: string
}

// Module-level registry (the adapter's analog of core's GlobalDragState):
// resolves event.from / event.to elements to hook `id`s across instances.
// WeakMap so unmounted zones never leak.
const zones = new WeakMap<HTMLElement, ZoneRecord>()

/** Option keys the adapter owns — never forwarded to the core instance. */
const ADAPTER_KEYS = new Set([
  'onSort',
  'onSelectionChange',
  'selectedIds',
  'id',
])

/**
 * Core callback options that must read the latest consumer prop at call
 * time (so changing a callback identity never touches the instance).
 * `onEnd` is deliberately absent — the adapter owns the end event.
 */
const CALLBACK_KEYS = [
  'onStart',
  'onChoose',
  'onUnchoose',
  'onUpdate',
  'onSort',
  'onAdd',
  'onRemove',
  'onSelect',
  'onClone',
  'onChange',
  'onSpill',
  'onFilter',
  'setData',
] as const

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function escapeAttr(value: string): string {
  if (typeof globalThis.CSS !== 'undefined' && globalThis.CSS.escape) {
    return globalThis.CSS.escape(value)
  }
  // Fallback for environments without CSS.escape: backslash-escape `\` and
  // `"`, hex-escape line terminators — any of these raw would make the
  // quoted attribute selector invalid and querySelector throw.
  return value.replace(/[\\"\n\r\f]/g, (c) =>
    c === '\\' || c === '"' ? `\\${c}` : `\\${c.charCodeAt(0).toString(16)} `
  )
}

/**
 * React hook wrapping a controlled-mode Sortable.
 *
 * - Returns a callback ref — attach it to the element you render.
 * - Forces `controlled: true`; a completed drag calls `onSort(intent)`
 *   exactly once (on the source hook for cross-list drags).
 * - StrictMode-safe: create/destroy is idempotent under double effects.
 * - Option changes apply via `sortable.option()` (no remount); changes
 *   arriving mid-drag are queued and flushed when the drag ends.
 * - After a keyboard drop, focus is restored to the moved item's
 *   `data-id` one animation frame after the consumer's commit.
 */
export function useSortable<T extends HTMLElement = HTMLElement>(
  options: UseSortableOptions
): UseSortableReturn<T> {
  const [element, setElement] = useState<T | null>(null)
  const sortableRef = useRef<Sortable | null>(null)
  const optionsRef = useRef(options)
  const prevOptionsRef = useRef<UseSortableOptions | null>(null)
  const queuedDiffRef = useRef<Map<string, unknown>>(new Map())
  const flushRafRef = useRef(0)
  // True while the controlled-selection effect is writing to the
  // SelectionManager — suppresses the select-event mirror so applying the
  // consumer's own state never echoes back as onSelectionChange calls.
  const syncingSelectionRef = useRef(false)
  optionsRef.current = options

  const ref = useCallback((el: T | null) => setElement(el), [])

  // Diffs queued mid-drag can't wait for this instance's own end event —
  // the active drag may belong to a different list, whose end this hook
  // never sees. Poll each frame until no drag is active anywhere, then
  // apply the queued options.
  const scheduleQueuedFlush = useCallback((): void => {
    if (flushRafRef.current !== 0) return
    const tick = (): void => {
      flushRafRef.current = 0
      const sortable = sortableRef.current
      if (!sortable || queuedDiffRef.current.size === 0) return
      if (Sortable.active) {
        flushRafRef.current = window.requestAnimationFrame(tick)
        return
      }
      const queued = queuedDiffRef.current
      queuedDiffRef.current = new Map()
      for (const [key, value] of queued) {
        sortable.option(
          key as keyof SortableOptions,
          value as SortableOptions[keyof SortableOptions]
        )
      }
    }
    flushRafRef.current = window.requestAnimationFrame(tick)
  }, [])

  const dataIdAttr = (): string => optionsRef.current.dataIdAttr ?? 'data-id'

  const readId = (el: HTMLElement, index: number): string => {
    const id = el.getAttribute(dataIdAttr())
    if (id !== null) return id
    // Missing identity attribute is a consumer bug — intents can't be
    // applied reliably by index alone. Loud, not fatal.
    // eslint-disable-next-line no-console
    console.error(
      `[resortable/react] sortable item is missing the "${dataIdAttr()}" attribute; falling back to index ${index}`
    )
    return String(index)
  }

  // Mount / destroy — StrictMode's create → destroy → create is safe
  // because destroy() fully detaches and the registry is per-element.
  useEffect(() => {
    if (!element) return

    const initial = optionsRef.current
    const coreOptions: Partial<SortableOptions> = {}
    for (const [key, value] of Object.entries(initial)) {
      if (ADAPTER_KEYS.has(key)) continue
      if (typeof value === 'function')
        continue // wrapped below
      ;(coreOptions as Record<string, unknown>)[key] = value
    }

    // Read-at-call-time wrappers so callback identity changes never
    // require touching the instance. The core `onSort` prop name is
    // shadowed by the adapter's intent callback, so core's own onSort
    // (SortableEvent) is intentionally not forwardable.
    for (const key of CALLBACK_KEYS) {
      if (key === 'onSort') continue
      ;(coreOptions as Record<string, unknown>)[key] = (...args: unknown[]) => {
        const fn = (optionsRef.current as Record<string, unknown>)[key]
        if (typeof fn === 'function') {
          return (fn as (...a: unknown[]) => unknown)(...args)
        }
      }
    }
    // onMove's return value carries cancel/override semantics — forward it.
    coreOptions.onMove = (evt: MoveEvent, orig: Event) =>
      optionsRef.current.onMove?.(evt, orig)

    const sortable = new Sortable(element, {
      ...coreOptions,
      controlled: true,
      onEnd: (event: SortableEvent) => {
        const oldIndexes = event.oldIndexes ?? [event.oldIndex ?? -1]
        const newIndexes = event.newIndexes ?? [event.newIndex ?? -1]

        // Keyboard drops leave focus on the anchor item; capture its id
        // so we can restore focus after the consumer's re-render
        // replaces the node.
        const active = document.activeElement
        const anchorId =
          active instanceof HTMLElement && event.items.includes(active)
            ? active.getAttribute(dataIdAttr())
            : null

        const isNoOp =
          event.from === event.to && arraysEqual(oldIndexes, newIndexes)

        if (!isNoOp) {
          const intent: SortIntent = {
            dataIds: event.items.map(readId),
            from: event.from,
            to: event.to,
            fromId: zones.get(event.from)?.id,
            toId: zones.get(event.to)?.id,
            oldIndexes,
            newIndexes,
            pullMode: event.pullMode,
          }
          optionsRef.current.onSort(intent)

          if (anchorId !== null) {
            window.requestAnimationFrame(() => {
              const restored = event.to.querySelector<HTMLElement>(
                `[${dataIdAttr()}="${escapeAttr(anchorId)}"]`
              )
              restored?.focus()
            })
          }
        }
      },
    } as SortableOptions)

    // Selection bridge: elements → data-ids at the boundary.
    sortable.eventSystem.on('select', (event) => {
      if (syncingSelectionRef.current) return
      const items = event.items ?? []
      optionsRef.current.onSelectionChange?.(
        items.map((el, i) => readId(el, i))
      )
    })

    zones.set(element, { id: initial.id })
    sortableRef.current = sortable

    return () => {
      zones.delete(element)
      sortable.destroy()
      sortableRef.current = null
      queuedDiffRef.current = new Map()
      if (flushRafRef.current !== 0) {
        window.cancelAnimationFrame(flushRafRef.current)
        flushRafRef.current = 0
      }
    }
    // Everything else is intentionally read through optionsRef at call
    // time — only the element identity should remount the instance.
  }, [element])

  // Option diff — apply value changes via option() without remounting.
  // Diffs arriving while ANY drag is active are queued (option() rebuilds
  // DragManager; rebuilding either the source or a potential target zone
  // mid-drag would break the drag) and flushed once no drag is active.
  useEffect(() => {
    const prev = prevOptionsRef.current
    prevOptionsRef.current = options
    const sortable = sortableRef.current
    if (!sortable || !prev) return

    if (element) {
      const zone = zones.get(element)
      if (zone) zone.id = options.id
    }

    const keys = new Set([...Object.keys(prev), ...Object.keys(options)])
    for (const key of keys) {
      if (ADAPTER_KEYS.has(key)) continue
      const prevValue = (prev as Record<string, unknown>)[key]
      const nextValue = (options as Record<string, unknown>)[key]
      if (typeof prevValue === 'function' || typeof nextValue === 'function') {
        continue // callbacks read through optionsRef at call time
      }
      if (Object.is(prevValue, nextValue)) continue
      if (Sortable.active) {
        queuedDiffRef.current.set(key, nextValue)
        scheduleQueuedFlush()
      } else {
        sortable.option(
          key as keyof SortableOptions,
          nextValue as SortableOptions[keyof SortableOptions]
        )
      }
    }
  })

  // Controlled selection — when `selectedIds` is provided, consumer state
  // is authoritative. Runs every render (like the option diff above): the
  // set of matching DOM nodes can change without the prop's identity
  // changing (re-renders, cross-list moves). Skipped mid-drag — the
  // internal selection IS the dragged set; the consumer's post-drop
  // re-render re-runs the sync. Ids with no matching item here are
  // ignored, so one app-wide selection array can be passed to every zone.
  useEffect(() => {
    const ids = optionsRef.current.selectedIds
    if (ids === undefined) return
    const sortable = sortableRef.current
    const el = sortable?.element
    if (!sortable || !el || Sortable.active) return

    const attr = dataIdAttr()
    const selection = sortable.dragManager.selectionManager
    const wanted: HTMLElement[] = []
    for (const id of ids) {
      const item = el.querySelector<HTMLElement>(
        `[${attr}="${escapeAttr(id)}"]`
      )
      if (item) wanted.push(item)
    }
    const current = selection.selectedElements
    const inSync =
      current.size === wanted.length && wanted.every((w) => current.has(w))
    if (inSync) return

    syncingSelectionRef.current = true
    try {
      selection.clearSelection()
      for (const item of wanted) selection.select(item, true)
    } finally {
      syncingSelectionRef.current = false
    }
  })

  const getSelectedIds = useCallback((): string[] => {
    const sortable = sortableRef.current
    if (!sortable) return []
    const selected = Array.from(
      sortable.dragManager.selectionManager.selectedElements
    )
    const attr = optionsRef.current.dataIdAttr ?? 'data-id'
    return selected.map((el, i) => el.getAttribute(attr) ?? String(i))
  }, [])

  const setSelectedIds = useCallback((ids: string[]): void => {
    const sortable = sortableRef.current
    const el = sortable?.element
    if (!sortable || !el) return
    const attr = optionsRef.current.dataIdAttr ?? 'data-id'
    const selection = sortable.dragManager.selectionManager
    selection.clearSelection()
    for (const id of ids) {
      const item = el.querySelector<HTMLElement>(
        `[${attr}="${escapeAttr(id)}"]`
      )
      if (item) selection.select(item, true)
    }
  }, [])

  return { ref, sortable: sortableRef, getSelectedIds, setSelectedIds }
}
