import { expect, test, type Page } from '@playwright/test'
import { center, pointerDrag } from './helpers/pointer-drag'

/**
 * Pin a list's FULL `data-id` order. Counts alone can't tell a copy that
 * landed at the drop slot from one appended to the end. Polled rather than
 * read once: the ghost also carries `.sortable-item` and only leaves the DOM
 * after its settle animation, so a bare read can catch an extra entry.
 */
async function expectOrder(
  page: Page,
  selector: string,
  expected: string[]
): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(`${selector} .sortable-item`)
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.id))
    )
    .toEqual(expected)
}

/**
 * E2E coverage for the pointer-pipeline slice of `duplicateKey` — see
 * `playground.html`'s "Duplicate on Key" section: `#dup-a`/`#dup-b` share
 * group `dup-test` with `duplicateKey: 'alt'`, and `#dup-shift` is a single
 * list with `duplicateKey: 'shift'`.
 *
 * NOTE: Alt+drag can double as a window-manager gesture on some Linux
 * desktops (move-window-under-cursor). If the WebKit-on-Linux CI leg flakes
 * on the alt-held tests here, switch that fixture over to `#dup-shift` /
 * `page.keyboard.down('Shift')` instead — `duplicateKey` itself is
 * modifier-agnostic, only the OS gesture collision is alt-specific.
 */

