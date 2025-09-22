import { test, expect } from '@playwright/test'

test.describe('Simple Empty Container Test', () => {
  test('should allow dragging items into an empty container', async ({
    page,
  }) => {
    // Navigate to the simple test page
    await page.goto(
      'http://localhost:5173/html-tests/test-empty-container.html'
    )

    // Wait for Sortable to initialize
    await page.waitForSelector('#container1')
    await page.waitForTimeout(200)

    // Get initial counts
    const sourceItems = page.locator('#container1 .item')
    const emptyItems = page.locator('#container2 .item')

    // Verify initial state
    await expect(sourceItems).toHaveCount(3)
    await expect(emptyItems).toHaveCount(0)

    // Get the first item
    const firstItem = sourceItems.first()
    const itemText = await firstItem.textContent()

    // Get the empty container
    const emptyContainer = page.locator('#container2')

    // Perform the drag and drop
    await firstItem.dragTo(emptyContainer)

    // Wait for animation
    await page.waitForTimeout(300)

    // Verify the item was moved
    await expect(sourceItems).toHaveCount(2)
    await expect(emptyItems).toHaveCount(1)

    // Verify it's the correct item
    const movedItem = emptyItems.first()
    await expect(movedItem).toHaveText(itemText!)

    // Verify we can drag another item
    const secondItem = sourceItems.first()
    await secondItem.dragTo(emptyContainer)
    await page.waitForTimeout(300)

    // Verify both items moved
    await expect(sourceItems).toHaveCount(1)
    await expect(emptyItems).toHaveCount(2)
  })

  test('should allow dragging items back from previously empty container', async ({
    page,
  }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-empty-container.html'
    )

    // Wait for initialization
    await page.waitForSelector('#container1')
    await page.waitForTimeout(200)

    const sourceContainer = page.locator('#container1')
    const emptyContainer = page.locator('#container2')
    const sourceItems = sourceContainer.locator('.item')
    const emptyItems = emptyContainer.locator('.item')

    // Move item to empty container
    await sourceItems.first().dragTo(emptyContainer)
    await page.waitForTimeout(300)

    // Now drag it back
    await emptyItems.first().dragTo(sourceContainer)
    await page.waitForTimeout(300)

    // Verify item returned
    await expect(sourceItems).toHaveCount(3)
    await expect(emptyItems).toHaveCount(0)
  })
})
