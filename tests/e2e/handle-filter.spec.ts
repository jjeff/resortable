import { expect, test } from '@playwright/test'
import { center, pointerDrag } from './helpers/pointer-drag'

test.describe('Handle and Filter Options', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test.describe('Handle Option', () => {
    test('should only allow drag when initiated from handle', async ({
      page,
    }) => {
      // Initialize sortable with handle option
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'handle-test'
        container.innerHTML = `
          <div class="sortable-item" data-id="item-1">
            <span class="drag-handle">≡</span>
            <span>Item 1</span>
          </div>
          <div class="sortable-item" data-id="item-2">
            <span class="drag-handle">≡</span>
            <span>Item 2</span>
          </div>
          <div class="sortable-item" data-id="item-3">
            <span class="drag-handle">≡</span>
            <span>Item 3</span>
          </div>
        `
        document.body.appendChild(container)

        interface WindowWithSortable extends Window {
          Sortable?: typeof import('../../src/index.js').Sortable
        }
        const win = window as WindowWithSortable
        const Sortable = win.Sortable
        if (Sortable) {
          new Sortable(container, {
            handle: '.drag-handle',
            animation: 0,
          })
        }
      })

      const secondItem = page.locator('#handle-test [data-id="item-2"]')

      // Try to drag from non-handle area (should not work)
      const textPoint = await center(
        page,
        '#handle-test [data-id="item-1"] span:nth-child(2)'
      )
      const belowSecondItem = await center(
        page,
        '#handle-test [data-id="item-2"]'
      )
      await pointerDrag(page, textPoint, {
        x: belowSecondItem.x,
        y: belowSecondItem.y + 40,
      })

      // Verify order hasn't changed
      const items = page.locator('#handle-test .sortable-item')
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-1')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-2')
      await expect(items.nth(2)).toHaveAttribute('data-id', 'item-3')

      // Now drag from handle (should work) — move to below the second item.
      const handlePoint = await center(
        page,
        '#handle-test [data-id="item-1"] .drag-handle'
      )
      const secondBox = await secondItem.boundingBox()
      if (!secondBox) throw new Error('missing bounding box for second item')
      await pointerDrag(page, handlePoint, {
        x: secondBox.x + secondBox.width / 2,
        y: secondBox.y + secondBox.height + 10,
      })

      // Verify order has changed - item-1 should now be moved
      // Due to drag positioning variations across browsers, check that item-2 is first
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-2')
      // And that the items have been reordered
      const newOrder = await items.evaluateAll((els) =>
        els.map((el) => el.dataset.id)
      )
      expect(newOrder).not.toEqual(['item-1', 'item-2', 'item-3'])
      expect(newOrder).toContain('item-1')
      expect(newOrder).toContain('item-2')
      expect(newOrder).toContain('item-3')
    })

    test('should work with nested handle elements', async ({ page }) => {
      // Initialize sortable with nested handle structure
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'nested-handle-test'
        container.innerHTML = `
          <div class="sortable-item" data-id="item-1">
            <div class="drag-handle">
              <svg><path d="M0 0L10 10"></path></svg>
            </div>
            <span>Item 1</span>
          </div>
          <div class="sortable-item" data-id="item-2">
            <div class="drag-handle">
              <svg><path d="M0 0L10 10"></path></svg>
            </div>
            <span>Item 2</span>
          </div>
        `
        document.body.appendChild(container)

        interface WindowWithSortable extends Window {
          Sortable?: typeof import('../../src/index.js').Sortable
        }
        const win = window as WindowWithSortable
        const Sortable = win.Sortable
        if (Sortable) {
          new Sortable(container, {
            handle: '.drag-handle',
            animation: 0,
          })
        }
      })

      // Drag from nested SVG element within handle (should work)
      const svgPoint = await center(
        page,
        '#nested-handle-test [data-id="item-1"] .drag-handle svg'
      )
      const secondItemPoint = await center(
        page,
        '#nested-handle-test [data-id="item-2"]'
      )
      await pointerDrag(page, svgPoint, secondItemPoint)

      // Verify order has changed
      const items = page.locator('#nested-handle-test .sortable-item')
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-2')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-1')
    })
  })

  test.describe('Filter Option', () => {
    test('should prevent drag when initiated from filtered elements', async ({
      page,
    }) => {
      // Initialize sortable with filter option
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'filter-test'
        container.innerHTML = `
          <div class="sortable-item" data-id="item-1">
            <input type="text" placeholder="Edit me" />
            <span>Item 1</span>
          </div>
          <div class="sortable-item" data-id="item-2">
            <button>Click me</button>
            <span>Item 2</span>
          </div>
          <div class="sortable-item" data-id="item-3">
            <span>Item 3 (draggable)</span>
          </div>
        `
        document.body.appendChild(container)

        interface WindowWithSortable extends Window {
          Sortable?: typeof import('../../src/index.js').Sortable
        }
        const win = window as WindowWithSortable
        const Sortable = win.Sortable
        if (Sortable) {
          new Sortable(container, {
            filter: 'input, button',
            animation: 0,
          })
        }
      })

      const items = page.locator('#filter-test .sortable-item')
      const thirdItemPoint = await center(
        page,
        '#filter-test [data-id="item-3"]'
      )

      // Try to drag from input (should not work)
      const inputPoint = await center(
        page,
        '#filter-test [data-id="item-1"] input'
      )
      await pointerDrag(page, inputPoint, thirdItemPoint)

      // Verify order hasn't changed
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-1')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-2')
      await expect(items.nth(2)).toHaveAttribute('data-id', 'item-3')

      // Try to drag from button (should not work)
      const buttonPoint = await center(
        page,
        '#filter-test [data-id="item-2"] button'
      )
      await pointerDrag(page, buttonPoint, thirdItemPoint)

      // Verify order still hasn't changed
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-1')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-2')
      await expect(items.nth(2)).toHaveAttribute('data-id', 'item-3')

      // Drag from non-filtered area (should work)
      const itemTextPoint = await center(
        page,
        '#filter-test [data-id="item-1"] span'
      )
      await pointerDrag(page, itemTextPoint, thirdItemPoint)

      // Verify order has changed
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-2')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-3')
      await expect(items.nth(2)).toHaveAttribute('data-id', 'item-1')
    })

    test('should call onFilter callback when filtered element is clicked', async ({
      page,
    }) => {
      // Track onFilter calls
      const filterCalls: string[] = []
      await page.exposeFunction('recordFilterCall', (target: string) => {
        filterCalls.push(target)
      })

      // Initialize sortable with filter and onFilter callback
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'filter-callback-test'
        container.innerHTML = `
          <div class="sortable-item" data-id="item-1">
            <button class="edit-btn">Edit</button>
            <span>Item 1</span>
          </div>
          <div class="sortable-item" data-id="item-2">
            <button class="delete-btn">Delete</button>
            <span>Item 2</span>
          </div>
        `
        document.body.appendChild(container)

        interface WindowWithSortable extends Window {
          Sortable?: typeof import('../../src/index.js').Sortable
          recordFilterCall?: (target: string) => void
        }
        const win = window as WindowWithSortable
        const Sortable = win.Sortable
        if (Sortable) {
          new Sortable(container, {
            filter: 'button',
            onFilter: (event) => {
              const target = event.target as HTMLElement
              if (win.recordFilterCall) {
                win.recordFilterCall(target.className)
              }
            },
            animation: 0,
          })
        }
      })

      // Try to drag from edit button
      const editBtnPoint = await center(page, '#filter-callback-test .edit-btn')
      await pointerDrag(page, editBtnPoint, { x: 100, y: 100 })

      // Try to drag from delete button
      const deleteBtnPoint = await center(
        page,
        '#filter-callback-test .delete-btn'
      )
      await pointerDrag(page, deleteBtnPoint, { x: 100, y: 100 })

      // Verify onFilter was called for both buttons
      expect(filterCalls).toContain('edit-btn')
      expect(filterCalls).toContain('delete-btn')
    })
  })

  test.describe('Handle and Filter Combined', () => {
    test('should respect both handle and filter options', async ({ page }) => {
      // Initialize sortable with both handle and filter
      await page.evaluate(() => {
        const container = document.createElement('div')
        container.id = 'combined-test'
        container.innerHTML = `
          <div class="sortable-item" data-id="item-1">
            <span class="drag-handle">
              <button>≡</button>
            </span>
            <input type="text" />
            <span>Item 1</span>
          </div>
          <div class="sortable-item" data-id="item-2">
            <span class="drag-handle">≡</span>
            <span>Item 2</span>
          </div>
        `
        document.body.appendChild(container)

        interface WindowWithSortable extends Window {
          Sortable?: typeof import('../../src/index.js').Sortable
        }
        const win = window as WindowWithSortable
        const Sortable = win.Sortable
        if (Sortable) {
          new Sortable(container, {
            handle: '.drag-handle',
            filter: 'button, input',
            animation: 0,
          })
        }
      })

      const items = page.locator('#combined-test .sortable-item')
      const secondItemPoint = await center(
        page,
        '#combined-test [data-id="item-2"]'
      )

      // Try to drag from button inside handle (should not work - filtered)
      const handleButtonPoint = await center(
        page,
        '#combined-test [data-id="item-1"] .drag-handle button'
      )
      await pointerDrag(page, handleButtonPoint, secondItemPoint)

      // Verify order hasn't changed
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-1')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-2')

      // Try to drag from input (should not work - filtered and not handle)
      const inputPoint = await center(
        page,
        '#combined-test [data-id="item-1"] input'
      )
      await pointerDrag(page, inputPoint, secondItemPoint)

      // Verify order still hasn't changed
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-1')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-2')

      // Drag from handle text area (should work)
      const handleTextPoint = await center(
        page,
        '#combined-test [data-id="item-2"] .drag-handle'
      )
      const firstItemPoint = await center(
        page,
        '#combined-test [data-id="item-1"]'
      )
      await pointerDrag(page, handleTextPoint, firstItemPoint)

      // Verify order has changed
      await expect(items.nth(0)).toHaveAttribute('data-id', 'item-2')
      await expect(items.nth(1)).toHaveAttribute('data-id', 'item-1')
    })
  })
})
