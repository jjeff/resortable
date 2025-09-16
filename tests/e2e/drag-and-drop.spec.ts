import { expect, test } from '@playwright/test'
import { dragAndDropWithAnimation } from './helpers/animations'

// Helper to skip tests on Mobile Chrome due to dragAndDrop timeout issues
const shouldSkipMobileChrome = (
  browserName: string,
  isMobile: boolean
): boolean => browserName === 'chromium' && isMobile === true

test.describe('Legacy E2E Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#list1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#list2 .sortable-item')).toHaveCount(4)
  })

  test('reorders items within list1', async ({ page }) => {
    await dragAndDropWithAnimation(
      page,
      '#list1 [data-id="item-1"]',
      '#list1 [data-id="item-3"]'
    )

    // Use locator-based assertions instead of $$eval
    // When dragging item-1 to item-3, it should end up after item-3
    const items = page.locator('#list1 .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'item-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'item-3')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'item-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'item-4')
  })

  test('moves items between list1 and list2', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(
      shouldSkipMobileChrome(browserName, isMobile),
      'Skipping on Mobile Chrome due to dragAndDrop timeout'
    )
    await page.dragAndDrop(
      '#list1 [data-id="item-2"]',
      '#list2 [data-id="item-6"]'
    )

    // Check that list1 has one less item
    await expect(page.locator('#list1 .sortable-item')).toHaveCount(3)

    // Check that list2 has one more item
    await expect(page.locator('#list2 .sortable-item')).toHaveCount(5)

    // Verify the item is now in list2
    await expect(page.locator('#list2 [data-id="item-2"]')).toBeVisible()
    await expect(page.locator('#list1 [data-id="item-2"]')).not.toBeVisible()
  })

  test('maintains shared group behavior', async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(
      shouldSkipMobileChrome(browserName, isMobile),
      'Skipping on Mobile Chrome due to dragAndDrop timeout'
    )
    // Move from list2 to list1
    await page.dragAndDrop(
      '#list2 [data-id="item-7"]',
      '#list1 [data-id="item-1"]'
    )

    // Verify item moved correctly
    const list1Items = page.locator('#list1 .sortable-item')
    await expect(list1Items.nth(0)).toHaveAttribute('data-id', 'item-7')

    // Check counts
    await expect(page.locator('#list1 .sortable-item')).toHaveCount(5)
    await expect(page.locator('#list2 .sortable-item')).toHaveCount(3)
  })
})
