import { test, expect } from '@playwright/test'

test.describe('Debug with Logging', () => {
  test('trace dragstart and dragover with debug logging', async ({ page }) => {
    console.log('\n=== Debug with Logging ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      if (text.includes('[DEBUG_')) {
        console.log(`[CONSOLE] ${text}`)
      }
    })

    // Test 1: Manual event to see debug output
    console.log('\n=== Manual Event Test ===')

    const manualResult = await page.evaluate(() => {
      const sourceItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      const targetContainer = document.querySelector('#multi-2') as HTMLElement

      if (!sourceItem || !targetContainer) {
        return { error: 'Elements not found' }
      }

      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', 'sortable-item')
      dataTransfer.effectAllowed = 'move'

      // Dispatch dragstart
      console.log('[MANUAL] Dispatching dragstart...')
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: 100,
        clientY: 100,
      })

      sourceItem.dispatchEvent(dragStartEvent)

      // Wait a bit, then dispatch dragover
      setTimeout(() => {
        console.log('[MANUAL] Dispatching dragover...')
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        targetContainer.dispatchEvent(dragOverEvent)
      }, 10)

      return { error: null }
    })

    await page.waitForTimeout(500)

    console.log('Manual test result:', manualResult)

    // Test 2: Playwright dragTo
    console.log('\n=== Playwright dragTo Test ===')

    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    try {
      await sourceItem.dragTo(targetContainer)
      await page.waitForTimeout(200)
    } catch (e) {
      console.log('dragTo failed:', e)
    }

    // Show all debug logs
    console.log('\n=== Debug Logs ===')
    const debugLogs = logs.filter(
      (log) => log.includes('[DEBUG_') || log.includes('[MANUAL]')
    )
    debugLogs.forEach((log) => console.log(`  ${log}`))

    // Check final state
    const finalState = await page.evaluate(() => {
      return {
        list1: Array.from(
          document.querySelectorAll('#multi-1 .horizontal-item')
        ).map((el) => el.textContent?.trim()),
        list2: Array.from(
          document.querySelectorAll('#multi-2 .horizontal-item')
        ).map((el) => el.textContent?.trim()),
      }
    })

    console.log('\n=== Final State ===')
    console.log('List 1:', finalState.list1)
    console.log('List 2:', finalState.list2)

    const worked =
      finalState.list1.length !== 3 || finalState.list2.length !== 3
    console.log('Cross-container drag worked:', worked)

    // The test should not fail, we just want to see the debug output
    expect(manualResult.error).toBeNull()
  })
})
