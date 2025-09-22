import { test, expect } from '@playwright/test'

test.describe('Inline-block Drag and Drop Debug', () => {
  test('Test inline-block elements on test-inline-block-bug.html', async ({
    page,
  }) => {
    // Navigate to the first test page
    await page.goto('/html-tests/test-inline-block-bug.html')

    // Wait for initialization
    await page.waitForTimeout(1000)

    // Take initial screenshot
    await page.screenshot({
      path: 'test-results/inline-block-bug-initial.png',
      fullPage: true,
    })

    // Get the inline-block items
    const inlineItems = page.locator('#inline-container .inline-item')
    await expect(inlineItems).toHaveCount(4)

    // Check if draggable attributes are set
    for (let i = 0; i < 4; i++) {
      const item = inlineItems.nth(i)
      const draggableAttr = await item.getAttribute('draggable')
      console.log(`Inline item ${i}: draggable=${draggableAttr}`)
    }

    // Get computed styles for the first inline item
    const firstItem = inlineItems.first()
    const computedStyle = await firstItem.evaluate((el) => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        position: style.position,
        transform: style.transform,
        cursor: style.cursor,
        userSelect: style.userSelect,
        pointerEvents: style.pointerEvents,
      }
    })
    console.log('First inline item computed styles:', computedStyle)

    // Test drag and drop
    console.log('Testing drag from first to third item...')

    // Get initial text content
    const initialOrder = await inlineItems.allTextContents()
    console.log('Initial order:', initialOrder)

    // Attempt to drag first item to third position
    const firstItemBox = await firstItem.boundingBox()
    const thirdItem = inlineItems.nth(2)
    const thirdItemBox = await thirdItem.boundingBox()

    if (firstItemBox && thirdItemBox) {
      // Start drag
      await page.mouse.move(
        firstItemBox.x + firstItemBox.width / 2,
        firstItemBox.y + firstItemBox.height / 2
      )
      await page.mouse.down()

      // Take screenshot during drag start
      await page.screenshot({
        path: 'test-results/inline-block-bug-drag-start.png',
      })

      // Move to target
      await page.mouse.move(
        thirdItemBox.x + thirdItemBox.width / 2,
        thirdItemBox.y + thirdItemBox.height / 2,
        { steps: 5 }
      )

      // Take screenshot during drag
      await page.screenshot({
        path: 'test-results/inline-block-bug-during-drag.png',
      })

      // Drop
      await page.mouse.up()

      // Wait for animation
      await page.waitForTimeout(500)

      // Take final screenshot
      await page.screenshot({
        path: 'test-results/inline-block-bug-after-drag.png',
      })

      // Check final order
      const finalOrder = await inlineItems.allTextContents()
      console.log('Final order:', finalOrder)

      // Check if order changed
      const orderChanged =
        JSON.stringify(initialOrder) !== JSON.stringify(finalOrder)
      console.log('Order changed:', orderChanged)
    }

    // Check console logs for any errors
    const logs: string[] = []
    page.on('console', (msg) => logs.push(msg.text()))

    // Wait a bit more to see if there are any delayed logs
    await page.waitForTimeout(1000)

    console.log('Console logs:', logs)
  })

  test('Test inline-block elements on test-horizontal-list.html', async ({
    page,
  }) => {
    // Navigate to the second test page
    await page.goto('/html-tests/test-horizontal-list.html')

    // Wait for initialization
    await page.waitForTimeout(1000)

    // Take initial screenshot
    await page.screenshot({
      path: 'test-results/horizontal-list-initial.png',
      fullPage: true,
    })

    // Focus on the inline-block section
    const inlineSection = page.locator('#inline-list')
    const inlineItems = page.locator('#inline-list .inline-item')
    await expect(inlineItems).toHaveCount(5)

    // Check if draggable attributes are set
    for (let i = 0; i < 5; i++) {
      const item = inlineItems.nth(i)
      const draggableAttr = await item.getAttribute('draggable')
      console.log(`Horizontal inline item ${i}: draggable=${draggableAttr}`)
    }

    // Get computed styles for the first inline item
    const firstItem = inlineItems.first()
    const computedStyle = await firstItem.evaluate((el) => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        position: style.position,
        transform: style.transform,
        cursor: style.cursor,
        userSelect: style.userSelect,
        pointerEvents: style.pointerEvents,
        verticalAlign: style.verticalAlign,
        marginRight: style.marginRight,
      }
    })
    console.log('First horizontal inline item computed styles:', computedStyle)

    // Get container styles
    const containerStyle = await inlineSection.evaluate((el) => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        whiteSpace: style.whiteSpace,
        overflowX: style.overflowX,
        minHeight: style.minHeight,
      }
    })
    console.log('Inline container styles:', containerStyle)

    // Test drag and drop
    console.log('Testing drag from first to third item in horizontal list...')

    // Get initial text content
    const initialOrder = await inlineItems.allTextContents()
    console.log('Initial order:', initialOrder)

    // Attempt to drag first item to third position
    const firstItemBox = await firstItem.boundingBox()
    const thirdItem = inlineItems.nth(2)
    const thirdItemBox = await thirdItem.boundingBox()

    if (firstItemBox && thirdItemBox) {
      // Start drag
      await page.mouse.move(
        firstItemBox.x + firstItemBox.width / 2,
        firstItemBox.y + firstItemBox.height / 2
      )
      await page.mouse.down()

      // Take screenshot during drag start
      await page.screenshot({
        path: 'test-results/horizontal-list-drag-start.png',
      })

      // Move to target
      await page.mouse.move(
        thirdItemBox.x + thirdItemBox.width / 2,
        thirdItemBox.y + thirdItemBox.height / 2,
        { steps: 5 }
      )

      // Take screenshot during drag
      await page.screenshot({
        path: 'test-results/horizontal-list-during-drag.png',
      })

      // Drop
      await page.mouse.up()

      // Wait for animation
      await page.waitForTimeout(500)

      // Take final screenshot
      await page.screenshot({
        path: 'test-results/horizontal-list-after-drag.png',
      })

      // Check final order
      const finalOrder = await inlineItems.allTextContents()
      console.log('Final order:', finalOrder)

      // Check if order changed
      const orderChanged =
        JSON.stringify(initialOrder) !== JSON.stringify(finalOrder)
      console.log('Order changed:', orderChanged)
    }

    // Test the flexbox list as a comparison
    console.log('Testing flexbox list for comparison...')
    const flexItems = page.locator('#flex-list .horizontal-item')
    const flexInitialOrder = await flexItems.allTextContents()
    console.log('Flex initial order:', flexInitialOrder)

    const firstFlexItem = flexItems.first()
    const thirdFlexItem = flexItems.nth(2)

    const firstFlexBox = await firstFlexItem.boundingBox()
    const thirdFlexBox = await thirdFlexItem.boundingBox()

    if (firstFlexBox && thirdFlexBox) {
      await page.mouse.move(
        firstFlexBox.x + firstFlexBox.width / 2,
        firstFlexBox.y + firstFlexBox.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        thirdFlexBox.x + thirdFlexBox.width / 2,
        thirdFlexBox.y + thirdFlexBox.height / 2,
        { steps: 5 }
      )
      await page.mouse.up()
      await page.waitForTimeout(500)

      const flexFinalOrder = await flexItems.allTextContents()
      console.log('Flex final order:', flexFinalOrder)

      const flexOrderChanged =
        JSON.stringify(flexInitialOrder) !== JSON.stringify(flexFinalOrder)
      console.log('Flex order changed:', flexOrderChanged)
    }
  })
})
