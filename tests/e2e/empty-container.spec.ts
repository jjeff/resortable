import { expect, test, Page } from '@playwright/test'

/**
 * Regression coverage for #32 — items must drop into empty sortable containers.
 *
 * ARCHITECTURE.md flagged this as an unresolved issue: when a container has
 * no draggable children, the pointer-based drag handler bails because
 * `elementFromPoint(...).closest(draggable)` returns null.
 *
 * NOTE: We drive the drag with `page.mouse` (not `page.dragAndDrop`) because
 * Playwright's high-level helper does not always dispatch intermediate
 * pointermove events to the target when the target is a container — and the
 * library's drag logic lives in `pointermove`.
 */
async function pointerDrag(
  page: Page,
  fromSelector: string,
  toSelector: string,
  steps = 10
): Promise<void> {
  // page.mouse uses viewport coordinates, so make sure both endpoints are
  // actually inside the viewport before reading bounding boxes.
  await page.locator(fromSelector).scrollIntoViewIfNeeded()
  await page.locator(toSelector).scrollIntoViewIfNeeded()

  const fromBox = await page.locator(fromSelector).boundingBox()
  const toBox = await page.locator(toSelector).boundingBox()
  if (!fromBox || !toBox) throw new Error('missing bounding box')

  const fromX = fromBox.x + fromBox.width / 2
  const fromY = fromBox.y + fromBox.height / 2
  const toX = toBox.x + toBox.width / 2
  const toY = toBox.y + toBox.height / 2

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  // Multiple intermediate pointermoves so the drag logic observes the path.
  await page.mouse.move(fromX, fromY, { steps })
  await page.mouse.move(toX, toY, { steps })
  await page.mouse.up()
}

test.describe('Empty Container Drop Target (#32)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)

    // Empty list a-1 by detaching every draggable child. Both lists share a
    // group ('shared-a'), so a-2's items remain eligible to drop into a-1.
    await page.evaluate(() => {
      const list = document.getElementById('shared-a-1')!
      list.querySelectorAll('.sortable-item').forEach((el) => el.remove())
    })

    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(0)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(4)
  })

  test('drops item from non-empty list into empty list', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Tracked in #48')

    await pointerDrag(page, '#shared-a-2 [data-id="a-5"]', '#shared-a-1')

    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(1)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(3)
    await expect(
      page.locator('#shared-a-1 .sortable-item').first()
    ).toHaveAttribute('data-id', 'a-5')
  })

  test('can drop multiple items into a previously-empty list sequentially', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Tracked in #48')

    await pointerDrag(page, '#shared-a-2 [data-id="a-5"]', '#shared-a-1')
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(1)

    await pointerDrag(
      page,
      '#shared-a-2 [data-id="a-6"]',
      '#shared-a-1 [data-id="a-5"]'
    )
    await expect(page.locator('#shared-a-1 .sortable-item')).toHaveCount(2)
    await expect(page.locator('#shared-a-2 .sortable-item')).toHaveCount(2)
  })
})
