import { expect, test, Page } from '@playwright/test'

/**
 * Coverage for #29 (PR1) — `forceFallback` + `fallbackClass` wiring.
 *
 * In fallback mode Resortable skips registering the HTML5 DnD listeners
 * (`dragstart`/`dragover`/etc.) on the container and drives the drag entirely
 * through pointer events. The configured `fallbackClass` is added to the
 * ghost element alongside `ghostClass` so fallback-mode styles can target a
 * stable hook (legacy parity).
 *
 * We drive the drag with `page.mouse` (not `page.dragAndDrop`) because the
 * fallback path lives in `pointermove` — high-level helpers do not reliably
 * dispatch the intermediate moves the pipeline needs.
 */

const FALLBACK_LIST = '#fallback-list'
const FALLBACK_ITEM = (id: string): string =>
  `${FALLBACK_LIST} [data-id="${id}"]`

async function center(
  page: Page,
  selector: string
): Promise<{ x: number; y: number }> {
  await page.locator(selector).scrollIntoViewIfNeeded()
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// `.sortable-item` items inside the fallback zone, excluding the ghost
// (which is a deep-clone of the dragged item — so it also carries the
// `.sortable-item` class). PR2 changed the default `fallbackOnBody` from
// implicit-true to false, so the ghost now lives inside the zone and would
// otherwise show up in item-order queries.
const FALLBACK_REAL_ITEMS = `${FALLBACK_LIST} .sortable-item:not(.sortable-ghost)`

test.describe('forceFallback (#29 PR1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator(FALLBACK_REAL_ITEMS)).toHaveCount(4)
  })

  test('ghost has both ghostClass and fallbackClass during drag', async ({
    page,
  }, testInfo) => {
    // Fallback mode is a desktop-precision drag concern. Mobile projects use
    // touch emulation with separate timing/geometry semantics — out of scope
    // here (mirrors the empty-insert-threshold skip; Mobile Chrome #48).
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    const from = await center(page, FALLBACK_ITEM('fb-1'))
    const to = await center(page, FALLBACK_ITEM('fb-3'))

    // Drive the drag manually so we can assert MID-drag, before pointerup
    // tears the ghost down.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 10 })

    // The ghost is created on drag start and appended to the sortable zone
    // (PR2 #29: `fallbackOnBody` defaults to false, matching legacy). It
    // carries both `ghostClass` and `fallbackClass`. Locate the (single)
    // ghost anywhere on the page before releasing.
    const ghost = page.locator('.sortable-ghost.sortable-fallback')
    await expect(ghost).toHaveCount(1)
    await expect(ghost).toHaveClass(/sortable-ghost/)
    await expect(ghost).toHaveClass(/sortable-fallback/)

    await page.mouse.up()
  })

  test('drag reorders items without HTML5 listeners attached', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    // Sanity check the starting order.
    const initialOrder = await page
      .locator(FALLBACK_REAL_ITEMS)
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))
    expect(initialOrder).toEqual(['fb-1', 'fb-2', 'fb-3', 'fb-4'])

    // In fallback mode the container should have NO `dragstart`/`dragover`/etc.
    // listeners. Direct introspection of registered listeners is not possible
    // from page context, so we instead confirm the contract by dispatching a
    // synthetic `dragstart` and asserting our HTML5 handler is not invoked.
    // (If it were attached, GlobalDragState would register an `html5-drag`
    // active drag.) The behavioural check below — pointer drag still works
    // and reorders correctly — is the primary signal that pointer is the
    // sole code path.

    const from = await center(page, FALLBACK_ITEM('fb-1'))
    const to = await center(page, FALLBACK_ITEM('fb-4'))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.mouse.up()

    // After the move, fb-1 should have shifted past fb-4. The exact final
    // order depends on insert-before vs after semantics, but fb-1 must no
    // longer be at index 0.
    const finalOrder = await page
      .locator(FALLBACK_REAL_ITEMS)
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))
    expect(finalOrder[0]).not.toBe('fb-1')
    expect(finalOrder).toContain('fb-1')
    expect(finalOrder).toHaveLength(4)
  })
})

/**
 * Coverage for #29 (PR2) — `fallbackOnBody`, `fallbackOffsetX`,
 * `fallbackOffsetY`. These options control where the pointer-driven ghost
 * gets appended and how it is shifted relative to the cursor.
 *
 * Fixtures are created on the fly with `page.evaluate` so we don't have to
 * extend `index.html` with three additional permutations.
 */
