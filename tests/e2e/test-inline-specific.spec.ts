import { test } from '@playwright/test'

test.describe('Test Inline-block Specific', () => {
  test('test Section 3 inline-block drag', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Monitor all events
    await page.evaluate(() => {
      const inlineList = document.querySelector('#inline-list')
      if (!inlineList) {
        console.log('ERROR: No inline-list found!')
        return
      }

      // Add event listeners to the container
      const events = [
        'dragstart',
        'dragover',
        'dragend',
        'drop',
        'dragleave',
        'dragenter',
      ]
      events.forEach((eventName) => {
        inlineList.addEventListener(
          eventName,
          (e) => {
            const target = e.target as HTMLElement
            if (target.classList.contains('inline-item')) {
              console.log(`[Container] ${eventName} on ${target.textContent}`)
              if (eventName === 'dragstart') {
                console.log(
                  `  - Inline-block check in DragManager should skip DOM changes`
                )
                console.log(
                  `  - Display: ${window.getComputedStyle(target).display}`
                )
              }
            }
          },
          true
        ) // Use capture phase
      })

      // Check initial state
      const items = inlineList.querySelectorAll('.inline-item')
      console.log(`Found ${items.length} inline items`)
      items.forEach((item, i) => {
        const el = item as HTMLElement
        console.log(
          `Item ${i}: draggable=${el.draggable}, display=${window.getComputedStyle(el).display}`
        )
      })
    })

    // Capture console logs
    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      console.log(text)
    })

    // Wait for initialization
    await page.waitForTimeout(500)

    // Try to drag the first item
    const firstItem = page.locator('#inline-list .inline-item').first()
    const thirdItem = page.locator('#inline-list .inline-item').nth(2)

    console.log('\n=== Attempting drag from first to third ===')

    // Method 1: Using Playwright's dragTo
    console.log('Method 1: Playwright dragTo...')
    try {
      await firstItem.dragTo(thirdItem, {
        targetPosition: { x: 10, y: 10 },
      })
      await page.waitForTimeout(500)
    } catch (e) {
      console.log(`dragTo failed: ${e}`)
    }

    let status = await page.locator('#status').textContent()
    console.log(`Status after dragTo: ${status}`)

    // Method 2: Manual mouse events
    console.log('\nMethod 2: Manual mouse events...')
    const firstBox = await firstItem.boundingBox()
    const thirdBox = await thirdItem.boundingBox()

    if (firstBox && thirdBox) {
      await page.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2
      )
      await page.mouse.down()
      await page.waitForTimeout(200)

      // Move slowly
      for (let i = 1; i <= 5; i++) {
        const x =
          firstBox.x + (thirdBox.x - firstBox.x) * (i / 5) + firstBox.width / 2
        const y = firstBox.y + firstBox.height / 2
        await page.mouse.move(x, y)
        await page.waitForTimeout(100)
      }

      await page.mouse.up()
      await page.waitForTimeout(500)
    }

    status = await page.locator('#status').textContent()
    console.log(`Status after manual drag: ${status}`)

    // Check if any DOM modifications happened
    const finalState = await page.evaluate(() => {
      const firstItem = document.querySelector(
        '#inline-list .inline-item'
      ) as HTMLElement
      return {
        classes: firstItem?.className,
        opacity: firstItem?.style.opacity,
        display: firstItem ? window.getComputedStyle(firstItem).display : null,
      }
    })

    console.log('\nFinal item state:', finalState)

    // Get the order of items
    const finalOrder = await page
      .locator('#inline-list .inline-item')
      .allTextContents()
    console.log('Final order:', finalOrder)
  })

  test('compare with working test-inline-block-bug.html', async ({ page }) => {
    // Test the working version
    await page.goto(
      'http://localhost:5173/html-tests/test-inline-block-bug.html'
    )
    await page.waitForLoadState('networkidle')

    const logs: string[] = []
    page.on('console', (msg) => logs.push(msg.text()))

    const firstItem = page.locator('#inline-container .inline-item').first()
    const thirdItem = page.locator('#inline-container .inline-item').nth(2)

    await firstItem.dragTo(thirdItem)
    await page.waitForTimeout(500)

    const workingOrder = await page
      .locator('#inline-container .inline-item')
      .allTextContents()
    console.log('WORKING version order after drag:', workingOrder)

    const workingLogs = logs.filter((log) => log.includes('INLINE'))
    console.log('WORKING version logs:', workingLogs)
  })
})
