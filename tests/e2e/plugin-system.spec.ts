/**
 * @fileoverview End-to-end tests for plugin system functionality
 * @note This file contains E2E test mocks that access global window objects
 * and internal plugin properties for testing purposes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- E2E test mocks need 'any' for flexibility */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- E2E test accessing internal properties */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- E2E test mock assignments */
/* eslint-disable @typescript-eslint/no-unsafe-call -- E2E test mock function calls */
/* eslint-disable @typescript-eslint/no-unsafe-return -- E2E test mock return values */

import { test, expect } from '@playwright/test'

test.describe('Plugin System E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo.html')
  })

  test('should load and initialize plugin system', async ({ page }) => {
    // Test that the plugin system is available
    const hasPluginSystem = await page.evaluate(() => {
      return typeof (window as any).PluginSystem !== 'undefined'
    })
    expect(hasPluginSystem).toBe(true)
  })

  test('should register and use AutoScroll plugin', async ({ page }) => {
    // Create a test setup with AutoScroll
    await page.evaluate(() => {
      // Create container
      const container = document.createElement('div')
      container.id = 'auto-scroll-test'
      container.style.width = '200px'
      container.style.height = '150px'
      container.style.overflow = 'auto'
      container.style.border = '1px solid #ccc'

      // Add many items to enable scrolling
      for (let i = 0; i < 20; i++) {
        const item = document.createElement('div')
        item.className = 'sortable-item'
        item.textContent = `Item ${i + 1}`
        item.style.padding = '10px'
        item.style.margin = '5px'
        item.style.background = '#f0f0f0'
        item.setAttribute('data-id', `item-${i + 1}`)
        container.appendChild(item)
      }

      document.body.appendChild(container)

      // Initialize sortable with plugin
      const { Sortable, PluginSystem } = window as any

      // Register AutoScroll plugin
      const AutoScrollPlugin = {
        name: 'AutoScroll',
        version: '2.0.0',
        install(sortable: any) {
          // Simple mock implementation for testing
          sortable._autoScrollInstalled = true
        },
        uninstall(sortable: any) {
          sortable._autoScrollInstalled = false
        },
      }

      PluginSystem.register(AutoScrollPlugin)

      // Create sortable and install plugin
      const sortable = new Sortable(container)
      PluginSystem.install(sortable, 'AutoScroll')

      // Store for testing
      ;(window as any).testSortable = sortable
    })

    // Verify plugin is installed
    const isInstalled = await page.evaluate(() => {
      const { PluginSystem } = window as any
      return PluginSystem.isInstalled(
        (window as any).testSortable,
        'AutoScroll'
      )
    })
    expect(isInstalled).toBe(true)

    // Verify plugin functionality
    const hasAutoScroll = await page.evaluate(() => {
      return (window as any).testSortable._autoScrollInstalled
    })
    expect(hasAutoScroll).toBe(true)
  })

  test('should handle MultiDrag plugin integration', async ({ page }) => {
    // Test MultiDrag plugin functionality
    await page.evaluate(() => {
      // Create test container
      const container = document.createElement('div')
      container.id = 'multi-drag-test'
      container.style.padding = '20px'

      // Add items
      for (let i = 0; i < 5; i++) {
        const item = document.createElement('div')
        item.className = 'sortable-item'
        item.textContent = `Multi Item ${i + 1}`
        item.style.padding = '10px'
        item.style.margin = '5px'
        item.style.background = '#e0f0ff'
        item.style.cursor = 'pointer'
        item.setAttribute('data-id', `multi-item-${i + 1}`)
        container.appendChild(item)
      }

      document.body.appendChild(container)

      // Initialize with MultiDrag
      const { Sortable, PluginSystem } = window as any

      // Register mock MultiDrag plugin
      const MultiDragPlugin = {
        name: 'MultiDrag',
        version: '2.0.0',
        install(sortable: any) {
          sortable._multiDragInstalled = true
          // Add click handler for testing
          sortable.element.addEventListener('click', function (e: Event) {
            if ((e as MouseEvent).ctrlKey) {
              const target = e.target as HTMLElement
              if (target.classList.contains('sortable-item')) {
                target.classList.toggle('selected')
              }
            }
          })
        },
        uninstall(sortable: any) {
          sortable._multiDragInstalled = false
        },
      }

      PluginSystem.register(MultiDragPlugin)

      // Create sortable with multiDrag enabled
      const sortable = new Sortable(container, { multiDrag: true })
      PluginSystem.install(sortable, 'MultiDrag')
      ;(window as any).multiDragSortable = sortable
    })

    // Test multi-selection functionality
    const firstItem = page.locator('#multi-drag-test .sortable-item').first()
    const secondItem = page.locator('#multi-drag-test .sortable-item').nth(1)

    // Simulate Ctrl+Click for multi-selection
    await firstItem.click({ modifiers: ['Control'] })
    await secondItem.click({ modifiers: ['Control'] })

    // Verify selection
    const selectedCount = await page
      .locator('#multi-drag-test .sortable-item.selected')
      .count()
    expect(selectedCount).toBe(2)
  })

  test('should handle Swap plugin functionality', async ({ page }) => {
    // Test Swap plugin
    await page.evaluate(() => {
      // Create test container
      const container = document.createElement('div')
      container.id = 'swap-test'
      container.style.padding = '20px'

      // Add items in a grid layout
      for (let i = 0; i < 4; i++) {
        const item = document.createElement('div')
        item.className = 'sortable-item'
        item.textContent = `Swap ${i + 1}`
        item.style.display = 'inline-block'
        item.style.width = '80px'
        item.style.height = '80px'
        item.style.margin = '10px'
        item.style.background = '#ffe0e0'
        item.style.textAlign = 'center'
        item.style.lineHeight = '80px'
        item.setAttribute('data-id', `swap-item-${i + 1}`)
        container.appendChild(item)
      }

      document.body.appendChild(container)

      // Initialize with Swap plugin
      const { Sortable, PluginSystem } = window as any

      // Register mock Swap plugin
      const SwapPlugin = {
        name: 'Swap',
        version: '2.0.0',
        install(sortable: any) {
          sortable._swapInstalled = true
          sortable._swapMode = 'swap' // vs 'insert'
        },
        uninstall(sortable: any) {
          sortable._swapInstalled = false
          sortable._swapMode = 'insert'
        },
      }

      PluginSystem.register(SwapPlugin)

      const sortable = new Sortable(container)
      PluginSystem.install(sortable, 'Swap')
      ;(window as any).swapSortable = sortable
    })

    // Verify swap mode is active
    const swapMode = await page.evaluate(() => {
      return (window as any).swapSortable._swapMode
    })
    expect(swapMode).toBe('swap')
  })

  test('should handle plugin lifecycle correctly', async ({ page }) => {
    // Test complete plugin lifecycle
    await page.evaluate(() => {
      const { Sortable, PluginSystem } = window as any

      // Create test plugin
      const TestPlugin = {
        name: 'TestLifecycle',
        version: '1.0.0',
        installCount: 0,
        uninstallCount: 0,
        install() {
          this.installCount++
        },
        uninstall() {
          this.uninstallCount++
        },
      }

      PluginSystem.register(TestPlugin)

      // Create sortable
      const container = document.createElement('div')
      const sortable = new Sortable(container)

      // Test install
      PluginSystem.install(sortable, 'TestLifecycle')

      // Test uninstall
      PluginSystem.uninstall(sortable, 'TestLifecycle')

      // Test destroy cleanup
      PluginSystem.install(sortable, 'TestLifecycle')
      sortable.destroy()
      ;(window as any).testPlugin = TestPlugin
    })

    // Verify lifecycle calls
    const lifecycleStats = await page.evaluate(() => {
      const plugin = (window as any).testPlugin
      return {
        installCount: plugin.installCount,
        uninstallCount: plugin.uninstallCount,
      }
    })

    expect(lifecycleStats.installCount).toBe(2) // Installed twice
    expect(lifecycleStats.uninstallCount).toBe(2) // Uninstalled manually + destroy
  })

  test('should prevent duplicate plugin installations', async ({ page }) => {
    // Test error handling
    const errorMessage = await page.evaluate(() => {
      const { Sortable, PluginSystem } = window as any

      const TestPlugin = {
        name: 'DuplicateTest',
        version: '1.0.0',
        install() {},
        uninstall() {},
      }

      PluginSystem.register(TestPlugin)

      const container = document.createElement('div')
      const sortable = new Sortable(container)

      // Install once
      PluginSystem.install(sortable, 'DuplicateTest')

      // Try to install again
      try {
        PluginSystem.install(sortable, 'DuplicateTest')
        return null
      } catch (error) {
        return (error as Error).message
      }
    })

    expect(errorMessage).toContain('already installed')
  })

  test('should handle multiple sortable instances independently', async ({
    page,
  }) => {
    // Test plugin isolation between instances
    await page.evaluate(() => {
      const { Sortable, PluginSystem } = window as any

      const TestPlugin = {
        name: 'IsolationTest',
        version: '1.0.0',
        instances: new Set(),
        install(sortable: any) {
          this.instances.add(sortable)
        },
        uninstall(sortable: any) {
          this.instances.delete(sortable)
        },
      }

      PluginSystem.register(TestPlugin)

      // Create two sortables
      const container1 = document.createElement('div')
      const container2 = document.createElement('div')
      const sortable1 = new Sortable(container1)
      const sortable2 = new Sortable(container2)

      // Install on first only
      PluginSystem.install(sortable1, 'IsolationTest')
      ;(window as any).testResults = {
        sortable1HasPlugin: PluginSystem.isInstalled(
          sortable1,
          'IsolationTest'
        ),
        sortable2HasPlugin: PluginSystem.isInstalled(
          sortable2,
          'IsolationTest'
        ),
        pluginInstanceCount: TestPlugin.instances.size,
      }
    })

    const results = await page.evaluate(() => (window as any).testResults)

    expect(results.sortable1HasPlugin).toBe(true)
    expect(results.sortable2HasPlugin).toBe(false)
    expect(results.pluginInstanceCount).toBe(1)
  })
})
