/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test'
import { dragAndDropWithAnimation } from './helpers/animations'

/**
 * Replace the Sortable bound to `list` with a fresh one configured for the
 * test. The page's bootstrap script tracks instances by `{el, destroy}` but
 * Sortable's actual property is `element` — the `existing.destroy()` lookup
 * in older specs silently no-ops, leaving the original Sortable attached
 * alongside the new one. For #33 we need a clean slate (the original
 * DragManager has no `onMove` and would fire first), so we look up the live
 * Sortable directly via the static `Sortable.get(el)` registry.
 */
async function replaceSortable(
  page: Page,
  listId: string,
  options: Record<string, any>
): Promise<void> {
  await page.evaluate(
    ({ listId, options }) => {
      const list = document.getElementById(listId)
      if (!list || !window.Sortable) return
      const existing = (
        window.Sortable as unknown as {
          get: (el: HTMLElement) => { destroy: () => void } | null
        }
      ).get(list)
      if (existing) existing.destroy()
      window.eventLog = []
      // Reconstruct callbacks from option keys (callbacks aren't transferable
      // across the worker boundary). Each opt callback name maps to a
      // marker shape we instantiate here.
      const realOptions: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(options)) {
        if (v && typeof v === 'object' && '__callback' in v) {
          const cb = (v as { __callback: string }).__callback
          if (cb === 'returnFalse') realOptions[k] = () => false
          else if (cb === 'returnMinus1') realOptions[k] = () => -1
          else if (cb === 'returnPlus1') realOptions[k] = () => 1
          else if (cb === 'logMove')
            realOptions[k] = (evt: any, originalEvent: Event) => {
              window.eventLog?.push({
                related: evt.related?.dataset?.id ?? null,
                from: evt.from?.id ?? null,
                to: evt.to?.id ?? null,
                originalIsEvent: originalEvent instanceof Event,
                originalType: originalEvent?.type ?? null,
              })
            }
          else if (cb === 'logName') {
            const name = k
            realOptions[k] = () => window.eventLog?.push(name)
          }
        } else {
          realOptions[k] = v
        }
      }
      new window.Sortable(list, realOptions)
    },
    { listId, options }
  )
}

/**
 * E2E coverage for #33 — `onMove(MoveEvent, originalEvent)` wiring.
 *
 * Two pipelines exist in DragManager and both must honor the contract:
 *   - HTML5 native (`dragstart` / `dragover` / `drop`): exercised by
 *     `page.dragAndDrop` against `#basic-list` (default config).
 *   - Pointer fallback (`pointerdown` / `pointermove`): exercised by
 *     driving `page.mouse` against `#fallback-list` (configured with
 *     `forceFallback: true`).
 *
 * The contract:
 *   - `false`  → cancel: no DOM reorder, no `sort` / `update` / `change`
 *   - `-1`     → force insert BEFORE related
 *   - `1`      → force insert AFTER related
 *   - 2nd arg  → the actual DOM event that triggered the dragover
 */

const BASIC_LIST = '#basic-list'
const FALLBACK_LIST = '#fallback-list'

const basicItem = (id: string): string =>
  `${BASIC_LIST} [data-id="basic-${id}"]`
const fallbackItem = (id: string): string =>
  `${FALLBACK_LIST} [data-id="fb-${id}"]`

