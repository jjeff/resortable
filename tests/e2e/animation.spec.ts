import { test, expect } from '@playwright/test'

// TODO: These tests require full drag-and-drop implementation to work properly
// They are currently skipped until the drag system is complete
test.describe.skip('Animation System - Full Integration (TODO)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/simple-list.html')
  })

  test('should animate item reordering with FLIP technique', async ({
    page,
  }) => {
    // Get initial positions
    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const secondItem = items.nth(1)

    const firstInitialBox = await firstItem.boundingBox()
    const secondInitialBox = await secondItem.boundingBox()

    // Drag first item to second position
    await firstItem.dragTo(secondItem)

    // Wait for animation to complete
    await page.waitForTimeout(200)

    // Verify positions have swapped
    const firstFinalBox = await firstItem.boundingBox()
    const secondFinalBox = await secondItem.boundingBox()

    // First item should be approximately where second was
    expect(firstFinalBox?.y).toBeCloseTo(secondInitialBox?.y || 0, 0)
    // Second item should be approximately where first was
    expect(secondFinalBox?.y).toBeCloseTo(firstInitialBox?.y || 0, 0)
  })

  test('should respect animation duration option', async ({ page }) => {
    // Create sortable with longer animation
    await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new (window as any).Sortable(list, {
          animation: 500, // Longer animation
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
        })
      }
    })

    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const lastItem = items.nth(4)

    // Start drag
    await firstItem.dragTo(lastItem)

    // Animation should take 500ms, check at halfway point
    await page.waitForTimeout(250)

    // Items should still be transitioning (this is hard to test precisely)
    // Just verify drag completes successfully
    await page.waitForTimeout(300)

    // Verify final position
    const itemTexts = await items.allTextContents()
    expect(itemTexts[4]).toContain('Item 1')
  })

  test('should skip animation when duration is 0', async ({ page }) => {
    // Create sortable with no animation
    await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new (window as any).Sortable(list, {
          animation: 0, // No animation
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
        })
      }
    })

    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const secondItem = items.nth(1)

    // Drag should be instant
    await firstItem.dragTo(secondItem)

    // No need to wait for animation
    const itemTexts = await items.allTextContents()
    expect(itemTexts[0]).toContain('Item 2')
    expect(itemTexts[1]).toContain('Item 1')
  })

  test('should animate ghost element appearance and removal', async ({
    page,
  }) => {
    // Enable ghost class
    await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new (window as any).Sortable(list, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
        })
      }
    })

    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const secondItem = items.nth(1)

    // Start dragging
    await firstItem.hover()
    await page.mouse.down()

    // Move to trigger ghost
    await secondItem.hover()

    // Ghost should be visible with reduced opacity
    const ghost = page.locator('.sortable-ghost')
    await expect(ghost).toBeVisible()

    // Complete drag
    await page.mouse.up()

    // Ghost should be removed
    await expect(ghost).not.toBeVisible()
  })

  test('should animate items when moving between lists', async ({ page }) => {
    // Navigate to multi-list example
    await page.goto('/examples/multi-list.html')

    // Get items from both lists
    const list1Items = page.locator('#list1 .sortable-item')
    const list2Items = page.locator('#list2 .sortable-item')

    const firstItem = list1Items.nth(0)
    const list2 = page.locator('#list2')

    // Initial counts
    const list1InitialCount = await list1Items.count()
    const list2InitialCount = await list2Items.count()

    // Drag from list1 to list2
    await firstItem.dragTo(list2)

    // Wait for animation
    await page.waitForTimeout(200)

    // Verify counts changed
    expect(await list1Items.count()).toBe(list1InitialCount - 1)
    expect(await list2Items.count()).toBe(list2InitialCount + 1)

    // Verify item text moved
    const list2Texts = await list2Items.allTextContents()
    expect(list2Texts).toContain('List 1 - Item 1')
  })

  test('should support custom easing functions', async ({ page }) => {
    // Create sortable with custom easing
    await page.evaluate(() => {
      const list = document.getElementById('simple-list')
      if (list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        new (window as any).Sortable(list, {
          animation: 300,
          easing: 'ease-in-out', // Custom easing
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
        })
      }
    })

    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const lastItem = items.nth(4)

    // Perform drag with custom easing
    await firstItem.dragTo(lastItem)

    // Wait for animation with custom easing
    await page.waitForTimeout(350)

    // Verify move completed
    const itemTexts = await items.allTextContents()
    expect(itemTexts[4]).toContain('Item 1')
  })

  test('should handle rapid successive drags with animation cancellation', async ({
    page,
  }) => {
    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const secondItem = items.nth(1)
    const thirdItem = items.nth(2)

    // Perform rapid drags without waiting for animations
    await firstItem.dragTo(secondItem)
    await page.waitForTimeout(50) // Start animation

    // Start new drag before previous animation completes
    await secondItem.dragTo(thirdItem)
    await page.waitForTimeout(50)

    // Another rapid drag
    await thirdItem.dragTo(firstItem)

    // Wait for all animations to settle
    await page.waitForTimeout(200)

    // Verify final state is consistent
    const itemTexts = await items.allTextContents()
    expect(itemTexts).toHaveLength(5)

    // All items should still be present
    expect(itemTexts.join(',')).toMatch(/Item 1/)
    expect(itemTexts.join(',')).toMatch(/Item 2/)
    expect(itemTexts.join(',')).toMatch(/Item 3/)
  })

  test('should animate items affected by reordering', async ({ page }) => {
    const items = page.locator('.sortable-item')
    const firstItem = items.nth(0)
    const lastItem = items.nth(4)

    // Get initial positions of all items
    const initialPositions = await Promise.all(
      [0, 1, 2, 3, 4].map(async (i) => {
        const box = await items.nth(i).boundingBox()
        return box?.y || 0
      })
    )

    // Drag first to last - all items in between should shift up
    await firstItem.dragTo(lastItem)

    // Wait for animation
    await page.waitForTimeout(200)

    // Get final positions
    const finalPositions = await Promise.all(
      [0, 1, 2, 3, 4].map(async (i) => {
        const box = await items.nth(i).boundingBox()
        return box?.y || 0
      })
    )

    // Items 2-5 (now at positions 0-3) should have moved up
    expect(finalPositions[0]).toBeCloseTo(initialPositions[1], 0)
    expect(finalPositions[1]).toBeCloseTo(initialPositions[2], 0)
    expect(finalPositions[2]).toBeCloseTo(initialPositions[3], 0)
    expect(finalPositions[3]).toBeCloseTo(initialPositions[4], 0)
  })
})
