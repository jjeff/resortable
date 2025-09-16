/**
 * @fileoverview Plugin system for extending Sortable functionality
 * @author Resortable Team
 * @since 2.0.0
 */

import { SortablePlugin, SortableInstance } from '../types/index.js'

/**
 * Plugin system for managing Sortable plugins
 *
 * @remarks
 * The PluginSystem manages the lifecycle of plugins, providing registration,
 * installation, and cleanup functionality. It ensures plugins are properly
 * installed and uninstalled from Sortable instances.
 *
 * @example Basic plugin registration
 * ```typescript
 * import { PluginSystem, AutoScrollPlugin } from 'resortable';
 *
 * // Register a plugin globally
 * PluginSystem.register(AutoScrollPlugin);
 *
 * // Install on a sortable instance
 * const sortable = new Sortable(element);
 * PluginSystem.install(sortable, 'AutoScroll');
 * ```
 *
 * @public
 */
export class PluginSystem {
  /**
   * Registry of available plugins by name
   */
  private static plugins = new Map<string, SortablePlugin>()

  /**
   * Track which plugins are installed on which instances
   */
  private static installations = new WeakMap<SortableInstance, Set<string>>()

  /**
   * Register a plugin globally
   *
   * @param plugin - The plugin to register
   * @param options - Registration options
   * @param options.overwrite - If true, overwrite existing plugin instead of throwing error
   * @throws Error if plugin name conflicts with existing plugin and overwrite is false
   *
   * @example
   * ```typescript
   * PluginSystem.register(new MyCustomPlugin());
   * // Or to overwrite existing:
   * PluginSystem.register(new MyCustomPlugin(), { overwrite: true });
   * ```
   */
  public static register(
    plugin: SortablePlugin,
    options: { overwrite?: boolean } = {}
  ): void {
    if (this.plugins.has(plugin.name) && !options.overwrite) {
      throw new Error(`Plugin "${plugin.name}" is already registered`)
    }

    this.plugins.set(plugin.name, plugin)
  }

  /**
   * Unregister a plugin globally
   *
   * @param name - Name of the plugin to unregister
   * @returns true if plugin was found and removed, false otherwise
   *
   * @example
   * ```typescript
   * PluginSystem.unregister('MyPlugin');
   * ```
   */
  public static unregister(name: string): boolean {
    return this.plugins.delete(name)
  }

  /**
   * Get a registered plugin by name
   *
   * @param name - Name of the plugin to retrieve
   * @returns The plugin instance or undefined if not found
   *
   * @example
   * ```typescript
   * const plugin = PluginSystem.get('AutoScroll');
   * if (plugin) {
   *   console.log('Plugin version:', plugin.version);
   * }
   * ```
   */
  public static get(name: string): SortablePlugin | undefined {
    return this.plugins.get(name)
  }

  /**
   * Get all registered plugin names
   *
   * @returns Array of plugin names
   *
   * @example
   * ```typescript
   * const pluginNames = PluginSystem.list();
   * console.log('Available plugins:', pluginNames);
   * ```
   */
  public static list(): string[] {
    return Array.from(this.plugins.keys())
  }

  /**
   * Install a plugin on a Sortable instance
   *
   * @param instance - The Sortable instance to install the plugin on
   * @param name - Name of the plugin to install
   * @throws Error if plugin is not registered or already installed
   *
   * @example
   * ```typescript
   * const sortable = new Sortable(element);
   * PluginSystem.install(sortable, 'AutoScroll');
   * ```
   */
  public static install(instance: SortableInstance, name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new Error(`Plugin "${name}" is not registered`)
    }

    // Get or create installation set for this instance
    let installed = this.installations.get(instance)
    if (!installed) {
      installed = new Set<string>()
      this.installations.set(instance, installed)
    }

    // Check if already installed
    if (installed.has(name)) {
      throw new Error(`Plugin "${name}" is already installed on this instance`)
    }

    // Install the plugin
    plugin.install(instance)
    installed.add(name)
  }

  /**
   * Uninstall a plugin from a Sortable instance
   *
   * @param instance - The Sortable instance to uninstall the plugin from
   * @param name - Name of the plugin to uninstall
   * @returns true if plugin was found and uninstalled, false otherwise
   *
   * @example
   * ```typescript
   * PluginSystem.uninstall(sortable, 'AutoScroll');
   * ```
   */
  public static uninstall(instance: SortableInstance, name: string): boolean {
    const plugin = this.plugins.get(name)
    const installed = this.installations.get(instance)

    if (!plugin || !installed || !installed.has(name)) {
      return false
    }

    // Uninstall the plugin
    plugin.uninstall(instance)
    installed.delete(name)

    // Clean up empty installation set
    if (installed.size === 0) {
      this.installations.delete(instance)
    }

    return true
  }

  /**
   * Uninstall all plugins from a Sortable instance
   *
   * @param instance - The Sortable instance to clean up
   *
   * @example
   * ```typescript
   * // Clean up all plugins when destroying sortable
   * PluginSystem.uninstallAll(sortable);
   * sortable.destroy();
   * ```
   */
  public static uninstallAll(instance: SortableInstance): void {
    const installed = this.installations.get(instance)
    if (!installed) {
      return
    }

    // Uninstall each plugin
    for (const name of installed) {
      const plugin = this.plugins.get(name)
      if (plugin) {
        plugin.uninstall(instance)
      }
    }

    // Clean up installation tracking
    this.installations.delete(instance)
  }

  /**
   * Check if a plugin is installed on an instance
   *
   * @param instance - The Sortable instance to check
   * @param name - Name of the plugin to check
   * @returns true if plugin is installed, false otherwise
   *
   * @example
   * ```typescript
   * if (PluginSystem.isInstalled(sortable, 'AutoScroll')) {
   *   console.log('AutoScroll is active');
   * }
   * ```
   */
  public static isInstalled(instance: SortableInstance, name: string): boolean {
    const installed = this.installations.get(instance)
    return installed ? installed.has(name) : false
  }

  /**
   * Get all installed plugin names for an instance
   *
   * @param instance - The Sortable instance to check
   * @returns Array of installed plugin names
   *
   * @example
   * ```typescript
   * const installedPlugins = PluginSystem.getInstalled(sortable);
   * console.log('Installed plugins:', installedPlugins);
   * ```
   */
  public static getInstalled(instance: SortableInstance): string[] {
    const installed = this.installations.get(instance)
    return installed ? Array.from(installed) : []
  }

  /**
   * Install multiple plugins at once
   *
   * @param instance - The Sortable instance to install plugins on
   * @param names - Array of plugin names to install
   *
   * @example
   * ```typescript
   * PluginSystem.installMany(sortable, ['AutoScroll', 'MultiDrag']);
   * ```
   */
  public static installMany(instance: SortableInstance, names: string[]): void {
    for (const name of names) {
      this.install(instance, name)
    }
  }

  /**
   * Uninstall multiple plugins at once
   *
   * @param instance - The Sortable instance to uninstall plugins from
   * @param names - Array of plugin names to uninstall
   *
   * @example
   * ```typescript
   * PluginSystem.uninstallMany(sortable, ['AutoScroll', 'MultiDrag']);
   * ```
   */
  public static uninstallMany(
    instance: SortableInstance,
    names: string[]
  ): void {
    for (const name of names) {
      this.uninstall(instance, name)
    }
  }
}
