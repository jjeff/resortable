import { test, expect } from '@playwright/test'

test('multi-drag functionality test', async ({ page }) => {
  // Navigate to the test page (using port 5174 since our dev server is running there)
  await page.goto('http://localhost:5174/html-tests/test-multi-drag.html')

  // Wait for page to load
  await page.waitForLoadState('networkidle')

  // Take initial screenshot
  await page.screenshot({ path: '/tmp/initial.png' })
  console.log('Initial page loaded')

  // Click the first "Select All" button (the one for single list)
  const selectAllButton = page
    .locator('button')
    .filter({ hasText: 'Select All' })
    .first()
  await selectAllButton.click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: '/tmp/after_select_all.png' })
  console.log('Clicked Select All button')

  // Check for selected items (look for various selection indicators)
  const selectedItems = await page
    .locator(
      '.selected, [aria-selected="true"], .multi-drag-selected, .sortable-chosen'
    )
    .count()
  console.log(`Found ${selectedItems} selected items`)

  // Find all draggable items
  const draggableItems = await page
    .locator('[draggable="true"], .sortable-item, li')
    .count()
  console.log(`Found ${draggableItems} draggable items`)

  // Get all list items for inspection
  const listItems = await page.locator('li').all()
  console.log(`Found ${listItems.length} list items`)

  if (listItems.length > 0) {
    // Try to drag the first item
    const firstItem = listItems[0]

    // Get the bounding box of the first item
    const box = await firstItem.boundingBox()
    if (box) {
      const startX = box.x + box.width / 2
      const startY = box.y + box.height / 2

      // Calculate target position (move down by 100px)
      const targetX = startX
      const targetY = startY + 100

      console.log(
        `Starting drag from (${startX}, ${startY}) to (${targetX}, ${targetY})`
      )

      // Perform drag operation
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.waitForTimeout(500)
      await page.screenshot({ path: '/tmp/during_drag.png' })

      await page.mouse.move(targetX, targetY, { steps: 10 })
      await page.waitForTimeout(500)
      await page.screenshot({ path: '/tmp/drag_end.png' })

      await page.mouse.up()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: '/tmp/after_drop.png' })

      console.log('Drag operation completed')
    }
  }

  // Keep page open for a bit to observe
  await page.waitForTimeout(2000)
})
