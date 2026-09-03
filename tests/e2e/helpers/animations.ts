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
 * Perform drag and drop with animation wait.
 *
 * Uses `page.dragAndDrop`, which reaches the POINTER pipeline, not the native
 * HTML5 one — on every project, desktop included. `DragManager.onPointerDown`
 * calls `preventDefault()` on a drag-eligible press, which stops the browser
 * ever firing `dragstart`, so the native handlers are unreachable unless the
 * fixture opts in with `nativeDrag: true` (#165). Playwright's mouse events
 * reach the pointer pipeline via engine-synthesized `pointer*` events.
 *
 * ponytail: routing touch projects through `mouseDragAndDrop` instead was
 * tried and is WORSE — its straight-line stepped path transits the
 * intermediate container on stacked mobile layouts and lands items at the
 * wrong index (10 deterministic failures in shared-groups vs. occasional
 * load-induced flakes). Left as-is deliberately. If the residual mobile
 * flakiness here is worth chasing, the fix is a path that routes around
 * other drop zones, not a different drag primitive.
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
 * The source rect is read after scrolling the source into view. The TARGET
 * rect is deliberately read later — after `mousedown`, once the target has
 * been scrolled into view with the pointer already held down.
 *
 * Resolving the target up front is what breaks on short viewports: if source
 * and target don't both fit on screen at once, the target's center can sit
 * below the viewport's bottom edge. `document.elementFromPoint()` returns
 * null outside the viewport, so the library's hit-test resolves no drop zone
 * and the drop is a silent no-op — the drag "succeeds" while doing nothing.
 * Scrolling mid-drag keeps the gesture continuous (no pointer release) while
 * bringing the target into hit-testable space.
 *
 * Each rect is read in a single `page.evaluate` rather than via
 * `locator.boundingBox()`, which auto-scrolls its element into view and would
 * silently invalidate coordinates captured before it.
 */
export async function mouseDragAndDrop(
  page: Page,
  sourceSelector: string,
  targetSelector: string
): Promise<void> {
  await page.locator(sourceSelector).first().scrollIntoViewIfNeeded()

  const centerOf = async (selector: string) => {
    const rect = await page.evaluate((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
    }, selector)
    if (!rect) {
      throw new Error(`mouseDragAndDrop: could not resolve "${selector}"`)
    }
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }

  const from = await centerOf(sourceSelector)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y, { steps: 3 })

  // Bring the target into view mid-drag, then read its post-scroll rect.
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'center' })
  }, targetSelector)
  const to = await centerOf(targetSelector)

  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  await waitForAnimations(page)
}
