import { Page } from '@playwright/test'

/**
 * Wait for all animations to complete on the page
 * This is needed because FLIP animations might delay DOM updates
 */
export async function waitForAnimations(page: Page): Promise<void> {
  // Web Animations wait is best-effort — if the page tears down or a single
  // animation hangs we don't want the helper to throw or stall. See #47.
  try {
    await page.evaluate(() => {
      const animationsDone = Promise.all(
        document.getAnimations().map((animation) => animation.finished)
      )
      const cap = new Promise((resolve) => window.setTimeout(resolve, 2000))
      return Promise.race([animationsDone, cap])
    })
  } catch (err) {
    if (!(err instanceof Error && /aborted|Target closed/i.test(err.message))) {
      throw err
    }
  }

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
