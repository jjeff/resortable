import { expect, test } from '@playwright/test'

test.describe('Library Initialization and Error Handling', () => {
  test('loads the development environment correctly', async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)

    // Check page title
    await expect(page).toHaveTitle('Resortable - Modern Drag & Drop Library')

    // Check main heading
    await expect(page.locator('.hero h1')).toHaveText('Resortable')

    // Verify demo sections are present
    await expect(page.locator('h2').first()).toBeVisible()
  })

  test('initializes Resortable library successfully', async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)

    // Wait for library to load and initialize
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )

    // Verify sortable items are properly configured
    const sortableItems = page.locator('.sortable-item')
    await expect(sortableItems.first()).toHaveAttribute('draggable', 'true')
  })

  test.skip('handles library loading errors gracefully', async ({ page }) => {
    // Intercept the module import to simulate an error
    await page.route('**/src/index.ts', (route) => {
      void route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'Module not found',
      })
    })

    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)

    // Check that error fallback message is displayed
    await expect(page.locator('#library-status')).toContainText(
      'Error loading library'
    )
  })

  test('verifies all sortable containers are initialized', async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )

    // Check that all containers have draggable items
    const containers = [
      '#basic-list',
      '#shared-a-1',
      '#shared-a-2',
      '#group-a-1',
      '#group-b-1',
      '#grid-1',
      '#grid-2',
      '#list1',
      '#list2',
    ]

    for (const container of containers) {
      const items = page.locator(`${container} .sortable-item`)
      await expect(items.first()).toHaveAttribute('draggable', 'true')
    }
  })

  test('displays proper development status information', async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)

    // Check that developer section exists
    await expect(page.locator('.developer-section h2')).toContainText(
      'Developer Testing Area'
    )
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )
  })

  test('applies correct CSS classes to sortable elements', async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)

    // Check that sortable items have the correct base class
    const items = page.locator('.sortable-item')
    await expect(items.first()).toHaveClass(/sortable-item/)

    // Check that containers have correct styling
    const containers = page.locator('.sortable-list')
    await expect(containers.first()).toHaveClass(/sortable-list/)
  })

  test('handles page refresh and reinitialization', async ({ page }) => {
    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )

    // Perform a drag operation to ensure functionality works
    await page.dragAndDrop(
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-2"]'
    )

    // Refresh the page
    await page.reload()
    // Wait for the library to fully load after refresh
    await page.waitForFunction(() => (window as any).resortableLoaded === true)

    // Verify library reinitializes correctly
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )

    // Verify items are back to original order
    const items = page.locator('#basic-list .sortable-item')
    await expect(items.nth(0)).toHaveAttribute('data-id', 'basic-1')
    await expect(items.nth(1)).toHaveAttribute('data-id', 'basic-2')
  })

  test('captures and logs console errors during initialization', async ({
    page,
  }) => {
    const consoleMessages: string[] = []
    const consoleErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'log') {
        consoleMessages.push(msg.text())
      } else if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    // Wait for the library to fully load
    await page.waitForFunction(() => (window as any).resortableLoaded === true)
    await page.waitForTimeout(1000)

    // Check that no errors were logged during normal initialization
    expect(consoleErrors).toHaveLength(0)

    // Verify initialization completed successfully
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )
  })
})
