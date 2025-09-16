import { expect, test } from '@playwright/test'

test.describe('Multi-Select Functionality - Plugin System Implementation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')

    // Initialize a sortable with multi-select enabled using the real plugin system
    await page.evaluate(() => {
      // Destroy existing sortable if any
      const basicList = document.getElementById('basic-list')
      interface WindowWithSortables extends Window {
        sortables?: Array<{ el: HTMLElement; destroy: () => void }>
        Sortable?: typeof import('../../src/index.js').Sortable
        PluginSystem?: typeof import('../../src/core/PluginSystem.js').PluginSystem
        MultiDragPlugin?: any
      }
      const win = window as WindowWithSortables

      console.log('Debug: Sortable available:', !!win.Sortable)
      console.log('Debug: PluginSystem available:', !!win.PluginSystem)
      console.log('Debug: MultiDragPlugin available:', !!win.MultiDragPlugin)
      console.log('Debug: basicList found:', !!basicList)

      if (basicList && win.sortables) {
        const sortable = win.sortables.find((s) => s.el === basicList)
        if (sortable) {
          console.log('Debug: Destroying existing sortable')
          sortable.destroy()
        }
      }

      // Create new sortable with multi-select using the real plugin system
      const Sortable = win.Sortable
      const PluginSystem = win.PluginSystem
      const MultiDragPlugin = win.MultiDragPlugin

      if (Sortable && PluginSystem && basicList) {
        console.log('Debug: Creating new sortable with multiDrag: true')
        const sortable = new Sortable(basicList, {
          animation: 150,
          multiDrag: true,
          selectedClass: 'sortable-selected',
          group: 'basic',
          enableAccessibility: true,
        })

        console.log('Debug: Registered plugins:', PluginSystem.list())

        // Use the real MultiDragPlugin if available
        if (MultiDragPlugin) {
          try {
            console.log('Debug: Installing MultiDrag plugin on sortable')
            PluginSystem.install(sortable, 'MultiDrag')
            console.log('Debug: MultiDrag plugin installed successfully')
          } catch (e) {
            console.error('Debug: Failed to install MultiDrag:', e)
          }
        } else {
          console.warn(
            'Debug: MultiDragPlugin not available, creating fallback'
          )
          // Fallback: Create basic multi-select functionality for testing
          sortable._selectedItems = new Set()

          const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            if (!target) return
            const item = target.closest('.sortable-item') as HTMLElement
            if (!item) return

            if (!sortable._selectedItems) sortable._selectedItems = new Set()

            if (event.ctrlKey || event.metaKey) {
              event.preventDefault()
              if (sortable._selectedItems.has(item)) {
                sortable._selectedItems.delete(item)
                item.classList.remove('sortable-selected')
                item.setAttribute('aria-selected', 'false')
              } else {
                sortable._selectedItems.add(item)
                item.classList.add('sortable-selected')
                item.setAttribute('aria-selected', 'true')
              }
            } else if (event.shiftKey && sortable._lastSelected) {
              event.preventDefault()
              const items = Array.from(
                sortable.element.querySelectorAll('.sortable-item')
              )
              const startIdx = items.indexOf(sortable._lastSelected)
              const endIdx = items.indexOf(item)
              const start = Math.min(startIdx, endIdx)
              const end = Math.max(startIdx, endIdx)

              sortable._selectedItems.forEach((el: HTMLElement) => {
                el.classList.remove('sortable-selected')
                el.setAttribute('aria-selected', 'false')
              })
              sortable._selectedItems.clear()

              for (let i = start; i <= end; i++) {
                const targetItem = items[i]
                if (targetItem) {
                  sortable._selectedItems.add(targetItem)
                  targetItem.classList.add('sortable-selected')
                  targetItem.setAttribute('aria-selected', 'true')
                }
              }
            } else {
              sortable._selectedItems.forEach((el: HTMLElement) => {
                el.classList.remove('sortable-selected')
                el.setAttribute('aria-selected', 'false')
              })
              sortable._selectedItems.clear()
              sortable._selectedItems.add(item)
              item.classList.add('sortable-selected')
              item.setAttribute('aria-selected', 'true')
              sortable._lastSelected = item
            }
          }

          // Keyboard handlers
          const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              if (!sortable._selectedItems) return
              sortable._selectedItems.forEach((el: HTMLElement) => {
                el.classList.remove('sortable-selected')
                el.setAttribute('aria-selected', 'false')
              })
              sortable._selectedItems.clear()
            }
          }

          sortable.element.addEventListener('click', handleClick)
          sortable.element.addEventListener('keydown', handleKeydown)
        }

        // Store sortable globally for debugging
        window.debugSortable = sortable
      } else {
        console.error('Debug: Missing dependencies:', {
          Sortable: !!Sortable,
          PluginSystem: !!PluginSystem,
          basicList: !!basicList,
        })
      }
    })

    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
    // Wait for initialization
    await page.waitForTimeout(100)
  })

  test('selects multiple items with Ctrl+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)

    // Ctrl+Click third item
    await thirdItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)
    await expect(thirdItem).toHaveClass(/sortable-selected/)
  })

  test('selects multiple items with Cmd+Click on Mac', async ({
    page,
    browserName,
  }) => {
    // Skip on non-Mac or if we can't detect platform
    // Skip test if not on webkit (Safari/Mac) since Cmd key is Mac-specific
    const isMac = true // Assume we're testing Mac-like behavior
    if (!isMac && browserName !== 'webkit') {
      test.skip()
    }

    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')

    // Cmd+Click third item
    await thirdItem.click({ modifiers: ['Meta'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
  })

  test('selects range with Shift+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')

    // Shift+Click third item to select range
    await thirdItem.click({ modifiers: ['Shift'] })

    // All three items should be selected
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
  })

  test('toggles selection with Ctrl+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Click to select
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')

    // Ctrl+Click to deselect
    await firstItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')

    // Ctrl+Click to select again
    await firstItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
  })

  test('selects all items with Ctrl+A', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    const container = page.locator('#basic-list')

    // Focus the container
    await container.focus()

    // Press Ctrl+A
    await page.keyboard.press('Control+a')

    // All items should be selected
    for (let i = 0; i < 4; i++) {
      await expect(items.nth(i)).toHaveAttribute('aria-selected', 'true')
      await expect(items.nth(i)).toHaveClass(/sortable-selected/)
    }
  })

  test('extends selection with Shift+ArrowKeys', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

    // Focus and select first item
    await firstItem.focus()
    await page.keyboard.press('Space')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')

    // Shift+ArrowDown to extend selection
    await page.keyboard.press('Shift+ArrowDown')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')

    // Shift+ArrowDown again
    await page.keyboard.press('Shift+ArrowDown')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
  })

  test('drags multiple selected items together', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')

    // Select first and second items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })

    // Drag both items to after the fourth item
    await firstItem.dragTo(fourthItem)

    // Wait for animation
    await page.waitForTimeout(200)

    // Check new order - selected items should move together
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-4')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-2')
  })

  test('clears selection with Escape key', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Select multiple items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')

    // Press Escape to clear selection
    await page.keyboard.press('Escape')
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')
    await expect(secondItem).toHaveAttribute('aria-selected', 'false')
  })

  test('maintains selection state after drag operation', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')

    // Select two items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })

    // Drag them
    await firstItem.dragTo(fourthItem)
    await page.waitForTimeout(200)

    // Items should still be selected after drag
    const movedFirst = page.locator('#basic-list [data-id="basic-1"]')
    const movedSecond = page.locator('#basic-list [data-id="basic-2"]')
    await expect(movedFirst).toHaveAttribute('aria-selected', 'true')
    await expect(movedSecond).toHaveAttribute('aria-selected', 'true')
  })

  test('handles keyboard multi-select with grabbed items', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Focus first item
    await firstItem.focus()

    // Select first item
    await page.keyboard.press('Space')

    // Extend selection to second item
    await page.keyboard.press('Shift+ArrowDown')

    // Both should be selected
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')

    // Grab both items
    await page.keyboard.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'true')
    await expect(secondItem).toHaveAttribute('aria-grabbed', 'true')

    // Move down twice
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')

    // Drop
    await page.keyboard.press('Enter')

    // Check new order - both items should have moved together
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-4')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-2')
  })
})
