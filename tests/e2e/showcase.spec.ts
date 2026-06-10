import { expect, test } from '@playwright/test'

test.describe('Showcase Page Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for a specific element instead of networkidle (much faster)
    await page.waitForSelector('.hero h1', { state: 'visible', timeout: 5000 })
  })

  test('should display hero section with badges', async ({ page }) => {
    await expect(page.locator('.hero h1')).toHaveText('Resortable')
    await expect(page.locator('.badge')).toHaveCount(6)
  })

  test('visual effects demos should be draggable', async ({ page }) => {
    // Test smooth list
    const smoothList = page.locator('#smooth-list')
    await expect(smoothList).toBeVisible()

    // Exclude the pointer-driven ghost clone from item enumeration. PR2 #29
    // changed the default `fallbackOnBody` from implicit-true to false, so
    // mid-drag the ghost lives inside the zone and would otherwise satisfy
    // `.sortable-item` queries (it is a deep clone of a sortable item).
    const smoothItems = smoothList.locator(
      '.sortable-item:not(.sortable-ghost)'
    )
    await expect(smoothItems).toHaveCount(4)

    // Verify items can be dragged
    const firstItem = smoothItems.first()
    const lastItem = smoothItems.last()

    await firstItem.dragTo(lastItem)

    // Verify order changed
    await expect(smoothItems.first()).toHaveAttribute('data-id', 'smooth-2')
  })

  test('kanban board should allow dragging between columns', async ({
    page,
  }) => {
    const todoColumn = page.locator('#kanban-todo')
    const doingColumn = page.locator('#kanban-doing')

    const todoCards = todoColumn.locator('.kanban-card')
    const doingCards = doingColumn.locator('.kanban-card')

    // Initial counts
    await expect(todoCards).toHaveCount(3)
    await expect(doingCards).toHaveCount(2)

    // Drag first todo to doing column
    await todoCards.first().dragTo(doingColumn)

    // Verify counts changed
    await expect(todoCards).toHaveCount(2)
    await expect(doingCards).toHaveCount(3)
  })

  test('image gallery should be reorderable', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'Mobile Safari',
      'dragAndDrop non-deterministic on Mobile Safari/WebKit emulation — tracked in #62'
    )
    const gallery = page.locator('#image-gallery')
    const items = gallery.locator('.gallery-item')

    await expect(items).toHaveCount(8)

    // Drag first image to third position
    await items.first().dragTo(items.nth(2))

    // Verify order changed
    await expect(items.first()).toHaveAttribute('data-id', 'img-2')
  })

  test('basic list in developer section should remain functional', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'Mobile Safari',
      'dragAndDrop non-deterministic on Mobile Safari/WebKit emulation — tracked in #62'
    )
    // #basic-list moved from / to /playground.html when the showcase split
    // into a polished landing + bare dev playground.
    await page.goto('/playground.html')
    const basicList = page.locator('#basic-list')
    await expect(basicList).toBeVisible()

    // Filter out the in-zone ghost clone — see note in 'visual effects demos
    // should be draggable' above for the PR2 #29 rationale.
    const items = basicList.locator('.sortable-item:not(.sortable-ghost)')
    await expect(items).toHaveCount(4)

    // Test dragging
    await items.first().dragTo(items.last())
    await expect(items.first()).toHaveAttribute('data-id', 'basic-2')
  })
})