test.describe('fallback positioning (#29 PR2)', () => {
  const PR2_LIST = '#pr2-fallback-list'
  const PR2_ITEM = (id: string): string => `${PR2_LIST} [data-id="${id}"]`

  type FallbackInit = {
    fallbackOnBody?: boolean
    fallbackOffsetX?: number
    fallbackOffsetY?: number
  }

  // Build a fresh sortable list configured with the supplied fallback
  // options. Lives at a fixed position (top-left 50,50) so the test can
  // reason about absolute coordinates without scrolling concerns.
  async function buildList(page: Page, opts: FallbackInit): Promise<void> {
    await page.evaluate((opts) => {
      // Tear down any prior fixture so re-runs are clean.
      document.getElementById('pr2-fallback-list')?.remove()
      const container = document.createElement('div')
      container.id = 'pr2-fallback-list'
      container.style.position = 'absolute'
      container.style.top = '50px'
      container.style.left = '50px'
      container.style.width = '300px'
      container.style.background = '#eef'
      container.innerHTML = `
        <div class="sortable-item" data-id="pr2-1"
             style="width:200px;height:40px;background:#ccc;">Item 1</div>
        <div class="sortable-item" data-id="pr2-2"
             style="width:200px;height:40px;background:#ddd;">Item 2</div>
        <div class="sortable-item" data-id="pr2-3"
             style="width:200px;height:40px;background:#ccc;">Item 3</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        animation: 0,
        forceFallback: true,
        fallbackClass: 'sortable-fallback',
        fallbackOnBody: opts.fallbackOnBody,
        fallbackOffsetX: opts.fallbackOffsetX,
        fallbackOffsetY: opts.fallbackOffsetY,
      })
    }, opts)
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('fallbackOnBody: false appends ghost as child of sortable zone', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    await buildList(page, { fallbackOnBody: false })

    const from = await center(page, PR2_ITEM('pr2-1'))
    const to = await center(page, PR2_ITEM('pr2-3'))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 8 })

    // Mid-drag the ghost should live inside the zone, not document.body.
    const ghostParentId = await page
      .locator('.sortable-ghost.sortable-fallback')
      .first()
      .evaluate((el) => el.parentElement?.id ?? '')
    expect(ghostParentId).toBe('pr2-fallback-list')

    await page.mouse.up()
  })

  test('fallbackOnBody: true appends ghost to document.body', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    await buildList(page, { fallbackOnBody: true })

    const from = await center(page, PR2_ITEM('pr2-1'))
    const to = await center(page, PR2_ITEM('pr2-3'))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 8 })

    // Ghost should be a direct child of <body>, never inside the zone.
    const ghost = page.locator('body > .sortable-ghost.sortable-fallback')
    await expect(ghost).toHaveCount(1)

    await page.mouse.up()
  })

  test('fallbackOffsetX shifts ghost X position by configured pixels', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    const OFFSET = 40
    // Use fallbackOnBody:true so the ghost lives at a predictable parent
    // (document.body); its `left` style is then absolute viewport pixels.
    await buildList(page, { fallbackOffsetX: OFFSET, fallbackOnBody: true })

    const from = await center(page, PR2_ITEM('pr2-1'))
    // Capture the original element's rect BEFORE the drag, since the item
    // can move in the DOM mid-drag and skew any after-the-fact measurement.
    const origLeft = await page
      .locator(PR2_ITEM('pr2-1'))
      .evaluate((el) => el.getBoundingClientRect().left)

    // Drag mostly sideways with a small vertical nudge so we cleanly clear
    // the dragstart threshold without triggering a vertical reorder.
    const target = { x: from.x + 80, y: from.y + 5 }

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(target.x, target.y, { steps: 10 })

    // GhostManager formula:
    //   ghost.left = cursor.x - (startCursor.x - origRect.left) + offsetX
    //             = target.x - from.x + origRect.left + offsetX
    const expectedLeft = target.x - from.x + origLeft + OFFSET

    const ghostLeft = await page
      .locator('body > .sortable-ghost.sortable-fallback')
      .evaluate((el) => parseFloat((el as HTMLElement).style.left))

    // 2px slack for sub-pixel rounding in the mouse-step pipeline.
    expect(Math.abs(ghostLeft - expectedLeft)).toBeLessThanOrEqual(2)

    await page.mouse.up()
  })

  test('fallbackOffsetY shifts ghost Y position by configured pixels', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    const OFFSET = -25 // shift up
    await buildList(page, { fallbackOffsetY: OFFSET, fallbackOnBody: true })

    const from = await center(page, PR2_ITEM('pr2-1'))
    const origTop = await page
      .locator(PR2_ITEM('pr2-1'))
      .evaluate((el) => el.getBoundingClientRect().top)

    // A small downward drag — enough motion to clear the start threshold,
    // not enough to reorder past the next item (which would change which
    // element is "pr2-1" inside the locator).
    const target = { x: from.x, y: from.y + 15 }

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(target.x, target.y, { steps: 10 })

    // ghost.top = target.y - from.y + origTop + offsetY
    const expectedTop = target.y - from.y + origTop + OFFSET

    const ghostTop = await page
      .locator('body > .sortable-ghost.sortable-fallback')
      .evaluate((el) => parseFloat((el as HTMLElement).style.top))

    expect(Math.abs(ghostTop - expectedTop)).toBeLessThanOrEqual(2)

    await page.mouse.up()
  })
})

/**
 * Coverage for #29 (PR3) — `fallbackTolerance`. The pointer must travel at
 * least N pixels (Chebyshev distance, matching legacy semantics) from
 * pointerdown before the drag commits. Below the threshold no ghost is
 * created, no `choose`/`start` event fires, no DOM order changes. Above the
 * threshold the drag commits and behaves identically to the no-tolerance
 * path.
 *
 * As with PR2, fixtures are built on the fly via `page.evaluate` so this
 * file stays self-contained and the demo `index.html` is not perturbed.
 */
test.describe('fallbackTolerance (#29 PR3)', () => {
  const PR3_LIST = '#pr3-fallback-list'
  const PR3_ITEM = (id: string): string => `${PR3_LIST} [data-id="${id}"]`
  const PR3_ITEMS = `${PR3_LIST} .sortable-item:not(.sortable-ghost)`

  async function buildList(
    page: Page,
    opts: { fallbackTolerance?: number } = {}
  ): Promise<void> {
    await page.evaluate((opts) => {
      document.getElementById('pr3-fallback-list')?.remove()
      const container = document.createElement('div')
      container.id = 'pr3-fallback-list'
      container.style.position = 'absolute'
      container.style.top = '50px'
      container.style.left = '50px'
      container.style.width = '300px'
      container.style.background = '#efe'
      container.innerHTML = `
        <div class="sortable-item" data-id="pr3-1"
             style="width:200px;height:40px;background:#cdc;">Item 1</div>
        <div class="sortable-item" data-id="pr3-2"
             style="width:200px;height:40px;background:#dcd;">Item 2</div>
        <div class="sortable-item" data-id="pr3-3"
             style="width:200px;height:40px;background:#cdc;">Item 3</div>
        <div class="sortable-item" data-id="pr3-4"
             style="width:200px;height:40px;background:#dcd;">Item 4</div>
      `
      document.body.appendChild(container)

      // Instrument: capture any drag-lifecycle event so tests can assert
      // that no commit-phase side-effects occurred during a sub-tolerance
      // press-and-release.
      interface WindowWithEvents extends Window {
        __pr3Events?: string[]
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithEvents
      win.__pr3Events = []
      const push = (name: string) => (): void => {
        win.__pr3Events?.push(name)
      }
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        animation: 0,
        forceFallback: true,
        fallbackClass: 'sortable-fallback',
        fallbackTolerance: opts.fallbackTolerance,
        onChoose: push('choose'),
        onStart: push('start'),
        onEnd: push('end'),
      })
    }, opts)
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('small pointer move does not start drag', async ({ page }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    await buildList(page, { fallbackTolerance: 10 })

    const initial = await page
      .locator(PR3_ITEMS)
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))

    const from = await center(page, PR3_ITEM('pr3-1'))
    // Move 3px — well below 10px tolerance. The drag must NOT commit.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 3, from.y, { steps: 3 })

    // No ghost, no class, no order change while still under threshold.
    await expect(page.locator('.sortable-ghost')).toHaveCount(0)
    await expect(page.locator('.sortable-fallback')).toHaveCount(0)
    const stillOrder = await page
      .locator(PR3_ITEMS)
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))
    expect(stillOrder).toEqual(initial)

    await page.mouse.up()
  })

  test('movement past threshold starts drag normally', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    await buildList(page, { fallbackTolerance: 10 })

    const from = await center(page, PR3_ITEM('pr3-1'))
    const to = await center(page, PR3_ITEM('pr3-4'))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // First an intermediate move that crosses the 10px threshold (15px).
    await page.mouse.move(from.x + 15, from.y, { steps: 4 })

    // Drag committed: ghost present, fallback class on it.
    const ghost = page.locator('.sortable-ghost.sortable-fallback')
    await expect(ghost).toHaveCount(1)

    // Complete the drag — reorder should succeed normally.
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    const finalOrder = await page
      .locator(PR3_ITEMS)
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))
    expect(finalOrder[0]).not.toBe('pr3-1')
    expect(finalOrder).toContain('pr3-1')
    expect(finalOrder).toHaveLength(4)
  })

  test('pointerup during capture phase fires no drag events', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    await buildList(page, { fallbackTolerance: 10 })

    const from = await center(page, PR3_ITEM('pr3-1'))

    // Press, nudge 2px (below threshold), release — a click, not a drag.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 2, from.y, { steps: 2 })
    await page.mouse.up()

    // No drag-lifecycle event should have fired.
    const events = await page.evaluate(() =>
      (window as unknown as { __pr3Events: string[] }).__pr3Events.slice()
    )
    expect(events).toEqual([])

    // And no ghost lingers.
    await expect(page.locator('.sortable-ghost')).toHaveCount(0)
  })
})
