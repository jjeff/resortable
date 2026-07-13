import { expect, test, Page } from '@playwright/test'

/**
 * Autoscroll under a HELD (stationary) pointer must keep the controlled-mode
 * drop target fresh (jjeff/resortable#124; downstream
 * spaceagetv/missioncontrol#4566).
 *
 * A long scrolling list is dragged toward its bottom edge until autoscroll
 * kicks in, then the pointer is held still while the list scrolls underneath
 * it. No further `pointermove` fires during that scroll — the pointer
 * pipeline used to freeze the drop target at the pre-scroll row and report a
 * no-op move (newIndex == source). The fix re-resolves the target on every
 * `scroll`, so the intent lands near the end of the (now scrolled) list.
 */

interface AsWindow extends Window {
  Sortable?: typeof import('../../src/index.js').Sortable
  __asIntents?: Array<{ oldIndexes?: number[]; newIndexes?: number[] }>
  __asList?: HTMLElement
}

const COUNT = 30
const ITEM_H = 40
const VIEWPORT_H = 200

async function buildScrollingList(page: Page): Promise<void> {
  await page.evaluate(
    ({ count, itemH, viewportH }) => {
      document.getElementById('as-list')?.remove()
      const ul = document.createElement('ul')
      ul.id = 'as-list'
      ul.style.cssText = `list-style:none;margin:0;padding:0;position:absolute;top:40px;left:40px;width:120px;height:${viewportH}px;overflow-y:auto;background:#eef`
      for (let i = 0; i < count; i++) {
        const li = document.createElement('li')
        li.id = `as-${i}`
        li.className = 'as-item'
        li.style.cssText = `height:${itemH}px;box-sizing:border-box;background:#8ac;border-bottom:1px solid #457`
        li.textContent = String(i)
        ul.appendChild(li)
      }
      document.body.appendChild(ul)

      const win = window as unknown as AsWindow
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      win.__asIntents = []
      win.__asList = ul
      new Sortable(ul, {
        controlled: true,
        draggable: '.as-item',
        dataIdAttr: 'id',
        animation: 0,
        scroll: true,
        scrollSpeed: 20,
        scrollSensitivity: 60,
        onEnd: (evt) => {
          win.__asIntents?.push({
            oldIndexes: evt.oldIndexes,
            newIndexes: evt.newIndexes,
          })
        },
      })
    },
    { count: COUNT, itemH: ITEM_H, viewportH: VIEWPORT_H }
  )
}

test.describe('autoscroll keeps the controlled drop target fresh (#124)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  test('a held-pointer edge drag lands near the scrolled end, not the source', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only — touch emulation differs (Mobile Chrome tracked in #48)'
    )

    await buildScrollingList(page)

    const list = await page.locator('#as-list').boundingBox()
    const first = await page.locator('#as-0').boundingBox()
    if (!list || !first) throw new Error('missing boxes')

    // Grab the first row and drag toward the bottom edge of the viewport,
    // inside the autoscroll sensitivity band.
    await page.mouse.move(first.x + 25, first.y + 20)
    await page.mouse.down()
    const edgeY = list.y + VIEWPORT_H - 8
    await page.mouse.move(list.x + 25, edgeY, { steps: 8 })

    // Hold the pointer still and let autoscroll drive the list to the bottom.
    // No further pointermove fires — this is the stationary-pointer scenario.
    await page.waitForFunction(
      () => {
        const ul = (window as unknown as AsWindow).__asList
        return !!ul && ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 2
      },
      undefined,
      { timeout: 5000 }
    )

    await page.mouse.up()

    const intents = await page.evaluate(
      () => (window as unknown as AsWindow).__asIntents ?? []
    )
    expect(intents).toHaveLength(1)
    const newIndex = intents[0].newIndexes?.[0] ?? -1
    // Source was row 0; after scrolling to the bottom the target must land far
    // down the list, not collapse back to 0.
    expect(newIndex).toBeGreaterThan(COUNT / 2)
  })
})
