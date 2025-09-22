import { test } from '@playwright/test'

test('debug group compatibility', async ({ page }) => {
  await page.goto('http://localhost:5173/html-tests/test-horizontal-list.html')
  await page.waitForLoadState('networkidle')

  // Check what's actually set on the containers and in the GlobalDragState
  const groupInfo = await page.evaluate(() => {
    const multi1 = document.getElementById('multi-1')
    const multi2 = document.getElementById('multi-2')

    // Get data attributes
    const info = {
      multi1: {
        id: multi1?.id,
        dropZone: multi1?.dataset.dropZone,
        sortableGroup: multi1?.dataset.sortableGroup,
      },
      multi2: {
        id: multi2?.id,
        dropZone: multi2?.dataset.dropZone,
        sortableGroup: multi2?.dataset.sortableGroup,
      },
    }

    return info
  })

  console.log('Group configuration:', JSON.stringify(groupInfo, null, 2))

  // Now try to start a drag and check what GlobalDragState says
  await page.evaluate(() => {
    // Add a global handler to check canAcceptDrop during drag
    document.addEventListener(
      'dragover',
      (e) => {
        const target = e.target as HTMLElement
        const container = target.closest('#multi-1, #multi-2')
        if (container) {
          // Try to access GlobalDragState if it's available
          try {
            // @ts-ignore
            const globalDragState = window.__globalDragState
            if (globalDragState) {
              const canAccept = globalDragState.canAcceptDrop(
                'html5-drag',
                container.dataset.sortableGroup
              )
              console.log(
                `[DRAGOVER] Container ${container.id} can accept: ${canAccept}`
              )
            }
          } catch (err) {
            console.log('[DRAGOVER] Could not check GlobalDragState')
          }
        }
      },
      true
    )

    // Add handler to track dragstart
    document.addEventListener(
      'dragstart',
      (e) => {
        const target = e.target as HTMLElement
        console.log('[DRAGSTART] Started dragging:', target.textContent)
        console.log('[DRAGSTART] From container:', target.parentElement?.id)

        // Check GlobalDragState after drag starts
        setTimeout(() => {
          try {
            // @ts-ignore
            const globalDragState = window.__globalDragState
            if (globalDragState) {
              const activeDrag = globalDragState.getActiveDrag('html5-drag')
              if (activeDrag) {
                console.log(
                  '[DRAGSTART] Active drag group:',
                  activeDrag.groupName
                )
                console.log(
                  '[DRAGSTART] Can accept drop to shared-horizontal:',
                  globalDragState.canAcceptDrop(
                    'html5-drag',
                    'shared-horizontal'
                  )
                )
              }
            }
          } catch (err) {
            console.log('[DRAGSTART] Could not access GlobalDragState')
          }
        }, 100)
      },
      true
    )

    document.addEventListener(
      'dragend',
      (e) => {
        const target = e.target as HTMLElement
        console.log('[DRAGEND] Ended dragging:', target.textContent)
      },
      true
    )
  })

  // Monitor console
  page.on('console', (msg) => console.log(msg.text()))

  // Try to drag
  console.log('\nAttempting drag...')
  const source = page.locator('#multi-1 .horizontal-item').first()
  const target = page.locator('#multi-2')

  try {
    await source.dragTo(target, { timeout: 5000 })
  } catch (e) {
    console.log('Drag timed out or failed')
  }

  await page.waitForTimeout(1000)
})
