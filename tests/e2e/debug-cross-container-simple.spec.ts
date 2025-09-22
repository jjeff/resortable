import { test, expect } from '@playwright/test'
import { injectEventLogger, getItemOrder } from '../helpers/drag-helpers'

test.describe('Cross-Container Drag Debug - Simple', () => {
  test('basic cross-container setup check', async ({ page }) => {
    console.log('\n=== Basic Cross-Container Setup Check ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Capture console logs
    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      logs.push(text)
      console.log(`[CONSOLE] ${text}`)
    })

    // Step 1: Basic element existence check
    const elementsExist = await page.evaluate(() => {
      return {
        multi1: !!document.getElementById('multi-1'),
        multi2: !!document.getElementById('multi-2'),
        multi1Items: document.querySelectorAll('#multi-1 .horizontal-item')
          .length,
        multi2Items: document.querySelectorAll('#multi-2 .horizontal-item')
          .length,
      }
    })

    console.log('Elements exist:', elementsExist)
    expect(elementsExist.multi1).toBe(true)
    expect(elementsExist.multi2).toBe(true)
    expect(elementsExist.multi1Items).toBe(3)
    expect(elementsExist.multi2Items).toBe(3)

    // Step 2: Check basic configuration
    const config = await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      return {
        multi1: {
          id: multi1?.id,
          dropZone: multi1?.dataset.dropZone,
          sortableGroup: multi1?.dataset.sortableGroup,
          hasClass: multi1?.classList.contains('sortable-drop-zone'),
        },
        multi2: {
          id: multi2?.id,
          dropZone: multi2?.dataset.dropZone,
          sortableGroup: multi2?.dataset.sortableGroup,
          hasClass: multi2?.classList.contains('sortable-drop-zone'),
        },
      }
    })

    console.log('Configuration:', config)
    expect(config.multi1.dropZone).toBe('true')
    expect(config.multi2.dropZone).toBe('true')
    expect(config.multi1.sortableGroup).toBe('shared-horizontal')
    expect(config.multi2.sortableGroup).toBe('shared-horizontal')

    // Step 3: Check draggable attributes
    const draggableStates = await page.evaluate(() => {
      const items1 = Array.from(
        document.querySelectorAll('#multi-1 .horizontal-item')
      )
      const items2 = Array.from(
        document.querySelectorAll('#multi-2 .horizontal-item')
      )

      return {
        list1Items: items1.map((item) => ({
          text: item.textContent,
          draggable: (item as HTMLElement).draggable,
        })),
        list2Items: items2.map((item) => ({
          text: item.textContent,
          draggable: (item as HTMLElement).draggable,
        })),
      }
    })

    console.log('Draggable states:', draggableStates)

    // All items should be draggable
    draggableStates.list1Items.forEach((item) => {
      expect(item.draggable).toBe(true)
    })
    draggableStates.list2Items.forEach((item) => {
      expect(item.draggable).toBe(true)
    })

    // Step 4: Try to access Sortable/DragManager instances
    const instanceInfo = await page.evaluate(() => {
      const info = {
        sortableInstances: 0,
        dragManagerRegistry: 0,
        globalDragState: false,
        windowProperties: [] as string[],
      }

      // Check window properties that might contain our instances
      for (const prop in window) {
        if (
          prop.toLowerCase().includes('sortable') ||
          prop.toLowerCase().includes('drag') ||
          prop.toLowerCase().includes('resortable')
        ) {
          info.windowProperties.push(prop)
        }
      }

      // Try to access known global objects
      try {
        const sortableInstances = (window as any).sortableInstances
        if (sortableInstances) {
          info.sortableInstances = Array.isArray(sortableInstances)
            ? sortableInstances.length
            : 1
        }
      } catch (e) {
        // ignore
      }

      try {
        const dragManager = (window as any).DragManager
        if (dragManager && dragManager.registry) {
          info.dragManagerRegistry = dragManager.registry.size
        }
      } catch (e) {
        // ignore
      }

      try {
        const globalState = (window as any).globalDragState
        info.globalDragState = !!globalState
      } catch (e) {
        // ignore
      }

      return info
    })

    console.log('Instance info:', instanceInfo)

    // Step 5: Simple drag event test
    console.log('\n=== Simple Drag Event Test ===')

    await injectEventLogger(page, '#multi-1')
    await injectEventLogger(page, '#multi-2')

    // Get initial order
    const initialOrder1 = await getItemOrder(
      page,
      '#multi-1',
      '.horizontal-item'
    )
    const initialOrder2 = await getItemOrder(
      page,
      '#multi-2',
      '.horizontal-item'
    )

    console.log('Initial orders:')
    console.log('  List 1:', initialOrder1)
    console.log('  List 2:', initialOrder2)

    // Try a simple dragstart event to see what happens
    const dragStartResult = await page.evaluate(() => {
      const firstItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      if (!firstItem) return { error: 'No first item found' }

      const event = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      })

      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', 'test')
        event.dataTransfer.effectAllowed = 'move'
      }

      console.log('Dispatching dragstart on:', firstItem.textContent)
      const result = firstItem.dispatchEvent(event)

      return {
        dispatched: result,
        prevented: event.defaultPrevented,
        itemText: firstItem.textContent,
        dataTransferTypes: event.dataTransfer
          ? Array.from(event.dataTransfer.types)
          : [],
      }
    })

    console.log('Drag start result:', dragStartResult)

    // Wait for any async effects
    await page.waitForTimeout(500)

    // Check if anything changed
    const afterOrder1 = await getItemOrder(page, '#multi-1', '.horizontal-item')
    const afterOrder2 = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('After dragstart:')
    console.log('  List 1:', afterOrder1)
    console.log('  List 2:', afterOrder2)

    // Filter console logs for drag-related messages
    const dragLogs = logs.filter(
      (log) =>
        log.includes('drag') ||
        log.includes('Drag') ||
        log.includes('DRAG') ||
        log.includes('[EVENT]')
    )

    console.log('\n=== Drag-related logs ===')
    dragLogs.forEach((log) => console.log(`  ${log}`))

    // Basic assertions - the test should at least not crash
    expect(dragStartResult.dispatched).toBe(true)
    expect(initialOrder1.length).toBe(3)
    expect(initialOrder2.length).toBe(3)
  })

  test('manual dragover test', async ({ page }) => {
    console.log('\n=== Manual Dragover Test ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Capture console logs
    const logs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (
        text.includes('drag') ||
        text.includes('Drag') ||
        text.includes('EVENT')
      ) {
        logs.push(text)
        console.log(`[CONSOLE] ${text}`)
      }
    })

    await injectEventLogger(page, '#multi-1')
    await injectEventLogger(page, '#multi-2')

    // Test complete drag sequence
    const dragSequenceResult = await page.evaluate(() => {
      const sourceItem = document.querySelector(
        '#multi-1 .horizontal-item:first-child'
      ) as HTMLElement
      const targetContainer = document.querySelector('#multi-2') as HTMLElement

      if (!sourceItem || !targetContainer) {
        return { error: 'Elements not found' }
      }

      const results = {
        dragstart: false,
        dragover: false,
        drop: false,
        dragend: false,
        errors: [] as string[],
      }

      try {
        // Create shared DataTransfer
        const dataTransfer = new DataTransfer()
        dataTransfer.setData('text/plain', 'sortable-item')
        dataTransfer.effectAllowed = 'move'

        // 1. Dragstart
        const dragStartEvent = new DragEvent('dragstart', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        })

        console.log('Dispatching dragstart...')
        results.dragstart = sourceItem.dispatchEvent(dragStartEvent)

        // Small delay
        setTimeout(() => {
          // 2. Dragover on target
          const dragOverEvent = new DragEvent('dragover', {
            bubbles: true,
            cancelable: true,
            dataTransfer,
            clientX: 500,
            clientY: 300,
          })

          console.log('Dispatching dragover...')
          results.dragover = targetContainer.dispatchEvent(dragOverEvent)

          setTimeout(() => {
            // 3. Drop
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer,
              clientX: 500,
              clientY: 300,
            })

            console.log('Dispatching drop...')
            results.drop = targetContainer.dispatchEvent(dropEvent)

            setTimeout(() => {
              // 4. Dragend
              const dragEndEvent = new DragEvent('dragend', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
              })

              console.log('Dispatching dragend...')
              results.dragend = sourceItem.dispatchEvent(dragEndEvent)
            }, 10)
          }, 10)
        }, 10)
      } catch (e) {
        results.errors.push(String(e))
      }

      return results
    })

    // Wait for all events to process
    await page.waitForTimeout(1000)

    console.log('Drag sequence results:', dragSequenceResult)

    // Check final state
    const finalOrder1 = await getItemOrder(page, '#multi-1', '.horizontal-item')
    const finalOrder2 = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('Final orders:')
    console.log('  List 1:', finalOrder1)
    console.log('  List 2:', finalOrder2)

    console.log('\n=== All drag-related logs ===')
    logs.forEach((log) => console.log(`  ${log}`))

    // Check if cross-container movement occurred
    const crossContainerWorking =
      finalOrder1.length !== 3 || finalOrder2.length !== 3
    console.log('Cross-container drag working:', crossContainerWorking)

    if (!crossContainerWorking) {
      console.log('❌ Cross-container drag did not work')
      console.log('Expected: Items to move between containers')
      console.log('Actual: Items remained in original containers')
    }

    expect(
      dragSequenceResult.error || dragSequenceResult.errors?.length || 0
    ).toBe(0)
  })
})
