import { test } from '@playwright/test'

test.describe('Inline-block Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')
  })

  test('should detect draggable items in inline-block list', async ({
    page,
  }) => {
    // Check if inline items are draggable
    const inlineItems = await page.locator('#inline-list .inline-item').all()
    console.log(`Found ${inlineItems.length} inline items`)

    for (let i = 0; i < inlineItems.length; i++) {
      const item = inlineItems[i]
      const text = await item.textContent()
      const draggable = await item.evaluate(
        (el) => (el as HTMLElement).draggable
      )
      const display = await item.evaluate(
        (el) => window.getComputedStyle(el).display
      )
      console.log(
        `Item ${i} (${text}): draggable=${draggable}, display=${display}`
      )
    }
  })

  test('should drag inline-block items with native drag', async ({ page }) => {
    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (
        text.includes('Inline') ||
        text.includes('drag') ||
        text.includes('Drag')
      ) {
        logs.push(text)
      }
    })

    // Get initial order
    const initialOrder = await page
      .locator('#inline-list .inline-item')
      .allTextContents()
    console.log('Initial order:', initialOrder)

    // Try to drag first item to third position
    const firstItem = page.locator('#inline-list .inline-item').first()
    const thirdItem = page.locator('#inline-list .inline-item').nth(2)

    // Check if items are draggable
    const firstDraggable = await firstItem.evaluate(
      (el) => (el as HTMLElement).draggable
    )
    const firstDisplay = await firstItem.evaluate(
      (el) => window.getComputedStyle(el).display
    )
    console.log(
      `First item: draggable=${firstDraggable}, display=${firstDisplay}`
    )

    // Get bounding boxes
    const firstBox = await firstItem.boundingBox()
    const thirdBox = await thirdItem.boundingBox()

    if (firstBox && thirdBox) {
      console.log('Attempting drag...')

      // Move to first item
      await page.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2
      )

      // Mouse down to start drag
      await page.mouse.down()

      // Small delay to let drag start
      await page.waitForTimeout(100)

      // Move to third item position (slowly)
      await page.mouse.move(
        thirdBox.x + thirdBox.width / 2,
        thirdBox.y + thirdBox.height / 2,
        { steps: 10 }
      )

      // Wait a bit before releasing
      await page.waitForTimeout(100)

      // Release
      await page.mouse.up()

      // Wait for any animations
      await page.waitForTimeout(500)
    }

    // Check final order
    const finalOrder = await page
      .locator('#inline-list .inline-item')
      .allTextContents()
    console.log('Final order:', finalOrder)

    // Check status message
    const status = await page.locator('#status').textContent()
    console.log('Status:', status)

    // Log all console messages
    console.log('Console logs during drag:')
    logs.forEach((log) => console.log('  -', log))

    // Check if order changed
    const orderChanged =
      JSON.stringify(initialOrder) !== JSON.stringify(finalOrder)
    console.log('Order changed:', orderChanged)

    // The test should show if drag worked
    if (!orderChanged && status?.includes('Moved from position')) {
      const match = status.match(/Moved from position (\d+) to (\d+)/)
      if (match && match[1] === match[2]) {
        console.log('ISSUE: Drag ended immediately (same position)')
      }
    }
  })

  test('compare working vs non-working inline-block', async ({ page }) => {
    // First test the working one
    await page.goto(
      'http://localhost:5173/html-tests/test-inline-block-bug.html'
    )
    await page.waitForLoadState('networkidle')

    console.log('=== Testing WORKING inline-block (Test 1) ===')
    const workingItems = await page
      .locator('#inline-container .inline-item')
      .all()
    for (let i = 0; i < Math.min(2, workingItems.length); i++) {
      const item = workingItems[i]
      const draggable = await item.evaluate(
        (el) => (el as HTMLElement).draggable
      )
      const styles = await item.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          display: computed.display,
          background: computed.background,
          transition: computed.transition,
          transform: computed.transform,
        }
      })
      console.log(`Working item ${i}: draggable=${draggable}`)
      console.log('  Styles:', JSON.stringify(styles, null, 2))
    }

    // Now test the non-working one
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    console.log('\n=== Testing NON-WORKING inline-block (Test 3) ===')
    const nonWorkingItems = await page
      .locator('#inline-list .inline-item')
      .all()
    for (let i = 0; i < Math.min(2, nonWorkingItems.length); i++) {
      const item = nonWorkingItems[i]
      const draggable = await item.evaluate(
        (el) => (el as HTMLElement).draggable
      )
      const styles = await item.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          display: computed.display,
          background: computed.background,
          transition: computed.transition,
          transform: computed.transform,
        }
      })
      console.log(`Non-working item ${i}: draggable=${draggable}`)
      console.log('  Styles:', JSON.stringify(styles, null, 2))
    }

    // Check parent container differences
    console.log('\n=== Container differences ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-inline-block-bug.html'
    )
    const workingContainer = await page
      .locator('#inline-container')
      .evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          display: computed.display,
          overflow: computed.overflow,
          whiteSpace: computed.whiteSpace,
        }
      })
    console.log(
      'Working container styles:',
      JSON.stringify(workingContainer, null, 2)
    )

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    const nonWorkingContainer = await page
      .locator('#inline-list')
      .evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          display: computed.display,
          overflow: computed.overflow,
          whiteSpace: computed.whiteSpace,
        }
      })
    console.log(
      'Non-working container styles:',
      JSON.stringify(nonWorkingContainer, null, 2)
    )
  })
})
