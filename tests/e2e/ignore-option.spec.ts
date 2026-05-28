import { expect, test } from '@playwright/test'

/**
 * E2E coverage for the `ignore` option (issue #30, legacy parity:
 * default `'a, img'`). Asserts that pointer-down on a descendant
 * matching `ignore` does not start a drag — the item stays in place
 * and the `onStart` callback is not fired.
 *
 * We assert via a fixture-instrumented `window.dragStarts` counter
 * plus the absence of DOM reorder. Cross-zone navigation from
 * `<a href>` is not asserted directly because the fixture uses
 * `javascript:void(0)` href; the relevant proof is that drag does
 * not begin and the link element stays put.
 */

declare global {
  interface Window {
    dragStarts: { default: number; custom: number }
    sortableDefault: unknown
    sortableCustom: unknown
  }
}

async function getDragStarts(
  page: import('@playwright/test').Page
): Promise<{ default: number; custom: number }> {
  return await page.evaluate(() => window.dragStarts)
}

async function pointerSweep(
  page: import('@playwright/test').Page,
  selector: string,
  toY: number
): Promise<void> {
  const target = page.locator(selector)
  const box = await target.boundingBox()
  if (!box) throw new Error(`No bounding box for ${selector}`)

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Move enough to commit drag if it were going to start.
  await page.mouse.move(startX, toY, { steps: 5 })
  await page.mouse.up()
}

test.describe('Ignore Option (issue #30)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/ignore-option.html')
  })

  test('default — clicking a link does not start a drag', async ({ page }) => {
    const before = await getDragStarts(page)
    expect(before.default).toBe(0)

    // Drag attempt starting from the anchor in item-1.
    await pointerSweep(page, '#ignore-test [data-id="item-1"] [data-link]', 400)

    // No drag was initiated.
    const after = await getDragStarts(page)
    expect(after.default).toBe(0)

    // Order is preserved.
    const items = await page.locator('#ignore-test .sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-1')
    expect(await items[1].getAttribute('data-id')).toBe('item-2')
    expect(await items[2].getAttribute('data-id')).toBe('item-3')

    // Link element is still inside item-1.
    const linkParent = await page.evaluate(() => {
      const link = document.querySelector('#ignore-test [data-link]')
      return link?.closest('.sortable-item')?.getAttribute('data-id') ?? null
    })
    expect(linkParent).toBe('item-1')
  })

  test('default — clicking an image does not start a drag', async ({
    page,
  }) => {
    await pointerSweep(page, '#ignore-test [data-id="item-1"] [data-img]', 400)

    const after = await getDragStarts(page)
    expect(after.default).toBe(0)

    const items = await page.locator('#ignore-test .sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-1')
    expect(await items[1].getAttribute('data-id')).toBe('item-2')
    expect(await items[2].getAttribute('data-id')).toBe('item-3')
  })

  test('default — dragging from a non-ignored area still starts a drag', async ({
    page,
  }) => {
    // The `.body` span is the bulk of the item — not in default `ignore`.
    await pointerSweep(page, '#ignore-test [data-id="item-1"] .body', 400)

    const after = await getDragStarts(page)
    // We don't depend on the reorder semantics (chromium pointer-event
    // simulation has its own quirks documented in handle-filter.spec.ts);
    // we just confirm a drag DID start, which the ignore-blocked cases
    // do not.
    expect(after.default).toBeGreaterThanOrEqual(1)
  })

  test('custom `ignore: "input, button"` — link IS draggable, button is NOT', async ({
    page,
  }) => {
    // Button click should NOT start a drag.
    await pointerSweep(
      page,
      '#ignore-custom [data-id="cust-1"] [data-btn]',
      400
    )

    let after = await getDragStarts(page)
    expect(after.custom).toBe(0)

    const itemsAfterButton = await page
      .locator('#ignore-custom .sortable-item')
      .all()
    expect(await itemsAfterButton[0].getAttribute('data-id')).toBe('cust-1')
    expect(await itemsAfterButton[1].getAttribute('data-id')).toBe('cust-2')
    expect(await itemsAfterButton[2].getAttribute('data-id')).toBe('cust-3')

    // Link click SHOULD start a drag — custom selector overrides the
    // legacy default so `<a>` is no longer in the ignore set.
    await pointerSweep(
      page,
      '#ignore-custom [data-id="cust-1"] [data-link]',
      400
    )

    after = await getDragStarts(page)
    expect(after.custom).toBeGreaterThanOrEqual(1)
  })
})
