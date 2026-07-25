import { test, expect, Page } from '@playwright/test'

/**
 * Coverage for `swapThreshold` / `invertSwap` / `invertedSwapThreshold` /
 * `direction` (#77). The inline fixtures build `position: absolute`
 * markup with explicit item width/height (mirrors `fallback-mode.spec.ts`)
 * so every rect is known in advance and overlap fractions are computable
 * exactly.
 *
 * **Two pipelines reach `shouldSwap()`, historically via one entry point
 * each; now the pointer path has two.** Before #121, the *uncontrolled*
 * pointer path's same-zone branch reordered immediately on
 * `over !== movingElement` — it never consulted `swapThreshold` at all —
 * so `controlled: true` (routing through `handleControlledMove`, the same
 * gate the native HTML5 `dragover` handler uses) was the only way to
 * exercise the threshold gate via `page.mouse` (native HTML5
 * `dragstart`/`dragover` can't be triggered by Playwright's synthetic mouse
 * input either — same constraint documented in `on-move.spec.ts`). The
 * fixtures below still use `controlled: true` and still read the
 * placeholder's position (`data-resortable-placeholder`, same signal
 * `controlled-pointer.spec.ts` uses) instead of real DOM item order, since
 * controlled mode never structurally moves the real items mid-drag — that
 * coverage remains valid on its own terms and stays as-is.
 *
 * #121 wired `shouldSwap()` into the uncontrolled path too, so as of this
 * PR `controlled: true` is no longer required to reach the gate — see the
 * 'uncontrolled pointer pipeline (#121)' describe block below, which drives
 * the same options through plain `page.mouse` with no `controlled` option
 * set and asserts real DOM reordering directly (see the comment on that
 * block for why the gate measures the ghost's rect, not the parked item's).
 */

/**
 * Mouse Y for a given vertical overlap fraction against `targetTop`.
 *
 * The ghost (item-sized, tracks the cursor) has `top = mouseY - grabOffset`
 * where `grabOffset` is how far below the dragged item's own top edge it
 * was grabbed. Solving `overlap = 1 - |mouseY - targetTop - grabOffset| /
 * itemHeight` for the branch where the ghost's bottom clips at the
 * target's bottom gives `mouseY = targetTop + grabOffset +
 * itemHeight * (1 - overlap)`.
 *
 * `grabOffset` also decides which side of the target's midpoint the cursor
 * lands on (`handleControlledMove`'s `naturalAfter` — insert after the
 * target when the cursor is past its midpoint). A small `grabOffset` puts
 * LOW overlaps past the midpoint (used for the inverted-threshold cases,
 * where the swap fires at low overlap); a `grabOffset` around a quarter of
 * the item size puts HIGH overlaps past the midpoint too (used for the
 * normal-threshold cases, where the swap fires at high overlap) — pick
 * per-test so the swap is a real index change, not a same-index no-op.
 */
function overlapY(
  targetTop: number,
  itemHeight: number,
  overlap: number,
  grabOffset: number
): number {
  return targetTop + grabOffset + itemHeight * (1 - overlap)
}

/** Horizontal counterpart of {@link overlapY}. */
function overlapX(
  targetLeft: number,
  itemWidth: number,
  overlap: number,
  grabOffset: number
): number {
  return targetLeft + grabOffset + itemWidth * (1 - overlap)
}

/**
 * DOM order of `container`'s children, labeled the same way
 * `controlled-pointer.spec.ts` does: the placeholder is `'PH'`, the ghost
 * (if hit) is `'GHOST'`, everything else reports its `data-id`. Swap
 * outcome is read from where `'PH'` lands relative to the target's id.
 */
async function childLabels(page: Page, containerId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const el = document.getElementById(id)
    if (!el) return []
    return Array.from(el.children).map((c) =>
      c.hasAttribute('data-resortable-placeholder')
        ? 'PH'
        : c.hasAttribute('data-resortable-ghost')
          ? 'GHOST'
          : ((c as HTMLElement).dataset.id ?? '')
    )
  }, containerId)
}

/** Shared by both describe blocks below. */
function skipMobile(testInfo: { project: { name: string } }): boolean {
  return /Mobile/.test(testInfo.project.name)
}

