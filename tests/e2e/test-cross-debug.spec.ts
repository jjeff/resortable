import { test } from '@playwright/test'

test.describe('Debug Cross-Container', () => {
  test('debug why drag ends immediately', async ({ page }) => {
    await page.goto('http://localhost:5173/html-tests/test-horizontal-list.html')
    await page.waitForLoadState('networkidle')

    // Monitor console FIRST
    const logs: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      logs.push(text)
      console.log(text)
    })

    // Add comprehensive event monitoring
    await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      // Track ALL events
      const events = ['dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']

      events.forEach(eventName => {
        // Monitor on containers
        multi1?.addEventListener(eventName, (e) => {
          console.log(`[Container1] ${eventName}`)
          if (eventName === 'dragstart' || eventName === 'dragend') {
            const target = e.target as HTMLElement
            console.log(`  Target: ${target.textContent}`)
            console.log(`  Display: ${window.getComputedStyle(target).display}`)
          }
        }, true)

        multi2?.addEventListener(eventName, (e) => {
          console.log(`[Container2] ${eventName}`)
        }, true)

        // Monitor on document
        document.addEventListener(eventName, (e) => {
          const target = e.target as HTMLElement
          if (target.classList?.contains('horizontal-item')) {
            console.log(`[Document] ${eventName} on ${target.textContent}`)
          }
        }, true)
      })

      // Check if global handler was added
      console.log('Global handler check: Will be monitored via events...')
    })


    // Try manual drag with precise control
    console.log('\n=== Starting manual drag test ===')

    const firstItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    const sourceBox = await firstItem.boundingBox()
    const targetBox = await targetContainer.boundingBox()

    if (sourceBox && targetBox) {
      // Move to source
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)

      // Start drag
      await page.mouse.down()
      await page.waitForTimeout(200)

      // Move just a little bit first (to trigger dragover on the source container)
      await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 20, sourceBox.y + sourceBox.height / 2)
      await page.waitForTimeout(100)

      // Now move to target container
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 })
      await page.waitForTimeout(200)

      // Release
      await page.mouse.up()
      await page.waitForTimeout(500)
    }

    // Check final state
    const finalState = await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')
      return {
        list1Count: multi1?.querySelectorAll('.horizontal-item').length,
        list2Count: multi2?.querySelectorAll('.horizontal-item').length,
        status: document.getElementById('status')?.textContent
      }
    })

    console.log('\n=== Final State ===')
    console.log('List 1 items:', finalState.list1Count)
    console.log('List 2 items:', finalState.list2Count)
    console.log('Status:', finalState.status)

    // Analyze logs
    const dragEvents = logs.filter(log =>
      log.includes('[Container') || log.includes('[Document]')
    )
    console.log('\n=== Event sequence ===')
    dragEvents.forEach(event => console.log(event))
  })
})