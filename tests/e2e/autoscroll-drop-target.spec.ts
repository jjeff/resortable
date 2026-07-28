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
  __asScrollEvents?: number
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
      // TEMPORARY diagnostics — this failure only reproduces on the CI
      // runner, never locally, so the numbers have to come from CI itself.
      win.__asScrollEvents = 0
      ul.addEventListener('scroll', () => {
        win.__asScrollEvents = (win.__asScrollEvents ?? 0) + 1
      })
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
    // The scroll wait below can burn most of its 20s budget on a loaded
    // runner, which leaves little of the 30s default in playwright.config.ts
    // for the drag itself. Without this a slow engine reports "Test timeout
    // of 30000ms exceeded" instead of failing on the index this test is about.
    test.setTimeout(60_000)

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
    // Generous timeout: AutoScrollPlugin advances `el.scrollTop` once per
    // animation frame (by `calculateSpeed`, which tapers with edge distance
    // and tops out at `scrollSpeed`), so the ~1000px this list travels costs
    // tens of frames. The wait can never outrun the engine's frame clock.
    //
    // That clock is the whole story on WebKit. Measured in the Playwright
    // v1.58.2-noble image at 2 CPUs, over one 5s held-pointer drag:
    //
    //   engine                     rAF/sec   px scrolled in 5s
    //   Linux Chromium (headless)     60.4   1000 (done in ~1s)
    //   Linux WebKit   (headless)      1.2   80
    //   Linux WebKit   (headed/Xvfb)  36.0   1000 (done in ~3s)
    //
    // Headless WebKit on Linux has no compositor and so no real frame clock.
    // At ~1.2 fps this scroll needs the better part of a minute, which no
    // sane budget covers. CI therefore runs the WebKit project headed under
    // Xvfb (see the e2e-tests-linux matrix in ci.yml); that is what keeps
    // this test inside the budget below. Headless Chromium is unaffected —
    // it still drives frames at ~60/sec.
    //
    // The replay is not what makes this slow. In the same measurement the hit
    // test ran in ~0.18ms, and `scroll` never arrived faster than one per
    // frame while scrolling was actually happening (Chromium: 49 events
    // across ~60 scrolling frames). #140 coalesces the replay to one per
    // frame anyway (#134) — a reasonable ceiling on the work, but it is not
    // what fixed the slowness here; the frame clock was.
    await page.waitForFunction(
      () => {
        const ul = (window as unknown as AsWindow).__asList
        return !!ul && ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 2
      },
      undefined,
      { timeout: 20000 }
    )

    // Release as soon as the list has scrolled. Do NOT also wait for the
    // placeholder to catch up first: since #140 the `scroll` replay is
    // coalesced to one `onPointerMove` per animation frame, so between the
    // last scroll tick and the next frame the placeholder is legitimately one
    // tick stale. `cleanupPointerDrag` flushes that pending replay
    // synchronously on pointerup, which is what makes the committed index
    // correct. Waiting for pre-release freshness therefore demands a state
    // the library no longer promises, and on a loaded runner it simply never
    // arrives — it timed out 3/3 on the Linux WebKit leg while the drop
    // itself was resolving correctly the whole time.
    // TEMPORARY diagnostics, captured immediately before release. The key
    // field is `underCursor`: if the row actually under the pointer is near
    // the end of the list but the committed index is not, the fault is in
    // target resolution rather than in scrolling.
    const diag = await page.evaluate(
      ({ x, y }) => {
        const ul = (window as unknown as AsWindow).__asList
        if (!ul) return null
        const kids = Array.from(ul.children)
        return {
          scrollTop: Math.round(ul.scrollTop),
          maxScroll: Math.round(ul.scrollHeight - ul.clientHeight),
          scrollEvents: (window as unknown as AsWindow).__asScrollEvents ?? -1,
          placeholderIndex: kids.findIndex((c) =>
            c.hasAttribute('data-resortable-placeholder')
          ),
          childCount: kids.length,
          underCursor: document.elementFromPoint(x, y)?.id ?? 'none',
        }
      },
      { x: list.x + 25, y: edgeY }
    )

    await page.mouse.up()

    const intents = await page.evaluate(
      () => (window as unknown as AsWindow).__asIntents ?? []
    )
    expect(intents).toHaveLength(1)
    const newIndex = intents[0].newIndexes?.[0] ?? -1
    // Source was row 0; after scrolling to the bottom the target must land far
    // down the list, not collapse back to 0.
    expect(newIndex, `pre-drop state: ${JSON.stringify(diag)}`).toBeGreaterThan(
      COUNT / 2
    )
  })
})
