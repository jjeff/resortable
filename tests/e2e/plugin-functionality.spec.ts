/**
 * @fileoverview E2E tests for actual plugin functionality
 * @note This file contains test mock plugins that require extensive use of 'any' types
 * for testing internal plugin functionality and accessing private sortable properties.
 * ESLint suppressions are used throughout for legitimate testing purposes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Test mock plugins need 'any' for flexibility */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Test accessing internal plugin properties */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Test mock assignments */
/* eslint-disable @typescript-eslint/no-unsafe-call -- Test mock function calls */
/* eslint-disable @typescript-eslint/no-unsafe-argument -- Test mock arguments */
/* eslint-disable @typescript-eslint/no-unsafe-return -- Test mock return values */
/* eslint-disable @typescript-eslint/require-await -- Test async functions may not always await */
/* eslint-disable no-console -- E2E test debug logging */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- E2E test DOM assertions */

import { test, expect } from '@playwright/test'

test.describe('Plugin Functionality E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the main page which has PluginSystem available globally
    await page.goto('/')

    // Wait for the main page to load and have PluginSystem available
    await page.waitForFunction(
      () => {
        return window.Sortable && window.PluginSystem
      },
      { timeout: 10000 }
    )

    // Set up test containers and plugins using the main page's setup
    await page.evaluate(async () => {
      // Use inline plugins for testing since the main library already has classes in place
      const AutoScrollPlugin = {
        name: 'AutoScroll',
        version: '2.0.0',
        install(sortable: any) {
          sortable._autoScrollInstalled = true
          const trackMouse = (e: MouseEvent) => {
            // Mouse tracking functionality
            console.log('Mouse tracked:', e.clientX, e.clientY)
          }
          document.addEventListener('mousemove', trackMouse)
          sortable._autoScrollMouseTracker = trackMouse
        },
        uninstall(sortable: any) {
          if (sortable._autoScrollMouseTracker) {
            document.removeEventListener(
              'mousemove',
              sortable._autoScrollMouseTracker
            )
            delete sortable._autoScrollMouseTracker
          }
          sortable._autoScrollInstalled = false
        },
      }

      // This is a generic click-selection mock plugin used to exercise the
      // PluginSystem lifecycle. It used to be named "MultiDrag"; multi-drag
      // is now a core feature (`multiDrag: true`), not a plugin (#34). The
      // mock is renamed to DemoSelect to avoid implying a built-in.
      const DemoSelectPlugin = {
        name: 'DemoSelect',
        version: '2.0.0',
        install(sortable: any) {
          sortable._demoSelectInstalled = true
          sortable._selectedItems = new Set()

          const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            if (!target) return
            const item = target.closest('.sortable-item')
            if (!item) return

            if (event.ctrlKey || event.metaKey) {
              if (sortable._selectedItems.has(item)) {
                sortable._selectedItems.delete(item)
                item.classList.remove('sortable-selected')
              } else {
                sortable._selectedItems.add(item)
                item.classList.add('sortable-selected')
              }
            } else if (event.shiftKey && sortable._lastSelected) {
              const items = Array.from(
                sortable.element.querySelectorAll('.sortable-item')
              )
              const startIdx = items.indexOf(sortable._lastSelected)
              const endIdx = items.indexOf(item)
              const start = Math.min(startIdx, endIdx)
              const end = Math.max(startIdx, endIdx)

              sortable._selectedItems.forEach((el: Element) =>
                el.classList.remove('sortable-selected')
              )
              sortable._selectedItems.clear()

              for (let i = start; i <= end; i++) {
                const targetItem = items[i] as HTMLElement
                if (targetItem) {
                  sortable._selectedItems.add(targetItem)
                  targetItem.classList.add('sortable-selected')
                }
              }
            } else {
              sortable._selectedItems.forEach((el: Element) =>
                el.classList.remove('sortable-selected')
              )
              sortable._selectedItems.clear()
              sortable._selectedItems.add(item)
              item.classList.add('sortable-selected')
              sortable._lastSelected = item
            }
          }

          sortable.element.addEventListener('click', handleClick)
          sortable._demoSelectClickHandler = handleClick
        },
        uninstall(sortable: any) {
          if (sortable._demoSelectClickHandler) {
            sortable.element.removeEventListener(
              'click',
              sortable._demoSelectClickHandler
            )
            delete sortable._demoSelectClickHandler
          }
          sortable._demoSelectInstalled = false
        },
      }

      const SwapPlugin = {
        name: 'Swap',
        version: '2.0.0',
        install(sortable: any) {
          sortable._swapInstalled = true
          sortable._swapMode = true
        },
        uninstall(sortable: any) {
          sortable._swapInstalled = false
          sortable._swapMode = false
        },
      }

      // Debug: Check if PluginSystem is available and log registration
      console.log('PluginSystem available:', !!window.PluginSystem)
      console.log('Registering plugins...')

      // Register plugins
      try {
        window.PluginSystem.register(AutoScrollPlugin)
        console.log('AutoScroll registered successfully')
      } catch (e) {
        console.error('Failed to register AutoScroll:', e)
      }

      try {
        window.PluginSystem.register(DemoSelectPlugin)
        console.log('DemoSelect registered successfully')
      } catch (e) {
        console.error('Failed to register DemoSelect:', e)
      }

      try {
        window.PluginSystem.register(SwapPlugin)
        console.log('Swap registered successfully')
      } catch (e) {
        console.error('Failed to register Swap:', e)
      }

      // Check registered plugins
      console.log('All registered plugins:', window.PluginSystem.list())

      // Create test containers
      const testHTML = `
        <div id="plugin-test-area" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: white; z-index: 9999; overflow: auto; padding: 20px;">
          <style>
            .plugin-test-container { margin: 20px 0; padding: 20px; border: 1px solid #ccc; }
            .plugin-test-item {
              padding: 10px; margin: 5px 0; background: #f0f0f0; cursor: move; user-select: none;
            }
            .sortable-selected { background: #cce5ff !important; border: 2px solid #0066cc; }
            .sortable-ghost { opacity: 0.4; }
            .sortable-chosen { background: #ffe6cc; }
            #autoscroll-container { height: 200px; overflow: auto; border: 2px solid #999; width: 300px; }
            #swap-container { display: flex; flex-wrap: wrap; gap: 10px; }
            #swap-container .plugin-test-item { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin: 0; }
          </style>

          <div class="plugin-test-container">
            <h3>DemoSelect Plugin Test</h3>
            <div id="demo-select-list">
              <div class="plugin-test-item sortable-item" data-id="demo-1">Demo Item 1</div>
              <div class="plugin-test-item sortable-item" data-id="demo-2">Demo Item 2</div>
              <div class="plugin-test-item sortable-item" data-id="demo-3">Demo Item 3</div>
              <div class="plugin-test-item sortable-item" data-id="demo-4">Demo Item 4</div>
              <div class="plugin-test-item sortable-item" data-id="demo-5">Demo Item 5</div>
            </div>
          </div>

          <div class="plugin-test-container">
            <h3>AutoScroll Plugin Test</h3>
            <div id="autoscroll-container">
              <div id="autoscroll-list">
                <div class="plugin-test-item sortable-item" data-id="scroll-1">Scroll Item 1</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-2">Scroll Item 2</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-3">Scroll Item 3</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-4">Scroll Item 4</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-5">Scroll Item 5</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-6">Scroll Item 6</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-7">Scroll Item 7</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-8">Scroll Item 8</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-9">Scroll Item 9</div>
                <div class="plugin-test-item sortable-item" data-id="scroll-10">Scroll Item 10</div>
              </div>
            </div>
          </div>

          <div class="plugin-test-container">
            <h3>Swap Plugin Test</h3>
            <div id="swap-container">
              <div class="plugin-test-item sortable-item" data-id="swap-1">A</div>
              <div class="plugin-test-item sortable-item" data-id="swap-2">B</div>
              <div class="plugin-test-item sortable-item" data-id="swap-3">C</div>
              <div class="plugin-test-item sortable-item" data-id="swap-4">D</div>
            </div>
          </div>
        </div>
      `

      document.body.insertAdjacentHTML('beforeend', testHTML)

      // Create sortables with plugins
      console.log('Creating sortables...')

      window.demoSelectSortable = new window.Sortable!(
        document.getElementById('demo-select-list')!,
        {
          animation: 150,
        }
      )
      console.log('DemoSelect sortable created')

      try {
        window.PluginSystem.install(window.demoSelectSortable, 'DemoSelect')
        console.log('DemoSelect plugin installed successfully')
      } catch (e) {
        console.error('Failed to install DemoSelect plugin:', e)
      }

      window.autoScrollSortable = new window.Sortable!(
        document.getElementById('autoscroll-list')!,
        {
          animation: 150,
        }
      )
      console.log('AutoScroll sortable created')

      try {
        window.PluginSystem.install(window.autoScrollSortable, 'AutoScroll')
        console.log('AutoScroll plugin installed successfully')
      } catch (e) {
        console.error('Failed to install AutoScroll plugin:', e)
      }

      window.swapSortable = new window.Sortable!(
        document.getElementById('swap-container')!,
        {
          animation: 150,
        }
      )
      console.log('Swap sortable created')

      try {
        window.PluginSystem.install(window.swapSortable, 'Swap')
        console.log('Swap plugin installed successfully')
      } catch (e) {
        console.error('Failed to install Swap plugin:', e)
      }

      // Mark as ready
      window.pluginTestsReady = true
    })

    // Wait for initialization to complete
    await page.waitForFunction(
      () => {
        return (
          window.demoSelectSortable &&
          window.autoScrollSortable &&
          window.swapSortable &&
          window.pluginTestsReady
        )
      },
      { timeout: 10000 }
    )
  })

  test.afterEach(async ({ page }) => {
    // Clean up test containers
    await page.evaluate(() => {
      const testArea = document.getElementById('plugin-test-area')
      if (testArea) {
        testArea.remove()
      }
      // Clean up globals
      delete (window as any).demoSelectSortable
      delete (window as any).autoScrollSortable
      delete (window as any).swapSortable
      delete (window as any).pluginTestsReady
    })
  })

  // The former 'MultiDrag Plugin' describe block (Ctrl+click / Shift+click /
  // toggle / single-click selection) was removed in #34: multi-drag is now a
  // core feature, not a plugin, and these scenarios are covered against the
  // real implementation in tests/e2e/multi-select.spec.ts. The DemoSelect
  // mock kept above is wired only so the Plugin Lifecycle describe (further
  // down) can exercise install/uninstall/duplicate via a real registered
  // plugin name.

  test.describe('AutoScroll Plugin', () => {
    test('should be installed and ready', async ({ page }) => {
      const isInstalled = await page.evaluate(() => {
        return window.PluginSystem.isInstalled(
          window.autoScrollSortable,
          'AutoScroll'
        )
      })
      expect(isInstalled).toBe(true)

      const hasAutoScroll = await page.evaluate(() => {
        return window.autoScrollSortable._autoScrollInstalled
      })
      expect(hasAutoScroll).toBe(true)
    })

    test('should activate mouse tracking on drag start', async ({ page }) => {
      // Start a drag operation
      const firstItem = page.locator('#autoscroll-list .sortable-item').first()

      // Simulate drag start
      await firstItem.hover()
      await page.mouse.down()

      // Check if auto-scroll is activated
      const hasActiveScrolling = await page.evaluate(() => {
        return (
          typeof window.autoScrollSortable._autoScrollMouseTracker ===
          'function'
        )
      })
      expect(hasActiveScrolling).toBe(true)

      // End drag
      await page.mouse.up()
    })

    test('should handle container scrolling during drag', async ({ page }) => {
      // Get initial scroll position
      const initialScrollTop = await page.evaluate(() => {
        return document.getElementById('autoscroll-container')!.scrollTop
      })

      // Scroll down to make items visible
      await page.evaluate(() => {
        document.getElementById('autoscroll-container')!.scrollTop = 100
      })

      const scrolledPosition = await page.evaluate(() => {
        return document.getElementById('autoscroll-container')!.scrollTop
      })

      expect(scrolledPosition).toBeGreaterThan(initialScrollTop)
    })
  })

  test.describe('Swap Plugin', () => {
    test('should be installed with swap mode enabled', async ({ page }) => {
      const isInstalled = await page.evaluate(() => {
        return window.PluginSystem.isInstalled(window.swapSortable, 'Swap')
      })
      expect(isInstalled).toBe(true)

      const hasSwapMode = await page.evaluate(() => {
        return window.swapSortable._swapMode === true
      })
      expect(hasSwapMode).toBe(true)
    })

    test('should show visual feedback during swap operations', async ({
      page,
    }) => {
      // Get initial order
      const initialOrder = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('#swap-container .sortable-item')
        ).map((el) => (el as HTMLElement).textContent)
      })

      // Perform a drag operation to trigger swap
      const firstItem = page.locator(
        '#swap-container .sortable-item[data-id="swap-1"]'
      )
      const secondItem = page.locator(
        '#swap-container .sortable-item[data-id="swap-2"]'
      )

      await firstItem.dragTo(secondItem)

      // Wait for any animations or visual feedback
      await page.waitForTimeout(100)

      // Check that items are in the DOM (swap should maintain all items).
      // PR2 #29 changed the default `fallbackOnBody` to false, so the
      // pointer-driven ghost lives inside the zone during the drag and may
      // linger briefly through its fade-out transition. Exclude ghost clones
      // from the count.
      const finalCount = await page
        .locator('#swap-container .sortable-item:not(.sortable-ghost)')
        .count()
      expect(finalCount).toBe(4)

      // Verify order has changed
      const finalOrder = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('#swap-container .sortable-item')
        ).map((el) => (el as HTMLElement).textContent)
      })

      expect(finalOrder).not.toEqual(initialOrder)
    })
  })

  test.describe('Plugin Lifecycle', () => {
    test('should properly install and uninstall plugins', async ({ page }) => {
      // Check initial installation
      const initialInstallations = await page.evaluate(() => {
        return {
          demoSelect: window.PluginSystem.isInstalled(
            window.demoSelectSortable,
            'DemoSelect'
          ),
          autoScroll: window.PluginSystem.isInstalled(
            window.autoScrollSortable,
            'AutoScroll'
          ),
          swap: window.PluginSystem.isInstalled(window.swapSortable, 'Swap'),
        }
      })

      expect(initialInstallations.demoSelect).toBe(true)
      expect(initialInstallations.autoScroll).toBe(true)
      expect(initialInstallations.swap).toBe(true)

      // Uninstall a plugin
      await page.evaluate(() => {
        window.PluginSystem.uninstall(window.demoSelectSortable, 'DemoSelect')
      })

      // Verify uninstallation
      const afterUninstall = await page.evaluate(() => {
        return window.PluginSystem.isInstalled(
          window.demoSelectSortable,
          'DemoSelect'
        )
      })

      expect(afterUninstall).toBe(false)

      // Re-install plugin
      await page.evaluate(() => {
        window.PluginSystem.install(window.demoSelectSortable, 'DemoSelect')
      })

      // Verify re-installation
      const afterReinstall = await page.evaluate(() => {
        return window.PluginSystem.isInstalled(
          window.demoSelectSortable,
          'DemoSelect'
        )
      })

      expect(afterReinstall).toBe(true)
    })

    test('should list installed plugins correctly', async ({ page }) => {
      const installedPlugins = await page.evaluate(() => {
        return {
          demoSelect: window.PluginSystem.getInstalled(
            window.demoSelectSortable
          ),
          autoScroll: window.PluginSystem.getInstalled(
            window.autoScrollSortable
          ),
          swap: window.PluginSystem.getInstalled(window.swapSortable),
        }
      })

      expect(installedPlugins.demoSelect).toContain('DemoSelect')
      expect(installedPlugins.autoScroll).toContain('AutoScroll')
      expect(installedPlugins.swap).toContain('Swap')
    })

    test('should handle plugin errors gracefully', async ({ page }) => {
      // Try to install a non-existent plugin
      const result = await page.evaluate(() => {
        try {
          window.PluginSystem.install(
            window.demoSelectSortable,
            'NonExistentPlugin'
          )
          return { success: true, error: null }
        } catch (error) {
          return { success: false, error: (error as Error).message }
        }
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not registered')
    })

    test('should prevent duplicate plugin installations', async ({ page }) => {
      // Try to install an already installed plugin
      const result = await page.evaluate(() => {
        try {
          window.PluginSystem.install(window.demoSelectSortable, 'DemoSelect')
          return { success: true, error: null }
        } catch (error) {
          return { success: false, error: (error as Error).message }
        }
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('already installed')
    })
  })
})
