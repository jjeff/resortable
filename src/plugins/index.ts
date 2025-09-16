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
  const { PluginSystem } = require('../core/PluginSystem.js')
  const { AutoScrollPlugin } = require('./AutoScrollPlugin.js')
  const { MultiDragPlugin } = require('./MultiDragPlugin.js')
  const { SwapPlugin } = require('./SwapPlugin.js')

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
  sortable: any,
  plugins: string[] = ['AutoScroll']
): void {
  const { PluginSystem } = require('../core/PluginSystem.js')

  for (const pluginName of plugins) {
    try {
      PluginSystem.install(sortable, pluginName)
    } catch (error) {
      console.warn(`Failed to install plugin "${pluginName}":`, error)
    }
  }
}
