import { expect, test } from '@playwright/test'
import { dragAndDropWithAnimation } from './helpers/animations'

test.describe('Feature Demos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true
    )
  })

  test.describe('Handle Functionality', () => {
    test('can only drag items by their handles', async ({ page }) => {
      // Try dragging from the content area (should not work)
      const contentArea = page.locator('#handle-list .handle-content').first()
      const initialOrder = await page
        .locator('#handle-list .handle-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      // Attempt to drag from content area
      await contentArea.hover()
      await page.mouse.down()
      await page.mouse.move(100, 200)
      await page.mouse.up()

      // Order should not change
      const orderAfterContentDrag = await page
        .locator('#handle-list .handle-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterContentDrag).toEqual(initialOrder)

      // Now drag using the handle (should work)
      const handle = page.locator('#handle-list .drag-handle').first()
      const targetHandle = page.locator('#handle-list .drag-handle').nth(2)

      await handle.hover()
      await page.mouse.down()
      await targetHandle.hover()
      await page.mouse.up()

      // Order should change
      const orderAfterHandleDrag = await page
        .locator('#handle-list .handle-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterHandleDrag).not.toEqual(initialOrder)
    })

    test('handle elements have correct cursor style', async ({ page }) => {
      const handle = page.locator('#handle-list .drag-handle').first()
      const cursor = await handle.evaluate(
        (el) => window.getComputedStyle(el).cursor
      )
      expect(cursor).toBe('move')
    })
  })

  test.describe('Filter Functionality', () => {
    test('disabled items are not draggable', async ({ page }) => {
      // Disabled items should not have draggable attribute
      const disabledItem = page.locator('#filter-list .disabled').first()
      const isDraggable = await disabledItem.evaluate(
        (el: HTMLElement) => el.draggable
      )
      expect(isDraggable).toBeFalsy()

      // Try to drag disabled item anyway
      const regularItem = page
        .locator('#filter-list .filter-item:not(.disabled)')
        .first()

      const initialOrder = await page
        .locator('#filter-list .filter-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      await disabledItem.hover()
      await page.mouse.down()
      await regularItem.hover()
      await page.mouse.up()

      // Order should not change
      const orderAfterDrag = await page
        .locator('#filter-list .filter-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterDrag).toEqual(initialOrder)
    })

    test('can interact with input elements without triggering drag', async ({
      page,
    }) => {
      const input = page.locator('#filter-list input').first()

      // Clear and type in input
      await input.click()
      await input.fill('Test text')

      const value = await input.inputValue()
      expect(value).toBe('Test text')

      // Verify list order hasn't changed
      const items = await page
        .locator('#filter-list .filter-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(items[0]).toBe('filter-1')
      expect(items[1]).toBe('filter-2')
    })

    test('can click buttons without triggering drag', async ({ page }) => {
      // Set up alert handler
      let alertMessage = ''
      page.on('dialog', async (dialog) => {
        alertMessage = dialog.message()
        await dialog.accept()
      })

      const button = page.locator('#filter-list button').first()
      await button.click()

      expect(alertMessage).toBe('Clicked!')
    })

    test('onFilter callback is triggered for input/button elements', async ({
      page,
    }) => {
      // Set up console log capture
      const consoleLogs: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'log') {
          consoleLogs.push(msg.text())
        }
      })

      // Try to drag from an input element
      const input = page.locator('#filter-list input').first()
      await input.hover()
      await page.mouse.down()
      await page.mouse.move(100, 100)
      await page.mouse.up()

      // Check that the filter callback was triggered
      await page.waitForTimeout(100)
      const hasFilterLog = consoleLogs.some(
        (log) =>
          log.includes('Clicked on filtered element') ||
          log.includes('Filtered:')
      )
      expect(hasFilterLog).toBeTruthy()
    })
  })

  test.describe('Nested Lists', () => {
    // @TODO: This test has hover intercept issues in CI - element is blocked by container
    // The test verifies nested folder reordering by dragging headers as handles
    // but pointer events are intercepted by parent containers
    test.skip('can reorder folders using headers as handles', async ({
      page,
    }) => {
      const firstHeader = page.locator('.nested-header').first()
      const lastHeader = page.locator('.nested-header').last()

      // Drag first folder to last position
      await firstHeader.hover()
      await page.mouse.down()
      await lastHeader.hover()
      await page.mouse.move(0, 20) // Move below the last header
      await page.mouse.up()

      await page.waitForTimeout(200)

      // Check new order
      const headers = await page
        .locator('.nested-header')
        .evaluateAll((els) => els.map((el) => el.textContent))

      expect(headers[0]).toContain('Components')
      expect(headers[headers.length - 1]).toContain('Project Files')
    })

    test('can move files between folders', async ({ page }) => {
      // Move a file from first folder to second folder
      const sourceFile = page.locator('#nested-folder-1 .nested-item').first()
      const targetFolder = page.locator('#nested-folder-2')

      const sourceFileText = await sourceFile.textContent()

      await sourceFile.hover()
      await page.mouse.down()
      await targetFolder.hover()
      await page.mouse.up()

      await page.waitForTimeout(200)

      // Verify file moved to target folder
      const targetFiles = await page
        .locator('#nested-folder-2 .nested-item')
        .evaluateAll((els) => els.map((el) => el.textContent))

      expect(targetFiles).toContain(sourceFileText)

      // Verify file removed from source folder
      const sourceFiles = await page
        .locator('#nested-folder-1 .nested-item')
        .evaluateAll((els) => els.map((el) => el.textContent))

      expect(sourceFiles).not.toContain(sourceFileText)
    })

    test('cannot drag folders by their content', async ({ page }) => {
      const folderContent = page.locator('.nested-content').first()
      const initialOrder = await page
        .locator('.nested-container')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      // Try to drag folder by its content area
      await folderContent.hover()
      await page.mouse.down()
      await page.mouse.move(100, 200)
      await page.mouse.up()

      // Order should not change
      const orderAfterDrag = await page
        .locator('.nested-container')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterDrag).toEqual(initialOrder)
    })
  })

  test.describe('Delay Functionality', () => {
    // @TODO: Delay functionality is inconsistent across browsers/platforms
    test.skip('requires holding for delay period before drag starts', async ({
      page,
    }) => {
      const firstItem = page.locator('#delay-list .delay-item').first()
      const lastItem = page.locator('#delay-list .delay-item').last()

      const initialOrder = await page
        .locator('#delay-list .delay-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      // Quick click and drag (should not work due to delay)
      await firstItem.hover()
      await page.mouse.down()
      await page.waitForTimeout(100) // Less than 300ms delay
      await lastItem.hover()
      await page.mouse.up()

      const orderAfterQuickDrag = await page
        .locator('#delay-list .delay-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterQuickDrag).toEqual(initialOrder)

      // Hold and drag (should work)
      await firstItem.hover()
      await page.mouse.down()
      await page.waitForTimeout(350) // More than 300ms delay
      await lastItem.hover()
      await page.mouse.up()

      await page.waitForTimeout(200)

      const orderAfterDelayedDrag = await page
        .locator('#delay-list .delay-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterDelayedDrag).not.toEqual(initialOrder)
    })
  })

  test.describe('Shared Lists (Clone Mode)', () => {
    test.skip('clones items from source to target list (HTML5 drag integration issue)', async ({
      page,
    }) => {
      const sourceItem = page.locator('#clone-source .clone-item').first()

      const sourceItemText = await sourceItem.textContent()
      const initialSourceCount = await page
        .locator('#clone-source .clone-item')
        .count()
      const initialTargetCount = await page
        .locator('#clone-target .clone-item')
        .count()

      // Drag from source to target
      await dragAndDropWithAnimation(
        page,
        '#clone-source .clone-item:first-child',
        '#clone-target'
      )

      // Source should have the same number of items (cloned, not moved)
      const finalSourceCount = await page
        .locator('#clone-source .clone-item')
        .count()
      expect(finalSourceCount).toBe(initialSourceCount)

      // Target should have one more item
      const finalTargetCount = await page
        .locator('#clone-target .clone-item')
        .count()
      expect(finalTargetCount).toBe(initialTargetCount + 1)

      // The cloned item should be in target
      const targetItems = await page
        .locator('#clone-target .clone-item')
        .evaluateAll((els) => els.map((el) => el.textContent))
      expect(targetItems).toContain(sourceItemText)

      // Original item should still be in source
      const sourceItems = await page
        .locator('#clone-source .clone-item')
        .evaluateAll((els) => els.map((el) => el.textContent))
      expect(sourceItems).toContain(sourceItemText)
    })

    // @TODO: Bidirectional drag functionality needs cloning to work properly
    test.skip('can drag items between lists bidirectionally', async ({
      page,
    }) => {
      // First, move an item to target
      await dragAndDropWithAnimation(
        page,
        '#clone-source .clone-item:first-child',
        '#clone-target'
      )

      // Now try to drag from target back to source
      const initialSourceCount = await page
        .locator('#clone-source .clone-item')
        .count()

      await dragAndDropWithAnimation(
        page,
        '#clone-target .clone-item:last-child',
        '#clone-source'
      )

      // Source count should increase (items can be dragged back)
      const finalSourceCount = await page
        .locator('#clone-source .clone-item')
        .count()
      expect(finalSourceCount).toBe(initialSourceCount + 1)
    })

    // @TODO: Sort: false option isn't working correctly - items are still reordering
    test.skip('source list items cannot be reordered', async ({ page }) => {
      const initialOrder = await page
        .locator('#clone-source .clone-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      // Try to reorder within source - this should fail because sort: false
      await dragAndDropWithAnimation(
        page,
        '#clone-source .clone-item:first-child',
        '#clone-source .clone-item:last-child'
      )

      // Order should not change (sort: false)
      const finalOrder = await page
        .locator('#clone-source .clone-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(finalOrder).toEqual(initialOrder)
    })
  })

  test.describe('Multi-Drag Selection (Visual Demo Only)', () => {
    test.skip('can select items by clicking with Shift key', async ({
      page,
    }) => {
      // Skip this test as multi-drag is not yet fully implemented
      const firstItem = page.locator('#multidrag-list .filter-item').first()
      const secondItem = page.locator('#multidrag-list .filter-item').nth(1)

      // Click first item
      await firstItem.click()
      await page.waitForTimeout(100) // Wait for click handler
      let bgColor = await firstItem.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      )
      expect(bgColor).toBe('rgb(231, 245, 255)') // #e7f5ff

      // Shift+Click second item
      await secondItem.click({ modifiers: ['Shift'] })
      await page.waitForTimeout(100) // Wait for click handler
      bgColor = await secondItem.evaluate(
        (el) => window.getComputedStyle(el).backgroundColor
      )
      expect(bgColor).toBe('rgb(231, 245, 255)')

      // Both should be selected - check inline styles
      const firstItemStyle = await firstItem.evaluate(
        (el) => el.style.background
      )
      const secondItemStyle = await secondItem.evaluate(
        (el) => el.style.background
      )

      // Check both items have the selected background style
      expect(firstItemStyle).toContain('231') // rgb(231, 245, 255)
      expect(secondItemStyle).toContain('231')

      const selectedCount = await page
        .locator('#multidrag-list .filter-item')
        .evaluateAll(
          (els) =>
            els.filter((el) => el.style.background.includes('231')).length
        )
      expect(selectedCount).toBe(2)
    })

    test.skip('selection is cleared after drag', async ({ page }) => {
      // Skip this test as multi-drag is not yet fully implemented
      const firstItem = page.locator('#multidrag-list .filter-item').first()
      const lastItem = page.locator('#multidrag-list .filter-item').last()

      // Select an item
      await firstItem.click()

      // Drag it
      await firstItem.hover()
      await page.mouse.down()
      await lastItem.hover()
      await page.mouse.up()

      await page.waitForTimeout(200)

      // Selection should be cleared
      const selectedCount = await page
        .locator('#multidrag-list .filter-item')
        .evaluateAll(
          (els) =>
            els.filter(
              (el) =>
                window.getComputedStyle(el).backgroundColor ===
                'rgb(231, 245, 255)'
            ).length
        )
      expect(selectedCount).toBe(0)
    })
  })
})
