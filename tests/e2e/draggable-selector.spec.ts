import { test, expect } from '@playwright/test'

test.describe('Draggable Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/draggable-selector.html')
  })

  test('should only allow dragging elements matching the selector', async ({
    page,
  }) => {
    // First item has class 'draggable-item'
    const item1 = page.locator('[data-id="item-1"]')
    // Second item has class 'non-draggable'
    const item2 = page.locator('[data-id="item-2"]')
    // Third item has class 'draggable-item'
    const item3 = page.locator('[data-id="item-3"]')

    // Try to drag the non-draggable item - should not work
    await item2.dragTo(item1)

    // Check order hasn't changed
    const items = await page.locator('.sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-1')
    expect(await items[1].getAttribute('data-id')).toBe('item-2')
    expect(await items[2].getAttribute('data-id')).toBe('item-3')

    // Drag a draggable item - should work
    await item3.dragTo(item1)

    // Check order has changed
    const itemsAfter = await page.locator('.sortable-item').all()
    expect(await itemsAfter[0].getAttribute('data-id')).toBe('item-3')
    expect(await itemsAfter[1].getAttribute('data-id')).toBe('item-1')
    expect(await itemsAfter[2].getAttribute('data-id')).toBe('item-2')
  })

  test('should update draggable items when selector changes', async ({
    page,
  }) => {
    const item1 = page.locator('[data-id="item-1"]')
    const item2 = page.locator('[data-id="item-2"]')

    // Initially, item2 is not draggable
    await item2.dragTo(item1)

    // Check order hasn't changed
    const items = await page.locator('.sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-1')
    expect(await items[1].getAttribute('data-id')).toBe('item-2')

    // Add draggable class to item2
    await page.evaluate(() => {
      const item = document.querySelector('[data-id="item-2"]')
      item?.classList.remove('non-draggable')
      item?.classList.add('draggable-item')
    })

    // Now item2 should be draggable
    await item2.dragTo(item1)

    // Check order has changed
    const itemsAfter = await page.locator('.sortable-item').all()
    expect(await itemsAfter[0].getAttribute('data-id')).toBe('item-2')
    expect(await itemsAfter[1].getAttribute('data-id')).toBe('item-1')
  })

  test('should work with complex CSS selectors', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/draggable-selector-complex.html')

    const itemActive = page.locator('[data-id="item-active"]')
    const itemInactive = page.locator('[data-id="item-inactive"]')
    const itemPremium = page.locator('[data-id="item-premium"]')

    // Inactive item should not be draggable
    await itemInactive.dragTo(itemActive)

    // Check order hasn't changed
    const items = await page.locator('.sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-active')
    expect(await items[1].getAttribute('data-id')).toBe('item-inactive')
    expect(await items[2].getAttribute('data-id')).toBe('item-premium')

    // Premium item should be draggable (matches the complex selector)
    await itemPremium.dragTo(itemActive)

    // Check order has changed
    const itemsAfter = await page.locator('.sortable-item').all()
    expect(await itemsAfter[0].getAttribute('data-id')).toBe('item-premium')
    expect(await itemsAfter[1].getAttribute('data-id')).toBe('item-active')
    expect(await itemsAfter[2].getAttribute('data-id')).toBe('item-inactive')
  })
})
