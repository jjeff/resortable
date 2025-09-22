import { test } from '@playwright/test'

test.describe('Manual Inline Test', () => {
  test('manually trigger drag events', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Check what happens when we manually dispatch drag events
    const result = await page.evaluate(() => {
      const container = document.querySelector('#inline-list')
      const firstItem = container?.querySelector('.inline-item') as HTMLElement

      if (!firstItem) return { error: 'No items found' }

      const logs: string[] = []

      // Check initial state
      logs.push(`Initial draggable: ${firstItem.draggable}`)
      logs.push(`Display: ${window.getComputedStyle(firstItem).display}`)

      // Create a proper DataTransfer object
      const dt = new DataTransfer()
      dt.effectAllowed = 'move'
      dt.setData('text/plain', 'test')

      // Try to dispatch dragstart
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })

      logs.push('Dispatching dragstart...')
      const dragStartResult = firstItem.dispatchEvent(dragStartEvent)
      logs.push(`dragstart dispatched, result: ${dragStartResult}`)

      // Check if any classes were added
      logs.push(`Classes after dragstart: ${firstItem.className}`)

      // Dispatch dragend
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })

      logs.push('Dispatching dragend...')
      const dragEndResult = firstItem.dispatchEvent(dragEndEvent)
      logs.push(`dragend dispatched, result: ${dragEndResult}`)

      return { logs, className: firstItem.className }
    })

    console.log('Manual dispatch results:')
    if (result.logs) {
      result.logs.forEach((log) => console.log('  ', log))
    }

    // Now check the console output from the page
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      if (msg.text().includes('Inline') || msg.text().includes('drag')) {
        consoleLogs.push(msg.text())
      }
    })

    // Wait a bit and check status
    await page.waitForTimeout(1000)
    const status = await page.locator('#status').textContent()
    console.log('\nStatus after manual dispatch:', status)

    if (consoleLogs.length > 0) {
      console.log('\nConsole logs:')
      consoleLogs.forEach((log) => console.log('  ', log))
    }

    // Try real mouse drag one more time with detailed logging
    console.log('\n=== Attempting real drag ===')

    // Inject detailed logging
    await page.evaluate(() => {
      const firstItem = document.querySelector(
        '#inline-list .inline-item'
      ) as HTMLElement
      if (firstItem) {
        // Override dragstart handler temporarily
        const originalHandler = (firstItem as any).ondragstart
        firstItem.ondragstart = (e) => {
          console.log('ondragstart fired!')
          console.log('  DataTransfer:', e.dataTransfer)
          console.log('  Target:', e.target)
          if (originalHandler) originalHandler(e)
        }
      }
    })

    const firstItem = page.locator('#inline-list .inline-item').first()
    const secondItem = page.locator('#inline-list .inline-item').nth(1)

    // Use slower, more deliberate drag
    const firstBox = await firstItem.boundingBox()
    const secondBox = await secondItem.boundingBox()

    if (firstBox && secondBox) {
      // Click and hold
      await page.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2
      )
      await page.mouse.down()

      // Wait longer
      await page.waitForTimeout(500)

      // Move very slowly
      for (let i = 0; i <= 10; i++) {
        const x =
          firstBox.x +
          (secondBox.x - firstBox.x) * (i / 10) +
          firstBox.width / 2
        const y = firstBox.y + firstBox.height / 2
        await page.mouse.move(x, y)
        await page.waitForTimeout(50)
      }

      // Release
      await page.mouse.up()
      await page.waitForTimeout(500)
    }

    const finalStatus = await page.locator('#status').textContent()
    console.log('Final status:', finalStatus)
  })
})
