import { expect, test, Page } from '@playwright/test'

/**
 * Coverage for #126 — `hitArea` lets a non-empty zone claim drops that land
 * anywhere inside a surrounding region (`closest('.song')`) but outside the
 * zone's own rect, inserting at the nearest end.
 *
 * The fixture's clip lists sit pinned to the far RIGHT of each 600px song row,
 * so most of the row is "body" that is NOT a registered drop zone. Dragging a
 * clip onto the body left of the list must land it at the start; dragging past
 * the list must append.
 */
async function pointerDrag(
  page: Page,
  fromSelector: string,
  toX: number,
  toY: number
): Promise<void> {
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

const clipIds = (page: Page, listSel: string) =>
  page
    .locator(`${listSel} .clip`)
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.id))

test.describe('hitArea (#126)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/hit-area.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('drop on the body left of the clip list inserts at the start', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch geometry differs (Mobile Chrome tracked in #48)'
    )

    const songB = await page.locator('#song-b').boundingBox()
    if (!songB) throw new Error('no song box')
    // Aim at the left third of song B's body — well left of its clip list.
    const targetX = songB.x + songB.width * 0.15
    const targetY = songB.y + songB.height / 2

    await pointerDrag(page, '#clips-a [data-id="a1"]', targetX, targetY)

    // a1 moved to the FRONT of song B's clip list.
    expect(await clipIds(page, '#clips-b')).toEqual(['a1', 'b1'])
    expect(await clipIds(page, '#clips-a')).toEqual(['a2'])
  })

  test('drop past the clip list appends to the end', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch geometry differs (Mobile Chrome tracked in #48)'
    )

    const songB = await page.locator('#song-b').boundingBox()
    if (!songB) throw new Error('no song box')
    // Aim past the right edge of the clip list (the far right of the row).
    const targetX = songB.x + songB.width - 4
    const targetY = songB.y + songB.height / 2

    await pointerDrag(page, '#clips-a [data-id="a1"]', targetX, targetY)

    // a1 appended AFTER song B's existing clip.
    expect(await clipIds(page, '#clips-b')).toEqual(['b1', 'a1'])
    expect(await clipIds(page, '#clips-a')).toEqual(['a2'])
  })
})