test.describe('duplicateKey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#dup-a .sortable-item')).toHaveCount(4)
    await expect(page.locator('#dup-b .sortable-item')).toHaveCount(2)
    await expect(page.locator('#dup-shift .sortable-item')).toHaveCount(4)
  })

  test.afterEach(async ({ page }) => {
    // Belt-and-suspenders: a failed assertion mid-test can leave a modifier
    // "held" for Playwright's synthetic input across into the next test.
    await page.keyboard.up('Alt').catch(() => {})
    await page.keyboard.up('Shift').catch(() => {})
  })

  test('alt-drag within Dup A duplicates in place: count 4 -> 5, original stays at its old position', async ({
    page,
  }) => {
    const from = await center(page, '#dup-a [data-id="dup-a-1"]')
    const to = await center(page, '#dup-a [data-id="dup-a-3"]')

    await page.keyboard.down('Alt')
    await pointerDrag(page, from, to)
    await page.keyboard.up('Alt')

    // The copy lands at the DROP SLOT (index 2), the original is back at its
    // start index (0), and the clone keeps the original's data-id (identity
    // re-minting is left to the `clone` event handler) — hence dup-a-1 twice.
    await expectOrder(page, '#dup-a', [
      'dup-a-1',
      'dup-a-2',
      'dup-a-1',
      'dup-a-3',
      'dup-a-4',
    ])
  })

  test('alt-drag from Dup A to Dup B copies: source unchanged, target +1', async ({
    page,
  }) => {
    const from = await center(page, '#dup-a [data-id="dup-a-2"]')
    const to = await center(page, '#dup-b [data-id="dup-b-1"]')

    await page.keyboard.down('Alt')
    await pointerDrag(page, from, to)
    await page.keyboard.up('Alt')

    // Source order untouched — every item, not just a count.
    await expectOrder(page, '#dup-a', [
      'dup-a-1',
      'dup-a-2',
      'dup-a-3',
      'dup-a-4',
    ])
    // Target: exactly one copy, and the residents keep their relative order
    // (a copy that displaced or duplicated them would show up here). The
    // copy's exact slot is NOT pinned: on the desktop grid the lists sit
    // side by side and it lands at index 0, while on the mobile viewports
    // they stack and the drag path transits the whole list, landing at the
    // end. Slot pinning lives in the same-zone tests, whose geometry is
    // identical in every project.
    await expect(page.locator('#dup-b .sortable-item')).toHaveCount(3)
    const dupB = await page
      .locator('#dup-b .sortable-item')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.id))
    expect(dupB.filter((id) => id !== 'dup-a-2')).toEqual([
      'dup-b-1',
      'dup-b-2',
    ])
  })

  test('a plain drag (no modifier) still moves — regression', async ({
    page,
  }) => {
    const from = await center(page, '#dup-a [data-id="dup-a-1"]')
    const to = await center(page, '#dup-a [data-id="dup-a-3"]')

    await pointerDrag(page, from, to)

    // Plain move: dup-a-1 changes slot, nothing is copied.
    await expectOrder(page, '#dup-a', [
      'dup-a-2',
      'dup-a-1',
      'dup-a-3',
      'dup-a-4',
    ])
  })

  test('Alt held through a click with no drag does NOT duplicate', async ({
    page,
  }) => {
    const at = await center(page, '#dup-a [data-id="dup-a-1"]')

    // `fallbackTolerance` defaults to 0, so pointerdown commits the drag
    // immediately — without a movement check this bare click would duplicate.
    await page.keyboard.down('Alt')
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expectOrder(page, '#dup-a', [
      'dup-a-1',
      'dup-a-2',
      'dup-a-3',
      'dup-a-4',
    ])
  })

  test('Alt pressed mid-drag (between mouse moves) still arms duplicate', async ({
    page,
  }) => {
    const from = await center(page, '#dup-a [data-id="dup-a-1"]')
    const mid = await center(page, '#dup-a [data-id="dup-a-2"]')
    const to = await center(page, '#dup-a [data-id="dup-a-3"]')

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 5 })
    // Move partway with no modifier held yet...
    await page.mouse.move(mid.x, mid.y, { steps: 5 })
    // ...then arm duplicate mid-drag, and finish the move.
    await page.keyboard.down('Alt')
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    // Count only: the pause at `mid` changes the drag path, and where a
    // path-dependent drop lands differs between engines (Chromium/Firefox
    // put the copy at index 3, WebKit at 2). This test is about ARMING
    // duplicate mid-drag — the drop slot is pinned by the tests above.
    await expect(page.locator('#dup-a .sortable-item')).toHaveCount(5)
    await expect(page.locator('#dup-a [data-id="dup-a-1"]')).toHaveCount(2)
  })

  test('Alt released before mouse-up falls back to a plain move', async ({
    page,
  }) => {
    const from = await center(page, '#dup-a [data-id="dup-a-1"]')
    const to = await center(page, '#dup-a [data-id="dup-a-3"]')

    await page.keyboard.down('Alt')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 5 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    // Release BEFORE mouse-up — drop-time truth reads no modifier held.
    await page.keyboard.up('Alt')
    await page.mouse.up()

    await expect(page.locator('#dup-a [data-id="dup-a-1"]')).toHaveCount(1)
    await expect(page.locator('#dup-a .sortable-item')).toHaveCount(4)
  })

  test('the ghost gains and loses sortable-duplicate as Alt toggles mid-drag', async ({
    page,
  }) => {
    const from = await center(page, '#dup-a [data-id="dup-a-1"]')
    const to = await center(page, '#dup-a [data-id="dup-a-3"]')

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 5 })
    await page.mouse.move(to.x, to.y, { steps: 5 })

    const ghost = page.locator('[data-resortable-ghost]')
    await expect(ghost).not.toHaveClass(/sortable-duplicate/)

    await page.keyboard.down('Alt')
    await expect(ghost).toHaveClass(/sortable-duplicate/)

    await page.keyboard.up('Alt')
    await expect(ghost).not.toHaveClass(/sortable-duplicate/)

    await page.mouse.up()
  })

  test('shift-drag on Dup Shift duplicates (exercises the pointerdown relaxation)', async ({
    page,
  }) => {
    const from = await center(page, '#dup-shift [data-id="dup-shift-1"]')
    const to = await center(page, '#dup-shift [data-id="dup-shift-3"]')

    // duplicateKey: 'shift' on #dup-shift means a shift+pointerdown must
    // still START a drag here — normally shift+click is a selection
    // gesture that blocks drag start entirely (isSelectionModifierHeld).
    await page.keyboard.down('Shift')
    await pointerDrag(page, from, to)
    await page.keyboard.up('Shift')

    await expectOrder(page, '#dup-shift', [
      'dup-shift-1',
      'dup-shift-2',
      'dup-shift-1',
      'dup-shift-3',
      'dup-shift-4',
    ])
  })
})
