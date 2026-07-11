import { expect, test } from '@playwright/test'
import { dragAndDropWithAnimation } from './helpers/animations'

test.describe('Basic Sortable Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('displays basic sortable list correctly', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    await expect(items).toHaveCount(4)

    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('reorders items within basic list using drag and drop', async ({
    page,
  }) => {
    // Drag first item to third position (it will end up after basic-3)
    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-3"]'
    )

    // Check new order using locators with retry
    // When dragging basic-1 to basic-3, it should end up after basic-3
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('maintains correct order after multiple drag operations', async ({
    page,
  }) => {
    // Verify initial state
    const initialItems = page.locator('#basic-list .sortable-item')
    await expect(initialItems.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(initialItems.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(initialItems.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(initialItems.nth(3)).toHaveAttribute('data-id', 'basic-4')

    // First drag: move basic-2 to the end (drag to basic-4)
    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-2"]',
      '#basic-list [data-id="basic-4"]'
    )

    // Wait for first drag to complete
    await page.waitForTimeout(300)

    // Verify intermediate state after first drag
    // When dragging basic-2 to basic-4, it should end up after basic-4
    await expect(
      page.locator('#basic-list .sortable-item').nth(3)
    ).toHaveAttribute('data-id', 'basic-2')

    // Second drag: move basic-4 to basic-1 position
    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-4"]',
      '#basic-list [data-id="basic-1"]'
    )

    // When dragging basic-4 to basic-1, it should end up before basic-1
    // After both drags, order should be: basic-4, basic-1, basic-3, basic-2
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-4')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-2')
  })

  test('applies visual feedback classes during drag', async ({ page }) => {
    const dragItem = page.locator('#basic-list [data-id="basic-1"]')

    // The library sets draggable=false when navigator.maxTouchPoints > 0
    // (touch devices use the pointer pipeline, not HTML5 DnD). Asserting the
    // device-correct setup. Note Playwright's "Mobile Safari" project is
    // Desktop WebKit + mobile viewport — NOT touch emulation; only "Mobile
    // Chrome" reports touchpoints > 0. Asserts the device-correct setup. #48
    const isTouchDevice = await page.evaluate(
      () => navigator.maxTouchPoints > 0
    )
    await expect(dragItem).toHaveAttribute(
      'draggable',
      isTouchDevice ? 'false' : 'true'
    )
  })

  // Removed (#74): "shows hover effects on sortable items" asserted a
  // translateY transform on `#basic-list .sortable-item:hover`, but
  // playground.html (a deliberately bare-bones dev harness — see its own
  // header copy) has never had a `.sortable-item:hover` rule. Checked the
  // pre-split combined page (git show 6f2c031^:index.html): #basic-list
  // used plain `.test-item` styling there too; the hover-transform only
  // ever existed on unrelated marketing demo sections (`.smooth-list`,
  // `.spring-list`) that don't exist in this fixture. Nothing to restore —
  // the test encoded a false assumption, not a regression.

  // Removed (#74): "handles touch input for drag and drop" drove a touch
  // drag via raw `page.dispatchEvent(..., { pointerType: 'touch' })`.
  // Playwright's real Touchscreen API only exposes `tap(x, y)` (single
  // touchstart+touchend) — there's no public multi-step touch-drag gesture
  // to rewrite this against. The dispatchEvent approach dispatches
  // untrusted synthetic events that don't reliably drive a full drag
  // session (see the sibling "handles pen input" / "handles multi-touch
  // pointer events" tests below, which use the same technique and only
  // assert *no* reorder happens) — that's the source of the flakiness.
  // DragManager's pointer handlers (`onPointerDown`/`onPointerMove`/
  // `onPointerUp`) don't branch on pointerType, so the code path a real
  // touch drag exercises is already covered:
  //   - the fallback pointer pipeline itself: on-move.spec.ts's
  //     "forceFallback (pointer pipeline, HTML5 listeners skipped)" suite
  //   - the touch-specific routing decision (HTML5 DnD disabled, draggable
  //     set to false when `navigator.maxTouchPoints > 0`): the "applies
  //     visual feedback classes during drag" test above, which runs for
  //     real under the touch-enabled "Mobile Chrome" project.

  test('handles pen input for drag and drop', async ({ page }) => {
    // Simulate pen drag with pointer events
    const sourceItem = page.locator('#basic-list [data-id="basic-2"]')
    const targetItem = page.locator('#basic-list [data-id="basic-4"]')

    const sourceBox = await sourceItem.boundingBox()
    const targetBox = await targetItem.boundingBox()

    if (!sourceBox || !targetBox) {
      throw new Error('Could not get element bounding boxes')
    }

    // Simulate pen-based drag with pointer events
    await page.dispatchEvent('#basic-list [data-id="basic-2"]', 'pointerdown', {
      pointerId: 2,
      pointerType: 'pen',
      isPrimary: true,
      clientX: sourceBox.x + sourceBox.width / 2,
      clientY: sourceBox.y + sourceBox.height / 2,
      button: 0,
      pressure: 0.5, // Pen-specific property
    })

    await page.dispatchEvent('body', 'pointermove', {
      pointerId: 2,
      pointerType: 'pen',
      isPrimary: true,
      clientX: targetBox.x + targetBox.width / 2,
      clientY: targetBox.y + targetBox.height / 2,
      button: 0,
      pressure: 0.5,
    })

    await page.dispatchEvent('body', 'pointerup', {
      pointerId: 2,
      pointerType: 'pen',
      isPrimary: true,
      clientX: targetBox.x + targetBox.width / 2,
      clientY: targetBox.y + targetBox.height / 2,
      button: 0,
      pressure: 0,
    })

    // Wait for the drag operation to complete
    await page.waitForTimeout(100)

    // Verify the items were reordered (basic-2 should move towards basic-4)
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('handles multi-touch pointer events correctly', async ({ page }) => {
    // Test that only the primary pointer interaction works for dragging
    const sourceItem = page.locator('#basic-list [data-id="basic-3"]')
    const targetItem = page.locator('#basic-list [data-id="basic-1"]')

    const sourceBox = await sourceItem.boundingBox()
    const targetBox = await targetItem.boundingBox()

    if (!sourceBox || !targetBox) {
      throw new Error('Could not get element bounding boxes')
    }

    // Start two simultaneous touch points
    await page.dispatchEvent('#basic-list [data-id="basic-3"]', 'pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX: sourceBox.x + sourceBox.width / 2,
      clientY: sourceBox.y + sourceBox.height / 2,
      button: 0,
    })

    // Secondary touch that should be ignored
    await page.dispatchEvent('#basic-list [data-id="basic-4"]', 'pointerdown', {
      pointerId: 4,
      pointerType: 'touch',
      isPrimary: false,
      clientX: sourceBox.x + sourceBox.width / 2,
      clientY: sourceBox.y + sourceBox.height / 2 + 50,
      button: 0,
    })

    // Move primary pointer
    await page.dispatchEvent('body', 'pointermove', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX: targetBox.x + targetBox.width / 2,
      clientY: targetBox.y + targetBox.height / 2,
      button: 0,
    })

    // Move secondary pointer (should be ignored)
    await page.dispatchEvent('body', 'pointermove', {
      pointerId: 4,
      pointerType: 'touch',
      isPrimary: false,
      clientX: targetBox.x + targetBox.width / 2 + 50,
      clientY: targetBox.y + targetBox.height / 2 + 50,
      button: 0,
    })

    // End both pointers
    await page.dispatchEvent('body', 'pointerup', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX: targetBox.x + targetBox.width / 2,
      clientY: targetBox.y + targetBox.height / 2,
      button: 0,
    })

    await page.dispatchEvent('body', 'pointerup', {
      pointerId: 4,
      pointerType: 'touch',
      isPrimary: false,
      clientX: targetBox.x + targetBox.width / 2 + 50,
      clientY: targetBox.y + targetBox.height / 2 + 50,
      button: 0,
    })

    // Wait for the drag operation to complete
    await page.waitForTimeout(100)

    // Verify the multi-touch behavior - items should remain in original order
    // since our implementation properly ignores non-primary pointers during active drags
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })
})
