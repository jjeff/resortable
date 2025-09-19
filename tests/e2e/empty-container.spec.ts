import { test, expect } from '@playwright/test'

test.describe('Empty Container Drops', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/demo-features.html')

    // Wait for the page to be fully loaded
    await page.waitForSelector('#nested-vertical-list')

    // Scroll to the nested section
    await page.evaluate(() => {
      document
        .querySelector('#nested-vertical-list')
        ?.scrollIntoView({ behavior: 'instant', block: 'center' })
    })
  })

  test('should allow dropping items into empty containers', async ({
    page,
  }) => {
    // Get initial state
    const dashboardItems = page
      .locator('.nested-container')
      .filter({ hasText: 'Dashboard Widgets' })
      .locator('.horizontal-item')
    const emptyContainer = page
      .locator('.nested-container')
      .filter({ hasText: 'Empty Section' })
      .locator('.horizontal-list')

    // Verify initial state
    await expect(dashboardItems).toHaveCount(5)
    await expect(emptyContainer.locator('.horizontal-item')).toHaveCount(0)

    // Get the first item from Dashboard Widgets
    const firstItem = dashboardItems.first()
    const itemText = await firstItem.textContent()

    // Drag the first item to the empty container
    await firstItem.dragTo(emptyContainer)

    // Wait for animation to complete
    await page.waitForTimeout(300)

    // Verify the item was moved
    await expect(dashboardItems).toHaveCount(4)
    await expect(emptyContainer.locator('.horizontal-item')).toHaveCount(1)

    // Verify it's the correct item
    const movedItem = emptyContainer.locator('.horizontal-item').first()
    await expect(movedItem).toHaveText(itemText!)
  })

  test('should show placeholder when dragging over empty container', async ({
    page,
  }) => {
    // Get elements
    const firstItem = page
      .locator('.nested-container')
      .filter({ hasText: 'Dashboard Widgets' })
      .locator('.horizontal-item')
      .first()
    const emptyContainer = page
      .locator('.nested-container')
      .filter({ hasText: 'Empty Section' })
      .locator('.horizontal-list')

    // Start dragging
    await firstItem.hover()
    await page.mouse.down()
    await page.mouse.move(100, 100) // Move to trigger drag start

    // Move over empty container
    const emptyBox = await emptyContainer.boundingBox()
    if (emptyBox) {
      await page.mouse.move(
        emptyBox.x + emptyBox.width / 2,
        emptyBox.y + emptyBox.height / 2
      )

      // Check for placeholder
      const placeholder = emptyContainer.locator('.sortable-placeholder')
      await expect(placeholder).toBeVisible()
    }

    // Release the drag
    await page.mouse.up()
  })

  test('should allow dropping multiple items into empty container', async ({
    page,
  }) => {
    // Get elements
    const dashboardContainer = page
      .locator('.nested-container')
      .filter({ hasText: 'Dashboard Widgets' })
    const dashboardItems = dashboardContainer.locator('.horizontal-item')
    const emptyContainer = page
      .locator('.nested-container')
      .filter({ hasText: 'Empty Section' })
      .locator('.horizontal-list')

    // Verify initial state
    await expect(dashboardItems).toHaveCount(5)
    await expect(emptyContainer.locator('.horizontal-item')).toHaveCount(0)

    // Drag first item
    await dashboardItems.nth(0).dragTo(emptyContainer)
    await page.waitForTimeout(300)

    // Verify first item moved
    await expect(dashboardItems).toHaveCount(4)
    await expect(emptyContainer.locator('.horizontal-item')).toHaveCount(1)

    // Drag second item
    await dashboardItems.nth(0).dragTo(emptyContainer)
    await page.waitForTimeout(300)

    // Verify second item moved
    await expect(dashboardContainer.locator('.horizontal-item')).toHaveCount(3)
    await expect(emptyContainer.locator('.horizontal-item')).toHaveCount(2)
  })

  test('should allow dragging items between empty containers', async ({
    page,
  }) => {
    // First, create two empty containers by moving all items out
    const dataProcessingContainer = page
      .locator('.nested-container')
      .filter({ hasText: 'Data Processing' })
    const dataProcessingItems =
      dataProcessingContainer.locator('.horizontal-item')
    const dashboardContainer = page
      .locator('.nested-container')
      .filter({ hasText: 'Dashboard Widgets' })
      .locator('.horizontal-list')

    // Move all Data Processing items to Dashboard
    const itemCount = await dataProcessingItems.count()
    for (let i = 0; i < itemCount; i++) {
      await dataProcessingItems.first().dragTo(dashboardContainer)
      await page.waitForTimeout(200)
    }

    // Now both Data Processing and Empty Section are empty
    const emptySection = page
      .locator('.nested-container')
      .filter({ hasText: 'Empty Section' })
      .locator('.horizontal-list')
    const dataProcessingList =
      dataProcessingContainer.locator('.horizontal-list')

    // Verify both are empty
    await expect(dataProcessingList.locator('.horizontal-item')).toHaveCount(0)
    await expect(emptySection.locator('.horizontal-item')).toHaveCount(0)

    // Move one item from Dashboard to Data Processing (now empty)
    const dashboardItems = page
      .locator('.nested-container')
      .filter({ hasText: 'Dashboard Widgets' })
      .locator('.horizontal-item')
    await dashboardItems.first().dragTo(dataProcessingList)
    await page.waitForTimeout(300)

    // Verify item moved to previously empty container
    await expect(dataProcessingList.locator('.horizontal-item')).toHaveCount(1)

    // Now drag from Data Processing to Empty Section (both were empty initially)
    await dataProcessingList
      .locator('.horizontal-item')
      .first()
      .dragTo(emptySection)
    await page.waitForTimeout(300)

    // Verify item moved between previously empty containers
    await expect(dataProcessingList.locator('.horizontal-item')).toHaveCount(0)
    await expect(emptySection.locator('.horizontal-item')).toHaveCount(1)
  })
})
