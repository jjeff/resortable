import { test } from '@playwright/test'

test.describe('Debug Inline-block Events', () => {
  test('check event listeners on inline-block items', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Inject event monitoring
    await page.evaluate(() => {
      const container = document.querySelector('#inline-list')
      const items = container?.querySelectorAll('.inline-item')

      if (items) {
        items.forEach((item, index) => {
          const el = item as HTMLElement

          // Track all drag events
          el.addEventListener('dragstart', (e) => {
            console.log(`[Item ${index}] dragstart triggered`)
            console.log(`  - draggable: ${el.draggable}`)
            console.log(`  - dataTransfer: ${e.dataTransfer}`)
          })

          el.addEventListener('dragend', (_e) => {
            console.log(`[Item ${index}] dragend triggered`)
          })

          el.addEventListener('mousedown', (e) => {
            console.log(
              `[Item ${index}] mousedown at (${e.clientX}, ${e.clientY})`
            )
          })

          el.addEventListener('mouseup', (e) => {
            console.log(
              `[Item ${index}] mouseup at (${e.clientX}, ${e.clientY})`
            )
          })
        })
      }

      // Also monitor container events
      if (container) {
        container.addEventListener('dragover', (_e) => {
          console.log('[Container] dragover')
        })

        container.addEventListener('drop', (_e) => {
          console.log('[Container] drop')
        })
      }
    })

    // Capture console logs
    const logs: string[] = []
    page.on('console', (msg) => {
      logs.push(msg.text())
    })

    // Try to drag the first item
    const firstItem = page.locator('#inline-list .inline-item').first()
    const thirdItem = page.locator('#inline-list .inline-item').nth(2)

    console.log('Attempting drag with mouse events...')

    // Get positions
    const firstBox = await firstItem.boundingBox()
    const thirdBox = await thirdItem.boundingBox()

    if (firstBox && thirdBox) {
      // Mouse down on first item
      await page.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2
      )
      await page.mouse.down()

      // Wait to see if dragstart fires
      await page.waitForTimeout(200)

      // Move to third item
      await page.mouse.move(
        thirdBox.x + thirdBox.width / 2,
        thirdBox.y + thirdBox.height / 2,
        { steps: 5 }
      )

      // Wait
      await page.waitForTimeout(200)

      // Release
      await page.mouse.up()

      // Wait for events to fire
      await page.waitForTimeout(500)
    }

    // Print all logs
    console.log('\n=== Event Logs ===')
    logs.forEach((log) => console.log(log))

    // Check if dragstart was triggered
    const dragstartFired = logs.some((log) => log.includes('dragstart'))
    const dragendFired = logs.some((log) => log.includes('dragend'))
    const mousedownFired = logs.some((log) => log.includes('mousedown'))

    console.log('\n=== Event Summary ===')
    console.log(`mousedown fired: ${mousedownFired}`)
    console.log(`dragstart fired: ${dragstartFired}`)
    console.log(`dragend fired: ${dragendFired}`)

    // If dragstart didn't fire, try with Playwright's dragTo
    if (!dragstartFired) {
      console.log('\n=== Trying Playwright dragTo ===')
      logs.length = 0 // Clear logs

      await firstItem.dragTo(thirdItem)
      await page.waitForTimeout(500)

      console.log('Logs after dragTo:')
      logs.forEach((log) => console.log(log))
    }
  })

  test('compare event firing between working and non-working', async ({
    page,
  }) => {
    // Test working version
    console.log('=== WORKING version (test-inline-block-bug.html) ===')
    await page.goto(
      'http://localhost:5173/html-tests/test-inline-block-bug.html'
    )
    await page.waitForLoadState('networkidle')

    let logs: string[] = []
    page.on('console', (msg) => logs.push(msg.text()))

    // Try drag on working version
    const workingFirst = page.locator('#inline-container .inline-item').first()
    const workingThird = page.locator('#inline-container .inline-item').nth(2)

    await workingFirst.hover()
    await page.mouse.down()
    await page.waitForTimeout(100)
    await workingThird.hover()
    await page.waitForTimeout(100)
    await page.mouse.up()
    await page.waitForTimeout(500)

    const workingLogs = [...logs]
    console.log('Working version logs:')
    workingLogs.forEach((log) => console.log('  ', log))

    // Test non-working version
    console.log('\n=== NON-WORKING version (test-horizontal-list.html) ===')
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    logs = []

    const nonWorkingFirst = page.locator('#inline-list .inline-item').first()
    const nonWorkingThird = page.locator('#inline-list .inline-item').nth(2)

    await nonWorkingFirst.hover()
    await page.mouse.down()
    await page.waitForTimeout(100)
    await nonWorkingThird.hover()
    await page.waitForTimeout(100)
    await page.mouse.up()
    await page.waitForTimeout(500)

    console.log('Non-working version logs:')
    logs.forEach((log) => console.log('  ', log))
  })
})
