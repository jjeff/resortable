import { expect, test } from '@playwright/test'
import {
  dragAndDropWithAnimation,
  waitForAnimations,
} from './helpers/animations'

test.describe('Legacy E2E Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#list1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#list2 .sortable-item')).toHaveCount(4)
  })

  test('reorders items within list1', async ({ page }) => {
    await dragAndDropWithAnimation(
      page,
      '#list1 [data-id="item-1"]',
      '#list1 [data-id="item-3"]'
    )

    // Use locator-based assertions instead of $$eval
    // When dragging item-1 to item-3, it should end up after item-3
    const items = page.locator('#list1 .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'item-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'item-3')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'item-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'item-4')
  })

  test('moves items between list1 and list2', async ({ page }) => {
    await page.dragAndDrop(
      '#list1 [data-id="item-2"]',
      '#list2 [data-id="item-6"]'
    )

    // Check that list1 has one less item
    await expect(page.locator('#list1 .sortable-item')).toHaveCount(3)

    // Check that list2 has one more item
    await expect(page.locator('#list2 .sortable-item')).toHaveCount(5)

    // Verify the item is now in list2
    await expect(page.locator('#list2 [data-id="item-2"]')).toBeVisible()
    await expect(page.locator('#list1 [data-id="item-2"]')).not.toBeVisible()
  })

  test('maintains shared group behavior', async ({ page }) => {
    // page.dragAndDrop drives native HTML5 DnD, which this library disables
    // on touch devices (DragManager sets draggable=false when
    // navigator.maxTouchPoints > 0) in favor of a pointer-event pipeline that
    // needs real mouse-driven pointer events instead — so this drives
    // page.mouse directly.
    //
    // Scrolling to just the source item (as page.dragAndDrop and the
    // mouseDragAndDrop helper both do) leaves the target sitting right at
    // the viewport edge on narrow mobile viewports, where the "Legacy E2E
    // Test Lists" grid collapses to one column and list1 ends up stacked
    // right above list2. A drop that close to the edge lands inside this
    // library's AutoScrollPlugin trigger zone, which scrolls the page
    // mid-drag and drops the item at the wrong index — confirmed via debug
    // logging: item-7 landed at list1 index 3, not 0, exactly when its
    // target rect sat 4px from the top edge. Scrolling the shared container
    // into view instead keeps both items comfortably clear of any edge.
    await page.locator('.test-container:has(#list1)').scrollIntoViewIfNeeded()

    const rects = await page.evaluate(() => {
      const center = (sel: string) => {
        const r = document.querySelector(sel)?.getBoundingClientRect()
        return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
      return {
        from: center('#list2 [data-id="item-7"]'),
        to: center('#list1 [data-id="item-1"]'),
      }
    })
    if (!rects.from || !rects.to) {
      throw new Error('could not resolve item-7 or item-1 bounding box')
    }
    const { from, to } = rects

    // Move from list2 to list1
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 5 })
    await page.mouse.move(to.x, to.y, { steps: 10 })

    // The move above already crossed into list1 and landed on item-1, but a
    // fast synthetic move can still get the final index wrong: entering a
    // new zone inserts the item at the crossing point and kicks off that
    // zone's 150ms FLIP animation, and DragManager's same-zone reorder
    // (onPointerMove) bails out early while `targetZone.isAnimating` is true
    // to avoid oscillation from elementFromPoint hitting animated positions.
    // A real pointer naturally keeps moving/settling across enough wall-clock
    // time to outlast that window; ten steps dispatched back-to-back can
    // land entirely inside it, leaving the item wherever it first crossed
    // the boundary instead of where the cursor ends up. Wait for the FLIP to
    // finish, then re-approach the target so a fresh pointermove re-triggers
    // the reorder against the settled DOM.
    await waitForAnimations(page)
    await page.mouse.move(to.x, to.y - 1, { steps: 2 })
    await page.mouse.move(to.x, to.y, { steps: 2 })

    await page.mouse.up()
    await waitForAnimations(page)

    // Verify item moved correctly
    const list1Items = page.locator('#list1 .sortable-item')
    await expect(list1Items.nth(0)).toHaveAttribute('data-id', 'item-7')

    // Check counts
    await expect(page.locator('#list1 .sortable-item')).toHaveCount(5)
    await expect(page.locator('#list2 .sortable-item')).toHaveCount(3)
  })
})