test.describe('Swap Behavior Options (#77)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('should respect swapThreshold option', async ({ page }, testInfo) => {
    test.skip(
      skipMobile(testInfo),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    const LIST = '#swap-threshold-list'
    const ITEM_HEIGHT = 60

    await page.evaluate(() => {
      document.getElementById('swap-threshold-list')?.remove()
      const container = document.createElement('div')
      container.id = 'swap-threshold-list'
      container.style.cssText =
        'position:absolute;top:40px;left:40px;width:220px;background:#eef'
      container.innerHTML = `
        <div class="sortable-item" data-id="st-1" style="width:220px;height:60px;background:#ccc;">Item 1</div>
        <div class="sortable-item" data-id="st-2" style="width:220px;height:60px;background:#ddd;">Item 2</div>
        <div class="sortable-item" data-id="st-3" style="width:220px;height:60px;background:#ccc;">Item 3</div>
        <div class="sortable-item" data-id="st-4" style="width:220px;height:60px;background:#ddd;">Item 4</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        controlled: true,
        swapThreshold: 0.5,
        animation: 0,
      })
    })

    const item1Box = await page
      .locator(`${LIST} [data-id="st-1"]`)
      .boundingBox()
    const item2Box = await page
      .locator(`${LIST} [data-id="st-2"]`)
      .boundingBox()
    if (!item1Box || !item2Box) throw new Error('missing item boxes')

    // Grab offset of 15 (a quarter of the 60px item height) keeps the 60%
    // overlap stage's cursor past item2's midpoint — see {@link overlapY}.
    const GRAB_OFFSET = 15
    const grabX = item1Box.x + item1Box.width / 2
    const grabY = item1Box.y + GRAB_OFFSET

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()

    // 30% overlap — below the 0.5 threshold, must NOT swap. `st-1` (the
    // dragged item) stays in the DOM — hidden, not removed — so it appears
    // right after the placeholder; the ghost lives inside the zone
    // (`fallbackOnBody` defaults to false) and sorts last.
    await page.mouse.move(
      grabX,
      overlapY(item2Box.y, ITEM_HEIGHT, 0.3, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-threshold-list')).toEqual([
      'PH',
      'st-1',
      'st-2',
      'st-3',
      'st-4',
      'GHOST',
    ])

    // 60% overlap — above the 0.5 threshold, must swap.
    await page.mouse.move(
      grabX,
      overlapY(item2Box.y, ITEM_HEIGHT, 0.6, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-threshold-list')).toEqual([
      'st-1',
      'st-2',
      'PH',
      'st-3',
      'st-4',
      'GHOST',
    ])

    await page.mouse.up()
  })

  test('should handle invertSwap option', async ({ page }) => {
    const LIST = '#swap-invert-list'
    const ITEM_HEIGHT = 60

    await page.evaluate(() => {
      document.getElementById('swap-invert-list')?.remove()
      const container = document.createElement('div')
      container.id = 'swap-invert-list'
      container.style.cssText =
        'position:absolute;top:40px;left:40px;width:220px;background:#efe'
      container.innerHTML = `
        <div class="sortable-item" data-id="iv-a" style="width:220px;height:60px;background:#cdc;">Item A</div>
        <div class="sortable-item" data-id="iv-b" style="width:220px;height:60px;background:#dcd;">Item B</div>
        <div class="sortable-item" data-id="iv-c" style="width:220px;height:60px;background:#cdc;">Item C</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        controlled: true,
        invertSwap: true,
        swapThreshold: 0.5,
        animation: 0,
      })
    })

    const itemABox = await page
      .locator(`${LIST} [data-id="iv-a"]`)
      .boundingBox()
    const itemBBox = await page
      .locator(`${LIST} [data-id="iv-b"]`)
      .boundingBox()
    if (!itemABox || !itemBBox) throw new Error('missing item boxes')

    // Grab offset near the item's top edge keeps the low-overlap (0.2) swap
    // stage's cursor past item B's midpoint — see {@link overlapY}.
    const GRAB_OFFSET = 5
    const grabX = itemABox.x + itemABox.width / 2
    const grabY = itemABox.y + GRAB_OFFSET

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()

    // 80% overlap — inverted rule swaps only when overlap < threshold, so a
    // LARGE overlap must NOT swap.
    await page.mouse.move(
      grabX,
      overlapY(itemBBox.y, ITEM_HEIGHT, 0.8, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-invert-list')).toEqual([
      'PH',
      'iv-a',
      'iv-b',
      'iv-c',
      'GHOST',
    ])

    // 20% overlap — below the 0.5 threshold, inverted rule swaps.
    await page.mouse.move(
      grabX,
      overlapY(itemBBox.y, ITEM_HEIGHT, 0.2, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-invert-list')).toEqual([
      'iv-a',
      'iv-b',
      'PH',
      'iv-c',
      'GHOST',
    ])

    await page.mouse.up()
  })

  test('should respect direction option for horizontal sorting', async ({
    page,
  }) => {
    const LIST = '#swap-direction-list'
    const ITEM_WIDTH = 100

    await page.evaluate(() => {
      document.getElementById('swap-direction-list')?.remove()
      const container = document.createElement('div')
      container.id = 'swap-direction-list'
      container.style.cssText =
        'position:absolute;top:40px;left:40px;width:400px;display:flex;background:#eef'
      container.innerHTML = `
        <div class="sortable-item" data-id="card-1" style="width:100px;height:60px;flex-shrink:0;background:#ccc;">Card 1</div>
        <div class="sortable-item" data-id="card-2" style="width:100px;height:60px;flex-shrink:0;background:#ddd;">Card 2</div>
        <div class="sortable-item" data-id="card-3" style="width:100px;height:60px;flex-shrink:0;background:#ccc;">Card 3</div>
        <div class="sortable-item" data-id="card-4" style="width:100px;height:60px;flex-shrink:0;background:#ddd;">Card 4</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        controlled: true,
        direction: 'horizontal',
        swapThreshold: 0.5,
        animation: 0,
      })
    })

    const card1Box = await page
      .locator(`${LIST} [data-id="card-1"]`)
      .boundingBox()
    const card2Box = await page
      .locator(`${LIST} [data-id="card-2"]`)
      .boundingBox()
    if (!card1Box || !card2Box) throw new Error('missing item boxes')

    // Grab offset of 20 (a fifth of the 100px item width) keeps the 60%
    // overlap stage's cursor past card2's midpoint — see {@link overlapY}.
    const GRAB_OFFSET = 20
    const grabX = card1Box.x + GRAB_OFFSET
    const grabY = card1Box.y + card1Box.height / 2

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()

    // 30% overlap — below the 0.5 threshold, must NOT swap.
    await page.mouse.move(
      overlapX(card2Box.x, ITEM_WIDTH, 0.3, GRAB_OFFSET),
      grabY,
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-direction-list')).toEqual([
      'PH',
      'card-1',
      'card-2',
      'card-3',
      'card-4',
      'GHOST',
    ])

    // 60% overlap — above the 0.5 threshold, must swap.
    await page.mouse.move(
      overlapX(card2Box.x, ITEM_WIDTH, 0.6, GRAB_OFFSET),
      grabY,
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-direction-list')).toEqual([
      'card-1',
      'card-2',
      'PH',
      'card-3',
      'card-4',
      'GHOST',
    ])

    await page.mouse.up()
  })

  test('should use invertedSwapThreshold when invertSwap is true', async ({
    page,
  }) => {
    const LIST = '#swap-inverted-threshold-list'
    const ITEM_HEIGHT = 60

    await page.evaluate(() => {
      document.getElementById('swap-inverted-threshold-list')?.remove()
      const container = document.createElement('div')
      container.id = 'swap-inverted-threshold-list'
      container.style.cssText =
        'position:absolute;top:40px;left:40px;width:220px;background:#fee'
      container.innerHTML = `
        <div class="sortable-item" data-id="ivt-1" style="width:220px;height:60px;background:#dcc;">Item 1</div>
        <div class="sortable-item" data-id="ivt-2" style="width:220px;height:60px;background:#ddc;">Item 2</div>
        <div class="sortable-item" data-id="ivt-3" style="width:220px;height:60px;background:#dcc;">Item 3</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        controlled: true,
        invertSwap: true,
        swapThreshold: 0.8,
        invertedSwapThreshold: 0.3,
        animation: 0,
      })
    })

    const item1Box = await page
      .locator(`${LIST} [data-id="ivt-1"]`)
      .boundingBox()
    const item2Box = await page
      .locator(`${LIST} [data-id="ivt-2"]`)
      .boundingBox()
    if (!item1Box || !item2Box) throw new Error('missing item boxes')

    // Grab offset near the item's top edge keeps the low-overlap (0.25) swap
    // stage's cursor past item2's midpoint — see {@link overlapY}.
    const GRAB_OFFSET = 5
    const grabX = item1Box.x + item1Box.width / 2
    const grabY = item1Box.y + GRAB_OFFSET

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()

    // 50% overlap — not below invertedSwapThreshold (0.3), must NOT swap.
    // (Also above swapThreshold (0.8)? No — but invertSwap replaces the
    // normal gate entirely, so only the `< invertedSwapThreshold` check
    // applies here.)
    await page.mouse.move(
      grabX,
      overlapY(item2Box.y, ITEM_HEIGHT, 0.5, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-inverted-threshold-list')).toEqual([
      'PH',
      'ivt-1',
      'ivt-2',
      'ivt-3',
      'GHOST',
    ])

    // 25% overlap — below invertedSwapThreshold (0.3), must swap.
    await page.mouse.move(
      grabX,
      overlapY(item2Box.y, ITEM_HEIGHT, 0.25, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-inverted-threshold-list')).toEqual([
      'ivt-1',
      'ivt-2',
      'PH',
      'ivt-3',
      'GHOST',
    ])

    await page.mouse.up()
  })
})

