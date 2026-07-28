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

      // Hide the playground's own content first. This fixture is
      // position:absolute over `document.body`, and the page underneath has
      // sortable lists of its own. Where they land depends on viewport size
      // and font metrics, so on some environments one of them covered this
      // list's drop point: `document.elementFromPoint` at the cursor returned
      // `shared-a-1` — a row from an unrelated list — and the drag resolved
      // its target there, committing indexes like 5 and 11 instead of 29.
      //
      // It reproduced only on the Linux WebKit CI runner and never locally,
      // at any CPU count, in isolation or under the full suite, which made it
      // read convincingly like a scroll-event timing bug. It was a layout
      // overlap. z-index alone is not enough: an overlapping element in its
      // own stacking context can still win the hit test.
      for (const child of Array.from(document.body.children)) {
        ;(child as HTMLElement).style.display = 'none'
      }

      const ul = document.createElement('ul')
      ul.id = 'as-list'
      ul.style.cssText = `list-style:none;margin:0;padding:0;position:absolute;top:40px;left:40px;width:120px;height:${viewportH}px;overflow-y:auto;background:#eef;z-index:2147483647`
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
    // tick stale, and `cleanupPointerDrag` flushes that pending replay on
    // pointerup. Such a wait was tried here and only masked the overlap bug
    // described in `buildScrollingList` — it timed out instead of failing on
    // the index, which made a layout problem look like a timing problem.
    //
    // State at the instant of release, used for both the guard below and the
    // failure message on the final assertion. A bare index mismatch is close
    // to undebuggable on a runner you cannot attach to; these few fields are
    // what actually identified the bug this test previously had.
    const diag = await page.evaluate(
      ({ x, y }) => {
        const ul = (window as unknown as AsWindow).__asList
        if (!ul) return null
        const kids = Array.from(ul.children)
        return {
          scrollTop: Math.round(ul.scrollTop),
          maxScroll: Math.round(ul.scrollHeight - ul.clientHeight),
          placeholderIndex: kids.findIndex((c) =>
            c.hasAttribute('data-resortable-placeholder')
          ),
          childCount: kids.length,
          underCursor: document.elementFromPoint(x, y)?.id ?? 'none',
          // The list itself is a legitimate hit at the bottom edge (the point
          // can land on the ul's own box rather than a row), so containment
          // is the real question, not whether the id looks like a row.
          cursorInList: ul.contains(document.elementFromPoint(x, y)),
        }
      },
      { x: list.x + 25, y: edgeY }
    )

    // Guard the premise before asserting the conclusion. If something else on
    // the page covers the drop point, the drag resolves against that element
    // and the committed index is meaningless — which is exactly how this test
    // used to fail, with an index that looked like a scroll bug. Fail here
    // instead, where the message names the real cause.
    expect(
      diag?.cursorInList,
      `cursor is not over the fixture list: ${JSON.stringify(diag)}`
    ).toBe(true)

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
