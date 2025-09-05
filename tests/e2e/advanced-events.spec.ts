import { test, expect } from '@playwright/test'

test.describe('Advanced Event Callbacks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should fire onChoose event when element is chosen', async ({ page }) => {
    await page.evaluate(() => {
      window.eventLog = []
      document.body.innerHTML = `
        <div id="test-list" style="padding: 20px;">
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item 1</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item 2</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item 3</div>
        </div>
      `
      const list = document.getElementById('test-list')
      const Sortable = window.Sortable as any
      if (!Sortable) return
      new Sortable(list, {
        onChoose: (evt) => {
          window.eventLog.push({
            type: 'choose',
            item: evt.item.textContent,
            oldIndex: evt.oldIndex
          })
        }
      })
    })

    // Start dragging item 2
    const item2 = page.locator('.sortable-item').nth(1)
    await item2.hover()
    await page.mouse.down()
    await page.waitForTimeout(50)
    
    // Check that onChoose was fired
    const eventLog = await page.evaluate(() => window.eventLog)
    expect(eventLog).toContainEqual({
      type: 'choose',
      item: 'Item 2',
      oldIndex: 1
    })
    
    await page.mouse.up()
  })

  test('should fire onSort event when sorting changes', async ({ page }) => {
    await page.evaluate(() => {
      window.eventLog = []
      document.body.innerHTML = `
        <div id="test-list" style="padding: 20px;">
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item A</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item B</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item C</div>
        </div>
      `
      const list = document.getElementById('test-list')
      const Sortable = window.Sortable as any
      if (!Sortable) return
      new Sortable(list, {
        animation: 0,
        onSort: (evt) => {
          window.eventLog.push({
            type: 'sort',
            oldIndex: evt.oldIndex,
            newIndex: evt.newIndex
          })
        }
      })
    })

    // Drag item A to position of item C
    const itemA = page.locator('.sortable-item').first()
    const itemC = page.locator('.sortable-item').nth(2)
    
    await itemA.dragTo(itemC)
    
    // Check that onSort was fired
    const eventLog = await page.evaluate(() => window.eventLog)
    expect(eventLog.some(e => e.type === 'sort')).toBeTruthy()
  })

  test('should fire onChange event when order changes within same list', async ({ page }) => {
    await page.evaluate(() => {
      window.eventLog = []
      document.body.innerHTML = `
        <div id="test-list" style="padding: 20px;">
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">First</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Second</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Third</div>
        </div>
      `
      const list = document.getElementById('test-list')
      const Sortable = window.Sortable as any
      if (!Sortable) return
      new Sortable(list, {
        animation: 0,
        onChange: (evt) => {
          window.eventLog.push({
            type: 'change',
            item: evt.item.textContent,
            oldIndex: evt.oldIndex,
            newIndex: evt.newIndex
          })
        }
      })
    })

    // Drag first item to second position
    const first = page.locator('.sortable-item').first()
    const second = page.locator('.sortable-item').nth(1)
    
    await first.dragTo(second)
    
    // Check that onChange was fired
    const eventLog = await page.evaluate(() => window.eventLog)
    expect(eventLog.some(e => e.type === 'change')).toBeTruthy()
    
    // Verify the new order
    const items = await page.locator('.sortable-item').allTextContents()
    expect(items).toEqual(['Second', 'First', 'Third'])
  })

  test('should fire onMove event during drag operations', async ({ page }) => {
    await page.evaluate(() => {
      window.moveEventCount = 0
      document.body.innerHTML = `
        <div id="test-list" style="padding: 20px;">
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item 1</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item 2</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Item 3</div>
        </div>
      `
      const list = document.getElementById('test-list')
      const Sortable = window.Sortable as any
      if (!Sortable) return
      new Sortable(list, {
        animation: 0,
        onMove: (evt) => {
          window.moveEventCount++
          // Check that related element is provided
          if (evt.related) {
            window.lastRelatedElement = evt.related.textContent
          }
        }
      })
    })

    const item1 = page.locator('.sortable-item').first()
    const item2 = page.locator('.sortable-item').nth(1)
    const item3 = page.locator('.sortable-item').nth(2)
    
    // Start drag on item1
    await item1.hover()
    await page.mouse.down()
    
    // Move over item2
    const item2Box = await item2.boundingBox()
    await page.mouse.move(item2Box!.x + 10, item2Box!.y + item2Box!.height / 2)
    await page.waitForTimeout(100)
    
    // Move over item3
    const item3Box = await item3.boundingBox()
    await page.mouse.move(item3Box!.x + 10, item3Box!.y + item3Box!.height / 2)
    await page.waitForTimeout(100)
    
    await page.mouse.up()
    
    // Check that onMove was fired multiple times
    const moveCount = await page.evaluate(() => window.moveEventCount)
    expect(moveCount).toBeGreaterThan(0)
    
    // Check that related element was tracked
    const lastRelated = await page.evaluate(() => window.lastRelatedElement)
    expect(lastRelated).toBeTruthy()
  })

  test('should include MoveEvent properties in onMove callback', async ({ page }) => {
    await page.evaluate(() => {
      window.moveEventData = null
      document.body.innerHTML = `
        <div id="test-list" style="padding: 20px;">
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Alpha</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Beta</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Gamma</div>
        </div>
      `
      const list = document.getElementById('test-list')
      const Sortable = window.Sortable as any
      if (!Sortable) return
      new Sortable(list, {
        animation: 0,
        onMove: (evt) => {
          window.moveEventData = {
            hasRelated: !!evt.related,
            hasWillInsertAfter: evt.willInsertAfter !== undefined,
            hasDraggedRect: !!evt.draggedRect,
            hasTargetRect: !!evt.targetRect
          }
        }
      })
    })

    const alpha = page.locator('.sortable-item').first()
    const beta = page.locator('.sortable-item').nth(1)
    
    // Drag alpha over beta
    await alpha.hover()
    await page.mouse.down()
    
    const betaBox = await beta.boundingBox()
    await page.mouse.move(betaBox!.x + 10, betaBox!.y + betaBox!.height / 2)
    await page.waitForTimeout(100)
    await page.mouse.up()
    
    // Check that MoveEvent had all expected properties
    const moveData = await page.evaluate(() => window.moveEventData)
    expect(moveData).toEqual({
      hasRelated: true,
      hasWillInsertAfter: true,
      hasDraggedRect: true,
      hasTargetRect: true
    })
  })

  test('should fire events in correct order during drag operation', async ({ page }) => {
    await page.evaluate(() => {
      window.eventOrder = []
      document.body.innerHTML = `
        <div id="test-list" style="padding: 20px;">
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">One</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Two</div>
          <div class="sortable-item" style="padding: 20px; margin: 5px; background: #f0f0f0;">Three</div>
        </div>
      `
      const list = document.getElementById('test-list')
      const Sortable = window.Sortable as any
      if (!Sortable) return
      new Sortable(list, {
        animation: 0,
        onChoose: () => window.eventOrder.push('choose'),
        onStart: () => window.eventOrder.push('start'),
        onMove: () => {
          if (!window.eventOrder.includes('move')) {
            window.eventOrder.push('move')
          }
        },
        onSort: () => window.eventOrder.push('sort'),
        onChange: () => window.eventOrder.push('change'),
        onUpdate: () => window.eventOrder.push('update'),
        onEnd: () => window.eventOrder.push('end')
      })
    })

    // Perform a drag operation
    const one = page.locator('.sortable-item').first()
    const two = page.locator('.sortable-item').nth(1)
    
    await one.dragTo(two)
    
    // Check event order
    const eventOrder = await page.evaluate(() => window.eventOrder)
    
    // Choose should come before start
    const chooseIndex = eventOrder.indexOf('choose')
    const startIndex = eventOrder.indexOf('start')
    expect(chooseIndex).toBeLessThan(startIndex)
    
    // Start should come before move
    const moveIndex = eventOrder.indexOf('move')
    expect(startIndex).toBeLessThan(moveIndex)
    
    // End should be last
    expect(eventOrder[eventOrder.length - 1]).toBe('end')
  })
})