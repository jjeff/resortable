import { expect, test } from '@playwright/test'

test.describe('Multi-Drag Debug Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up console logging to capture any errors or debug messages
    page.on('console', (msg) => {
      const type = msg.type()
      const text = msg.text()
      console.log(`[Browser ${type}]:`, text)
    })

    // Set up error logging
    page.on('pageerror', (error) => {
      console.error('[Browser Error]:', error.message)
    })

    // Navigate to the multi-drag test page
    await page.goto('http://localhost:5173/html-tests/test-multi-drag.html')

    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')

    // Wait for the status element to ensure the page is ready
    await expect(page.locator('#status')).toBeVisible()
    await expect(page.locator('#status')).toContainText('Ready')
  })

  test('should verify initial page state and elements', async ({ page }) => {
    await test.step('Check page title and main elements', async () => {
      await expect(page).toHaveTitle('Multi-Drag Test')
      await expect(page.locator('h1')).toContainText(
        'Multi-Drag Selection Test'
      )

      // Verify single list exists with correct items
      const singleListItems = page.locator('#single-list .sortable-item')
      await expect(singleListItems).toHaveCount(8)

      // Verify multi-lists exist
      const todoItems = page.locator('#multi-list-1 .sortable-item')
      const doneItems = page.locator('#multi-list-2 .sortable-item')
      await expect(todoItems).toHaveCount(5)
      await expect(doneItems).toHaveCount(2)
    })

    await test.step('Check controls and buttons are present', async () => {
      await expect(page.locator('#multiDragToggle')).toBeChecked()
      await expect(
        page.getByRole('button', { name: 'Select All', exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Clear Selection', exact: true })
      ).toBeVisible()
    })
  })

  test('should debug single item selection behavior', async ({ page }) => {
    await test.step('Test basic item selection', async () => {
      const firstItem = page.locator('#single-list [data-id="item-1"]')
      const secondItem = page.locator('#single-list [data-id="item-2"]')

      // Click first item and verify selection
      await firstItem.click()

      // Check if item gets selected class
      await expect(firstItem).toHaveClass(/sortable-selected/)

      // Check status update
      await expect(page.locator('#status')).toContainText('Selected 1 item')

      // Log the current state
      const selectedItems = await page.locator('.sortable-selected').count()
      console.log(`Selected items count: ${selectedItems}`)

      // Test multiple selection with Ctrl+Click
      await secondItem.click({ modifiers: ['Control'] })

      // Both items should be selected now
      await expect(firstItem).toHaveClass(/sortable-selected/)
      await expect(secondItem).toHaveClass(/sortable-selected/)

      const totalSelected = await page.locator('.sortable-selected').count()
      console.log(`Total selected items after Ctrl+Click: ${totalSelected}`)

      await expect(page.locator('#status')).toContainText('Selected 2 items')
    })

    await test.step('Log JavaScript state after selection', async () => {
      const jsState = await page.evaluate(() => {
        const singleList = document.getElementById('single-list')
        const selectedElements = document.querySelectorAll(
          '#single-list .sortable-selected'
        )

        return {
          selectedCount: selectedElements.length,
          selectedIds: Array.from(selectedElements).map((el) =>
            el.getAttribute('data-id')
          ),
          sortableExists: !!window.debugSortable,
          multiDragEnabled: window.debugSortable?.options?.multiDrag,
          hasSelectedItems: !!window.debugSortable?._selectedItems,
          selectedItemsSize: window.debugSortable?._selectedItems?.size || 0,
        }
      })

      console.log('JavaScript state after selection:', jsState)
    })
  })

  test('should debug drag behavior with selected items', async ({ page }) => {
    await test.step('Select multiple items', async () => {
      const firstItem = page.locator('#single-list [data-id="item-1"]')
      const thirdItem = page.locator('#single-list [data-id="item-3"]')

      // Select two items
      await firstItem.click()
      await thirdItem.click({ modifiers: ['Control'] })

      // Verify both are selected
      await expect(firstItem).toHaveClass(/sortable-selected/)
      await expect(thirdItem).toHaveClass(/sortable-selected/)

      console.log('Selected items 1 and 3')
    })

    await test.step('Drag first selected item and monitor events', async () => {
      const firstItem = page.locator('#single-list [data-id="item-1"]')
      const targetPosition = page.locator('#single-list [data-id="item-5"]')

      // Set up event monitoring
      await page.evaluate(() => {
        window.eventLog = []

        // Monitor all drag-related events
        const events = ['dragstart', 'dragend', 'dragover', 'drop']
        events.forEach((eventName) => {
          document.addEventListener(eventName, (e) => {
            window.eventLog.push({
              type: eventName,
              target: e.target?.getAttribute?.('data-id') || 'unknown',
              timestamp: Date.now(),
            })
          })
        })

        // Monitor Sortable events if available
        if (window.debugSortable) {
          const originalOnStart = window.debugSortable.options.onStart
          const originalOnEnd = window.debugSortable.options.onEnd

          window.debugSortable.options.onStart = function (evt) {
            window.eventLog.push({
              type: 'sortable-start',
              selectedCount: evt.items?.length || 0,
              draggedItem: evt.item?.getAttribute?.('data-id') || 'unknown',
              timestamp: Date.now(),
            })
            if (originalOnStart) originalOnStart.call(this, evt)
          }

          window.debugSortable.options.onEnd = function (evt) {
            window.eventLog.push({
              type: 'sortable-end',
              selectedCount: evt.items?.length || 0,
              oldIndex: evt.oldIndex,
              newIndex: evt.newIndex,
              fromContainer: evt.from?.id,
              toContainer: evt.to?.id,
              timestamp: Date.now(),
            })
            if (originalOnEnd) originalOnEnd.call(this, evt)
          }
        }
      })

      // Perform the drag operation
      await firstItem.dragTo(targetPosition)

      // Wait for any animations or async operations
      await page.waitForTimeout(500)
    })

    await test.step('Analyze drag results', async () => {
      // Get the event log
      const eventLog = await page.evaluate(() => window.eventLog || [])
      console.log('Drag events:', eventLog)

      // Check final positions
      const finalOrder = await page.evaluate(() => {
        const items = document.querySelectorAll('#single-list .sortable-item')
        return Array.from(items).map((item) => item.getAttribute('data-id'))
      })

      console.log('Final order after drag:', finalOrder)

      // Check which items are still selected
      const stillSelected = await page.evaluate(() => {
        const selected = document.querySelectorAll(
          '#single-list .sortable-selected'
        )
        return Array.from(selected).map((item) => item.getAttribute('data-id'))
      })

      console.log('Items still selected after drag:', stillSelected)

      // Check if both selected items moved together
      const item1Index = finalOrder.indexOf('item-1')
      const item3Index = finalOrder.indexOf('item-3')

      console.log(`Item 1 is now at index: ${item1Index}`)
      console.log(`Item 3 is now at index: ${item3Index}`)

      // Log whether they moved together or separately
      if (Math.abs(item1Index - item3Index) === 2) {
        console.log(
          '✓ Selected items moved together (with original item-2 between them)'
        )
      } else if (item1Index !== 0 && item3Index !== 2) {
        console.log('✓ Both selected items moved to new positions')
      } else {
        console.log('✗ Only one item moved, multi-drag not working correctly')
      }
    })
  })

  test('should test cross-container multi-drag', async ({ page }) => {
    await test.step('Select items from both lists', async () => {
      const todoItem1 = page.locator('#multi-list-1 [data-id="todo-1"]')
      const todoItem2 = page.locator('#multi-list-1 [data-id="todo-2"]')
      const doneItem1 = page.locator('#multi-list-2 [data-id="done-1"]')

      // Select items from both lists
      await todoItem1.click()
      await todoItem2.click({ modifiers: ['Control'] })

      // Verify selection
      await expect(todoItem1).toHaveClass(/sortable-selected/)
      await expect(todoItem2).toHaveClass(/sortable-selected/)

      console.log('Selected multiple items from todo list')
    })

    await test.step('Drag selected items to other list', async () => {
      const todoItem1 = page.locator('#multi-list-1 [data-id="todo-1"]')
      const doneList = page.locator('#multi-list-2')

      // Set up event monitoring for cross-container drag
      await page.evaluate(() => {
        window.crossContainerLog = []

        // Monitor both sortable instances
        const multiList1 = document.getElementById('multi-list-1')
        const multiList2 = document.getElementById('multi-list-2')

        if (multiList1 && multiList2) {
          ;[multiList1, multiList2].forEach((list, index) => {
            list.addEventListener('dragenter', () => {
              window.crossContainerLog.push(`dragenter-list-${index + 1}`)
            })
            list.addEventListener('dragover', () => {
              window.crossContainerLog.push(`dragover-list-${index + 1}`)
            })
            list.addEventListener('drop', () => {
              window.crossContainerLog.push(`drop-list-${index + 1}`)
            })
          })
        }
      })

      // Drag from todo to done list
      await todoItem1.dragTo(doneList)
      await page.waitForTimeout(500)

      // Check results
      const crossContainerLog = await page.evaluate(
        () => window.crossContainerLog || []
      )
      console.log('Cross-container drag events:', crossContainerLog)

      // Check final distribution
      const todoCount = await page
        .locator('#multi-list-1 .sortable-item')
        .count()
      const doneCount = await page
        .locator('#multi-list-2 .sortable-item')
        .count()

      console.log(
        `After cross-container drag - Todo: ${todoCount}, Done: ${doneCount}`
      )

      // Check if both selected items moved
      const todo1InDone = await page
        .locator('#multi-list-2 [data-id="todo-1"]')
        .count()
      const todo2InDone = await page
        .locator('#multi-list-2 [data-id="todo-2"]')
        .count()

      console.log(`todo-1 in done list: ${todo1InDone > 0}`)
      console.log(`todo-2 in done list: ${todo2InDone > 0}`)

      if (todo1InDone > 0 && todo2InDone > 0) {
        console.log('✓ Multi-drag across containers working correctly')
      } else if (todo1InDone > 0) {
        console.log('✗ Only dragged item moved, not all selected items')
      } else {
        console.log('✗ No items moved to target container')
      }
    })
  })

  test('should check console for JavaScript errors and warnings', async ({
    page,
  }) => {
    const consoleMessages: string[] = []
    const errors: string[] = []

    page.on('console', (msg) => {
      const text = msg.text()
      consoleMessages.push(`${msg.type()}: ${text}`)
      if (msg.type() === 'error') {
        errors.push(text)
      }
    })

    page.on('pageerror', (error) => {
      errors.push(`Page Error: ${error.message}`)
    })

    await test.step('Trigger various multi-drag operations to check for errors', async () => {
      // Test various scenarios that might trigger errors

      // 1. Select and deselect items
      const firstItem = page.locator('#single-list [data-id="item-1"]')
      await firstItem.click()
      await firstItem.click() // deselect

      // 2. Use control buttons
      await page.click('button:has-text("Select All")')
      await page.waitForTimeout(100)
      await page.click('button:has-text("Clear Selection")')
      await page.waitForTimeout(100)

      // 3. Test keyboard shortcuts
      await page.keyboard.press('Escape')

      // 4. Toggle multi-drag
      await page.click('#multiDragToggle')
      await page.waitForTimeout(100)
      await page.click('#multiDragToggle') // turn back on

      // 5. Test range selection
      await firstItem.click()
      const thirdItem = page.locator('#single-list [data-id="item-3"]')
      await thirdItem.click({ modifiers: ['Shift'] })

      // 6. Drag operation
      await firstItem.dragTo(page.locator('#single-list [data-id="item-6"]'))
      await page.waitForTimeout(300)
    })

    await test.step('Report console messages and errors', async () => {
      console.log('\n=== Console Messages ===')
      consoleMessages.forEach((msg) => console.log(msg))

      console.log('\n=== Errors Found ===')
      if (errors.length === 0) {
        console.log('✓ No JavaScript errors detected')
      } else {
        errors.forEach((error) => console.log(`✗ ${error}`))
      }

      // Fail test if critical errors found
      const criticalErrors = errors.filter(
        (error) =>
          !error.includes('favicon') && // Ignore favicon errors
          !error.includes('sourcemap') && // Ignore sourcemap warnings
          !error.toLowerCase().includes('warning') // Filter out warnings
      )

      if (criticalErrors.length > 0) {
        throw new Error(
          `Critical JavaScript errors detected: ${criticalErrors.join(', ')}`
        )
      }
    })
  })

  test('should verify multi-drag configuration and plugin state', async ({
    page,
  }) => {
    await test.step('Check Sortable configuration and plugin installation', async () => {
      const sortableState = await page.evaluate(() => {
        const singleListElement = document.getElementById('single-list')
        const multiList1Element = document.getElementById('multi-list-1')

        // Try to find the Sortable instances
        let singleListConfig = null
        const multiList1Config = null

        // Check if instances are stored globally
        if (window.debugSortable) {
          singleListConfig = {
            multiDrag: window.debugSortable.options?.multiDrag,
            selectedClass: window.debugSortable.options?.selectedClass,
            hasSelectFunction:
              typeof window.debugSortable.select === 'function',
            hasDeselectFunction:
              typeof window.debugSortable.deselect === 'function',
          }
        }

        return {
          singleListExists: !!singleListElement,
          multiList1Exists: !!multiList1Element,
          globalSortableAvailable: !!window.Sortable,
          debugSortableAvailable: !!window.debugSortable,
          multiDragPluginAvailable: !!window.MultiDragPlugin,
          singleListConfig,
        }
      })

      console.log('Sortable configuration state:', sortableState)

      // Verify key components are available
      expect(sortableState.singleListExists).toBe(true)
      expect(sortableState.multiList1Exists).toBe(true)

      if (!sortableState.globalSortableAvailable) {
        console.log(
          '⚠️  Global Sortable not available - may affect multi-drag functionality'
        )
      }

      if (!sortableState.multiDragPluginAvailable) {
        console.log(
          '⚠️  MultiDragPlugin not available - this may be the root cause of issues'
        )
      }

      if (sortableState.singleListConfig) {
        console.log(
          'Single list multi-drag enabled:',
          sortableState.singleListConfig.multiDrag
        )
        console.log(
          'Selected class configured:',
          sortableState.singleListConfig.selectedClass
        )
      }
    })
  })

  test('should test manual multi-selection patterns', async ({ page }) => {
    await test.step('Test different selection patterns', async () => {
      // Clear any existing selections
      await page.keyboard.press('Escape')

      // Pattern 1: Sequential selection with Ctrl
      console.log('Testing sequential Ctrl+Click selection...')
      for (let i = 1; i <= 3; i++) {
        const item = page.locator(`#single-list [data-id="item-${i}"]`)
        if (i === 1) {
          await item.click() // First item normal click
        } else {
          await item.click({ modifiers: ['Control'] }) // Subsequent with Ctrl
        }

        const selectedCount = await page
          .locator('#single-list .sortable-selected')
          .count()
        console.log(
          `After selecting item ${i}: ${selectedCount} items selected`
        )
      }

      // Check final state
      const finalSelected = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('#single-list .sortable-selected')
        ).map((el) => el.getAttribute('data-id'))
      })
      console.log('Final selected items:', finalSelected)

      // Clear selection
      await page.keyboard.press('Escape')
    })

    await test.step('Test range selection with Shift+Click', async () => {
      console.log('Testing Shift+Click range selection...')

      // Select first item
      const firstItem = page.locator('#single-list [data-id="item-2"]')
      await firstItem.click()

      // Select range to item 5
      const fifthItem = page.locator('#single-list [data-id="item-5"]')
      await fifthItem.click({ modifiers: ['Shift'] })

      const rangeSelected = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('#single-list .sortable-selected')
        ).map((el) => el.getAttribute('data-id'))
      })
      console.log('Range selected items:', rangeSelected)

      // Should select items 2, 3, 4, 5
      expect(rangeSelected).toContain('item-2')
      expect(rangeSelected).toContain('item-3')
      expect(rangeSelected).toContain('item-4')
      expect(rangeSelected).toContain('item-5')
    })
  })
})
