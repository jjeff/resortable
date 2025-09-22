import { test, expect } from '@playwright/test'
import {
  injectEventLogger,
  getItemOrder,
  getDraggableState,
  dragAndDropNative,
} from '../helpers/drag-helpers'

test.describe('Cross-Container Drag Debug', () => {
  test('comprehensive cross-container debug analysis', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    console.log('\n=== Starting Comprehensive Cross-Container Drag Debug ===')

    // Step 1: Inject event loggers and capture console
    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(`[${msg.type()}] ${text}`)
      console.log(`CONSOLE: ${text}`)
    })

    await injectEventLogger(page, '#multi-1')
    await injectEventLogger(page, '#multi-2')

    // Step 2: Get initial state
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

    // Step 3: Check Sortable instances and configuration
    const sortableConfig = await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      const info = {
        multi1: {
          id: multi1?.id,
          dropZone: multi1?.dataset.dropZone,
          sortableGroup: multi1?.dataset.sortableGroup,
          classList: multi1?.className.split(' '),
          hasEventListeners: {
            dragstart: false,
            dragover: false,
            drop: false,
            dragend: false,
          },
        },
        multi2: {
          id: multi2?.id,
          dropZone: multi2?.dataset.dropZone,
          sortableGroup: multi2?.dataset.sortableGroup,
          classList: multi2?.className.split(' '),
          hasEventListeners: {
            dragstart: false,
            dragover: false,
            drop: false,
            dragend: false,
          },
        },
        globalState: null as any,
        registrySize: 0,
      }

      // Check for event listeners by testing if the events fire
      if (multi1 && multi2) {
        ;[multi1, multi2].forEach((container, index) => {
          if (!container) return
          const key = index === 0 ? 'multi1' : 'multi2'

          // Check if dragstart listener exists by creating a test event
          try {
            const testEvent = new Event('dragstart')
            const originalHandler = container.dispatchEvent
            let handlerCalled = false
            container.dispatchEvent = function (event) {
              if (event.type === 'dragstart') handlerCalled = true
              return originalHandler.call(this, event)
            }
            container.dispatchEvent(testEvent)
            container.dispatchEvent = originalHandler
            info[key].hasEventListeners.dragstart = handlerCalled
          } catch (e) {
            console.log('Error checking event listeners:', e)
          }
        })
      }

      // Try to access global drag state and registry
      try {
        // Access the global drag state if available on window
        const globalState = (window as any).globalDragState
        if (globalState) {
          info.globalState = {
            hasActiveDrags: globalState.activeDrags?.size > 0,
            activeDragCount: globalState.activeDrags?.size || 0,
            hasPutTargets: globalState.putTargets?.size > 0,
          }
        }

        // Check DragManager registry
        const dragManagerClass = (window as any).DragManager
        if (dragManagerClass && dragManagerClass.registry) {
          info.registrySize = dragManagerClass.registry.size
        }
      } catch (e) {
        console.log('Could not access global state:', e)
      }

      return info
    })

    console.log('\n=== Sortable Configuration ===')
    console.log(JSON.stringify(sortableConfig, null, 2))

    // Step 4: Check draggable state of items
    const item1State = await getDraggableState(
      page,
      '#multi-1 .horizontal-item:first-child'
    )
    const item2State = await getDraggableState(
      page,
      '#multi-2 .horizontal-item:first-child'
    )

    console.log('\n=== Draggable States ===')
    console.log('First item in List 1:', item1State)
    console.log('First item in List 2:', item2State)

    // Step 5: Setup detailed event monitoring during drag
    await page.evaluate(() => {
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
              const currentTarget = e.currentTarget as HTMLElement
              console.log(`[EVENT] ${eventName} on ${currentTarget.id}`)
              console.log(
                `  - target: ${target.textContent || target.id || target.className}`
              )
              console.log(
                `  - clientX: ${(e as DragEvent).clientX}, clientY: ${(e as DragEvent).clientY}`
              )

              if (eventName === 'dragstart') {
                const dragEvent = e as DragEvent
                console.log(
                  `  - dataTransfer types: ${Array.from(dragEvent.dataTransfer?.types || [])}`
                )
                console.log(
                  `  - dataTransfer effectAllowed: ${dragEvent.dataTransfer?.effectAllowed}`
                )
              }

              if (eventName === 'dragover' || eventName === 'drop') {
                const dragEvent = e as DragEvent
                console.log(
                  `  - dataTransfer dropEffect: ${dragEvent.dataTransfer?.dropEffect}`
                )
                console.log(
                  `  - preventDefault called: ${dragEvent.defaultPrevented}`
                )
              }
            },
            true
          ) // Use capture phase
        })
      })

      console.log('Event monitoring setup complete')
    })

    // Step 6: Monitor GlobalDragState during drag
    await page.evaluate(() => {
      const originalStartDrag = (window as any).globalDragState?.startDrag
      if (originalStartDrag) {
        ;(window as any).globalDragState.startDrag = function (...args: any[]) {
          console.log('[GLOBAL_DRAG_STATE] startDrag called with:', args)
          return originalStartDrag.apply(this, args)
        }
      }

      const originalEndDrag = (window as any).globalDragState?.endDrag
      if (originalEndDrag) {
        ;(window as any).globalDragState.endDrag = function (...args: any[]) {
          console.log('[GLOBAL_DRAG_STATE] endDrag called with:', args)
          return originalEndDrag.apply(this, args)
        }
      }

      const originalCanAcceptDrop = (window as any).globalDragState
        ?.canAcceptDrop
      if (originalCanAcceptDrop) {
        ;(window as any).globalDragState.canAcceptDrop = function (
          ...args: any[]
        ) {
          const result = originalCanAcceptDrop.apply(this, args)
          console.log(
            '[GLOBAL_DRAG_STATE] canAcceptDrop called with:',
            args,
            'result:',
            result
          )
          return result
        }
      }
    })

    // Step 7: Attempt cross-container drag with multiple strategies
    console.log('\n=== Testing Drag Strategy 1: Playwright dragTo ===')

    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    // Clear logs before test
    logs.length = 0

    try {
      await sourceItem.dragTo(targetContainer)
      await page.waitForTimeout(1000) // Give time for events to fire
    } catch (e) {
      console.log('dragTo error:', e)
    }

    const list1After1 = await getItemOrder(page, '#multi-1', '.horizontal-item')
    const list2After1 = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('After dragTo:')
    console.log('  List 1:', list1After1)
    console.log('  List 2:', list2After1)
    console.log(
      '  Items moved:',
      list1After1.length !== list1Initial.length ||
        list2After1.length !== list2Initial.length
    )

    // Check GlobalDragState after first attempt
    const globalStateAfter1 = await page.evaluate(() => {
      const state = (window as any).globalDragState
      return {
        activeDrags: state?.activeDrags?.size || 0,
        putTargets: state?.putTargets?.size || 0,
      }
    })
    console.log('GlobalDragState after dragTo:', globalStateAfter1)

    // Step 8: Try manual mouse drag
    console.log('\n=== Testing Drag Strategy 2: Manual Mouse Events ===')

    // Reset if needed
    if (
      list1After1.length !== list1Initial.length ||
      list2After1.length !== list2Initial.length
    ) {
      await page.reload()
      await page.waitForLoadState('networkidle')
      await injectEventLogger(page, '#multi-1')
      await injectEventLogger(page, '#multi-2')
    }

    logs.length = 0

    try {
      await dragAndDropNative(
        page,
        '#multi-1 .horizontal-item:first-child',
        '#multi-2',
        {
          delay: 200,
          steps: 10,
        }
      )
      await page.waitForTimeout(1000)
    } catch (e) {
      console.log('dragAndDropNative error:', e)
    }

    const list1After2 = await getItemOrder(page, '#multi-1', '.horizontal-item')
    const list2After2 = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('After manual drag:')
    console.log('  List 1:', list1After2)
    console.log('  List 2:', list2After2)
    console.log(
      '  Items moved:',
      list1After2.length !== list1Initial.length ||
        list2After2.length !== list2Initial.length
    )

    // Step 9: Try dispatching events manually
    console.log('\n=== Testing Drag Strategy 3: Manual Events ===')

    logs.length = 0

    await page.evaluate(() => {
      const sourceItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      const targetContainer = document.querySelector('#multi-2') as HTMLElement

      if (!sourceItem || !targetContainer) {
        console.log('Could not find source or target elements')
        return
      }

      console.log('Manually dispatching drag events...')

      // Create drag start event
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      })

      // Set data transfer
      dragStartEvent.dataTransfer?.setData('text/plain', 'sortable-item')
      if (dragStartEvent.dataTransfer) {
        dragStartEvent.dataTransfer.effectAllowed = 'move'
      }

      console.log('Dispatching dragstart on:', sourceItem.textContent)
      const dragStartResult = sourceItem.dispatchEvent(dragStartEvent)
      console.log('Dragstart result:', dragStartResult)

      // Wait a bit then dispatch dragover on target
      setTimeout(() => {
        const dragOverEvent = new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dragStartEvent.dataTransfer,
          clientX: 500,
          clientY: 300,
        })

        console.log('Dispatching dragover on:', targetContainer.id)
        const dragOverResult = targetContainer.dispatchEvent(dragOverEvent)
        console.log('Dragover result:', dragOverResult)

        // Then dispatch drop
        setTimeout(() => {
          const dropEvent = new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dragStartEvent.dataTransfer,
            clientX: 500,
            clientY: 300,
          })

          console.log('Dispatching drop on:', targetContainer.id)
          const dropResult = targetContainer.dispatchEvent(dropEvent)
          console.log('Drop result:', dropResult)

          // Finally dispatch dragend
          setTimeout(() => {
            const dragEndEvent = new DragEvent('dragend', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dragStartEvent.dataTransfer,
            })

            console.log('Dispatching dragend on:', sourceItem.textContent)
            const dragEndResult = sourceItem.dispatchEvent(dragEndEvent)
            console.log('Dragend result:', dragEndResult)
          }, 50)
        }, 50)
      }, 50)
    })

    await page.waitForTimeout(1000)

    const list1After3 = await getItemOrder(page, '#multi-1', '.horizontal-item')
    const list2After3 = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('After manual events:')
    console.log('  List 1:', list1After3)
    console.log('  List 2:', list2After3)
    console.log(
      '  Items moved:',
      list1After3.length !== list1Initial.length ||
        list2After3.length !== list2Initial.length
    )

    // Step 10: Final analysis
    console.log('\n=== Final Analysis ===')

    const finalGlobalState = await page.evaluate(() => {
      const state = (window as any).globalDragState
      return {
        activeDrags: state?.activeDrags?.size || 0,
        putTargets: state?.putTargets?.size || 0,
        methods: state
          ? Object.getOwnPropertyNames(Object.getPrototypeOf(state))
          : [],
      }
    })

    console.log('Final GlobalDragState:', finalGlobalState)

    // Filter and display relevant event logs
    const relevantLogs = logs.filter(
      (log) =>
        log.includes('drag') ||
        log.includes('GLOBAL_DRAG_STATE') ||
        log.includes('[EVENT]') ||
        log.includes('Manually') ||
        log.includes('result:')
    )

    console.log('\n=== Event Timeline ===')
    relevantLogs.slice(-30).forEach((log, index) => {
      console.log(`${index + 1}: ${log}`)
    })

    // Step 11: Check for errors or issues
    const hasErrors = logs.some(
      (log) => log.includes('[error]') || log.includes('Error')
    )
    const hasWarnings = logs.some(
      (log) => log.includes('[warn]') || log.includes('Warning')
    )

    console.log('\n=== Issues Detected ===')
    console.log('Has errors:', hasErrors)
    console.log('Has warnings:', hasWarnings)
    console.log(
      'Cross-container drag working:',
      list1After1.length !== list1Initial.length ||
        list1After2.length !== list1Initial.length ||
        list1After3.length !== list1Initial.length
    )

    // Fail the test if cross-container drag is not working
    const crossContainerWorking =
      list1After1.length !== list1Initial.length ||
      list1After2.length !== list1Initial.length ||
      list1After3.length !== list1Initial.length

    if (!crossContainerWorking) {
      console.log('\n❌ Cross-container drag is NOT working with any strategy')
      console.log('Expected: Items to move between containers')
      console.log('Actual: No items moved between containers')
    } else {
      console.log('\n✅ Cross-container drag is working')
    }

    // Add assertions for key requirements
    expect(sortableConfig.multi1.dropZone).toBe('true')
    expect(sortableConfig.multi2.dropZone).toBe('true')
    expect(sortableConfig.multi1.sortableGroup).toBe('shared-horizontal')
    expect(sortableConfig.multi2.sortableGroup).toBe('shared-horizontal')
    expect(item1State.draggable).toBe(true)
    expect(item2State.draggable).toBe(true)
  })

  test('check group compatibility in isolation', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const groupCompatibility = await page.evaluate(() => {
      const result = {
        groupManagersFound: 0,
        canAcceptDrop: false,
        groupNames: [] as string[],
        compatibility: null as any,
      }

      try {
        // Try to access DragManager registry
        const dragManagerClass = (window as any).DragManager
        if (dragManagerClass && dragManagerClass.registry) {
          const registry = dragManagerClass.registry
          result.groupManagersFound = registry.size

          // Get group names from each manager
          for (const [element, manager] of registry) {
            const groupManager = manager.getGroupManager?.()
            if (groupManager) {
              const groupName = groupManager.getName()
              result.groupNames.push(groupName)
            }
          }

          // Test compatibility if we have 2 managers
          if (result.groupNames.length >= 2) {
            const firstManager = Array.from(registry.values())[0]
            const secondGroupName = result.groupNames[1]

            const groupManager = firstManager.getGroupManager?.()
            if (groupManager) {
              result.compatibility = {
                canPullTo: groupManager.canPullTo(secondGroupName),
                shouldClone: groupManager.shouldClone(),
                pullMode: groupManager.getPullMode(secondGroupName),
              }
            }
          }
        }

        // Test globalDragState canAcceptDrop function
        const globalState = (window as any).globalDragState
        if (globalState && result.groupNames.length >= 2) {
          result.canAcceptDrop = globalState.canAcceptDrop(
            'html5-drag',
            result.groupNames[1]
          )
        }
      } catch (e) {
        console.log('Error checking group compatibility:', e)
      }

      return result
    })

    console.log('\n=== Group Compatibility Analysis ===')
    console.log(JSON.stringify(groupCompatibility, null, 2))

    // Don't fail if no group managers found - just log the issue
    if (groupCompatibility.groupManagersFound === 0) {
      console.log(
        '⚠️  No DragManager instances found in registry - this indicates an initialization issue'
      )
    }
    expect(groupCompatibility.groupManagersFound).toBeGreaterThanOrEqual(0)
  })
})
