// Type declarations for test files

import type { Sortable } from '../../src'

declare global {
  interface Window {
    Sortable?: typeof Sortable
    PluginSystem?: any
    AutoScrollPlugin?: any
    MultiDragPlugin?: any
    SwapPlugin?: any
    multiDragSortable?: any
    autoScrollSortable?: any
    swapSortable?: any
    debugSortable?: any
    pluginTestsReady?: boolean
    sortables?: Array<{ el: HTMLElement; destroy: () => void }>
    eventLog?: unknown[]
    eventOrder?: string[]
    moveEventCount?: number
    moveEventData?: unknown
    lastRelatedElement?: string
  }
}

export {}
