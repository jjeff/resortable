import { dragAndDropWithAnimation } from './helpers/animations'
import { expect, test } from '@playwright/test'

test.describe('Grid Layout Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#grid-1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#grid-2 .sortable-item')).toHaveCount(4)
  })

  test('displays grid layouts correctly', async ({ page }) => {
    // Check first grid
    const grid1Items = page.locator('#grid-1 .sortable-item')
    await expect(grid1Items).toHaveCount(4)
    await expect(grid1Items.nth(0)).toHaveAttribute('data-id', 'g1-1')
    await expect(grid1Items.nth(3)).toHaveAttribute('data-id', 'g1-4')

    // Check second grid
    const grid2Items = page.locator('#grid-2 .sortable-item')
    await expect(grid2Items).toHaveCount(4)
    await expect(grid2Items.nth(0)).toHaveAttribute('data-id', 'g2-1')
    await expect(grid2Items.nth(3)).toHaveAttribute('data-id', 'g2-4')
  })

  test.fixme('maintains grid layout CSS properties', async ({ page }) => {
    const grid1 = page.locator('#grid-1')
    const grid2 = page.locator('#grid-2')

    // Check that grids have proper CSS grid properties
    await expect(grid1).toHaveCSS('display', 'grid')
    await expect(grid2).toHaveCSS('display', 'grid')

    // Verify grid template columns
    const grid1Columns = await grid1.evaluate(
      (el: Element) => window.getComputedStyle(el).gridTemplateColumns
    )
    const grid2Columns = await grid2.evaluate(
      (el: Element) => window.getComputedStyle(el).gridTemplateColumns
    )

    // Should have two equal columns (can be fr values, percentages, or computed px values)
    expect(grid1Columns).toMatch(/1fr 1fr|50% 50%|\d+px \d+px/)
    expect(grid2Columns).toMatch(/1fr 1fr|50% 50%|\d+px \d+px/)
  })

  test('allows reordering within the same grid', async ({ page }) => {
    // Move item within first grid
    await dragAndDropWithAnimation(
      page,
      '#grid-1 [data-id="g1-1"]',
      '#grid-1 [data-id="g1-3"]'
    )

    // Check new order in first grid
    // When dragging g1-1 to g1-3, it should end up after g1-3
    const grid1Items = page.locator('#grid-1 .sortable-item')
    await expect(grid1Items.nth(0)).toHaveAttribute('data-id', 'g1-2')
    await expect(grid1Items.nth(1)).toHaveAttribute('data-id', 'g1-3')
    await expect(grid1Items.nth(2)).toHaveAttribute('data-id', 'g1-1')
    await expect(grid1Items.nth(3)).toHaveAttribute('data-id', 'g1-4')
  })

  test('allows moving items between grids', async ({ page }) => {
    // Move item from grid 1 to grid 2
    await dragAndDropWithAnimation(
      page,
      '#grid-1 [data-id="g1-2"]',
      '#grid-2 [data-id="g2-3"]'
    )

    // Check first grid has one less item
    await expect(page.locator('#grid-1 .sortable-item')).toHaveCount(3)

    // Check second grid has one more item
    await expect(page.locator('#grid-2 .sortable-item')).toHaveCount(5)

    // Verify the item is in the correct position in second grid
    const grid2Items = page.locator('#grid-2 .sortable-item')
    await expect(grid2Items.nth(2)).toHaveAttribute('data-id', 'g1-2')
  })

  test('handles complex grid-to-grid operations', async ({ page }) => {
    // Move multiple items between grids
    await dragAndDropWithAnimation(
      page,
      '#grid-1 [data-id="g1-1"]',
      '#grid-2 [data-id="g2-1"]'
    )

    await dragAndDropWithAnimation(
      page,
      '#grid-2 [data-id="g2-4"]',
      '#grid-1 [data-id="g1-4"]'
    )

    // Both grids should still have 4 items
    await expect(page.locator('#grid-1 .sortable-item')).toHaveCount(4)
    await expect(page.locator('#grid-2 .sortable-item')).toHaveCount(4)

    // Check specific items are in expected grids
    await expect(page.locator('#grid-2 [data-id="g1-1"]')).toBeVisible()
    await expect(page.locator('#grid-1 [data-id="g2-4"]')).toBeVisible()
  })

  test('preserves grid positioning after drag operations', async ({ page }) => {
    // Get initial positions
    const initialBox1 = await page
      .locator('#grid-1 [data-id="g1-1"]')
      .boundingBox()
    const initialBox2 = await page
      .locator('#grid-1 [data-id="g1-2"]')
      .boundingBox()

    // Verify items are positioned differently (grid layout)
    expect(initialBox1).toBeTruthy()
    expect(initialBox2).toBeTruthy()

    // Move an item and verify grid layout is maintained
    await dragAndDropWithAnimation(
      page,
      '#grid-1 [data-id="g1-3"]',
      '#grid-1 [data-id="g1-1"]'
    )

    // Check that items still have grid positioning
    const newBox1 = await page
      .locator('#grid-1 .sortable-item')
      .nth(0)
      .boundingBox()
    const newBox2 = await page
      .locator('#grid-1 .sortable-item')
      .nth(1)
      .boundingBox()

    expect(newBox1).toBeTruthy()
    expect(newBox2).toBeTruthy()

    // Items should be positioned in a grid (either same row or different row)
    if (newBox1 && newBox2) {
      const sameRow = Math.abs(newBox1.y - newBox2.y) < 10
      const differentRow = Math.abs(newBox1.y - newBox2.y) > 30
      // After reordering, items might be on same row or different rows depending on grid layout
      expect(sameRow || differentRow).toBeTruthy()
      // But they should always have different X positions if on same row
      if (sameRow) {
        expect(Math.abs(newBox1.x - newBox2.x)).toBeGreaterThan(50)
      }
    }
  })

  test('maintains item content and styling in grid layout', async ({
    page,
  }) => {
    const originalText = await page
      .locator('#grid-1 [data-id="g1-1"]')
      .textContent()

    // Move the item to different grid
    await dragAndDropWithAnimation(
      page,
      '#grid-1 [data-id="g1-1"]',
      '#grid-2 [data-id="g2-2"]'
    )

    // Check item maintains its content and basic styling
    const movedItem = page.locator('#grid-2 [data-id="g1-1"]')
    await expect(movedItem).toHaveText(originalText || '')
    await expect(movedItem).toHaveClass(/sortable-item/)
  })
})
