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

/**
 * Low-level `page.mouse`-driven drag and drop, for elements where
 * `page.dragAndDrop()` / native HTML5 drag simulation doesn't reliably
 * reach this library's dual HTML5/pointer pipeline (see #75).
 *
 * Reads both elements' `getBoundingClientRect()` in a SINGLE `page.evaluate`
 * call rather than two sequential `locator.boundingBox()` calls. Each
 * `boundingBox()` call auto-scrolls its element into view; calling it twice
 * for two different elements can scroll the page between the two reads, so
 * the first element's captured coordinates go stale relative to the second
 * scroll position — the mouse then lands on the wrong spot (or nothing) and
 * the drag never starts. A single atomic read after one settle avoids that.
 */
export async function mouseDragAndDrop(
  page: Page,
  sourceSelector: string,
  targetSelector: string
): Promise<void> {
  await page.locator(sourceSelector).first().scrollIntoViewIfNeeded()

  const rects = await page.evaluate(
    ({ sourceSelector, targetSelector }) => {
      const s = document.querySelector(sourceSelector)?.getBoundingClientRect()
      const t = document.querySelector(targetSelector)?.getBoundingClientRect()
      if (!s || !t) return null
      return {
        source: { x: s.x, y: s.y, width: s.width, height: s.height },
        target: { x: t.x, y: t.y, width: t.width, height: t.height },
      }
    },
    { sourceSelector, targetSelector }
  )
  if (!rects) {
    throw new Error(
      `mouseDragAndDrop: could not resolve "${sourceSelector}" or "${targetSelector}"`
    )
  }

  const from = {
    x: rects.source.x + rects.source.width / 2,
    y: rects.source.y + rects.source.height / 2,
  }
  const to = {
    x: rects.target.x + rects.target.width / 2,
    y: rects.target.y + rects.target.height / 2,
  }

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  await waitForAnimations(page)
}
