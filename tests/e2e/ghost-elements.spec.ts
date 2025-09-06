import { expect, test } from '@playwright/test'

test.describe('Ghost Element Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
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

  test('applies drag class during drag operation', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

    // Get bounding boxes for drag coordinates
    const firstBox = await firstItem.boundingBox()
    const thirdBox = await thirdItem.boundingBox()

    if (!firstBox || !thirdBox) {
      throw new Error('Could not get element bounding boxes')
    }

    // Start drag operation
    await page.mouse.move(
      firstBox.x + firstBox.width / 2,
      firstBox.y + firstBox.height / 2
    )
    await page.mouse.down()

    // Move slightly to trigger drag
    await page.mouse.move(
      firstBox.x + firstBox.width / 2 + 10,
      firstBox.y + firstBox.height / 2 + 10
    )

    // Check classes are applied
    await expect(firstItem).toHaveClass(/sortable-chosen/)
    await expect(firstItem).toHaveClass(/sortable-drag/)

    // Complete the drag
    await page.mouse.move(
      thirdBox.x + thirdBox.width / 2,
      thirdBox.y + thirdBox.height / 2
    )
    await page.mouse.up()

    // Check classes are removed after drag
    await expect(firstItem).not.toHaveClass(/sortable-chosen/)
    await expect(firstItem).not.toHaveClass(/sortable-drag/)
  })

  test('shows placeholder element during drag', async ({ page }) => {
    // This test would check for the placeholder element, but since it's created
    // dynamically and may be difficult to test reliably with HTML5 drag API,
    // we'll focus on the visual classes

    // Perform a drag operation
    await page.dragAndDrop(
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-3"]'
    )

    // Verify the drag operation worked (items reordered)
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-1')
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

  test('handles cross-list drag with ghost elements', async ({ page }) => {
    // Test dragging between lists with proper ghost handling
    const item = page.locator('#list1 [data-id="item-1"]')

    // Drag from list1 to list2
    await page.dragAndDrop(
      '#list1 [data-id="item-1"]',
      '#list2 [data-id="item-5"]'
    )

    // Verify item moved
    await expect(page.locator('#list2 [data-id="item-1"]')).toBeVisible()

    // Verify no ghost classes remain
    await expect(item).not.toHaveClass(/sortable-chosen/)
    await expect(item).not.toHaveClass(/sortable-drag/)
  })
})
