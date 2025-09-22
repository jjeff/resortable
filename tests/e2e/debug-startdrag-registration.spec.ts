import { test, expect } from '@playwright/test'

test.describe('Debug StartDrag Registration', () => {
  test('verify globalDragState.startDrag is called and debug group compatibility', async ({
    page,
  }) => {
    console.log('\n=== Debug StartDrag Registration ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      console.log(`[CONSOLE] ${text}`)
    })

    // Inject debugging code into the page
    await page.evaluate(() => {
      // Try to expose debugging hooks on the global scope
      const sortableScript = document.querySelector('script[type="module"]')
      if (sortableScript) {
        console.log('Found module script')
      }

      // Add detailed logging to dragstart and dragover events
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      if (multi1 && multi2) {
        console.log('Setting up detailed event logging...')

        // Hook into dragstart to see what happens
        multi1.addEventListener(
          'dragstart',
          (e) => {
            console.log('[DRAGSTART_DEBUG] Event fired on multi-1')
            console.log('  - target:', (e.target as HTMLElement)?.textContent)
            console.log(
              '  - currentTarget:',
              (e.currentTarget as HTMLElement)?.id
            )
            console.log('  - dataTransfer exists:', !!e.dataTransfer)

            // Try to hook into the DragManager's onDragStart
            setTimeout(() => {
              console.log('[DRAGSTART_DEBUG] Checking after dragstart...')

              // Check if elements have been marked as being dragged
              const items = multi1.querySelectorAll('.horizontal-item')
              items.forEach((item, index) => {
                const htmlItem = item as HTMLElement
                console.log(
                  `  - Item ${index}: classes = ${htmlItem.className}`
                )
                console.log(`    opacity = ${htmlItem.style.opacity}`)
                console.log(`    draggable = ${htmlItem.draggable}`)
              })
            }, 10)
          },
          true
        )

        // Hook into dragover to see what happens
        multi2.addEventListener(
          'dragover',
          (e) => {
            console.log('[DRAGOVER_DEBUG] Event fired on multi-2')
            console.log('  - dataTransfer exists:', !!e.dataTransfer)
            console.log(
              '  - dataTransfer.types:',
              e.dataTransfer ? Array.from(e.dataTransfer.types) : 'none'
            )
            console.log('  - defaultPrevented (before):', e.defaultPrevented)

            // Check dropEffect before and after the handler
            if (e.dataTransfer) {
              console.log(
                '  - dropEffect (before handler):',
                e.dataTransfer.dropEffect
              )
            }

            setTimeout(() => {
              console.log('[DRAGOVER_DEBUG] After dragover handler:')
              if (e.dataTransfer) {
                console.log(
                  '  - dropEffect (after handler):',
                  e.dataTransfer.dropEffect
                )
              }
              console.log('  - defaultPrevented (after):', e.defaultPrevented)
            }, 1)
          },
          true
        )

        // Also try to hook into the DragManager methods if possible
        // This is tricky because they're in module scope, but we can try to monkey-patch
        const originalPreventDefault = Event.prototype.preventDefault
        Event.prototype.preventDefault = function () {
          if (this.type?.includes('drag')) {
            console.log(`[PREVENT_DEFAULT] Called on ${this.type}`)
          }
          return originalPreventDefault.call(this)
        }
      }
    })

    // Test 1: Try a controlled drag sequence
    console.log('\n=== Test 1: Manual Drag Events ===')

    const dragResult = await page.evaluate(() => {
      const sourceItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      const targetContainer = document.querySelector('#multi-2') as HTMLElement

      if (!sourceItem || !targetContainer) {
        return { error: 'Elements not found' }
      }

      const results: string[] = []

      // Create DataTransfer object
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', 'sortable-item')
      dataTransfer.effectAllowed = 'move'

      // 1. Fire dragstart
      console.log('[MANUAL_DRAG] Firing dragstart...')
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: 100,
        clientY: 100,
      })

      sourceItem.dispatchEvent(dragStartEvent)
      results.push(
        `dragstart dispatched, prevented: ${dragStartEvent.defaultPrevented}`
      )

      // Small delay then fire dragover
      setTimeout(() => {
        console.log('[MANUAL_DRAG] Firing dragover...')
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        targetContainer.dispatchEvent(dragOverEvent)
        results.push(
          `dragover dispatched, prevented: ${dragOverEvent.defaultPrevented}`
        )
        results.push(
          `dragover dropEffect: ${dragOverEvent.dataTransfer?.dropEffect}`
        )

        // Fire drop
        setTimeout(() => {
          console.log('[MANUAL_DRAG] Firing drop...')
          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: 500,
            clientY: 100,
          })

          targetContainer.dispatchEvent(dropEvent)
          results.push(
            `drop dispatched, prevented: ${dropEvent.defaultPrevented}`
          )

          // Fire dragend
          setTimeout(() => {
            console.log('[MANUAL_DRAG] Firing dragend...')
            const dragEndEvent = new DragEvent('dragend', {
              bubbles: true,
              cancelable: true,
              dataTransfer,
            })

            sourceItem.dispatchEvent(dragEndEvent)
            results.push(
              `dragend dispatched, prevented: ${dragEndEvent.defaultPrevented}`
            )
          }, 10)
        }, 10)
      }, 10)

      return { results, error: null }
    })

    await page.waitForTimeout(500)

    console.log('Manual drag results:')
    if (dragResult.error) {
      console.log('Error:', dragResult.error)
    } else {
      dragResult.results?.forEach((result) => console.log(`  ${result}`))
    }

    // Test 2: Try real browser drag
    console.log('\n=== Test 2: Real Browser Drag ===')

    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    try {
      await sourceItem.dragTo(targetContainer)
      await page.waitForTimeout(300)
    } catch (e) {
      console.log('Real drag failed:', e)
    }

    // Check the results
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

    console.log('\n=== Final Results ===')
    console.log('List 1:', finalState.list1)
    console.log('List 2:', finalState.list2)

    const manualWorked =
      finalState.list1.length !== 3 || finalState.list2.length !== 3
    console.log('Cross-container drag worked:', manualWorked)

    // Show relevant logs
    console.log('\n=== Relevant Logs ===')
    const relevantLogs = logs.filter(
      (log) =>
        log.includes('[DRAGSTART_DEBUG]') ||
        log.includes('[DRAGOVER_DEBUG]') ||
        log.includes('[MANUAL_DRAG]') ||
        log.includes('[PREVENT_DEFAULT]') ||
        log.includes('dropEffect')
    )
    relevantLogs.forEach((log) => console.log(`  ${log}`))

    // Basic test - should not crash
    expect(
      finalState.list1.length + finalState.list2.length
    ).toBeGreaterThanOrEqual(6)
  })

  test('test group compatibility directly', async ({ page }) => {
    console.log('\n=== Test Group Compatibility ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Test the exact group names and compatibility
    const groupTest = await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      if (!multi1 || !multi2) {
        return { error: 'Elements not found' }
      }

      return {
        multi1Group: multi1.dataset.sortableGroup,
        multi2Group: multi2.dataset.sortableGroup,
        groupsMatch:
          multi1.dataset.sortableGroup === multi2.dataset.sortableGroup,
        multi1DropZone: multi1.dataset.dropZone,
        multi2DropZone: multi2.dataset.dropZone,
        multi1Classes: Array.from(multi1.classList),
        multi2Classes: Array.from(multi2.classList),
      }
    })

    console.log('Group compatibility test:', JSON.stringify(groupTest, null, 2))

    expect(groupTest.groupsMatch).toBe(true)
    expect(groupTest.multi1Group).toBe('shared-horizontal')
    expect(groupTest.multi2Group).toBe('shared-horizontal')
  })
})
