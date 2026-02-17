/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test'
import { dragAndDropWithAnimation } from './helpers/animations'

test.describe('Advanced Event Callbacks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator('#basic-list .sortable-item')).toHaveCount(4)
  })

  test('should fire onChoose event when element is chosen', async ({
    page,
  }) => {
    // Reconfigure basic-list with onChoose callback
    await page.evaluate(() => {
      const basicList = document.getElementById('basic-list')
      if (!basicList || !window.Sortable) return

      // Destroy existing instance and create new one with event tracking
      const existing = window.sortables?.find(
        (s: { el: HTMLElement }) => s.el === basicList
      )
      if (existing) (existing as { destroy: () => void }).destroy()

      window.eventLog = []
      new window.Sortable(basicList, {
        animation: 0,
        group: 'basic-test',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onChoose: (evt: any) => {
          window.eventLog?.push({
            type: 'choose',
            item: evt.item.dataset.id ?? '',
            oldIndex: evt.oldIndex,
          })
        },
      })
    })

    // Start dragging item basic-2
    const item2 = page.locator('#basic-list [data-id="basic-2"]')
    await item2.hover()
    await page.mouse.down()
    await page.waitForTimeout(50)

    // Check that onChoose was fired
    const eventLog = await page.evaluate(() => window.eventLog ?? [])
    expect(eventLog).toContainEqual({
      type: 'choose',
      item: 'basic-2',
      oldIndex: 1,
    })

    await page.mouse.up()
  })

  // onSort, onChange, and onMove fire during intermediate dragover events.
  // Playwright's HTML5 dragAndDrop() doesn't reliably trigger these intermediate
  // events because the drag is too atomic. These events work in manual testing
  // and via the pointer events path.
  test.skip('should fire onSort event when sorting changes', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const basicList = document.getElementById('basic-list')
      if (!basicList || !window.Sortable) return
      const existing = window.sortables?.find(
        (s: { el: HTMLElement }) => s.el === basicList
      )
      if (existing) (existing as { destroy: () => void }).destroy()
      window.eventLog = []
      new window.Sortable(basicList, {
        animation: 0,
        group: 'basic-test',
        ghostClass: 'sortable-ghost',
        onSort: (evt: any) => {
          window.eventLog?.push({
            type: 'sort',
            oldIndex: evt.oldIndex,
            newIndex: evt.newIndex,
          })
        },
      })
    })

    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-3"]'
    )

    const eventLog = await page.evaluate(() => window.eventLog ?? [])
    expect(eventLog.some((e: any) => e.type === 'sort')).toBeTruthy()
  })

  test.skip('should fire onChange event when order changes within same list', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const basicList = document.getElementById('basic-list')
      if (!basicList || !window.Sortable) return
      const existing = window.sortables?.find(
        (s: { el: HTMLElement }) => s.el === basicList
      )
      if (existing) (existing as { destroy: () => void }).destroy()
      window.eventLog = []
      new window.Sortable(basicList, {
        animation: 0,
        group: 'basic-test',
        ghostClass: 'sortable-ghost',
        onChange: (evt: any) => {
          window.eventLog?.push({
            type: 'change',
            item: evt.item.dataset.id ?? '',
          })
        },
      })
    })

    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-2"]'
    )

    const eventLog = await page.evaluate(() => window.eventLog ?? [])
    expect(eventLog.some((e: any) => e.type === 'change')).toBeTruthy()
  })

  test.skip('should fire onMove event during drag operations', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const basicList = document.getElementById('basic-list')
      if (!basicList || !window.Sortable) return
      const existing = window.sortables?.find(
        (s: { el: HTMLElement }) => s.el === basicList
      )
      if (existing) (existing as { destroy: () => void }).destroy()
      window.moveEventCount = 0
      new window.Sortable(basicList, {
        animation: 0,
        group: 'basic-test',
        ghostClass: 'sortable-ghost',
        onMove: (evt: any) => {
          window.moveEventCount = (window.moveEventCount ?? 0) + 1
          if (evt.related) {
            window.lastRelatedElement =
              evt.related.dataset.id ?? evt.related.textContent ?? ''
          }
        },
      })
    })

    const item1 = page.locator('#basic-list [data-id="basic-1"]')
    const item3 = page.locator('#basic-list [data-id="basic-3"]')

    await item1.hover()
    await page.mouse.down()

    const item3Box = await item3.boundingBox()
    if (!item3Box) throw new Error('Could not get bounding box for item3')
    await page.mouse.move(
      item3Box.x + item3Box.width / 2,
      item3Box.y + item3Box.height / 2
    )
    await page.waitForTimeout(100)
    await page.mouse.up()

    const moveCount = await page.evaluate(() => window.moveEventCount ?? 0)
    expect(moveCount).toBeGreaterThan(0)
  })

  test('should fire events in correct order during drag operation', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const basicList = document.getElementById('basic-list')
      if (!basicList || !window.Sortable) return
      const existing = window.sortables?.find(
        (s: { el: HTMLElement }) => s.el === basicList
      )
      if (existing) (existing as { destroy: () => void }).destroy()
      window.eventOrder = []
      new window.Sortable(basicList, {
        animation: 0,
        group: 'basic-test',
        ghostClass: 'sortable-ghost',
        onChoose: () => window.eventOrder?.push('choose'),
        onStart: () => window.eventOrder?.push('start'),
        onEnd: () => window.eventOrder?.push('end'),
      })
    })

    await dragAndDropWithAnimation(
      page,
      '#basic-list [data-id="basic-1"]',
      '#basic-list [data-id="basic-2"]'
    )

    const eventOrder: string[] = await page.evaluate(
      () => window.eventOrder ?? []
    )

    // Choose should come first
    expect(eventOrder.indexOf('choose')).toBe(0)

    // Start should come after choose
    expect(eventOrder.indexOf('start')).toBeGreaterThan(
      eventOrder.indexOf('choose')
    )

    // End should be last
    expect(eventOrder[eventOrder.length - 1]).toBe('end')
  })
})
