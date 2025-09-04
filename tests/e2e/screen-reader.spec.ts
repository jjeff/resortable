import { expect, test } from '@playwright/test'

test.describe('Screen Reader Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('provides live region announcements for drag operations', async ({
    page,
  }) => {
    // Check that announcer element exists
    const announcer = page.locator('[role="status"][aria-live="assertive"]')
    await expect(announcer).toHaveCount(1)

    // Initially should be empty
    await expect(announcer).toHaveText('')

    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Focus and select item
    await firstItem.focus()
    await page.keyboard.press('Space')

    // Grab item - should announce
    await page.keyboard.press('Enter')
    await page.waitForTimeout(50) // Wait for announcement
    await expect(announcer).toHaveText(/Grabbed 1 item/)

    // Move item
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150) // Wait for announcement delay

    // Drop item - should announce
    await page.keyboard.press('Enter')
    await page.waitForTimeout(50) // Wait for announcement
    await expect(announcer).toHaveText(/Dropped 1 item/)
  })

  test('announces selection changes to screen readers', async ({ page }) => {
    const announcer = page.locator('[role="status"][aria-live="assertive"]')
    const container = page.locator('#basic-list')

    // Focus container
    await container.focus()

    // Select all items
    await page.keyboard.press('Control+a')
    await expect(announcer).toHaveText(/Selected all 4 items/)
  })

  test('announces cancellation of drag operations', async ({ page }) => {
    const announcer = page.locator('[role="status"][aria-live="assertive"]')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Start drag operation
    await firstItem.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')

    // Move down
    await page.keyboard.press('ArrowDown')

    // Cancel with Escape
    await page.keyboard.press('Escape')

    // Wait a bit for the announcement
    await page.waitForTimeout(50)
    await expect(announcer).toHaveText(/Move cancelled/)
  })

  test('provides descriptive ARIA labels', async ({ page }) => {
    const container = page.locator('#basic-list')

    // Container should have descriptive label
    await expect(container).toHaveAttribute(
      'aria-label',
      /Sortable list.*arrow keys.*space.*enter/
    )
  })

  test('updates ARIA attributes during interaction', async ({ page }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    // const secondItem = page.locator('#basic-list [data-id="basic-2"]') // Available if needed

    // Initially not selected or grabbed
    await expect(firstItem).toHaveAttribute('aria-selected', 'false')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'false')

    // Select item
    await firstItem.focus()
    await page.keyboard.press('Space')
    await expect(firstItem).toHaveAttribute('aria-selected', 'true')

    // Grab item
    await page.keyboard.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'true')

    // Move and drop
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(firstItem).toHaveAttribute('aria-grabbed', 'false')
  })

  test('maintains proper ARIA position attributes', async ({ page }) => {
    const items = page.locator('#basic-list .sortable-item')

    // Check initial positions
    for (let i = 0; i < 4; i++) {
      await expect(items.nth(i)).toHaveAttribute(
        'aria-posinset',
        (i + 1).toString()
      )
      await expect(items.nth(i)).toHaveAttribute('aria-setsize', '4')
    }

    // Move first item to third position
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    await firstItem.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Wait for DOM update
    await page.waitForTimeout(100)

    // Check updated positions - items should have new aria-posinset values
    const newItems = page.locator('#basic-list .sortable-item')
    for (let i = 0; i < 4; i++) {
      await expect(newItems.nth(i)).toHaveAttribute(
        'aria-posinset',
        (i + 1).toString()
      )
      await expect(newItems.nth(i)).toHaveAttribute('aria-setsize', '4')
    }
  })

  test('provides keyboard instructions in ARIA descriptions', async ({
    page,
  }) => {
    const container = page.locator('#basic-list')

    // Container should have instructions for keyboard users
    const ariaLabel = await container.getAttribute('aria-label')
    expect(ariaLabel).toContain('arrow keys')
    expect(ariaLabel).toContain('space')
    expect(ariaLabel).toContain('enter')
  })

  test('announces multi-item operations correctly', async ({ page }) => {
    // Initialize multi-select sortable
    await page.evaluate(() => {
      const basicList = document.getElementById('basic-list')
      interface WindowWithSortables extends Window {
        sortables?: Array<{ el: HTMLElement; destroy: () => void }>
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortables
      if (basicList && win.sortables) {
        const sortable = win.sortables.find((s) => s.el === basicList)
        if (sortable) sortable.destroy()
      }

      const Sortable = win.Sortable
      if (Sortable && basicList) {
        new Sortable(basicList, {
          animation: 150,
          multiDrag: true,
          selectedClass: 'sortable-selected',
          group: 'basic',
        })
      }
    })

    const announcer = page.locator('[role="status"][aria-live="assertive"]')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Select multiple items
    await firstItem.click()
    await secondItem.click({ modifiers: ['Control'] })

    // Focus first item and grab both
    await firstItem.focus()
    await page.keyboard.press('Enter')

    // Should announce plural
    await expect(announcer).toHaveText(/Grabbed 2 items/)

    // Drop items
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(announcer).toHaveText(/Dropped 2 items/)
  })

  test('clears announcements after delay to allow re-announcement', async ({
    page,
  }) => {
    const announcer = page.locator('[role="status"][aria-live="assertive"]')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')

    // Make an announcement
    await firstItem.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')
    await expect(announcer).toHaveText(/Grabbed/)

    // Wait for clear delay
    await page.waitForTimeout(200)

    // Announcer should be cleared
    await expect(announcer).toHaveText('')
  })

  test('maintains focus management for screen reader users', async ({
    page,
  }) => {
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')

    // Tab should go to first item
    await page.keyboard.press('Tab')
    await expect(firstItem).toBeFocused()

    // Arrow navigation should update tabindex
    await page.keyboard.press('ArrowDown')
    await expect(secondItem).toBeFocused()
    await expect(secondItem).toHaveAttribute('tabindex', '0')
    await expect(firstItem).toHaveAttribute('tabindex', '-1')

    // Tab out and back should return to last focused item
    await page.keyboard.press('Tab') // Tab out
    await page.keyboard.press('Shift+Tab') // Tab back
    await expect(secondItem).toBeFocused()
  })
})
