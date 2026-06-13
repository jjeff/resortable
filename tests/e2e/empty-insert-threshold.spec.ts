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
  }, testInfo) => {
    // emptyInsertThreshold is a desktop-precision-drag refinement. Mobile
    // projects use touch emulation with different geometry semantics and
    // stacked layouts; threshold behaviour there is out of scope here.
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch geometry differs (Mobile Chrome tracked in #48)'
    )

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
  }, testInfo) => {
    // emptyInsertThreshold is a desktop-precision-drag refinement. Mobile
    // projects use touch emulation with different geometry semantics and
    // stacked layouts; threshold behaviour there is out of scope here.
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch geometry differs (Mobile Chrome tracked in #48)'
    )

    // Aim at the very top-left of the viewport, well outside any sortable
    // container regardless of layout (desktop side-by-side, mobile stacked,
    // narrow viewport, etc.). The threshold is a few px — (5, 5) is
    // guaranteed not to be inside or "close to" any of our test sortables.
    await page.locator('#shared-a-2 [data-id="a-5"]').scrollIntoViewIfNeeded()
    await pointerDrag(page, '#shared-a-2 [data-id="a-5"]', 5, 5)

    // a-1 stays empty; a-2 unchanged.
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(0)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)
  })
})
