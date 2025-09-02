import { expect, test } from '@playwright/test'

test.describe('Library Initialization and Error Handling', () => {
  test('loads the development environment correctly', async ({ page }) => {
    await page.goto('/')

    // Check page title
    await expect(page).toHaveTitle('Resortable - Development')

    // Check main heading
    await expect(page.locator('h1')).toHaveText(
      'Resortable Development Environment'
    )

    // Verify all demo sections are present
    await expect(page.locator('h2')).toHaveCount(5) // 5 main sections
  })

  test('initializes Resortable library successfully', async ({ page }) => {
    await page.goto('/')

    // Wait for library to load and initialize
    await expect(page.locator('#library-status')).toHaveText(
      'Resortable Library Loaded'
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

    // Check that error fallback message is displayed
    await expect(page.locator('#library-status')).toHaveText(
      'Library Not Yet Implemented (Placeholder Mode)'
    )
  })

  test('verifies all sortable containers are initialized', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#library-status')).toHaveText(
      'Resortable Library Loaded'
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

    // Check development status section
    await expect(page.locator('.info h3')).toHaveText('Development Status')
    await expect(page.locator('.info p')).toHaveText(
      'This is a development environment for testing Resortable functionality.'
    )
  })

  test('applies correct CSS classes to sortable elements', async ({ page }) => {
    await page.goto('/')

    // Check that sortable items have the correct base class
    const items = page.locator('.sortable-item')
    await expect(items.first()).toHaveClass(/sortable-item/)

    // Check that containers have correct styling
    const containers = page.locator('.sortable-list')
    await expect(containers.first()).toHaveClass(/sortable-list/)
  })

  test('handles page refresh and reinitialization', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#library-status')).toHaveText(
      'Resortable Library Loaded'
    )

    // Perform a drag operation to ensure functionality works
    await page.dragAndDrop(
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-2"]'
    )

    // Refresh the page
    await page.reload()

    // Verify library reinitializes correctly
    await expect(page.locator('#library-status')).toHaveText(
      'Resortable Library Loaded'
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
    await page.waitForTimeout(1000)

    // Check that no errors were logged during normal initialization
    expect(consoleErrors).toHaveLength(0)

    // Verify initialization completed successfully
    await expect(page.locator('#library-status')).toHaveText(
      'Resortable Library Loaded'
    )
  })
})
