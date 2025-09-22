import { test, expect } from '@playwright/test'
import { injectEventLogger } from '../helpers/drag-helpers'

test.describe('Debug Immediate Dragend Issue', () => {
  test('investigate why dragend fires immediately', async ({ page }) => {
    console.log('\n=== Investigating Immediate Dragend Issue ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const logs: string[] = []
    const eventSequence: Array<{
      type: string
      target: string
      timestamp: number
      clientX?: number
      clientY?: number
    }> = []

    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      if (text.includes('[EVENT]') || text.includes('drag')) {
        console.log(`[CONSOLE] ${text}`)
      }
    })

    // Enhanced event logging with timing
    await page.evaluate(() => {
      const eventSequence: Array<{
        type: string
        target: string
        timestamp: number
        clientX?: number
        clientY?: number
      }> = []

      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      const events = [
        'dragstart',
        'dragover',
        'dragenter',
        'dragleave',
        'drop',
        'dragend',
      ]

      events.forEach((eventName) => {
        ;[multi1, multi2].forEach((container) => {
          if (!container) return

          container.addEventListener(
            eventName,
            (e) => {
              const target = e.target as HTMLElement
              const timestamp = Date.now()
              const dragEvent = e as DragEvent

              const eventInfo = {
                type: eventName,
                target:
                  target.textContent?.trim() || target.id || target.className,
                timestamp,
                clientX: dragEvent.clientX,
                clientY: dragEvent.clientY,
              }

              eventSequence.push(eventInfo)

              console.log(`[EVENT_DETAILED] ${eventName} at ${timestamp}`)
              console.log(`  - target: ${eventInfo.target}`)
              console.log(
                `  - coords: (${dragEvent.clientX}, ${dragEvent.clientY})`
              )
              console.log(`  - bubbles: ${e.bubbles}`)
              console.log(`  - cancelable: ${e.cancelable}`)
              console.log(`  - defaultPrevented: ${e.defaultPrevented}`)

              if (eventName === 'dragstart') {
                console.log(
                  `  - dataTransfer.effectAllowed: ${dragEvent.dataTransfer?.effectAllowed}`
                )
                console.log(
                  `  - dataTransfer.types: ${Array.from(dragEvent.dataTransfer?.types || [])}`
                )
              }

              if (eventName === 'dragover' || eventName === 'drop') {
                console.log(
                  `  - dataTransfer.dropEffect: ${dragEvent.dataTransfer?.dropEffect}`
                )
              }

              // Check if preventDefault was called
              if (eventName === 'dragover') {
                if (!e.defaultPrevented) {
                  console.log(
                    `  - ⚠️ WARNING: preventDefault not called on dragover!`
                  )
                }
              }
            },
            true
          ) // Use capture phase
        })
      })

      // Also add document-level listeners to catch global events
      events.forEach((eventName) => {
        document.addEventListener(
          eventName,
          (e) => {
            const target = e.target as HTMLElement
            const timestamp = Date.now()

            if (target.closest('#multi-1') || target.closest('#multi-2')) {
              console.log(
                `[DOCUMENT_EVENT] ${eventName} at ${timestamp} on ${target.textContent?.trim() || target.id}`
              )
            }
          },
          true
        )
      })

      // Expose event sequence for later access
      ;(window as any).__eventSequence = eventSequence
    })

    // Test 1: Real mouse drag with fine control
    console.log('\n=== Test 1: Real Mouse Drag ===')

    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    // Get precise coordinates
    const sourceBox = await sourceItem.boundingBox()
    const targetBox = await targetContainer.boundingBox()

    if (!sourceBox || !targetBox) {
      throw new Error('Could not get element bounds')
    }

    const sourceX = sourceBox.x + sourceBox.width / 2
    const sourceY = sourceBox.y + sourceBox.height / 2
    const targetX = targetBox.x + targetBox.width / 2
    const targetY = targetBox.y + targetBox.height / 2

    console.log(`Source coords: (${sourceX}, ${sourceY})`)
    console.log(`Target coords: (${targetX}, ${targetY})`)

    // Start the drag with precise timing
    console.log('Starting mouse down...')
    await page.mouse.move(sourceX, sourceY)
    await page.mouse.down()

    // Small delay to let dragstart fire
    await page.waitForTimeout(100)

    console.log('Moving to target...')
    // Move slowly in steps to trigger dragover events
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps
      const currentX = sourceX + (targetX - sourceX) * progress
      const currentY = sourceY + (targetY - sourceY) * progress

      await page.mouse.move(currentX, currentY)
      await page.waitForTimeout(50) // Small delay between moves
    }

    console.log('Releasing mouse...')
    await page.mouse.up()

    // Wait for all events to settle
    await page.waitForTimeout(500)

    // Get the event sequence
    const finalEventSequence = await page.evaluate(() => {
      return (window as any).__eventSequence || []
    })

    console.log('\n=== Event Sequence Analysis ===')
    console.log(`Total events captured: ${finalEventSequence.length}`)

    finalEventSequence.forEach((event: any, index: number) => {
      console.log(
        `${index + 1}. ${event.type} - ${event.target} (${event.timestamp})`
      )
    })

    // Check for the immediate dragend issue
    const dragStartEvents = finalEventSequence.filter(
      (e: any) => e.type === 'dragstart'
    )
    const dragOverEvents = finalEventSequence.filter(
      (e: any) => e.type === 'dragover'
    )
    const dropEvents = finalEventSequence.filter((e: any) => e.type === 'drop')
    const dragEndEvents = finalEventSequence.filter(
      (e: any) => e.type === 'dragend'
    )

    console.log('\n=== Event Analysis ===')
    console.log(`Dragstart events: ${dragStartEvents.length}`)
    console.log(`Dragover events: ${dragOverEvents.length}`)
    console.log(`Drop events: ${dropEvents.length}`)
    console.log(`Dragend events: ${dragEndEvents.length}`)

    if (dragStartEvents.length > 0 && dragEndEvents.length > 0) {
      const timeBetween =
        dragEndEvents[0].timestamp - dragStartEvents[0].timestamp
      console.log(`Time between dragstart and dragend: ${timeBetween}ms`)

      if (timeBetween < 100) {
        console.log(
          '⚠️  ISSUE DETECTED: Dragend fires very quickly after dragstart!'
        )
      }
    }

    // Test 2: Playwright's dragTo method
    console.log('\n=== Test 2: Playwright dragTo ===')

    // Clear event sequence
    await page.evaluate(() => {
      ;(window as any).__eventSequence = []
    })

    // Try Playwright's built-in dragTo
    try {
      await sourceItem.dragTo(targetContainer)
      await page.waitForTimeout(300)
    } catch (e) {
      console.log('dragTo failed:', e)
    }

    const dragToEventSequence = await page.evaluate(() => {
      return (window as any).__eventSequence || []
    })

    console.log(`DragTo events captured: ${dragToEventSequence.length}`)
    dragToEventSequence.forEach((event: any, index: number) => {
      console.log(`${index + 1}. ${event.type} - ${event.target}`)
    })

    // Check final item positions
    const finalPositions = await page.evaluate(() => {
      const list1Items = Array.from(
        document.querySelectorAll('#multi-1 .horizontal-item')
      ).map((el) => el.textContent?.trim())
      const list2Items = Array.from(
        document.querySelectorAll('#multi-2 .horizontal-item')
      ).map((el) => el.textContent?.trim())

      return {
        list1: list1Items,
        list2: list2Items,
        list1Count: list1Items.length,
        list2Count: list2Items.length,
      }
    })

    console.log('\n=== Final Positions ===')
    console.log('List 1:', finalPositions.list1)
    console.log('List 2:', finalPositions.list2)

    const crossContainerWorked =
      finalPositions.list1Count !== 3 || finalPositions.list2Count !== 3
    console.log('Cross-container drag worked:', crossContainerWorked)

    // Key diagnostic checks
    expect(dragStartEvents.length).toBeGreaterThan(0) // Should have dragstart

    if (dragOverEvents.length === 0) {
      console.log(
        '❌ ISSUE: No dragover events detected - this prevents drop from working'
      )
    }

    if (dropEvents.length === 0) {
      console.log(
        '❌ ISSUE: No drop events detected - drag sequence incomplete'
      )
    }

    // Log relevant console messages
    console.log('\n=== Console Messages ===')
    const dragRelatedLogs = logs.filter(
      (log) =>
        log.includes('drag') ||
        log.includes('[EVENT]') ||
        log.includes('WARNING') ||
        log.includes('preventDefault')
    )
    dragRelatedLogs.slice(-20).forEach((log) => console.log(`  ${log}`))
  })

  test('test with manual event sequence', async ({ page }) => {
    console.log('\n=== Manual Event Sequence Test ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const logs: string[] = []
    page.on('console', (msg) => {
      logs.push(msg.text())
    })

    await injectEventLogger(page, '#multi-1')
    await injectEventLogger(page, '#multi-2')

    // Try the exact sequence that should work
    const manualSequenceResult = await page.evaluate(() => {
      const results: string[] = []

      const sourceItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      const targetContainer = document.querySelector('#multi-2') as HTMLElement

      if (!sourceItem || !targetContainer) {
        return { error: 'Elements not found', results }
      }

      // Create a proper DataTransfer object
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', 'sortable-item')
      dataTransfer.effectAllowed = 'move'

      try {
        // 1. Dispatch dragstart
        results.push('Dispatching dragstart...')
        const dragStartEvent = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 100,
          clientY: 100,
        })

        const dragStartResult = sourceItem.dispatchEvent(dragStartEvent)
        results.push(
          `Dragstart result: ${dragStartResult}, prevented: ${dragStartEvent.defaultPrevented}`
        )

        // 2. Dispatch dragenter on target
        results.push('Dispatching dragenter...')
        const dragEnterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        const dragEnterResult = targetContainer.dispatchEvent(dragEnterEvent)
        results.push(
          `Dragenter result: ${dragEnterResult}, prevented: ${dragEnterEvent.defaultPrevented}`
        )

        // 3. Dispatch dragover on target - this is critical!
        results.push('Dispatching dragover...')
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        const dragOverResult = targetContainer.dispatchEvent(dragOverEvent)
        results.push(
          `Dragover result: ${dragOverResult}, prevented: ${dragOverEvent.defaultPrevented}`
        )
        results.push(
          `Dragover dropEffect: ${dragOverEvent.dataTransfer?.dropEffect}`
        )

        // 4. Dispatch drop on target
        results.push('Dispatching drop...')
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        const dropResult = targetContainer.dispatchEvent(dropEvent)
        results.push(
          `Drop result: ${dropResult}, prevented: ${dropEvent.defaultPrevented}`
        )

        // 5. Dispatch dragend on source
        results.push('Dispatching dragend...')
        const dragEndEvent = new DragEvent('dragend', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        const dragEndResult = sourceItem.dispatchEvent(dragEndEvent)
        results.push(
          `Dragend result: ${dragEndResult}, prevented: ${dragEndEvent.defaultPrevented}`
        )
      } catch (e) {
        results.push(`Error: ${e}`)
      }

      return { results, error: null }
    })

    await page.waitForTimeout(500)

    console.log('Manual sequence results:')
    if (manualSequenceResult.error) {
      console.log('Error:', manualSequenceResult.error)
    } else {
      manualSequenceResult.results.forEach((result) => {
        console.log(`  ${result}`)
      })
    }

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

    console.log('Final state after manual events:')
    console.log('  List 1:', finalState.list1)
    console.log('  List 2:', finalState.list2)

    const worked =
      finalState.list1.length !== 3 || finalState.list2.length !== 3
    console.log('Manual sequence worked:', worked)

    if (!worked) {
      console.log('❌ Even manual event sequence did not work')

      // Check for specific error messages
      const errorLogs = logs.filter(
        (log) =>
          log.includes('error') ||
          log.includes('Error') ||
          log.includes('fail') ||
          log.includes('prevent')
      )

      if (errorLogs.length > 0) {
        console.log('Error messages found:')
        errorLogs.forEach((log) => console.log(`  ${log}`))
      }
    }
  })
})
