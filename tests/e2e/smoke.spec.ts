import { expect, test } from '@playwright/test'

test('smoke test', async ({ page }) => {
  await page.goto('https://example.com')
  await expect(page).toHaveTitle('Example Domain')
})
