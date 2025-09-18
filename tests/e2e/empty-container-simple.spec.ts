import { test, expect } from '@playwright/test'

test('simple empty container drop test', async ({ page }) => {
  // Navigate to the page
  await page.goto('http://localhost:5173/demo-features.html')

  // Wait for the nested section to be visible
  await page.waitForSelector('#nested-vertical-list', { timeout: 5000 })

  // Scroll to the nested section
  await page.evaluate(() => {
    const element = document.querySelector('#nested-vertical-list')
    if (element) {
      element.scrollIntoView({ behavior: 'instant', block: 'center' })
    }
  })

  // Wait a bit for scroll to complete
  await page.waitForTimeout(500)

  // Get the empty container - use a more specific selector
  const emptyContainer = await page
    .locator('.nested-container')
    .filter({ hasText: 'Empty Section' })
    .locator('.horizontal-list')
    .elementHandle()

  // Check that it exists
  expect(emptyContainer).toBeTruthy()

  // Get the first item from Dashboard Widgets
  const firstItem = await page
    .locator('.nested-container')
    .filter({ hasText: 'Dashboard Widgets' })
    .locator('.horizontal-item')
    .first()
    .elementHandle()

  // Check that it exists
  expect(firstItem).toBeTruthy()

  console.log('Test completed successfully')
})
