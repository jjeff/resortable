/**
 * @fileoverview Plugin exports for Resortable library
 * @author Resortable Team
 * @since 2.0.0
 */

export { AutoScrollPlugin, type AutoScrollOptions } from './AutoScrollPlugin.js'
export { MultiDragPlugin, type MultiDragOptions } from './MultiDragPlugin.js'
export { SwapPlugin, type SwapOptions } from './SwapPlugin.js'

// Re-export the PluginSystem for convenience
export { PluginSystem } from '../core/PluginSystem.js'

// Import types and classes for internal use
import { PluginSystem } from '../core/PluginSystem.js'
import { AutoScrollPlugin } from './AutoScrollPlugin.js'
import { MultiDragPlugin } from './MultiDragPlugin.js'
import { SwapPlugin } from './SwapPlugin.js'
import type { SortableInstance } from '../types/index.js'

/**
 * Utility function to register all built-in plugins
 *
 * @example
 * ```typescript
 * import { registerAllPlugins } from 'resortable/plugins';
 *
 * // Register all built-in plugins
 * registerAllPlugins();
 * ```
 */
export function registerAllPlugins(): void {
  PluginSystem.register(AutoScrollPlugin.create())
  PluginSystem.register(MultiDragPlugin.create())
  PluginSystem.register(SwapPlugin.create())
}

/**
 * Utility function to register and install common plugins on a Sortable instance
 *
 * @param sortable - The Sortable instance to install plugins on
 * @param plugins - Array of plugin names to install
 *
 * @example
 * ```typescript
 * import { Sortable } from 'resortable';
 * import { installCommonPlugins } from 'resortable/plugins';
 *
 * const sortable = new Sortable(element, { multiDrag: true });
 * installCommonPlugins(sortable, ['AutoScroll', 'MultiDrag']);
 * ```
 */
export function installCommonPlugins(
  sortable: SortableInstance,
  plugins: string[] = ['AutoScroll']
): void {
  for (const pluginName of plugins) {
    try {
      PluginSystem.install(sortable, pluginName)
    } catch (error) {
      // Plugin installation failed - logged for debugging
      // eslint-disable-next-line no-console
      console.warn(`Failed to install plugin "${pluginName}":`, error)
    }
  }
}
