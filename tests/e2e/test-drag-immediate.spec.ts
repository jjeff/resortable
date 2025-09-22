import { test } from '@playwright/test'

test('debug immediate dragend', async ({ page }) => {
  await page.goto('http://localhost:5173/html-tests/test-horizontal-list.html')
  await page.waitForLoadState('networkidle')

  // Add detailed logging to understand why drag ends immediately
  await page.evaluate(() => {
    document.addEventListener('dragstart', (e) => {
      const target = e.target as HTMLElement
      console.log('[DRAGSTART]', {
        text: target.textContent,
        display: window.getComputedStyle(target).display,
        parent: target.parentElement?.id,
        dataTransfer: e.dataTransfer ? 'present' : 'missing'
      })

      // Check what DragManager thinks
      const container = target.parentElement
      if (container) {
        console.log('[DRAGSTART] Container:', {
          id: container.id,
          sortableGroup: container.dataset.sortableGroup,
          dropZone: container.dataset.dropZone
        })
      }

      // Check GlobalDragState after a moment
      setTimeout(() => {
        try {
          // @ts-ignore
          const gs = window.__globalDragState
          if (gs) {
            console.log('[DRAGSTART+100ms] Active drags:', gs.getActiveDragCount())
            const activeDrag = gs.getActiveDrag('html5-drag')
            if (activeDrag) {
              console.log('[DRAGSTART+100ms] Active drag details:', {
                groupName: activeDrag.groupName,
                fromZone: activeDrag.fromZone?.id
              })
            } else {
              console.log('[DRAGSTART+100ms] No active drag found!')
            }
          }
        } catch (err) {
          console.log('[DRAGSTART+100ms] Error:', err)
        }
      }, 100)
    }, true)

    document.addEventListener('dragover', (e) => {
      const target = e.target as HTMLElement
      const container = target.closest('#multi-1, #multi-2')
      if (container) {
        console.log('[DRAGOVER] on container:', container.id)
      }
    }, true)

    document.addEventListener('dragend', (e) => {
      const target = e.target as HTMLElement
      console.log('[DRAGEND]', {
        text: target.textContent,
        parent: target.parentElement?.id
      })

      // Check GlobalDragState
      try {
        // @ts-ignore
        const gs = window.__globalDragState
        if (gs) {
          console.log('[DRAGEND] Active drags remaining:', gs.getActiveDragCount())
        }
      } catch (err) {
        console.log('[DRAGEND] Error:', err)
      }
    }, true)
  })

  // Monitor console
  page.on('console', msg => console.log(msg.text()))

  // Try Playwright's dragTo
  console.log('\n=== Starting drag test with Playwright dragTo ===')

  const firstItem = page.locator('#multi-1 .horizontal-item').first()
  const secondContainer = page.locator('#multi-2')

  try {
    await firstItem.dragTo(secondContainer, { timeout: 5000 })
    console.log('Drag completed')
  } catch (e) {
    console.log('Drag failed:', e)
  }

  await page.waitForTimeout(1000)

  // Check final state
  const finalState = await page.evaluate(() => {
    const multi1 = document.getElementById('multi-1')
    const multi2 = document.getElementById('multi-2')
    return {
      list1Count: multi1?.querySelectorAll('.horizontal-item').length,
      list2Count: multi2?.querySelectorAll('.horizontal-item').length
    }
  })

  console.log('\n=== Final State ===')
  console.log('List 1 items:', finalState.list1Count)
  console.log('List 2 items:', finalState.list2Count)
})