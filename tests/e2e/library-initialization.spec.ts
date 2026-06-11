import { expect, test } from '@playwright/test'

test.describe('Library Initialization and Error Handling', () => {
  test('loads the development environment correctly', async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)

    // Playground title (separate from the polished showcase at `/`)
    await expect(page).toHaveTitle('Resortable — Dev Playground')

    // Check main heading
    await expect(page.locator('.page-header h1')).toContainText('Resortable')

    // Verify test sections are present
    await expect(page.locator('h2').first()).toBeVisible()
  })

  test('initializes Resortable library successfully', async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)

    // Wait for library to load and initialize
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )

    // The library sets draggable=false when navigator.maxTouchPoints > 0
    // (touch devices use the pointer pipeline, not HTML5 DnD). Asserting the
    // device-correct setup. Note Playwright's "Mobile Safari" project is
    // Desktop WebKit + mobile viewport — NOT touch emulation; only "Mobile
    // Chrome" reports touchpoints > 0.
    const isTouchDevice = await page.evaluate(
      () => navigator.maxTouchPoints > 0
    )
    const sortableItems = page.locator('.sortable-item')
    await expect(sortableItems.first()).toHaveAttribute(
      'draggable',
      isTouchDevice ? 'false' : 'true'
    )
  })

  test('handles library loading errors gracefully', async ({ page }) => {
    // Intercept the module import to simulate an error
    await page.route('**/src/index.ts', (route) => {
      void route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'Module not found',
      })
    })

    await page.goto('/playground.html')

    // Wait for the error status to appear (don't wait for resortableLoaded since it won't be set)
    await expect(page.locator('#library-status')).toContainText(
      'Error loading library',
      { timeout: 10000 }
    )
  })

  test('verifies all sortable containers are initialized', async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )

    // The library sets draggable=false when navigator.maxTouchPoints > 0
    // (touch devices use the pointer pipeline, not HTML5 DnD). Asserting the
    // device-correct setup. Note Playwright's "Mobile Safari" project is
    // Desktop WebKit + mobile viewport — NOT touch emulation; only "Mobile
    // Chrome" reports touchpoints > 0.
    const isTouchDevice = await page.evaluate(
      () => navigator.maxTouchPoints > 0
    )
    const expectedDraggable = isTouchDevice ? 'false' : 'true'

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
      await expect(items.first()).toHaveAttribute(
        'draggable',
        expectedDraggable
      )
    }
  })

  test('displays proper development status information', async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)

    // Playground header identifies it as the dev surface
    await expect(page.locator('.page-header h1')).toContainText(
      'Dev Playground'
    )
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )
  })

  test('applies correct CSS classes to sortable elements', async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)

    // Check that sortable items have the correct base class
    const items = page.locator('.sortable-item')
    await expect(items.first()).toHaveClass(/sortable-item/)

    // Check that containers have correct styling
    const containers = page.locator('.sortable-list')
    await expect(containers.first()).toHaveClass(/sortable-list/)
  })

  test('handles page refresh and reinitialization', async ({ page }) => {
    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
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
    await page.waitForFunction(() => window.resortableLoaded === true)

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

    await page.goto('/playground.html')
    // Wait for the library to fully load
    await page.waitForFunction(() => window.resortableLoaded === true)
    await page.waitForTimeout(1000)

    // Check that no errors were logged during normal initialization
    expect(consoleErrors).toHaveLength(0)

    // Verify initialization completed successfully
    await expect(page.locator('#library-status')).toContainText(
      'Resortable loaded'
    )
  })
})
