import { test, expect } from '@playwright/test'

test.describe('Resortable Library', () => {
  test('should load the development page', async ({ page }) => {
    await page.goto('/')

    // Wait for the page to load
    await page.waitForLoadState('networkidle')

    // Check if the page title contains expected content
    await expect(page).toHaveTitle(/Vite/)
  })

  test('should handle basic drag and drop', async ({ page }) => {
    await page.goto('/')

    // This is a placeholder test - will be replaced with actual
    // Sortable functionality tests once the library is implemented
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})
