import { expect, test } from '@playwright/test'

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('navigates through items with arrow keys', async ({ page }) => {
    const container = page.locator('#basic-list')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const thirdItem = page.locator('#basic-list [data-id="basic-3"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus the container first, then the first item
    await container.focus()
    await firstItem.focus()
    await expect(firstItem).toBeFocused()
    await expect(firstItem).toHaveAttribute('tabindex', '0')

    // Navigate down with ArrowDown - dispatch to container
    await container.press('ArrowDown')
    await expect(secondItem).toBeFocused()
    await expect(secondItem).toHaveAttribute('tabindex', '0')
    await expect(firstItem).toHaveAttribute('tabindex', '-1')

    // Navigate down again
    await container.press('ArrowDown')
    await expect(thirdItem).toBeFocused()

    // Navigate up with ArrowUp
    await container.press('ArrowUp')
    await expect(secondItem).toBeFocused()

    // Navigate to last item with End
    await container.press('End')
    await expect(fourthItem).toBeFocused()

    // Navigate to first item with Home
    await container.press('Home')
    await expect(firstItem).toBeFocused()
  })

  test('wraps around when navigating past boundaries', async ({ page }) => {
    const container = page.locator('#basic-list')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const fourthItem = page.locator('#basic-list [data-id="basic-4"]')

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus first item and navigate up (should wrap to last)
    await firstItem.focus()
    await container.press('ArrowUp')
    await expect(fourthItem).toBeFocused()

    // Navigate down from last (should wrap to first)
    await container.press('ArrowDown')
    await expect(firstItem).toBeFocused()
  })

  test('selects items with Space key', async ({ page }) => {
    const container = page.locator('#basic-list')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus and select first item
    await firstItem.focus()
    await container.press('Space')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')
    await expect(firstItem).toHaveClass(/sortable-selected/)

    // Navigate to second item and select it
    await container.press('ArrowDown')
    await container.press('Space')

    // In single-select mode, first should be deselected
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')
    await expect(secondItem).toHaveAttribute('aria-selected', 'true')
  })

  test('performs keyboard drag and drop with Enter key', async ({ page }) => {
    const container = page.locator('#basic-list')
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    // const thirdItem = page.locator('#basic-list [data-id="basic-3"]') // Available if needed

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus and select first item
    await firstItem.focus()
    await container.press('Space')

    // Grab the item with Enter
    await container.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'true')

    // Navigate to third position
    await container.press('ArrowDown')
    await container.press('ArrowDown')

    // Drop the item with Enter
    await container.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'false')

    // Verify new order - item moves from position 0 to position 2
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('cancels drag operation with Escape key', async ({ page }) => {
    const container = page.locator('#basic-list')
    const items = page.locator('#basic-list .sortable-item')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus and select first item
    await firstItem.focus()
    await container.press('Space')

    // Grab the item
    await container.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'true')

    // Navigate down
    await container.press('ArrowDown')
    await container.press('ArrowDown')

    // Cancel with Escape
    await container.press('Escape')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'false')

    // Verify original order is maintained
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-2')
    await expect(items.nth(2)).toHaveAttribute('data-id', 'basic-3')
    await expect(items.nth(3)).toHaveAttribute('data-id', 'basic-4')
  })

  test('maintains focus visibility during keyboard navigation', async ({
    page,
  }) => {
    const container = page.locator('#basic-list')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus first item
    await firstItem.focus()
    await expect(firstItem).toHaveClass(/sortable-focused/)

    // Navigate to second item
    await container.press('ArrowDown')
    await expect(firstItem).not.toHaveClass(/sortable-focused/)
    await expect(secondItem).toHaveClass(/sortable-focused/)
  })

  test.skip('supports keyboard navigation across different sortable groups', async ({
    page,
  }) => {
    // TODO: Implement cross-list keyboard drag and drop
    // Test navigation in shared groups
    const list1 = page.locator('#list1')
    const list2 = page.locator('#list2')
    const list1FirstItem = page.locator('#list1 [data-id="item-1"]')
    const list2FirstItem = page.locator('#list2 [data-id="item-5"]')

    // Wait for initialization
    await page.waitForTimeout(100)

    // Focus and grab item from list1
    await list1FirstItem.focus()
    await list1.press('Space')
    await list1.press('Enter')
    await expect(list1FirstItem).toHaveAttribute('aria-grabbed', 'true')

    // Tab to list2 and drop
    await list2FirstItem.focus()
    await list2.press('Enter')

    // Verify item moved to list2
    await expect(page.locator('#list2 [data-id="item-1"]')).toBeVisible()
    await expect(page.locator('#list1 [data-id="item-1"]')).not.toBeVisible()
  })

  test('provides proper ARIA attributes for screen readers', async ({
    page,
  }) => {
    const container = page.locator('#basic-list')
    const items = container.locator('.sortable-item')

    // Check container ARIA attributes
    await expect(container).toHaveAttribute('role', 'listbox')
    await expect(container).toHaveAttribute('aria-label', /Sortable list/)

    // Check item ARIA attributes
    for (let i = 0; i < 4; i++) {
      const item = items.nth(i)
      await expect(item).toHaveAttribute('role', 'listitem')
      await expect(item).toHaveAttribute('aria-setsize', '4')
      await expect(item).toHaveAttribute('aria-posinset', (i + 1).toString())
      await expect(item).toHaveAttribute('aria-grabbed', 'false')
      await expect(item).toHaveAttribute('aria-selected', 'false')
    }

    // First item should be in tab order
    await expect(items.nth(0)).toHaveAttribute('tabindex', '0')

    // Other items should be out of tab order
    for (let i = 1; i < 4; i++) {
      await expect(items.nth(i)).toHaveAttribute('tabindex', '-1')
    }
  })
})
