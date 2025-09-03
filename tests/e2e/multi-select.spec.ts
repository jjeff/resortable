import { expect, test } from '@playwright/test'

test.describe('Multi-Select Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    
    // Initialize a sortable with multi-select enabled
    await page.evaluate(() => {
      // Destroy existing sortable if any
      const basicList = document.getElementById('basic-list')
      if (basicList && (window as any).sortables) {
        const sortable = (window as any).sortables.find((s: any) => s.el === basicList)
        if (sortable) sortable.destroy()
      }
      
      // Create new sortable with multi-select
      const Sortable = (window as any).Sortable
      new Sortable(basicList, {
        animation: 150,
        multiSelect: true,
        selectedClass: 'sortable-selected',
        group: 'basic'
      })
    })
    
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('selects multiple items with Ctrl+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')
    
    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)
    
    // Ctrl+Click third item
    await thirdItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)
    await expect(thirdItem).toHaveClass(/sortable-selected/)
  })

  test('selects multiple items with Cmd+Click on Mac', async ({ page, browserName }) => {
    // Skip on non-Mac or if we can't detect platform
    const isMac = process.platform === 'darwin'
    if (!isMac && browserName !== 'webkit') {
      test.skip()
    }
    
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')
    
    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    
    // Cmd+Click third item
    await thirdItem.click({ modifiers: ['Meta'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
  })

  test('selects range with Shift+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    
    // Click first item
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    
    // Shift+Click third item to select range
    await thirdItem.click({ modifiers: ['Shift'] })
    
    // All three items should be selected
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
  })

  test('toggles selection with Ctrl+Click', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    
    // Click to select
    await firstItem.click()
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    
    // Ctrl+Click to deselect
    await firstItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')
    
    // Ctrl+Click to select again
    await firstItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
  })

  test('selects all items with Ctrl+A', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    const container = page.locator('#basic-list')
    
    // Focus the container
    await container.focus()
    
    // Press Ctrl+A
    await page.keyboard.press('Control+a')
    
    // All items should be selected
    for (let i = 0; i < 4; i++) {
      await expect(items.nth(i)).toHaveAttribute('aria-selected', 'true')
      await expect(items.nth(i)).toHaveClass(/sortable-selected/)
    }
  })

  test('extends selection with Shift+ArrowKeys', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')
    
    // Focus and select first item
    await firstItem.focus()
    await page.keyboard.press('Space')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    
    // Shift+ArrowDown to extend selection
    await page.keyboard.press('Shift+ArrowDown')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    
    // Shift+ArrowDown again
    await page.keyboard.press('Shift+ArrowDown')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    await expect(thirdItem).toHaveAttribute('aria-selected', 'true')
  })

  test('drags multiple selected items together', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')
    
    // Select first and second items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })
    
    // Drag both items to after the fourth item
    await firstItem.dragTo(fourthItem)
    
    // Wait for animation
    await page.waitForTimeout(200)
    
    // Check new order - selected items should move together
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-4')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-2')
  })

  test('clears selection with Escape key', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    
    // Select multiple items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    
    // Press Escape to clear selection
    await page.keyboard.press('Escape')
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')
    await expect(secondItem).toHaveAttribute('aria-selected', 'false')
  })

  test('maintains selection state after drag operation', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')
    
    // Select two items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })
    
    // Drag them
    await firstItem.dragTo(fourthItem)
    await page.waitForTimeout(200)
    
    // Items should still be selected after drag
    const movedFirst = page.locator('#basic-list [data-id="basic-1"]')
    const movedSecond = page.locator('#basic-list [data-id="basic-2"]')
    await expect(movedFirst).toHaveAttribute('aria-selected', 'true')
    await expect(movedSecond).toHaveAttribute('aria-selected', 'true')
  })

  test('handles keyboard multi-select with grabbed items', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    
    // Focus first item
    await firstItem.focus()
    
    // Select first item
    await page.keyboard.press('Space')
    
    // Extend selection to second item
    await page.keyboard.press('Shift+ArrowDown')
    
    // Both should be selected
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
    
    // Grab both items
    await page.keyboard.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'true')
    await expect(secondItem).toHaveAttribute('aria-grabbed', 'true')
    
    // Move down twice
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    
    // Drop
    await page.keyboard.press('Enter')
    
    // Check new order - both items should have moved together
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-4')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-2')
  })
})