async function center(
  page: Page,
  selector: string
): Promise<{ x: number; y: number }> {
  await page.locator(selector).scrollIntoViewIfNeeded()
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function idsIn(page: Page, listSelector: string): Promise<string[]> {
  return page.$$eval(
    `${listSelector} .sortable-item:not(.sortable-ghost)`,
    (els) =>
      (els as HTMLElement[])
        .map((el) => el.dataset.id ?? '')
        .filter((id) => id !== '')
  )
}

// Playwright's `page.dragAndDrop` synthesises mouse events that trigger the
// pointer pipeline (`onPointerDown` / `onPointerMove`), NOT a native HTML5
// drag session. So both describe blocks below exercise the pointer pipeline
// against two different DragManager configurations: the default (HTML5
// listeners registered but inert under synthetic mouse events) and
// `forceFallback: true` (HTML5 listeners skipped entirely). The pure HTML5
// `onDragOver` code path is covered by jsdom unit tests in
// `tests/unit/on-move.spec.ts`.
test.describe('onMove (#33) — default config (pointer pipeline via dragAndDrop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator(`${BASIC_LIST} .sortable-item`)).toHaveCount(4)
  })

  // Mobile Chrome's touch emulation has separate timing/geometry semantics
  // and is known to flake on `page.dragAndDrop` (mirrors existing skips
  // throughout the suite, e.g. event-callbacks.spec.ts).
  function skipMobile(testInfo: { project: { name: string } }): boolean {
    return /Mobile/.test(testInfo.project.name)
  }

  test('returning false cancels reorder — no DOM mutation, no sort/update/change', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Mobile dragAndDrop is unreliable')

    await replaceSortable(page, 'basic-list', {
      animation: 0,
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'returnFalse' },
      onSort: { __callback: 'logName' },
      onUpdate: { __callback: 'logName' },
      onChange: { __callback: 'logName' },
    })

    const before = await idsIn(page, BASIC_LIST)
    await dragAndDropWithAnimation(page, basicItem('1'), basicItem('3'))
    const after = await idsIn(page, BASIC_LIST)

    expect(after).toEqual(before)
    const log = await page.evaluate(() => window.eventLog ?? [])
    expect(log).not.toContain('onSort')
    expect(log).not.toContain('onUpdate')
    expect(log).not.toContain('onChange')
  })

  test('callback receives (MoveEvent, originalEvent: Event)', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Mobile dragAndDrop is unreliable')

    await replaceSortable(page, 'basic-list', {
      animation: 0,
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'logMove' },
    })

    await dragAndDropWithAnimation(page, basicItem('1'), basicItem('3'))

    const log = (await page.evaluate(() => window.eventLog ?? [])) as Array<{
      related: string | null
      from: string | null
      to: string | null
      originalIsEvent: boolean
      originalType: string | null
    }>
    expect(log.length).toBeGreaterThan(0)
    // At least one call related to basic-3 (the drop target).
    const overTarget = log.find((c) => c.related === 'basic-3')
    expect(overTarget).toBeTruthy()
    expect(overTarget?.originalIsEvent).toBe(true)
    // Playwright's `page.dragAndDrop` drives the pointer pipeline, not the
    // HTML5 DnD events (it uses synthetic mouse events, not a native drag
    // session). Either path satisfies the contract — both deliver a live
    // `Event` to `onMove`. We accept either to keep the test robust across
    // future Playwright versions.
    expect(['dragover', 'pointermove']).toContain(overTarget?.originalType)
    expect(overTarget?.from).toBe('basic-list')
    expect(overTarget?.to).toBe('basic-list')
  })

  test('returning -1 forces insert-BEFORE related (overrides natural drag-down)', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Mobile dragAndDrop is unreliable')

    await replaceSortable(page, 'basic-list', {
      animation: 0,
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'returnMinus1' },
    })

    // Drag basic-1 (top) DOWN over basic-3. Natural placement = insert AFTER
    // basic-3 → [2, 3, 1, 4]. Forced -1 = insert BEFORE basic-3 → [2, 1, 3, 4].
    await dragAndDropWithAnimation(page, basicItem('1'), basicItem('3'))
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-2',
      'basic-1',
      'basic-3',
      'basic-4',
    ])
  })

  test('returning 1 forces insert-AFTER related (overrides natural drag-up)', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Mobile dragAndDrop is unreliable')

    await replaceSortable(page, 'basic-list', {
      animation: 0,
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'returnPlus1' },
    })

    // Drag basic-4 (bottom) UP over basic-2. Natural placement = insert
    // BEFORE basic-2 → [1, 4, 2, 3]. Forced +1 = insert AFTER basic-2 →
    // [1, 2, 4, 3].
    await dragAndDropWithAnimation(page, basicItem('4'), basicItem('2'))
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-1',
      'basic-2',
      'basic-4',
      'basic-3',
    ])
  })
})

test.describe('onMove (#33) — forceFallback (pointer pipeline, HTML5 listeners skipped)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(
      page.locator(`${FALLBACK_LIST} .sortable-item:not(.sortable-ghost)`)
    ).toHaveCount(4)
  })

  // Fallback mode is a desktop-precision drag concern — mobile emulation
  // has separate timing/geometry semantics (mirrors existing fallback
  // tests; tracked in #48).
  function skipMobile(testInfo: { project: { name: string } }): boolean {
    return /Mobile/.test(testInfo.project.name)
  }

  test('returning false cancels reorder — pointer pipeline honors cancellation', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Desktop-only — touch emulation differs')

    await replaceSortable(page, 'fallback-list', {
      animation: 0,
      forceFallback: true,
      fallbackClass: 'sortable-fallback',
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'returnFalse' },
      onUpdate: { __callback: 'logName' },
    })

    const before = await idsIn(page, FALLBACK_LIST)
    const from = await center(page, fallbackItem('1'))
    const to = await center(page, fallbackItem('3'))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    const after = await idsIn(page, FALLBACK_LIST)
    expect(after).toEqual(before)
    const log = await page.evaluate(() => window.eventLog ?? [])
    expect(log).not.toContain('onUpdate')
  })

  test('callback receives a live PointerEvent as originalEvent', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Desktop-only — touch emulation differs')

    await replaceSortable(page, 'fallback-list', {
      animation: 0,
      forceFallback: true,
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'logMove' },
    })

    const from = await center(page, fallbackItem('1'))
    const to = await center(page, fallbackItem('3'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    const log = (await page.evaluate(() => window.eventLog ?? [])) as Array<{
      related: string | null
      originalIsEvent: boolean
      originalType: string | null
    }>
    expect(log.length).toBeGreaterThan(0)
    const sample = log.find((c) => c.originalType !== null)
    expect(sample?.originalIsEvent).toBe(true)
    // The pointer pipeline drives off `pointermove`.
    expect(sample?.originalType).toBe('pointermove')
  })

  test('returning -1 forces insert-BEFORE related (pointer pipeline)', async ({
    page,
  }, testInfo) => {
    test.skip(skipMobile(testInfo), 'Desktop-only — touch emulation differs')

    await replaceSortable(page, 'fallback-list', {
      animation: 0,
      forceFallback: true,
      ghostClass: 'sortable-ghost',
      onMove: { __callback: 'returnMinus1' },
    })

    // Drag fb-1 DOWN over fb-3. Natural = AFTER fb-3 → [2, 3, 1, 4].
    // Forced -1 = BEFORE fb-3 → [2, 1, 3, 4].
    const from = await center(page, fallbackItem('1'))
    const to = await center(page, fallbackItem('3'))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()

    expect(await idsIn(page, FALLBACK_LIST)).toEqual([
      'fb-2',
      'fb-1',
      'fb-3',
      'fb-4',
    ])
  })
})
