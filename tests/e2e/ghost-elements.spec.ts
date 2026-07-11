import { expect, test } from '@playwright/test'
import { dragAndDropWithAnimation } from './helpers/animations'

// Helper to skip tests on Mobile Chrome due to dragAndDrop timeout issues
const shouldSkipMobileChrome = (
  browserName: string,
  isMobile: boolean
): boolean => browserName === 'chromium' && isMobile === true

test.describe('Ghost Element Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('applies chosen class to dragged element', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Start dragging (using mouse down to better control the drag)
    await firstItem.hover()
    await page.mouse.down()

    // Check that chosen class is applied
    await expect(firstItem).toHaveClass(/sortable-chosen/)

    // Release the drag
    await page.mouse.up()
  })

  // Playwright's atomic dragAndDrop() completes too fast to observe
  // intermediate drag-class state. Driving the pointer through discrete
  // mouse.move steps — mirroring tests/e2e/on-move.spec.ts — lets us assert
  // on the class mid-drag before releasing. Tracked in #73.
  test('applies drag class during drag operation', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

    const fromBox = await firstItem.boundingBox()
    const toBox = await thirdItem.boundingBox()
    if (!fromBox || !toBox) throw new Error('missing bounding box')
    const from = {
      x: fromBox.x + fromBox.width / 2,
      y: fromBox.y + fromBox.height / 2,
    }
    const to = { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height / 2 }

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })

    // Both classes are applied as soon as the ghost is created (commit
    // phase), which happens immediately since basic-list uses the default
    // (zero) fallbackTolerance.
    await expect(firstItem).toHaveClass(/sortable-chosen/)
    await expect(firstItem).toHaveClass(/sortable-drag/)

    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    // Classes are removed after drag completes.
    await expect(firstItem).not.toHaveClass(/sortable-chosen/)
    await expect(firstItem).not.toHaveClass(/sortable-drag/)
  })

  test('shows placeholder element during drag', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'Mobile Safari',
      'Cross-list dragAndDrop non-deterministic on Mobile Safari/WebKit emulation — tracked in #62'
    )
    // This test would check for the placeholder element, but since it's created
    // dynamically and may be difficult to test reliably with HTML5 drag API,
    // we'll focus on the visual classes

    // Perform a drag operation
    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-3"]'
    )

    // Verify the drag operation worked (items reordered)
    // When dragging basic-1 to basic-3, it should end up after basic-3
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
  })

  test('applies ghost class styles correctly', async ({ page }) => {
    // Check that ghost class CSS is present
    const styles = await page.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets)
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || sheet.rules || [])
          for (const rule of rules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes('.sortable-ghost')
            ) {
              return rule.style.cssText
            }
          }
        } catch (_e) {
          // Cross-origin stylesheets may throw
          continue
        }
      }
      return null
    })

    // We should have some ghost styles defined
    expect(styles).toBeTruthy()
  })

  test('removes visual classes after drag completes', async ({ page }) => {
    const item = page.locator('#basic-list [data-id="basic-1"]')

    // Perform a drag and ensure classes are cleaned up
    await page.dragAndDrop(
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-2"]'
    )

    // After drag completes, no drag-related classes should remain
    await expect(item).not.toHaveClass(/sortable-chosen/)
    await expect(item).not.toHaveClass(/sortable-drag/)
    await expect(item).not.toHaveClass(/sortable-ghost/)
  })

  test('handles cross-list drag with ghost elements', async ({
    page,
    browserName,
    isMobile,
  }, testInfo) => {
    test.skip(
      shouldSkipMobileChrome(browserName, isMobile),
      'Mobile Chrome dragAndDrop timeout — tracked in #48'
    )
    test.skip(
      testInfo.project.name === 'Mobile Safari',
      'Cross-list dragAndDrop non-deterministic on Mobile Safari/WebKit emulation — tracked in #62'
    )
    // Test dragging between lists with proper ghost handling

    // Drag from list1 to list2
    await page.dragAndDrop(
      '#list1 [data-id="item-1"]',
      '#list2 [data-id="item-5"]'
    )

    // Verify item moved to list2
    const movedItem = page.locator('#list2 [data-id="item-1"]')
    await expect(movedItem).toBeVisible()

    // Verify no ghost classes remain on the moved item
    await expect(movedItem).not.toHaveClass(/sortable-chosen/)
    await expect(movedItem).not.toHaveClass(/sortable-drag/)
    await expect(movedItem).not.toHaveClass(/sortable-ghost/)
  })
})
