import { expect, test, type Page } from '@playwright/test'

/**
 * Dispatch a synthetic touch-type PointerEvent directly on the element at
 * (x, y). Playwright's `page.touchscreen` only exposes `tap()` (down+up with
 * no hold), so it can't drive a held touch through `delayOnTouchOnly`. The
 * library's own pointerdown handler only branches on `event.pointerType`
 * (see DragManager `onPointerDown`), so a script-dispatched (untrusted)
 * PointerEvent with `pointerType: 'touch'` exercises the exact same code
 * path as a real touch — `setPointerCapture` is already wrapped in a
 * try/catch for synthetic pointers (see DragManager `commitPointerDrag`).
 */
async function dispatchTouchPointer(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  pointerId = 101
): Promise<void> {
  await page.evaluate(
    ({ type, x, y, pointerId }) => {
      const el = document.elementFromPoint(x, y) ?? document
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        })
      )
    },
    { type, x, y, pointerId }
  )
}

test.describe('Delay Options', () => {
  test('should delay drag start with delay option', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/delay-test.html')
    // Fake `setTimeout`/`clearTimeout` so the 300ms `delay` timer can be
    // crossed deterministically instead of racing real wall-clock waits.
    await page.clock.install()

    const item1 = page.locator('[data-id="item-1"]')
    const item2 = page.locator('[data-id="item-2"]')

    const box1 = await item1.boundingBox()
    const box2 = await item2.boundingBox()
    if (!box1 || !box2) throw new Error('Could not get bounding boxes')
    const center1 = { x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 }
    const center2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }

    // Release before the 300ms delay elapses — drag never starts.
    await page.mouse.move(center1.x, center1.y)
    await page.mouse.down()
    await page.clock.fastForward(100) // less than the 300ms delay
    await page.mouse.move(center2.x, center2.y)
    await page.mouse.up()

    const items = await page.locator('.sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-1')
    expect(await items[1].getAttribute('data-id')).toBe('item-2')

    // Hold past the delay — drag starts and the drop reorders the list.
    await page.mouse.move(center1.x, center1.y)
    await page.mouse.down()
    await page.clock.fastForward(350) // more than the 300ms delay
    await page.mouse.move(center2.x, center2.y)
    await page.mouse.up()

    const itemsAfter = await page.locator('.sortable-item').all()
    expect(await itemsAfter[0].getAttribute('data-id')).toBe('item-2')
    expect(await itemsAfter[1].getAttribute('data-id')).toBe('item-1')
  })

  test('should only delay on touch with delayOnTouchOnly', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/delay-touch-only.html')

    const item1 = page.locator('[data-id="item-1"]')
    const item2 = page.locator('[data-id="item-2"]')

    // Mouse drag should work immediately (delay: 0 for mouse).
    await item1.dragTo(item2)

    // The drag ghost is removed once the 150ms drop animation finishes —
    // wait it out so it doesn't linger as a stray `.sortable-item` (it has
    // no `data-id`) when the order is inspected/reset below.
    await expect(page.locator('.sortable-ghost')).toHaveCount(0)

    const items = await page.locator('.sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-2')
    expect(await items[1].getAttribute('data-id')).toBe('item-1')

    // Reset order
    await page.evaluate(() => {
      const container = document.getElementById('delay-touch-test')
      if (!container) return
      const items = Array.from(container.children) as HTMLElement[]
      items.sort((a, b) => {
        const aId = parseInt(a.dataset.id?.replace('item-', '') || '0')
        const bId = parseInt(b.dataset.id?.replace('item-', '') || '0')
        return aId - bId
      })
      items.forEach((item) => container.appendChild(item))
    })

    // Fake timers so the 400ms `delayOnTouchOnly` timer can be crossed
    // deterministically for the touch-path assertions below.
    await page.clock.install()

    const box1 = await item1.boundingBox()
    const box2 = await item2.boundingBox()
    if (!box1 || !box2) throw new Error('Could not get bounding boxes')
    const center1 = { x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 }
    const center2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }

    // Touch released before the 400ms delayOnTouchOnly elapses — no reorder.
    await dispatchTouchPointer(page, 'pointerdown', center1.x, center1.y)
    await page.clock.fastForward(200) // less than the 400ms touch delay
    await dispatchTouchPointer(page, 'pointerup', center1.x, center1.y)

    const itemsAfterQuickTouch = await page.locator('.sortable-item').all()
    expect(await itemsAfterQuickTouch[0].getAttribute('data-id')).toBe('item-1')
    expect(await itemsAfterQuickTouch[1].getAttribute('data-id')).toBe('item-2')

    // Touch held past the delay — drag starts and the drop reorders the list.
    await dispatchTouchPointer(page, 'pointerdown', center1.x, center1.y)
    await page.clock.fastForward(450) // more than the 400ms touch delay
    await dispatchTouchPointer(page, 'pointermove', center2.x, center2.y)
    await dispatchTouchPointer(page, 'pointerup', center2.x, center2.y)

    const itemsAfterHeldTouch = await page.locator('.sortable-item').all()
    expect(await itemsAfterHeldTouch[0].getAttribute('data-id')).toBe('item-2')
    expect(await itemsAfterHeldTouch[1].getAttribute('data-id')).toBe('item-1')
  })

  test('should cancel delayed drag if moved beyond threshold', async ({
    page,
  }) => {
    await page.goto('/tests/e2e/fixtures/delay-threshold.html')
    // Fake `setTimeout`/`clearTimeout` so the 300ms `delay` timer can be
    // crossed deterministically instead of racing real wall-clock waits.
    await page.clock.install()

    const item1 = page.locator('[data-id="item-1"]')
    const item2 = page.locator('[data-id="item-2"]')

    const box1 = await item1.boundingBox()
    const box2 = await item2.boundingBox()
    if (!box1 || !box2) throw new Error('Could not get bounding boxes')
    const center1 = { x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 }
    const center2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }

    // Move beyond the 10px threshold before the delay completes — cancels
    // the pending drag even though the delay later elapses.
    await page.mouse.move(center1.x, center1.y)
    await page.mouse.down()
    await page.clock.fastForward(100) // less than the 300ms delay
    await page.mouse.move(center1.x + 15, center1.y + 15) // beyond the 10px threshold
    await page.clock.fastForward(250) // would complete the delay, if not cancelled
    await page.mouse.move(center2.x, center2.y)
    await page.mouse.up()

    const items = await page.locator('.sortable-item').all()
    expect(await items[0].getAttribute('data-id')).toBe('item-1')
    expect(await items[1].getAttribute('data-id')).toBe('item-2')

    // Move within the threshold — the delayed drag commits normally.
    await page.mouse.move(center1.x, center1.y)
    await page.mouse.down()
    await page.mouse.move(center1.x + 3, center1.y + 3) // within the 10px threshold
    await page.clock.fastForward(350) // more than the 300ms delay
    await page.mouse.move(center2.x, center2.y)
    await page.mouse.up()

    const itemsAfter = await page.locator('.sortable-item').all()
    expect(await itemsAfter[0].getAttribute('data-id')).toBe('item-2')
    expect(await itemsAfter[1].getAttribute('data-id')).toBe('item-1')
  })
})