/**
 * Uncontrolled pointer pipeline coverage for #121: `shouldSwap()` is now
 * reachable from `page.mouse` with no `controlled` option set (previously
 * only `controlled: true` reached it — see the file header). Unlike the
 * controlled-mode fixtures above, the dragged item is never hidden or
 * replaced by a placeholder here — it's the real DOM node, so assertions
 * read real item order via `childLabels()` (no `'PH'` ever appears).
 *
 * The gate is fed the GHOST's rect, not `movingElement`'s: nothing moves
 * the real dragged item until a swap actually commits, so its rect stays
 * parked in its original slot for the whole hover — measuring it would make
 * overlap compute to 0 no matter how far the cursor has traveled into the
 * target (any `swapThreshold > 0` would freeze the drag outright, and
 * `invertSwap` would fire unconditionally, since 0 overlap is always below
 * any positive threshold — this was caught by an earlier `test.fail()` pin
 * on these two cases before the ghost-rect fix landed). The cursor-following
 * ghost is the actual moving visual, which is why `handleControlledMove`
 * measures it too (`sourceManager.ghostManager.getGhostElement() ??
 * placeholder`, DragManager.ts:737-739) — the uncontrolled branch now does
 * the same (DragManager.ts, `onPointerMove`'s same-zone branch).
 */
