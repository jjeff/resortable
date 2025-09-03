import { expect, test } from '@playwright/test'

test.describe('Keyboard Debug', () => {
  test('checks if keyboard events are being handled', async ({ page }) => {
    await page.goto('/')
    
    // Add event listener to log keyboard events
    await page.evaluate(() => {
      const container = document.getElementById('basic-list')
      if (container) {
        console.log('Container found:', container)
        
        // Check if sortable is initialized
        const sortables = (window as any).sortables
        console.log('Sortables:', sortables)
        
        // Add direct event listener
        container.addEventListener('keydown', (e) => {
          console.log('Keydown event received:', e.key, 'Target:', (e.target as any).className)
        })
        
        // Check ARIA attributes
        const firstItem = container.querySelector('[data-id="basic-1"]')
        console.log('First item ARIA:', {
          role: firstItem?.getAttribute('role'),
          tabindex: firstItem?.getAttribute('tabindex'),
          ariaGrabbed: firstItem?.getAttribute('aria-grabbed'),
          ariaSelected: firstItem?.getAttribute('aria-selected')
        })
      }
    })
    
    // Focus first item and press ArrowDown
    const container = page.locator('#basic-list')
    const firstItem = page.locator('#basic-list [data-id="basic-1"]')
    
    // Check if item is focusable
    const itemAttributes = await firstItem.evaluate(el => ({
      tabindex: el.getAttribute('tabindex'),
      role: el.getAttribute('role'),
      className: el.className
    }))
    console.log('Item attributes:', itemAttributes)
    
    await firstItem.focus()
    
    // Check if focus worked
    const isFocused = await firstItem.evaluate(el => el === document.activeElement)
    console.log('Item focused after focus():', isFocused)
    
    // Set focus in SelectionManager explicitly
    await page.evaluate(() => {
      const container = document.getElementById('basic-list')
      const sortables = (window as any).sortables
      if (sortables && sortables.length > 0) {
        const sortable = sortables.find((s: any) => s.element === container)
        if (sortable && sortable.dragManager) {
          const selectionManager = sortable.dragManager.getSelectionManager()
          const firstItem = container?.querySelector('[data-id="basic-1"]') as HTMLElement
          if (selectionManager && firstItem) {
            console.log('Setting focus in SelectionManager to:', firstItem.getAttribute('data-id'))
            selectionManager.setFocus(firstItem)
          }
        }
      }
    })
    
    if (!isFocused) {
      // Try clicking to focus
      await firstItem.click()
      const isFocusedAfterClick = await firstItem.evaluate(el => el === document.activeElement)
      console.log('Item focused after click():', isFocusedAfterClick)
    }
    
    // Capture console logs
    const consoleLogs: string[] = []
    page.on('console', msg => consoleLogs.push(msg.text()))
    
    // Try pressing arrow key
    await container.press('ArrowDown')
    
    // Wait a bit
    await page.waitForTimeout(500)
    
    // Check state after arrow press
    const stateAfterArrow = await page.evaluate(() => {
      const container = document.getElementById('basic-list')
      const sortables = (window as any).sortables
      if (sortables && sortables.length > 0) {
        const sortable = sortables.find((s: any) => s.element === container)
        if (sortable && sortable.dragManager) {
          const selectionManager = sortable.dragManager.getSelectionManager()
          if (selectionManager) {
            const focused = selectionManager.getFocused()
            return {
              hasFocused: !!focused,
              focusedId: focused?.getAttribute('data-id'),
              focusedTabindex: focused?.getAttribute('tabindex'),
              activeElement: document.activeElement?.getAttribute('data-id')
            }
          }
        }
      }
      return null
    })
    console.log('State after ArrowDown:', stateAfterArrow)
    
    // Check console logs
    console.log('Console logs:', consoleLogs)
    
    // Check if focus changed
    const secondItem = page.locator('#basic-list [data-id="basic-2"]')
    const isSecondFocused = await secondItem.evaluate(el => el === document.activeElement)
    console.log('Second item focused:', isSecondFocused)
    
    // Check the SelectionManager state
    const selectionState = await page.evaluate(() => {
      const container = document.getElementById('basic-list')
      const sortables = (window as any).sortables
      if (sortables && sortables.length > 0) {
        const sortable = sortables.find((s: any) => s.element === container)
        if (sortable && sortable.dragManager) {
          const selectionManager = sortable.dragManager.getSelectionManager()
          if (selectionManager) {
            return {
              hasFocused: !!selectionManager.getFocused(),
              focusedId: selectionManager.getFocused()?.getAttribute('data-id')
            }
          }
        }
      }
      return null
    })
    
    console.log('Selection state:', selectionState)
  })
})