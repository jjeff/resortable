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
/**
 * `via` inserts an intermediate waypoint. A straight line between two points
 * can pass through a drop zone that is not the intended target, and this
 * library inserts on every move that resolves a zone — so the item silently
 * lands wherever the path grazed, and the test then passes for a reason that
 * has nothing to do with the endpoint. Route around such zones with `via`.
 */
async function pointerDrag(
  page: Page,
  fromSelector: string,
  toX: number,
  toY: number,
  via?: { x: number; y: number }
): Promise<void> {
  const fromBox = await page.locator(fromSelector).boundingBox()
  if (!fromBox) throw new Error('missing source box')
  const fromX = fromBox.x + fromBox.width / 2
  const fromY = fromBox.y + fromBox.height / 2

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX, fromY, { steps: 5 })
  if (via) await page.mouse.move(via.x, via.y, { steps: 8 })
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

    // The fixture's 600px-wide `.song` rows overflow narrow mobile
    // viewports (both clip lists sit pinned to the far right). Chromium
    // hit-tests coordinates beyond the visual viewport into that overflow
    // just fine, but WebKit's elementFromPoint / pointer-event targeting
    // does not — it resolves to <html> (or null) past the viewport edge,
    // so a mobile-Safari drag on an off-screen source/target never reaches
    // resortable's pointer handlers at all. Scrolling to the row's right
    // extent (a no-op where content already fits, i.e. every desktop
    // project) brings both clip lists into every engine's visible,
    // hit-testable viewport.
    await page.evaluate(() =>
      window.scrollTo({ left: document.documentElement.scrollWidth, top: 0 })
    )
  })

  test('drop on the body left of the clip list inserts at the start', async ({
    page,
  }) => {
    const clipsB = await page.locator('#clips-b').boundingBox()
    if (!clipsB) throw new Error('no clips-b box')
    // Just left of the clip list's own rect — inside song B's body, outside
    // clips-b — is enough to trigger the zone's `hitArea`-resolved "insert
    // at start" (any point left of the zone's rect qualifies, see
    // `insertAtStartOfZone` in DragManager.ts). Anchoring here instead of
    // an arbitrary fraction of the whole row keeps the target near the drag
    // source, so it stays within a single mobile-viewport width too.
    const targetX = clipsB.x - 20
    const targetY = clipsB.y + clipsB.height / 2

    await pointerDrag(page, '#clips-a [data-id="a1"]', targetX, targetY)

    // a1 moved to the FRONT of song B's clip list.
    expect(await clipIds(page, '#clips-b')).toEqual(['a1', 'b1'])
    expect(await clipIds(page, '#clips-a')).toEqual(['a2'])
  })

  test('drop past the clip list appends to the end', async ({ page }) => {
    const clipsB = await page.locator('#clips-b').boundingBox()
    if (!clipsB) throw new Error('no clips-b box')
    // Aim PAST the clip list's right edge, into song B's right padding: still
    // inside the `hitArea` region (.song) but outside the zone's own rect.
    // That is the branch this test is named for — `insertAtStartOfZone`
    // returns false, so `overIdx` falls through to `visible.length` and the
    // drop appends. Aiming inside the zone's own trailing padding (as this
    // test used to) reaches the same append branch by the ordinary
    // empty-space route and never exercises hitArea's right-side region at
    // all — the fixture had no such region until `.song` gained padding.
    const targetX = clipsB.x + clipsB.width + 15
    const targetY = clipsB.y + clipsB.height / 2

    // Approach from directly above rather than diagonally. A straight line
    // from clips-a to this point clips #clips-b's own rect on the way, which
    // inserts the item there mid-drag — the test then passes whether or not
    // hitArea routes the endpoint at all (verified: it still passed with
    // `hitArea` removed from the fixture). Going right into song A's padding
    // first, then straight down at an x that is past every clip list, keeps
    // the whole path outside both zones so only the endpoint can place it.
    const clipsA = await page.locator('#clips-a').boundingBox()
    if (!clipsA) throw new Error('no clips-a box')
    const via = { x: targetX, y: clipsA.y + clipsA.height / 2 }

    await pointerDrag(page, '#clips-a [data-id="a1"]', targetX, targetY, via)

    // a1 appended AFTER song B's existing clip.
    expect(await clipIds(page, '#clips-b')).toEqual(['b1', 'a1'])
    expect(await clipIds(page, '#clips-a')).toEqual(['a2'])
  })
})
