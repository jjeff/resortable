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
  }) => {
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
    //
    // Generous timeout: autoscroll advances 20px per animation frame, so the
    // ~1000px this list has to travel costs ~50 frames, and the wait is only
    // ever as fast as the engine's frame clock.
    //
    // That clock is the whole story on WebKit. Measured in the Playwright
    // v1.58.2-noble image at 2 CPUs, over a 5s held-pointer drag:
    //
    //   engine                     rAF/sec   px scrolled
    //   Linux Chromium (headless)     60.4          1000
    //   Linux WebKit   (headless)      1.2            80
    //   Linux WebKit   (headed/Xvfb)  36.0          1000
    //
    // Headless WebKit on Linux has no compositor and so no real frame clock;
    // at 1.2 fps this scroll needs ~42s. CI therefore runs the WebKit project
    // headed under Xvfb (see the e2e-tests-linux matrix in ci.yml), which is
    // what keeps this test inside the budget below.
    //
    // The replay itself is NOT the cost — an earlier comment here blamed the
    // per-`scroll` `onPointerMove` replay and #134 proposed throttling it to
    // one per frame. The measurement above disproves that: the hit test runs
    // in ~0.18ms and fired 3 times in 5s on WebKit (60 on Chromium), i.e.
    // roughly once per frame already. There is nothing to coalesce.
    await page.waitForFunction(
      () => {
        const ul = (window as unknown as AsWindow).__asList
        return !!ul && ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 2
      },
      undefined,
      { timeout: 20000 }
    )

    // Now wait for the drop target itself to catch up with that scroll.
    //
    // `scrollTop` moves synchronously inside the autoscroll loop's `scrollBy`,
    // but the `scroll` event that re-resolves the drop target is dispatched
    // asynchronously and coalesced — WebKit especially, and more so under the
    // load of a full parallel suite. Releasing as soon as the list merely
    // *looks* scrolled therefore races the replay and commits whatever target
    // the last delivered `scroll` resolved: measured at index 6-8 instead of
    // 29 on the Linux WebKit CI leg, while the same drag run alone reaches 29
    // every time. Waiting on the placeholder removes the race from the test.
    //
    // This does NOT weaken the #124 guard. The regression #124 describes
    // freezes the placeholder at the source row, so it would never pass this
    // wait — the test still fails, just here rather than on the assertion.
    //
    // The underlying library gap is real but narrower than this test: a drop
    // that lands while `scroll` events are still queued commits a stale index.
    // Fixing it means re-resolving the target at drop time, which today would
    // mean re-running `onPointerMove` and double-emitting `sort`/`change`.
    // Tracked in #144.
    await page.waitForFunction(
      (half) => {
        const ul = (window as unknown as AsWindow).__asList
        if (!ul) return false
        const placeholderIndex = Array.from(ul.children).findIndex((c) =>
          c.classList.contains('sortable-ghost')
        )
        return placeholderIndex > half
      },
      COUNT / 2,
      { timeout: 20000 }
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
