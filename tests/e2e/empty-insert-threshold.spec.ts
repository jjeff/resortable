import { expect, test, Page } from '@playwright/test'

/**
 * Coverage for #31 — `emptyInsertThreshold` widens the drop-target match
 * around empty sortable containers by the configured pixel distance.
 *
 * The default threshold (5 px) means a cursor a few pixels OUTSIDE an empty
 * container should still resolve to that container as the drop target.
 */
async function pointerDrag(
  page: Page,
  fromSelector: string,
  toX: number,
  toY: number
): Promise<void> {
  await page.locator(fromSelector).scrollIntoViewIfNeeded()
  const fromBox = await page.locator(fromSelector).boundingBox()
  if (!fromBox) throw new Error('missing source box')
  const fromX = fromBox.x + fromBox.width / 2
  const fromY = fromBox.y + fromBox.height / 2

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX, fromY, { steps: 5 })
  await page.mouse.move(toX, toY, { steps: 10 })
  await page.mouse.up()
}

test.describe('emptyInsertThreshold (#31)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)
    await page.evaluate(() => {
      document
        .getElementById('shared-a-1')!
        .querySelectorAll('.sortable-item')
        .forEach((el) => el.remove())
    })
  })

  test('cursor just outside empty container still drops inside (default 5px threshold)', async ({
    page,
  }) => {
    // This is the positive control for the negative test below: that one only
    // asserts a-5 does NOT reach #shared-a-1, which would also hold if the
    // drag never started at all. This test asserts a-5 DOES land there, so
    // between them a broken drag cannot pass both.
    //
    // Scroll the empty container into view, then aim 3 px PAST its right edge.
    // 3 < default 5 — should still resolve to the container as drop target.
    await page.locator('#shared-a-1').scrollIntoViewIfNeeded()
    const box = await page.locator('#shared-a-1').boundingBox()
    if (!box) throw new Error('no box')
    const justOutsideX = box.x + box.width + 3
    const insideY = box.y + box.height / 2

    await pointerDrag(
      page,
      '#shared-a-2 [data-id="a-5"]',
      justOutsideX,
      insideY
    )

    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(1)
    await expect(
      page.locator('#shared-a-1 .sortable-item').first()
    ).toHaveAttribute('data-id', 'a-5')
  })

  test('cursor far outside empty container does NOT drop inside', async ({
    page,
  }) => {
    // A hardcoded viewport point like (5, 5) is not layout-safe: on the
    // mobile projects `.test-grid` collapses to a single column (#31/#48
    // follow-up), stacking #shared-a-1 directly above #shared-a-2. A
    // straight-line pointer path from a2 up to a fixed top-left point then
    // physically transits a1's rect — a dead-center hit, not a threshold
    // graze — so the item lives there for the rest of the drag (there's no
    // "snap back" once the pointer later moves over no container). That's
    // a bug in this test's geometry, not in `emptyInsertThreshold`.
    //
    // Fix: derive the destination from the containers' actual bounding
    // boxes and travel straight down, away from both. Neither the desktop
    // side-by-side layout nor the mobile stacked layout ever puts a1 below
    // a2, so a vertical path (fixed x, increasing y) can't cross either
    // container's rect en route — only the final point needs checking.
    const source = page.locator('#shared-a-2 [data-id="a-5"]')
    await source.scrollIntoViewIfNeeded()
    const [sourceBox, box1, box2] = await Promise.all([
      source.boundingBox(),
      page.locator('#shared-a-1').boundingBox(),
      page.locator('#shared-a-2').boundingBox(),
    ])
    if (!sourceBox || !box1 || !box2) throw new Error('missing box')

    const farX = sourceBox.x + sourceBox.width / 2
    const margin = 100 // well beyond the default 5px emptyInsertThreshold
    const maxBottom = Math.max(box1.y + box1.height, box2.y + box2.height)
    const viewportHeight = page.viewportSize()?.height ?? maxBottom + margin
    const farY = Math.min(maxBottom + margin, viewportHeight - 1)

    await pointerDrag(page, '#shared-a-2 [data-id="a-5"]', farX, farY)

    // a-1 stays empty; a-2 unchanged.
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(0)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)
  })
})
