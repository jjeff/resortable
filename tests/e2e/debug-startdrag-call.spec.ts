import { test, expect } from '@playwright/test'

test.describe('Debug StartDrag Call', () => {
  test('trace startDrag call and canAcceptDrop logic', async ({ page }) => {
    console.log('\n=== Trace StartDrag Call ===')

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

    // Create a very detailed trace of what happens in dragstart and dragover
    await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      if (!multi1 || multi2) {
        // Get the first item for testing
        const firstItem = multi1?.querySelector(
          '.horizontal-item:first-child'
        ) as HTMLElement

        if (firstItem) {
          console.log('[TRACE] Setting up dragstart tracer...')
          console.log(`[TRACE] First item: ${firstItem.textContent}`)
          console.log(`[TRACE] First item draggable: ${firstItem.draggable}`)
          console.log(
            `[TRACE] First item parent: ${firstItem.parentElement?.id}`
          )
          console.log(
            `[TRACE] Draggable selector would match: ${firstItem.matches('.horizontal-item')}`
          )

          // Manually trace the onDragStart conditions
          multi1?.addEventListener(
            'dragstart',
            (e) => {
              console.log('[DRAGSTART_TRACE] Event received')

              const target = (e.target as HTMLElement)?.closest(
                '.horizontal-item'
              ) as HTMLElement
              console.log(
                `[DRAGSTART_TRACE] Target after closest: ${target?.textContent}`
              )
              console.log(
                `[DRAGSTART_TRACE] Target parent: ${target?.parentElement?.id}`
              )
              console.log(
                `[DRAGSTART_TRACE] Parent matches multi-1: ${target?.parentElement === multi1}`
              )

              if (target && target.parentElement === multi1) {
                console.log('[DRAGSTART_TRACE] ✅ Target validation passed')

                // Check if the element is draggable
                console.log(
                  `[DRAGSTART_TRACE] Target draggable: ${target.draggable}`
                )
                console.log(
                  `[DRAGSTART_TRACE] Target matches .horizontal-item: ${target.matches('.horizontal-item')}`
                )

                // Check dataTransfer
                if (e.dataTransfer) {
                  console.log('[DRAGSTART_TRACE] ✅ DataTransfer exists')
                  console.log(
                    `[DRAGSTART_TRACE] DataTransfer types: ${Array.from(e.dataTransfer.types)}`
                  )
                  console.log(
                    `[DRAGSTART_TRACE] DataTransfer effectAllowed: ${e.dataTransfer.effectAllowed}`
                  )
                } else {
                  console.log('[DRAGSTART_TRACE] ❌ No DataTransfer')
                }

                // Since we can't access the actual DragManager, simulate what it should do
                console.log(
                  '[DRAGSTART_TRACE] This should trigger startDrag with:'
                )
                console.log('  - dragId: html5-drag')
                console.log('  - target:', target.textContent)
                console.log('  - fromZone: multi-1')
                console.log('  - groupName: shared-horizontal')
              } else {
                console.log('[DRAGSTART_TRACE] ❌ Target validation failed')
              }
            },
            true
          )

          // Trace dragover conditions
          multi2?.addEventListener(
            'dragover',
            (e) => {
              console.log('[DRAGOVER_TRACE] Event received on multi-2')
              console.log(
                `[DRAGOVER_TRACE] DataTransfer exists: ${!!e.dataTransfer}`
              )
              console.log(
                `[DRAGOVER_TRACE] DataTransfer types: ${e.dataTransfer ? Array.from(e.dataTransfer.types) : 'none'}`
              )

              // Simulate the canAcceptDrop check
              console.log('[DRAGOVER_TRACE] Simulating canAcceptDrop check:')
              console.log('  - dragId: html5-drag')
              console.log('  - targetGroupName: shared-horizontal')
              console.log(
                '  - Expected: activeDrag should exist for html5-drag'
              )
              console.log(
                '  - Expected: activeDrag.groupName should be shared-horizontal'
              )
              console.log(
                '  - Expected: shared-horizontal === shared-horizontal should return true'
              )

              // Check if preventDefault was called BEFORE this handler
              console.log(
                `[DRAGOVER_TRACE] Default prevented before handler: ${e.defaultPrevented}`
              )

              setTimeout(() => {
                console.log(
                  `[DRAGOVER_TRACE] Default prevented after handler: ${e.defaultPrevented}`
                )
                console.log(
                  `[DRAGOVER_TRACE] DropEffect after handler: ${e.dataTransfer?.dropEffect}`
                )
              }, 1)
            },
            true
          )
        }
      }
    })

    // Test the exact sequence
    console.log('\n=== Testing Exact Sequence ===')

    const testResult = await page.evaluate(() => {
      const firstItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      const multi2 = document.getElementById('multi-2')

      if (!firstItem || !multi2) {
        return { error: 'Elements not found' }
      }

      // Create a proper drag event that should pass all validations
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', 'sortable-item')
      dataTransfer.effectAllowed = 'move'

      console.log('[TEST] Creating dragstart event...')
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: 100,
        clientY: 100,
      })

      // Make sure the event target is exactly what DragManager expects
      Object.defineProperty(dragStartEvent, 'target', {
        value: firstItem,
        writable: false,
      })

      console.log('[TEST] Dispatching dragstart...')
      const dragStartResult = firstItem.dispatchEvent(dragStartEvent)

      // Wait a bit, then test dragover
      setTimeout(() => {
        console.log('[TEST] Creating dragover event...')
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: 500,
          clientY: 100,
        })

        Object.defineProperty(dragOverEvent, 'target', {
          value: multi2,
          writable: false,
        })

        console.log('[TEST] Dispatching dragover...')
        const dragOverResult = multi2.dispatchEvent(dragOverEvent)

        console.log(`[TEST] Dragover result: ${dragOverResult}`)
        console.log(
          `[TEST] Dragover prevented: ${dragOverEvent.defaultPrevented}`
        )
        console.log(
          `[TEST] Final dropEffect: ${dragOverEvent.dataTransfer?.dropEffect}`
        )
      }, 50)

      return {
        dragStartResult,
        dragStartPrevented: dragStartEvent.defaultPrevented,
        error: null,
      }
    })

    await page.waitForTimeout(500)

    console.log('Test result:', testResult)

    // Show all trace logs
    console.log('\n=== Trace Logs ===')
    const traceLogs = logs.filter(
      (log) =>
        log.includes('[DRAGSTART_TRACE]') ||
        log.includes('[DRAGOVER_TRACE]') ||
        log.includes('[TEST]')
    )
    traceLogs.forEach((log) => console.log(`  ${log}`))

    expect(testResult.error).toBeNull()
  })

  test('test with real mouse drag to compare', async ({ page }) => {
    console.log('\n=== Real Mouse Drag Test ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      if (text.includes('[MOUSE]') || text.includes('dropEffect')) {
        console.log(`[CONSOLE] ${text}`)
      }
    })

    // Add logging for real mouse events
    await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      ;[multi1, multi2].forEach((container) => {
        if (!container) return
        ;['dragstart', 'dragover', 'drop', 'dragend'].forEach((eventName) => {
          container.addEventListener(
            eventName,
            (e) => {
              const dragEvent = e as DragEvent
              console.log(`[MOUSE] ${eventName} on ${container.id}`)
              console.log(
                `[MOUSE]   dropEffect: ${dragEvent.dataTransfer?.dropEffect}`
              )
              console.log(`[MOUSE]   prevented: ${e.defaultPrevented}`)
            },
            true
          )
        })
      })
    })

    // Try a real mouse drag
    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    console.log('Attempting real mouse drag...')

    try {
      // Use dragTo which should trigger real browser drag events
      await sourceItem.dragTo(targetContainer)
      await page.waitForTimeout(100)
    } catch (e) {
      console.log('dragTo failed:', e)
    }

    // Check what happened
    const afterMouseDrag = await page.evaluate(() => {
      return {
        list1Count: document.querySelectorAll('#multi-1 .horizontal-item')
          .length,
        list2Count: document.querySelectorAll('#multi-2 .horizontal-item')
          .length,
      }
    })

    console.log('After mouse drag:')
    console.log(`  List 1 count: ${afterMouseDrag.list1Count}`)
    console.log(`  List 2 count: ${afterMouseDrag.list2Count}`)

    const mouseDragWorked =
      afterMouseDrag.list1Count !== 3 || afterMouseDrag.list2Count !== 3
    console.log('Mouse drag worked:', mouseDragWorked)

    // Show mouse event logs
    console.log('\n=== Mouse Event Logs ===')
    const mouseLogs = logs.filter((log) => log.includes('[MOUSE]'))
    mouseLogs.forEach((log) => console.log(`  ${log}`))

    expect(afterMouseDrag.list1Count + afterMouseDrag.list2Count).toBe(6)
  })
})
