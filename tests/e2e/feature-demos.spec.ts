import { expect, test } from '@playwright/test'
import { mouseDragAndDrop, waitForAnimations } from './helpers/animations'

test.describe('Feature Demos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/demo.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
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
    test('can reorder folders using headers as handles', async ({ page }) => {
      // Anchored on the stable `data-id` on `.nested-container`, not
      // `.nested-header:first()/:last()`: those dynamic locators get
      // re-resolved by `.hover()` mid-drag, and by then they can match the
      // drag's own ghost/placeholder header (which carries the same class)
      // instead of a real folder header — Playwright then waits forever for
      // that transient element to be "stable" (was `#75`'s "hover intercept
      // by parent container"). `page.dragAndDrop()` on fixed selectors
      // drives proper multi-step native HTML5 DnD and isn't affected.
      await page.dragAndDrop(
        '.nested-container[data-id="folder-1"] .nested-header',
        '.nested-container[data-id="folder-3"] .nested-header'
      )
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
    test('requires holding for delay period before drag starts', async ({
      page,
    }) => {
      // Fake `setTimeout`/`clearTimeout` so the 300ms `delay` timer can be
      // crossed deterministically instead of racing real wall-clock waits.
      await page.clock.install()

      const firstItem = page.locator('#delay-list .delay-item').first()
      const lastItem = page.locator('#delay-list .delay-item').last()

      const initialOrder = await page
        .locator('#delay-list .delay-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      // The demo page is long — raw page.mouse coordinates (unlike
      // locator actions) don't auto-scroll, so the list must be scrolled
      // into view first or the coordinates land outside the viewport.
      await firstItem.scrollIntoViewIfNeeded()

      const firstBox = await firstItem.boundingBox()
      const lastBox = await lastItem.boundingBox()
      if (!firstBox || !lastBox) throw new Error('Could not get bounding boxes')
      const firstCenter = {
        x: firstBox.x + firstBox.width / 2,
        y: firstBox.y + firstBox.height / 2,
      }
      const lastCenter = {
        x: lastBox.x + lastBox.width / 2,
        y: lastBox.y + lastBox.height / 2,
      }

      // Quick click and drag (should not work due to delay)
      await page.mouse.move(firstCenter.x, firstCenter.y)
      await page.mouse.down()
      await page.clock.fastForward(100) // less than the 300ms delay
      await page.mouse.move(lastCenter.x, lastCenter.y)
      await page.mouse.up()

      const orderAfterQuickDrag = await page
        .locator('#delay-list .delay-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterQuickDrag).toEqual(initialOrder)

      // Hold and drag (should work)
      await page.mouse.move(firstCenter.x, firstCenter.y)
      await page.mouse.down()
      await page.clock.fastForward(350) // more than the 300ms delay
      await page.mouse.move(lastCenter.x, lastCenter.y)
      await page.mouse.up()

      const orderAfterDelayedDrag = await page
        .locator('#delay-list .delay-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))
      expect(orderAfterDelayedDrag).not.toEqual(initialOrder)
    })
  })

  test.describe('Shared Lists (Clone Mode)', () => {
    // Uses `mouseDragAndDrop` (see helpers/animations.ts) rather than
    // `page.dragAndDrop()` / `dragAndDropWithAnimation`: those resolve
    // source and target coordinates via two sequential `boundingBox()`
    // calls, each of which auto-scrolls its own element into view. On this
    // page that scrolls between the two reads, so the first element's
    // captured coordinates go stale and the drag either misses its target
    // or never starts. `mouseDragAndDrop` reads both rects atomically after
    // a single scroll. See #75.
    test('clones items from source to target list', async ({ page }) => {
      const sourceItem = page.locator('#clone-source .clone-item').first()

      const sourceItemText = await sourceItem.textContent()
      const initialSourceCount = await page
        .locator('#clone-source .clone-item')
        .count()
      const initialTargetCount = await page
        .locator('#clone-target .clone-item')
        .count()

      // Drag from source to target. Unlike `mouseDragAndDrop`, scroll the
      // TARGET into view mid-drag (pointer already down) instead of
      // up front: on short mobile viewports #clone-source (4 stacked items)
      // and #clone-target don't both fit on screen at once once the source
      // item is scrolled into view, so #clone-target's pre-scroll center
      // lands below the viewport's bottom edge. `elementFromPoint()` returns
      // null for coordinates outside the viewport, so the library's hit-test
      // at that point resolves no drop zone and the drop silently never
      // registers — this is the same scroll-boundary shape
      // `multidrag-crosszone-scroll.spec.ts` handles by scrolling the target
      // into view after `mousedown`, before moving the pointer there.
      await sourceItem.scrollIntoViewIfNeeded()
      const fromBox = await sourceItem.boundingBox()
      if (!fromBox)
        throw new Error('could not resolve #clone-source item bounding box')
      const from = {
        x: fromBox.x + fromBox.width / 2,
        y: fromBox.y + fromBox.height / 2,
      }

      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x, from.y, { steps: 5 })

      await page.evaluate(() => {
        document
          .querySelector('#clone-target')
          ?.scrollIntoView({ block: 'center' })
      })

      const targetBox = await page.locator('#clone-target').boundingBox()
      if (!targetBox)
        throw new Error('could not resolve #clone-target bounding box')
      const to = {
        x: targetBox.x + targetBox.width / 2,
        y: targetBox.y + targetBox.height / 2,
      }

      await page.mouse.move(to.x, to.y, { steps: 10 })
      await page.mouse.up()
      await waitForAnimations(page)

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

    test('can drag items between lists bidirectionally', async ({ page }) => {
      // First, move an item to target
      await mouseDragAndDrop(
        page,
        '#clone-source .clone-item:first-child',
        '#clone-target'
      )

      // Now try to drag from target back to source
      const initialSourceCount = await page
        .locator('#clone-source .clone-item')
        .count()

      await mouseDragAndDrop(
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

    test('source list items cannot be reordered', async ({ page }) => {
      const initialOrder = await page
        .locator('#clone-source .clone-item')
        .evaluateAll((els) => els.map((el) => el.dataset.id))

      // Try to reorder within source - this should fail because sort: false.
      await mouseDragAndDrop(
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
})
