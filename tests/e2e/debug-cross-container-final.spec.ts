import { test, expect } from '@playwright/test'
import { getItemOrder } from '../helpers/drag-helpers'

test.describe('Cross-Container Drag - Final Verification', () => {
  test('verify cross-container drag works correctly', async ({ page }) => {
    console.log('\n=== Final Cross-Container Drag Verification ===')

    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    // Get initial state
    const initialList1 = await getItemOrder(
      page,
      '#multi-1',
      '.horizontal-item'
    )
    const initialList2 = await getItemOrder(
      page,
      '#multi-2',
      '.horizontal-item'
    )

    console.log('Initial state:')
    console.log('  List 1:', initialList1)
    console.log('  List 2:', initialList2)

    // Verify initial setup
    expect(initialList1).toEqual(['List 1 - A', 'List 1 - B', 'List 1 - C'])
    expect(initialList2).toEqual(['List 2 - X', 'List 2 - Y', 'List 2 - Z'])

    // Perform cross-container drag using Playwright's dragTo
    const sourceItem = page.locator('#multi-1 .horizontal-item').first()
    const targetContainer = page.locator('#multi-2')

    console.log('\nPerforming cross-container drag...')
    await sourceItem.dragTo(targetContainer)
    await page.waitForTimeout(500)

    // Check final state
    const finalList1 = await getItemOrder(page, '#multi-1', '.horizontal-item')
    const finalList2 = await getItemOrder(page, '#multi-2', '.horizontal-item')

    console.log('Final state:')
    console.log('  List 1:', finalList1)
    console.log('  List 2:', finalList2)

    // Verify cross-container movement occurred
    const itemMovedFromList1 = finalList1.length === 2
    const itemMovedToList2 = finalList2.length === 4
    const list1AItemMoved = !finalList1.includes('List 1 - A')
    const list2HasList1Item = finalList2.some((item) =>
      item.startsWith('List 1')
    )

    console.log('\nVerification results:')
    console.log('  Item moved from List 1:', itemMovedFromList1)
    console.log('  Item moved to List 2:', itemMovedToList2)
    console.log('  "List 1 - A" moved:', list1AItemMoved)
    console.log('  List 2 contains List 1 item:', list2HasList1Item)

    // Assert successful cross-container drag
    expect(itemMovedFromList1).toBe(true)
    expect(itemMovedToList2).toBe(true)
    expect(list1AItemMoved).toBe(true)
    expect(list2HasList1Item).toBe(true)

    // Verify total item count is preserved
    const totalItems = finalList1.length + finalList2.length
    expect(totalItems).toBe(6)

    console.log('\n✅ Cross-container drag functionality verified!')
  })

  test('verify group configuration', async ({ page }) => {
    await page.goto(
      'http://localhost:5173/html-tests/test-horizontal-list.html'
    )
    await page.waitForLoadState('networkidle')

    const config = await page.evaluate(() => {
      const multi1 = document.getElementById('multi-1')
      const multi2 = document.getElementById('multi-2')

      return {
        multi1Group: multi1?.dataset.sortableGroup,
        multi2Group: multi2?.dataset.sortableGroup,
        multi1DropZone: multi1?.dataset.dropZone,
        multi2DropZone: multi2?.dataset.dropZone,
        groupsMatch:
          multi1?.dataset.sortableGroup === multi2?.dataset.sortableGroup,
      }
    })

    console.log('Configuration check:', config)

    // Verify correct group configuration
    expect(config.multi1Group).toBe('shared-horizontal')
    expect(config.multi2Group).toBe('shared-horizontal')
    expect(config.multi1DropZone).toBe('true')
    expect(config.multi2DropZone).toBe('true')
    expect(config.groupsMatch).toBe(true)

    console.log('✅ Group configuration verified!')
  })
})