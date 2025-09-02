import { expect, test } from '@playwright/test'

test.describe('drag and drop', () => {
  test('reorders items within list', async ({ page }) => {
    await page.goto('/')

    await page.dragAndDrop(
      '#list1 [data-id="item-1"]',
      '#list1 [data-id="item-3"]'
    )

    const order = await page.$$eval('#list1 .sortable-item', (els) =>
      els.map((el) => (el as HTMLElement).dataset.id)
    )
    expect(order).toEqual(['item-2', 'item-1', 'item-3', 'item-4'])
  })
})
