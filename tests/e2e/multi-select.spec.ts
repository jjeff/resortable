import { expect, test } from '@playwright/test'

test.describe('Multi-Select Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('selects multiple items with Ctrl/Cmd+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)

    // ControlOrMeta+Click third item (Ctrl on Win/Linux, Cmd on Mac)
    await thirdItem.click({ modifiers: ['ControlOrMeta'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)
    await expect(thirdItem).toHaveClass(/sortable-selected/)
  })

  test('selects range with Shift+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')

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

  test('toggles selection with Ctrl/Cmd+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Click to select
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')

    // ControlOrMeta+Click to deselect
    await firstItem.click({ modifiers: ['ControlOrMeta'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')

    // ControlOrMeta+Click to select again
    await firstItem.click({ modifiers: ['ControlOrMeta'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
  })

  test('selects all items with Ctrl/Cmd+A', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')

    // Focus the first item so the container's keydown handler fires
    await items.first().focus()

    // Press Ctrl+A (ControlOrMeta maps correctly per platform)
    await page.keyboard.press('ControlOrMeta+a')

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

  test.skip('drags multiple selected items together (pointer-based multi-drag not yet implemented)', async ({
    page,
  }) => {
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')

    // Select first and second items
    await firstItem.click()
    await secondItem.click({ modifiers: ['ControlOrMeta'] })

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
    await secondItem.click({ modifiers: ['ControlOrMeta'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')

    // Press Escape to clear selection
    await page.keyboard.press('Escape')
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')
    await expect(secondItem).toHaveAttribute('aria-selected', 'false')
  })

  test.skip('maintains selection state after drag operation (pointer-based multi-drag not yet implemented)', async ({
    page,
  }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')

    // Select two items
    await firstItem.click()
    await secondItem.click({ modifiers: ['ControlOrMeta'] })

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
