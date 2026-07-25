import { Page } from '@playwright/test'

export interface Point {
  x: number
  y: number
}

/**
 * Resolve an element's viewport center point, scrolling it into view first.
 */
export async function center(page: Page, selector: string): Promise<Point> {
  await page.locator(selector).scrollIntoViewIfNeeded()
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export interface PointerDragOptions {
  /** Steps for the in-place wiggle after pointerdown, before moving toward `to` (default 5). */
  settleSteps?: number
  /** Steps for the move from `from` to `to` (default 10). */
  steps?: number
}

/**
 * Drive a drag with `page.mouse`: move to source, press down, wiggle in
 * place, then move to the target over several steps before releasing.
 *
 * The multi-step moves matter — this library's drag detection needs several
 * intermediate `pointermove` events, and a single unstepped `mouse.move` (or
 * `locator.hover()`, which performs one) does not reliably generate enough of
 * them for Chromium/WebKit to recognize a drag.
 */
export async function pointerDrag(
  page: Page,
  from: Point,
  to: Point,
  opts: PointerDragOptions = {}
): Promise<void> {
  const { settleSteps = 5, steps = 10 } = opts
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y, { steps: settleSteps })
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}
