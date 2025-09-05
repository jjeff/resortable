// Type declarations for test files

import type { Sortable } from '../../src'

declare global {
  interface Window {
    Sortable?: typeof Sortable
    eventLog?: unknown[]
    eventOrder?: string[]
    moveEventCount?: number
    moveEventData?: unknown
    lastRelatedElement?: string
  }
}

export {}
