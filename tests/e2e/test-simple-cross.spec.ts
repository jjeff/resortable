import { test, expect } from '@playwright/test'

test('simple cross-container test', async ({ page }) => {
  await page.goto('http://localhost:5173/html-tests/test-horizontal-list.html')
  await page.waitForLoadState('networkidle')

  // Log all console messages
  page.on('console', msg => console.log(msg.text()))

  // Get initial counts
  const initialList1 = await page.locator('#multi-1 .horizontal-item').count()
  const initialList2 = await page.locator('#multi-2 .horizontal-item').count()

  console.log('Initial state:')
  console.log('  List 1:', initialList1, 'items')
  console.log('  List 2:', initialList2, 'items')

  // Try to drag first item from list 1 to list 2
  const source = page.locator('#multi-1 .horizontal-item').first()
  const target = page.locator('#multi-2')

  // Check if item is draggable
  const isDraggable = await source.evaluate(el => (el as HTMLElement).draggable)
  console.log('Item is draggable:', isDraggable)

  // Try drag using Playwright's dragTo
  console.log('\nAttempting drag from List 1 to List 2...')
  await source.dragTo(target, { timeout: 5000 })

  // Wait for any animations
  await page.waitForTimeout(500)

  // Check final counts
  const finalList1 = await page.locator('#multi-1 .horizontal-item').count()
  const finalList2 = await page.locator('#multi-2 .horizontal-item').count()

  console.log('\nFinal state:')
  console.log('  List 1:', finalList1, 'items')
  console.log('  List 2:', finalList2, 'items')

  // Check status message
  const status = await page.locator('#status').textContent()
  console.log('  Status:', status)

  // Verify the drag worked
  if (finalList1 === initialList1 - 1 && finalList2 === initialList2 + 1) {
    console.log('\n✅ Cross-container drag SUCCESSFUL!')
  } else {
    console.log('\n❌ Cross-container drag FAILED - items did not move between containers')
  }
})