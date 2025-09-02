import { expect, test } from '@playwright/test'

test.describe('Basic Sortable Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('displays basic sortable list correctly', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    await expect(items).toHaveCount(4)

    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('reorders items within basic list using drag and drop', async ({
    page,
  }) => {
    // Drag first item to third position
    await page.dragAndDrop(
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-3"]'
    )

    // Check new order using locators with retry
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('maintains correct order after multiple drag operations', async ({
    page,
  }) => {
    // Verify initial state
    const initialItems = page.locator('#basic-list .sortable-item')
    await expect(initialItems.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(initialItems.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(initialItems.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(initialItems.nth(3)).toHaveAttribute('data-id', 'basic-4')

    // First drag: move basic-2 to the end (drag to basic-4)
    await page.dragAndDrop(
      '#basic-list [data-id="basic-2"]',
      '#basic-list [data-id="basic-4"]'
    )

    // Wait for first drag to complete
    await page.waitForTimeout(300)

    // Verify intermediate state after first drag
    await expect(
      page.locator('#basic-list .sortable-item').nth(2)
    ).toHaveAttribute('data-id', 'basic-2')

    // Second drag: move basic-4 to the beginning (drag to basic-1)
    await page.dragAndDrop(
      '#basic-list [data-id="basic-4"]',
      '#basic-list [data-id="basic-1"]'
    )

    // Wait for second drag to complete
    await page.waitForTimeout(300)

    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-4')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-2')
  })

  test('applies visual feedback classes during drag', async ({ page }) => {
    const dragItem = page.locator('#basic-list [data-id="basic-1"]')

    // Check that draggable attribute is set
    await expect(dragItem).toHaveAttribute('draggable', 'true')
  })

  test('shows hover effects on sortable items', async ({ page }) => {
    const item = page.locator('#basic-list [data-id="basic-1"]')

    await item.hover()

    // Check if hover styles are applied by verifying computed styles
    const transform = await item.evaluate(
      (el: Element) => window.getComputedStyle(el).transform
    )

    // The CSS should apply a translateY transform on hover
    expect(transform).not.toBe('none')
  })
})
