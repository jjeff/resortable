import { Page } from '@playwright/test'

/**
 * Wait for all animations to complete on the page
 * This is needed because FLIP animations might delay DOM updates
 */
export async function waitForAnimations(page: Page): Promise<void> {
  // Wait for any Web Animations API animations to finish
  await page.evaluate(() => {
    return Promise.all(
      document.getAnimations().map((animation) => animation.finished)
    )
  })

  // Also wait a small amount for any CSS transitions
  await page.waitForTimeout(200)
}

/**
 * Perform drag and drop with animation wait
 */
export async function dragAndDropWithAnimation(
  page: Page,
  source: string,
  target: string
): Promise<void> {
  await page.dragAndDrop(source, target)
  await waitForAnimations(page)
}
