import { test } from '@playwright/test'
import {
  injectEventLogger,
  getItemOrder,
  getDraggableState,
} from '../helpers/drag-helpers'

test.describe('Cross-container Drag Test', () => {
  test('test multiple horizontal lists drag', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Inject event loggers for both containers
    await injectEventLogger(page, '#multi-1')
    await injectEventLogger(page, '#multi-2')

    // Capture console logs
    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      console.log(text)
    })

    // Get initial state
    const list1Initial = await getItemOrder(
      page,
      '#multi-1',
      '.horizontal-item'
    )
    const list2Initial = await getItemOrder(
      page,
      '#multi-2',
      '.horizontal-item'
    )

    console.log('\n=== Initial State ===')
    console.log('List 1:', list1Initial)
    console.log('List 2:', list2Initial)

    // Check draggable state of items
    const firstItemState = await getDraggableState(
      page,
      '#multi-1 .horizontal-item:first-child'
    )
    console.log('\nFirst item draggable state:', firstItemState)

    // Test 1: Try Playwright's dragTo
    console.log('\n=== Test 1: Playwright dragTo ===')
    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    try {
      await sourceItem.dragTo(targetContainer)
      await page.waitForTimeout(500)
    } catch (e) {
      console.log('dragTo error:', e)
    }

    let list1After = await getItemOrder(page, '#multi-1', '.horizontal-item')
    let list2After = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('After dragTo:')
    console.log('  List 1:', list1After)
    console.log('  List 2:', list2After)

    const status1 = await page.locator('#status').textContent()
    console.log('  Status:', status1)

    // Test 2: Manual mouse drag to specific item
    console.log('\n=== Test 2: Manual drag to specific item ===')
    const sourceItem2 = page.locator('#multi-1 .horizontal-item').first()
    const targetItem = page.locator('#multi-2 .horizontal-item').last()

    const sourceBox = await sourceItem2.boundingBox()
    const targetBox = await targetItem.boundingBox()

    if (sourceBox && targetBox) {
      // Start drag
      await page.mouse.move(
        sourceBox.x + sourceBox.width / 2,
        sourceBox.y + sourceBox.height / 2
      )
      await page.mouse.down()
      await page.waitForTimeout(100)

      // Move to target
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 5 }
      )
      await page.waitForTimeout(100)

      // Release
      await page.mouse.up()
      await page.waitForTimeout(500)
    }

    list1After = await getItemOrder(page, '#multi-1', '.horizontal-item')
    list2After = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('After manual drag:')
    console.log('  List 1:', list1After)
    console.log('  List 2:', list2After)

    const status2 = await page.locator('#status').textContent()
    console.log('  Status:', status2)

    // Check if items actually moved between containers
    const itemsMoved =
      list1After.length !== list1Initial.length ||
      list2After.length !== list2Initial.length
    console.log('\n=== Result ===')
    console.log('Items moved between containers:', itemsMoved)

    // Check event logs
    console.log('\n=== Event Logs ===')
    const relevantLogs = logs.filter(
      (log) =>
        log.includes('dragstart') ||
        log.includes('drop') ||
        log.includes('dragend') ||
        log.includes('Moved from List')
    )
    relevantLogs.slice(-10).forEach((log) => console.log('  ', log))
  })

  test('check group configuration', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Check if the containers have the same group
    const groupInfo = await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      // Check data attributes
      const info = {
        multi1: {
          id: multi1?.id,
          dropZone: multi1?.dataset.dropZone,
          sortableGroup: multi1?.dataset.sortableGroup,
          classList: multi1?.className,
        },
        multi2: {
          id: multi2?.id,
          dropZone: multi2?.dataset.dropZone,
          sortableGroup: multi2?.dataset.sortableGroup,
          classList: multi2?.className,
        },
      }

      // Try to access Sortable instances if available
      try {
        const sortableInstances = (window as any).sortableInstances || []
        info['instanceCount'] = sortableInstances.length
      } catch (e) {
        info['instanceCount'] = 'unknown'
      }

      return info
    })

    console.log('Group configuration:', JSON.stringify(groupInfo, null, 2))
  })
})