test.describe('Swap Behavior Options (#77) — uncontrolled pointer pipeline (#121)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('should respect swapThreshold option', async ({ page }, testInfo) => {
    test.skip(
      skipMobile(testInfo),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    const LIST = '#swap-threshold-list-uncontrolled'
    const ITEM_HEIGHT = 60

    await page.evaluate(() => {
      document.getElementById('swap-threshold-list-uncontrolled')?.remove()
      const container = document.createElement('div')
      container.id = 'swap-threshold-list-uncontrolled'
      container.style.cssText =
        'position:absolute;top:40px;left:40px;width:220px;background:#eef'
      container.innerHTML = `
        <div class="sortable-item" data-id="st-1" style="width:220px;height:60px;background:#ccc;">Item 1</div>
        <div class="sortable-item" data-id="st-2" style="width:220px;height:60px;background:#ddd;">Item 2</div>
        <div class="sortable-item" data-id="st-3" style="width:220px;height:60px;background:#ccc;">Item 3</div>
        <div class="sortable-item" data-id="st-4" style="width:220px;height:60px;background:#ddd;">Item 4</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        swapThreshold: 0.5,
        animation: 0,
      })
    })

    const item1Box = await page
      .locator(`${LIST} [data-id="st-1"]`)
      .boundingBox()
    const item2Box = await page
      .locator(`${LIST} [data-id="st-2"]`)
      .boundingBox()
    if (!item1Box || !item2Box) throw new Error('missing item boxes')

    // Same GRAB_OFFSET / overlap math as the controlled-mode
    // swapThreshold test above — see {@link overlapY}.
    const GRAB_OFFSET = 15
    const grabX = item1Box.x + item1Box.width / 2
    const grabY = item1Box.y + GRAB_OFFSET

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()

    // 30% overlap — below the 0.5 threshold, must NOT swap.
    await page.mouse.move(
      grabX,
      overlapY(item2Box.y, ITEM_HEIGHT, 0.3, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-threshold-list-uncontrolled')).toEqual(
      ['st-1', 'st-2', 'st-3', 'st-4', 'GHOST']
    )

    // 60% overlap — above the 0.5 threshold, must swap.
    await page.mouse.move(
      grabX,
      overlapY(item2Box.y, ITEM_HEIGHT, 0.6, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-threshold-list-uncontrolled')).toEqual(
      ['st-2', 'st-1', 'st-3', 'st-4', 'GHOST']
    )

    await page.mouse.up()
  })

  test('should handle invertSwap option', async ({ page }, testInfo) => {
    test.skip(
      skipMobile(testInfo),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    const LIST = '#swap-invert-list-uncontrolled'
    const ITEM_HEIGHT = 60

    await page.evaluate(() => {
      document.getElementById('swap-invert-list-uncontrolled')?.remove()
      const container = document.createElement('div')
      container.id = 'swap-invert-list-uncontrolled'
      container.style.cssText =
        'position:absolute;top:40px;left:40px;width:220px;background:#efe'
      container.innerHTML = `
        <div class="sortable-item" data-id="iv-a" style="width:220px;height:60px;background:#cdc;">Item A</div>
        <div class="sortable-item" data-id="iv-b" style="width:220px;height:60px;background:#dcd;">Item B</div>
        <div class="sortable-item" data-id="iv-c" style="width:220px;height:60px;background:#cdc;">Item C</div>
      `
      document.body.appendChild(container)

      interface WindowWithSortable extends Window {
        Sortable?: typeof import('../../src/index.js').Sortable
      }
      const win = window as WindowWithSortable
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      new Sortable(container, {
        invertSwap: true,
        swapThreshold: 0.5,
        animation: 0,
      })
    })

    const itemABox = await page
      .locator(`${LIST} [data-id="iv-a"]`)
      .boundingBox()
    const itemBBox = await page
      .locator(`${LIST} [data-id="iv-b"]`)
      .boundingBox()
    if (!itemABox || !itemBBox) throw new Error('missing item boxes')

    // Same GRAB_OFFSET / overlap math as the controlled-mode invertSwap
    // test above — see {@link overlapY}.
    const GRAB_OFFSET = 5
    const grabX = itemABox.x + itemABox.width / 2
    const grabY = itemABox.y + GRAB_OFFSET

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()

    // 80% overlap — inverted rule swaps only when overlap < threshold, so
    // a LARGE overlap must NOT swap.
    await page.mouse.move(
      grabX,
      overlapY(itemBBox.y, ITEM_HEIGHT, 0.8, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-invert-list-uncontrolled')).toEqual([
      'iv-a',
      'iv-b',
      'iv-c',
      'GHOST',
    ])

    // 20% overlap — below the 0.5 threshold, inverted rule swaps.
    await page.mouse.move(
      grabX,
      overlapY(itemBBox.y, ITEM_HEIGHT, 0.2, GRAB_OFFSET),
      {
        steps: 1,
      }
    )
    expect(await childLabels(page, 'swap-invert-list-uncontrolled')).toEqual([
      'iv-b',
      'iv-a',
      'iv-c',
      'GHOST',
    ])

    await page.mouse.up()
  })
})
