/**
 * @fileoverview Global type definitions for test environment
 * @description Type definitions for window object extensions used in E2E tests
 */

import type { SortableInstance } from '../../src/types/index.js'

declare global {
  interface Window {
    /**
     * Flag indicating that the Resortable library has fully loaded
     * Used by E2E tests to ensure proper initialization before running tests
     */
    resortableLoaded: boolean

    /**
     * Global Sortable constructor for testing
     */
    Sortable: typeof import('../../src/core/Sortable.js').Sortable

    /**
     * Global PluginSystem for testing
     */
    PluginSystem: typeof import('../../src/core/PluginSystem.js').PluginSystem

    /**
     * Array of active sortable instances for testing
     */
    sortables: SortableInstance[]

    /**
     * AutoScrollPlugin constructor (may be undefined if not loaded)
     */
    AutoScrollPlugin?: typeof import('../../src/plugins/AutoScrollPlugin.js').AutoScrollPlugin

    /**
     * MultiDragPlugin constructor (may be undefined if not loaded)
     */
    MultiDragPlugin?: typeof import('../../src/plugins/MultiDragPlugin.js').MultiDragPlugin

    /**
     * SwapPlugin constructor (may be undefined if not loaded)
     */
    SwapPlugin?: typeof import('../../src/plugins/SwapPlugin.js').SwapPlugin
  }
}

export {}
