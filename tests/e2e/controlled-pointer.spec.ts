import { expect, test, Page } from '@playwright/test'

/**
 * Controlled-mode POINTER-pipeline drags against items whose descendants
 * re-enable `pointer-events` — the structure that broke the first
 * real-world controlled-mode integration.
 *
 * The cursor-following ghost is a clone positioned exactly under the
 * cursor. Its inline `pointer-events: none` is defeated by consumer CSS
 * like `.item .overlay { pointer-events: auto }`: elementFromPoint returns
 * the ghost's interior, the identity-stripped clone misses every index
 * lookup, and the placeholder never moves. The fix hides the ghost for the
 * hit test (legacy parity: Sortable.js `_hideGhostForTarget`).
 */

async function buildControlledList(page: Page, animation = 0): Promise<void> {
  await page.evaluate((animation) => {
    document.getElementById('ctl-pointer-list')?.remove()
    const ul = document.createElement('ul')
    ul.id = 'ctl-pointer-list'
    ul.style.cssText =
      'display:flex;gap:4px;list-style:none;padding:8px;position:absolute;top:40px;left:40px;background:#eef'
    for (let i = 0; i < 4; i++) {
      const li = document.createElement('li')
      li.id = `cp-${i}`
      li.className = 'cp-item'
      li.style.cssText =
        'width:50px;height:50px;background:#8ac;position:relative'
      // Mirror rich item content that re-enables pointer-events on
      // descendants (thumbnails, overlays, anchors).
      li.innerHTML = `<div class="cp-overlay" style="position:absolute;inset:0;pointer-events:auto">${i}</div>`
      ul.appendChild(li)
    }
    document.body.appendChild(ul)

    interface WindowWithSortable extends Window {
      Sortable?: typeof import('../../src/index.js').Sortable
      __cpIntents?: Array<{ oldIndexes?: number[]; newIndexes?: number[] }>
    }
    const win = window as WindowWithSortable
    const Sortable = win.Sortable
    if (!Sortable) throw new Error('Sortable not loaded on window')
    win.__cpIntents = []
    new Sortable(ul, {
      controlled: true,
      draggable: '.cp-item',
      dataIdAttr: 'id',
      animation,
      onEnd: (evt) => {
        win.__cpIntents?.push({
          oldIndexes: evt.oldIndexes,
          newIndexes: evt.newIndexes,
        })
      },
    })
  }, animation)
}

/** Child order of the controlled list, placeholder as 'PH', ghost dropped. */
function childOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.getElementById('ctl-pointer-list')?.children ?? [])
      .filter((el) => !el.hasAttribute('data-resortable-ghost'))
      .map((el) =>
        el.hasAttribute('data-resortable-placeholder') ? 'PH' : el.id
      )
  )
}

function intents(
  page: Page
): Promise<Array<{ oldIndexes?: number[]; newIndexes?: number[] }>> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cpIntents: Array<{ oldIndexes?: number[]; newIndexes?: number[] }>
        }
      ).__cpIntents
  )
}

test.describe('controlled pointer drags with pointer-events:auto descendants', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('placeholder tracks the cursor mid-list and the intent lands there', async ({
    page,
  }) => {
    await buildControlledList(page)

    const from = await page.locator('#cp-0').boundingBox()
    const to = await page.locator('#cp-2').boundingBox()
    if (!from || !to) throw new Error('missing boxes')

    await page.mouse.move(from.x + 25, from.y + 25)
    await page.mouse.down()
    // Land right of cp-2's midpoint → insert AFTER it.
    await page.mouse.move(to.x + 30, to.y + 25, { steps: 8 })

    // Mid-drag: the placeholder (a clone of the dragged item) must have
    // moved next to cp-2 — not be stuck at the start of the list.
    const midState = await page.evaluate(() => {
      const ul = document.getElementById('ctl-pointer-list')
      if (!ul) return null
      return Array.from(ul.children).map((el) =>
        el.hasAttribute('data-resortable-placeholder')
          ? 'PH'
          : el.hasAttribute('data-resortable-ghost')
            ? 'GHOST'
            : el.id
      )
    })
    expect(midState).not.toBeNull()
    const phIdx = midState!.indexOf('PH')
    const c2Idx = midState!.indexOf('cp-2')
    expect(phIdx).toBeGreaterThan(c2Idx)

    await page.mouse.up()

    // Controlled: consumer DOM untouched, intent reports the drop index.
    // Poll — the ghost settles onto the drop position with a short
    // animation before it's removed.
    await expect
      .poll(async () =>
        page.evaluate(() =>
          Array.from(
            document.querySelectorAll('#ctl-pointer-list .cp-item')
          ).map((el) => el.id)
        )
      )
      .toEqual(['cp-0', 'cp-1', 'cp-2', 'cp-3'])

    const intents = await page.evaluate(
      () =>
        (
          window as unknown as {
            __cpIntents: Array<{ oldIndexes?: number[]; newIndexes?: number[] }>
          }
        ).__cpIntents
    )
    expect(intents.length).toBe(1)
    expect(intents[0].oldIndexes).toEqual([0])
    expect(intents[0].newIndexes).toEqual([2])
  })

  // A running reorder animation defers pointer moves (hit-testing items
  // mid-flight made the target oscillate). Deferring used to mean DROPPING:
  // a fast drag across several items landed short of the release point, and
  // holding still afterwards never caught up because no further pointermove
  // arrived.
  test.describe('with a slow reorder animation', () => {
    test('a fast drag lands where it is released, even mid-animation', async ({
      page,
    }) => {
      await buildControlledList(page, 400)
      const from = await page.locator('#cp-3').boundingBox()
      const to = await page.locator('#cp-0').boundingBox()
      if (!from || !to) throw new Error('missing boxes')

      await page.mouse.move(from.x + 25, from.y + 25)
      await page.mouse.down()
      // Left of cp-0's midpoint → insert BEFORE it. Back-to-back steps land
      // well inside the first swap's 400ms animation.
      await page.mouse.move(to.x + 10, to.y + 25, { steps: 10 })
      await page.mouse.up()

      await expect.poll(async () => (await intents(page)).length).toBe(1)
      expect((await intents(page))[0]).toEqual({
        oldIndexes: [3],
        newIndexes: [0],
      })
    })

    test('holding still after a fast drag catches up once the animation ends', async ({
      page,
    }) => {
      await buildControlledList(page, 400)
      const from = await page.locator('#cp-3').boundingBox()
      const to = await page.locator('#cp-0').boundingBox()
      if (!from || !to) throw new Error('missing boxes')

      await page.mouse.move(from.x + 25, from.y + 25)
      await page.mouse.down()
      await page.mouse.move(to.x + 10, to.y + 25, { steps: 10 })

      // No further pointermove: the deferred move must replay by itself.
      await expect
        .poll(() => childOrder(page), { timeout: 3000 })
        .toEqual(['PH', 'cp-0', 'cp-1', 'cp-2', 'cp-3'])

      await page.mouse.up()
      await expect.poll(async () => (await intents(page)).length).toBe(1)
      expect((await intents(page))[0].newIndexes).toEqual([0])
    })
  })
})
