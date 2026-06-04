// Type declarations for test files
// ESLint suppressions for legitimate test type definitions requiring 'any'
/* eslint-disable @typescript-eslint/no-explicit-any -- Test global types need 'any' for external libraries and dynamic test objects */

import type { Sortable } from '../../src'

// Extend Sortable interface for test-specific properties
declare module '../../src' {
  interface Sortable {
    _selectedItems?: Set<HTMLElement>
    _lastSelected?: HTMLElement | null
    _demoSelectInstalled?: boolean
    _demoSelectClickHandler?: (event: MouseEvent) => void
  }
}

declare global {
  interface Window {
    Sortable?: typeof Sortable
    PluginSystem?: any
    AutoScrollPlugin?: any
    SwapPlugin?: any
    demoSelectSortable?: any
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
