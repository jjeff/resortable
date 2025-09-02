import { expect, test } from '@playwright/test'

test.describe('Independent Groups Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#group-a-1 .sortable-item')).toHaveCount(3)
    await expect(page.locator('#group-b-1 .sortable-item')).toHaveCount(3)
  })

  test('displays independent group lists correctly', async ({ page }) => {
    // Check Group A
    const groupAItems = page.locator('#group-a-1 .sortable-item')
    await expect(groupAItems).toHaveCount(3)
    await expect(groupAItems.nth(0)).toHaveAttribute('data-id', 'ga-1')
    await expect(groupAItems.nth(1)).toHaveAttribute('data-id', 'ga-2')
    await expect(groupAItems.nth(2)).toHaveAttribute('data-id', 'ga-3')

    // Check Group B
    const groupBItems = page.locator('#group-b-1 .sortable-item')
    await expect(groupBItems).toHaveCount(3)
    await expect(groupBItems.nth(0)).toHaveAttribute('data-id', 'gb-1')
    await expect(groupBItems.nth(1)).toHaveAttribute('data-id', 'gb-2')
    await expect(groupBItems.nth(2)).toHaveAttribute('data-id', 'gb-3')
  })

  test('allows sorting within Group A', async ({ page }) => {
    await page.dragAndDrop(
      '#group-a-1 [data-id="ga-1"]',
      '#group-a-1 [data-id="ga-3"]'
    )

    const groupAItems = page.locator('#group-a-1 .sortable-item')
    await expect(groupAItems.nth(0)).toHaveAttribute('data-id', 'ga-2')
    await expect(groupAItems.nth(1)).toHaveAttribute('data-id', 'ga-1')
    await expect(groupAItems.nth(2)).toHaveAttribute('data-id', 'ga-3')
  })

  test('allows sorting within Group B', async ({ page }) => {
    await page.dragAndDrop(
      '#group-b-1 [data-id="gb-3"]',
      '#group-b-1 [data-id="gb-1"]'
    )

    const groupBItems = page.locator('#group-b-1 .sortable-item')
    await expect(groupBItems.nth(0)).toHaveAttribute('data-id', 'gb-3')
    await expect(groupBItems.nth(1)).toHaveAttribute('data-id', 'gb-1')
    await expect(groupBItems.nth(2)).toHaveAttribute('data-id', 'gb-2')
  })

  test('prevents moving items between independent groups', async ({ page }) => {
    // Attempt to drag from Group A to Group B
    await page.dragAndDrop(
      '#group-a-1 [data-id="ga-1"]',
      '#group-b-1 [data-id="gb-2"]'
    )

    // Verify Group A still has all its items
    await expect(page.locator('#group-a-1 .sortable-item')).toHaveCount(3)
    await expect(page.locator('#group-a-1 [data-id="ga-1"]')).toBeVisible()

    // Verify Group B still has only its original items
    await expect(page.locator('#group-b-1 .sortable-item')).toHaveCount(3)
    await expect(page.locator('#group-b-1 [data-id="ga-1"]')).not.toBeVisible()
  })

  test('prevents moving items from Group B to Group A', async ({ page }) => {
    // Attempt to drag from Group B to Group A
    await page.dragAndDrop(
      '#group-b-1 [data-id="gb-2"]',
      '#group-a-1 [data-id="ga-1"]'
    )

    // Verify Group B still has all its items
    await expect(page.locator('#group-b-1 .sortable-item')).toHaveCount(3)
    await expect(page.locator('#group-b-1 [data-id="gb-2"]')).toBeVisible()

    // Verify Group A still has only its original items
    await expect(page.locator('#group-a-1 .sortable-item')).toHaveCount(3)
    await expect(page.locator('#group-a-1 [data-id="gb-2"]')).not.toBeVisible()
  })

  test.skip('maintains independence after multiple operations', async ({
    page,
  }) => {
    // Sort within Group A
    await page.dragAndDrop(
      '#group-a-1 [data-id="ga-2"]',
      '#group-a-1 [data-id="ga-1"]'
    )

    // Sort within Group B
    await page.dragAndDrop(
      '#group-b-1 [data-id="gb-1"]',
      '#group-b-1 [data-id="gb-3"]'
    )

    // Attempt cross-group drag again
    await page.dragAndDrop(
      '#group-a-1 [data-id="ga-3"]',
      '#group-b-1 [data-id="gb-2"]'
    )

    // Verify final states
    const groupAItems = page.locator('#group-a-1 .sortable-item')
    await expect(groupAItems).toHaveCount(3)
    await expect(groupAItems.nth(0)).toHaveAttribute('data-id', 'ga-2')

    const groupBItems = page.locator('#group-b-1 .sortable-item')
    await expect(groupBItems).toHaveCount(3)
    await expect(groupBItems.nth(1)).toHaveAttribute('data-id', 'gb-2')

    // Ensure no items crossed over
    await expect(page.locator('#group-a-1 [data-id^="gb-"]')).toHaveCount(0)
    await expect(page.locator('#group-b-1 [data-id^="ga-"]')).toHaveCount(0)
  })
})
