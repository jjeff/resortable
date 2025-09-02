import { expect, test } from '@playwright/test'

test.describe('Shared Group Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)
  })

  test('displays shared group lists correctly', async ({ page }) => {
    // Check first list
    const list1Items = page.locator('#shared-a-1 .sortable-item')
    await expect(list1Items).toHaveCount(4)
    await expect(list1Items.nth(0)).toHaveAttribute('data-id', 'a-1')
    await expect(list1Items.nth(3)).toHaveAttribute('data-id', 'a-4')

    // Check second list
    const list2Items = page.locator('#shared-a-2 .sortable-item')
    await expect(list2Items).toHaveCount(4)
    await expect(list2Items.nth(0)).toHaveAttribute('data-id', 'a-5')
    await expect(list2Items.nth(3)).toHaveAttribute('data-id', 'a-8')
  })

  test('moves items between shared group lists', async ({ page }) => {
    // Drag item from first list to second list
    await page.dragAndDrop(
      '#shared-a-1 [data-id="a-1"]',
      '#shared-a-2 [data-id="a-6"]'
    )

    // Wait for drag to complete
    await page.waitForTimeout(300)

    // Check first list has one less item
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(3)

    // Check second list has one more item
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(5)

    // Verify the item moved to the correct position in second list
    const list2Items = page.locator('#shared-a-2 .sortable-item')
    await expect(list2Items.nth(1)).toHaveAttribute('data-id', 'a-1')
  })

  test('maintains sorting within shared groups', async ({ page }) => {
    // First move an item within the same list
    await page.dragAndDrop(
      '#shared-a-1 [data-id="a-2"]',
      '#shared-a-1 [data-id="a-4"]'
    )

    // Check the order within first list
    const list1Items = page.locator('#shared-a-1 .sortable-item')
    await expect(list1Items.nth(0)).toHaveAttribute('data-id', 'a-1')
    await expect(list1Items.nth(1)).toHaveAttribute('data-id', 'a-3')
    await expect(list1Items.nth(2)).toHaveAttribute('data-id', 'a-2')
    await expect(list1Items.nth(3)).toHaveAttribute('data-id', 'a-4')
  })

  test('handles complex cross-list operations', async ({ page }) => {
    // Move item from list 1 to list 2
    await page.dragAndDrop(
      '#shared-a-1 [data-id="a-2"]',
      '#shared-a-2 [data-id="a-7"]'
    )

    // Move item from list 2 to list 1
    await page.dragAndDrop(
      '#shared-a-2 [data-id="a-6"]',
      '#shared-a-1 [data-id="a-1"]'
    )

    // Verify both lists have correct counts
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)

    // Check that items are in expected positions
    const list1Items = page.locator('#shared-a-1 .sortable-item')
    await expect(list1Items.nth(0)).toHaveAttribute('data-id', 'a-6')

    const list2Items = page.locator('#shared-a-2 .sortable-item')
    await expect(list2Items.nth(1)).toHaveAttribute('data-id', 'a-2')
  })

  test('preserves item content when moving between lists', async ({ page }) => {
    const originalText = await page
      .locator('#shared-a-1 [data-id="a-1"]')
      .textContent()

    // Move the item
    await page.dragAndDrop(
      '#shared-a-1 [data-id="a-1"]',
      '#shared-a-2 [data-id="a-5"]'
    )

    // Check the item still has the same text content
    await expect(page.locator('#shared-a-2 [data-id="a-1"]')).toHaveText(
      originalText || ''
    )
  })
})
