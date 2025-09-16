/**
 * @fileoverview Unit tests for PluginSystem
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginSystem } from '../../src/core/PluginSystem.js'
import { SortablePlugin } from '../../src/types/index.js'

// Mock plugins for testing
class MockPlugin implements SortablePlugin {
  public readonly name: string
  public readonly version = '1.0.0'
  public installCalled = false
  public uninstallCalled = false
  public installedInstances = new Set<any>()

  constructor(name: string) {
    this.name = name
  }

  install(sortable: any): void {
    this.installCalled = true
    this.installedInstances.add(sortable)
  }

  uninstall(sortable: any): void {
    this.uninstallCalled = true
    this.installedInstances.delete(sortable)
  }
}

class ErrorPlugin implements SortablePlugin {
  public readonly name = 'ErrorPlugin'
  public readonly version = '1.0.0'

  install(): void {
    throw new Error('Install failed')
  }

  uninstall(): void {
    throw new Error('Uninstall failed')
  }
}

describe('PluginSystem', () => {
  let mockPlugin1: MockPlugin
  let mockPlugin2: MockPlugin
  let mockSortable: any

  beforeEach(() => {
    // Clear plugin registry
    ;(PluginSystem as any).plugins.clear()
    // WeakMap doesn't have clear(), so create a new one
    ;(PluginSystem as any).installations = new WeakMap()

    mockPlugin1 = new MockPlugin('TestPlugin1')
    mockPlugin2 = new MockPlugin('TestPlugin2')
    mockSortable = {
      id: 'test-sortable',
      element: document.createElement('div'),
      options: {},
      eventSystem: {},
    }
  })

  afterEach(() => {
    // Clean up after each test
    ;(PluginSystem as any).plugins.clear()
    ;(PluginSystem as any).installations = new WeakMap()
  })

  describe('Plugin Registration', () => {
    it('should register a plugin', () => {
      PluginSystem.register(mockPlugin1)
      expect(PluginSystem.get('TestPlugin1')).toBe(mockPlugin1)
    })

    it('should throw error when registering plugin with duplicate name', () => {
      PluginSystem.register(mockPlugin1)
      expect(() => PluginSystem.register(mockPlugin1)).toThrow(
        'Plugin "TestPlugin1" is already registered'
      )
    })

    it('should unregister a plugin', () => {
      PluginSystem.register(mockPlugin1)
      expect(PluginSystem.unregister('TestPlugin1')).toBe(true)
      expect(PluginSystem.get('TestPlugin1')).toBeUndefined()
    })

    it('should return false when unregistering non-existent plugin', () => {
      expect(PluginSystem.unregister('NonExistent')).toBe(false)
    })

    it('should list all registered plugins', () => {
      PluginSystem.register(mockPlugin1)
      PluginSystem.register(mockPlugin2)
      const pluginNames = PluginSystem.list()
      expect(pluginNames).toContain('TestPlugin1')
      expect(pluginNames).toContain('TestPlugin2')
      expect(pluginNames).toHaveLength(2)
    })
  })

  describe('Plugin Installation', () => {
    beforeEach(() => {
      PluginSystem.register(mockPlugin1)
      PluginSystem.register(mockPlugin2)
    })

    it('should install a plugin on a sortable instance', () => {
      PluginSystem.install(mockSortable, 'TestPlugin1')

      expect(mockPlugin1.installCalled).toBe(true)
      expect(mockPlugin1.installedInstances.has(mockSortable)).toBe(true)
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(true)
    })

    it('should throw error when installing non-existent plugin', () => {
      expect(() => PluginSystem.install(mockSortable, 'NonExistent')).toThrow(
        'Plugin "NonExistent" is not registered'
      )
    })

    it('should throw error when installing already installed plugin', () => {
      PluginSystem.install(mockSortable, 'TestPlugin1')
      expect(() => PluginSystem.install(mockSortable, 'TestPlugin1')).toThrow(
        'Plugin "TestPlugin1" is already installed on this instance'
      )
    })

    it('should install multiple plugins', () => {
      PluginSystem.installMany(mockSortable, ['TestPlugin1', 'TestPlugin2'])

      expect(mockPlugin1.installCalled).toBe(true)
      expect(mockPlugin2.installCalled).toBe(true)
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(true)
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin2')).toBe(true)
    })

    it('should get list of installed plugins', () => {
      PluginSystem.install(mockSortable, 'TestPlugin1')
      PluginSystem.install(mockSortable, 'TestPlugin2')

      const installed = PluginSystem.getInstalled(mockSortable)
      expect(installed).toContain('TestPlugin1')
      expect(installed).toContain('TestPlugin2')
      expect(installed).toHaveLength(2)
    })
  })

  describe('Plugin Uninstallation', () => {
    beforeEach(() => {
      PluginSystem.register(mockPlugin1)
      PluginSystem.register(mockPlugin2)
      PluginSystem.install(mockSortable, 'TestPlugin1')
      PluginSystem.install(mockSortable, 'TestPlugin2')
    })

    it('should uninstall a plugin from sortable instance', () => {
      const result = PluginSystem.uninstall(mockSortable, 'TestPlugin1')

      expect(result).toBe(true)
      expect(mockPlugin1.uninstallCalled).toBe(true)
      expect(mockPlugin1.installedInstances.has(mockSortable)).toBe(false)
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(false)
    })

    it('should return false when uninstalling non-installed plugin', () => {
      const anotherSortable = {
        id: 'another',
        element: document.createElement('div'),
        options: {},
        eventSystem: {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn(),
        },
      }
      const result = PluginSystem.uninstall(anotherSortable, 'TestPlugin1')
      expect(result).toBe(false)
    })

    it('should uninstall multiple plugins', () => {
      PluginSystem.uninstallMany(mockSortable, ['TestPlugin1', 'TestPlugin2'])

      expect(mockPlugin1.uninstallCalled).toBe(true)
      expect(mockPlugin2.uninstallCalled).toBe(true)
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(false)
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin2')).toBe(false)
    })

    it('should uninstall all plugins from instance', () => {
      PluginSystem.uninstallAll(mockSortable)

      expect(mockPlugin1.uninstallCalled).toBe(true)
      expect(mockPlugin2.uninstallCalled).toBe(true)
      expect(PluginSystem.getInstalled(mockSortable)).toHaveLength(0)
    })

    it('should clean up installation tracking when all plugins uninstalled', () => {
      PluginSystem.uninstall(mockSortable, 'TestPlugin1')
      PluginSystem.uninstall(mockSortable, 'TestPlugin2')

      // Installation map should be cleaned up
      const installations = (PluginSystem as any).installations
      expect(installations.has(mockSortable)).toBe(false)
    })
  })

  describe('Multiple Instances', () => {
    let anotherSortable: any

    beforeEach(() => {
      anotherSortable = {
        id: 'another-sortable',
        element: document.createElement('div'),
        options: {},
        eventSystem: {
          on: vi.fn(),
          off: vi.fn(),
          emit: vi.fn(),
        },
      }
      PluginSystem.register(mockPlugin1)
    })

    it('should track plugins separately for different instances', () => {
      PluginSystem.install(mockSortable, 'TestPlugin1')
      PluginSystem.install(anotherSortable, 'TestPlugin1')

      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(true)
      expect(PluginSystem.isInstalled(anotherSortable, 'TestPlugin1')).toBe(
        true
      )

      PluginSystem.uninstall(mockSortable, 'TestPlugin1')

      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(false)
      expect(PluginSystem.isInstalled(anotherSortable, 'TestPlugin1')).toBe(
        true
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle plugin install errors gracefully', () => {
      const errorPlugin = new ErrorPlugin()
      PluginSystem.register(errorPlugin)

      expect(() => PluginSystem.install(mockSortable, 'ErrorPlugin')).toThrow(
        'Install failed'
      )
    })

    it('should handle plugin uninstall errors gracefully', () => {
      const errorPlugin = new ErrorPlugin()
      PluginSystem.register(errorPlugin)

      // Force add to installations to test uninstall error
      const installations = (PluginSystem as any).installations
      let installed = installations.get(mockSortable)
      if (!installed) {
        installed = new Set()
        installations.set(mockSortable, installed)
      }
      installed.add('ErrorPlugin')

      expect(() => PluginSystem.uninstall(mockSortable, 'ErrorPlugin')).toThrow(
        'Uninstall failed'
      )
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty plugin list', () => {
      expect(PluginSystem.list()).toHaveLength(0)
      expect(PluginSystem.getInstalled(mockSortable)).toHaveLength(0)
    })

    it('should handle uninstalling from instance with no plugins', () => {
      expect(PluginSystem.uninstall(mockSortable, 'NonExistent')).toBe(false)
      PluginSystem.uninstallAll(mockSortable) // Should not throw
    })

    it('should handle checking installation on instance with no plugins', () => {
      expect(PluginSystem.isInstalled(mockSortable, 'TestPlugin1')).toBe(false)
    })
  })
})
