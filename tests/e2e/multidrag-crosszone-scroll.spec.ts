import { expect, test, Page } from '@playwright/test'

/**
 * Nested-sortables cross-zone resolution (jjeff/resortable#124 follow-up;
 * downstream spaceagetv/missioncontrol#4566).
 *
 * Shape mirrors Visibox's Controller: an OUTER song-list Sortable (its own
 * group) whose items are "songs"; each song nests its own controlled,
 * multi-drag "clip zone" Sortable, all clip zones sharing one group. The
 * clips are laid out as a horizontal row, so a song is short vertically and
 * the CENTER of a whole song element sits on its header — which belongs to
 * the outer song-list zone, NOT the clip zone.
 *
 * The Visibox helper drops on the whole song element (`$to = #songID`), so
 * the pointer resolves to the outer (group-incompatible) song zone. The drop
 * must still fall through to that song's nested clip grid instead of
 * collapsing to a no-op back at the source. Before the fix, resolution
 * stopped at the outer zone and the move was a no-op (from === to === source).
 *
 * The Visibox test helper's event order is reproduced faithfully:
 *   pointerdown on a selected clip
 *   → (pause)
 *   → scrollIntoView(target song)  [scrolls the OUTER list before any move]
 *   → stepped pointermove to the target
 *   → (settle) → 1px nudge → pointerup
 */

interface AsWindow extends Window {
  Sortable?: typeof import('../../src/index.js').Sortable
  __intents?: Array<{
    from: string
    to: string
    oldIndexes?: number[]
    newIndexes?: number[]
    itemCount: number
  }>
}

const SONG_COUNT = 8
const CLIPS_PER_SONG = 6
const SOURCE_SONG = 0
const TARGET_SONG = 6 // below the fold — requires an outer scroll to reach
// The whole-song drop point lands on the header regardless of clip count
// (horizontal clip row keeps every song short). Matches Visibox's 6-clip
// target song.
const TARGET_CLIPS = 6

async function buildNestedSongs(page: Page): Promise<void> {
  await page.evaluate(
    ({ songCount, clipsPerSong, targetSong, targetClips }) => {
      document.getElementById('body')?.remove()
      const win = window as unknown as AsWindow
      const Sortable = win.Sortable
      if (!Sortable) throw new Error('Sortable not loaded on window')
      win.__intents = []

      // Scroll container is an ANCESTOR of the song Sortable (mirrors
      // Visibox's `.vb-controller-window__body` wrapping the song `<ol>`).
      const body = document.createElement('div')
      body.id = 'body'
      body.style.cssText =
        'position:absolute;top:20px;left:20px;width:280px;height:220px;overflow-y:auto;background:#f0f0f4;border:1px solid #99a'

      const songList = document.createElement('ol')
      songList.id = 'songs'
      songList.style.cssText = 'list-style:none;margin:0;padding:0'
      body.appendChild(songList)

      const clipOnEnd = (evt: {
        from?: HTMLElement
        to?: HTMLElement
        oldIndexes?: number[]
        newIndexes?: number[]
        items?: unknown[]
      }): void => {
        win.__intents?.push({
          from: evt.from?.id ?? '?',
          to: evt.to?.id ?? '?',
          oldIndexes: evt.oldIndexes,
          newIndexes: evt.newIndexes,
          itemCount: evt.items?.length ?? 0,
        })
      }

      for (let s = 0; s < songCount; s++) {
        const clipCount = s === targetSong ? targetClips : clipsPerSong
        const song = document.createElement('li')
        song.id = `song-${s}`
        song.className = 'song'
        song.style.cssText =
          'margin:8px;padding:6px;background:#fff;border:1px solid #ccd'

        const handle = document.createElement('div')
        handle.className = 'song-handle'
        handle.textContent = `☰ Song ${s}`
        // Header taller than the single clip row so the whole-song center
        // sits on the header (the outer song-list zone), reproducing the
        // Visibox drop geometry.
        handle.style.cssText =
          'font-weight:bold;height:44px;line-height:44px;cursor:grab'
        song.appendChild(handle)

        const zone = document.createElement('ul')
        zone.id = `zone-${s}`
        zone.className = 'clip-zone'
        // Horizontal clip row (Visibox lays a song's clips left-to-right),
        // so a song is short vertically: header row + one clip row. Its
        // whole-element center therefore lands on the HEADER, which belongs
        // to the OUTER song-list zone — the nested-resolution case (#124).
        zone.style.cssText =
          'list-style:none;margin:0;min-height:28px;padding:2px;display:flex;flex-wrap:nowrap;gap:4px;overflow-x:auto'

        for (let c = 0; c < clipCount; c++) {
          const clip = document.createElement('li')
          clip.id = `s${s}c${c}`
          clip.className = 'clip'
          clip.style.cssText =
            'flex:0 0 auto;width:38px;height:26px;box-sizing:border-box;padding:2px 4px;background:#8ac;border:1px solid #457;cursor:move'
          clip.textContent = `${c}`
          zone.appendChild(clip)
        }
        song.appendChild(zone)
        songList.appendChild(song)

        // Clip grid — controlled, multi-drag, shared group. Options mirror
        // Visibox's useClipGridSorting.
        new Sortable(zone, {
          group: 'clips',
          controlled: true,
          multiDrag: true,
          multiDragKey: 'meta',
          draggable: '.clip',
          dataIdAttr: 'id',
          animation: 200,
          scroll: true,
          scrollSensitivity: 200,
          fallbackOnBody: true,
          fallbackTolerance: 5,
          onEnd: clipOnEnd,
        })
      }

      // Outer song list — also a Sortable (nested sortables). Mirrors
      // Visibox's useSongListSorting: drag only via the handle, multiDrag,
      // controlled, big scrollSensitivity.
      new Sortable(songList, {
        group: 'songs',
        controlled: true,
        multiDrag: true,
        multiDragKey: 'meta',
        draggable: '.song',
        handle: '.song-handle',
        dataIdAttr: 'id',
        direction: 'vertical',
        animation: 400,
        scroll: true,
        scrollSensitivity: 200,
        fallbackOnBody: true,
        fallbackTolerance: 5,
      })

      document.body.appendChild(body)
    },
    {
      songCount: SONG_COUNT,
      clipsPerSong: CLIPS_PER_SONG,
      targetSong: TARGET_SONG,
      targetClips: TARGET_CLIPS,
    }
  )
}

/** Center of an element in viewport coordinates. */
async function center(
  page: Page,
  id: string
): Promise<{ x: number; y: number }> {
  const box = await page.locator(`#${id}`).boundingBox()
  if (!box) throw new Error(`no box for #${id}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.describe('multi-drag cross-zone in a nested scrolling list (#124 follow-up)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
  })

  // Select the first N clips of the source song via Ctrl/Cmd+Click.
  async function selectSourceClips(page: Page, n: number): Promise<void> {
    for (let c = 0; c < n; c++) {
      const id = `s${SOURCE_SONG}c${c}`
      await page.locator(`#${id}`).click({ modifiers: ['ControlOrMeta'] })
    }
  }

  test('dropping multi-selection on a song header lands in its nested clip grid', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only pointer pipeline'
    )
    await buildNestedSongs(page)

    const SELECT = 5
    await selectSourceClips(page, SELECT)
    // Confirm the selection took.
    for (let c = 0; c < SELECT; c++) {
      await expect(page.locator(`#s${SOURCE_SONG}c${c}`)).toHaveAttribute(
        'aria-selected',
        'true'
      )
    }

    // --- Visibox sortableDragAndDrop sequence ---
    const from = await center(page, `#s${SOURCE_SONG}c0`.slice(1))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.waitForTimeout(200)

    // scrollIntoView the target SONG — scrolls the OUTER list, fires BEFORE
    // any pointermove. Visibox drops on the whole song element (`$to = #songID`).
    await page.evaluate((tid) => {
      document.getElementById(tid)?.scrollIntoView({ block: 'center' })
    }, `song-${TARGET_SONG}`)

    const to = await center(page, `song-${TARGET_SONG}`)
    await page.mouse.move(to.x, to.y, { steps: 20 })
    await page.waitForTimeout(250)
    await page.mouse.move(to.x + 1, to.y)
    await page.waitForTimeout(100)
    await page.mouse.up()

    const intents = await page.evaluate(
      () => (window as unknown as AsWindow).__intents ?? []
    )

    // Exactly one cross-zone intent, moving all selected clips into the target.
    expect(intents.length).toBeGreaterThan(0)
    const last = intents[intents.length - 1]
    expect(last.from).toBe(`zone-${SOURCE_SONG}`)
    expect(last.to).toBe(`zone-${TARGET_SONG}`)
    expect(last.itemCount).toBe(SELECT)
  })

  test('a multi-selection built out of visual order drags as a DOM-ordered block', async ({
    page,
  }, testInfo) => {
    test.skip(
      /Mobile/.test(testInfo.project.name),
      'Desktop-only pointer pipeline'
    )
    await buildNestedSongs(page)

    // Select five clips in SCRAMBLED order (not left-to-right). The drag
    // must still move them as a contiguous run in visual/DOM order — a
    // block selected via marquee/scattered clicks otherwise lands
    // reordered at the drop site (Sortable.js multiDrag parity).
    const clickOrder = [2, 0, 4, 1, 3]
    for (const c of clickOrder) {
      await page
        .locator(`#s${SOURCE_SONG}c${c}`)
        .click({ modifiers: ['ControlOrMeta'] })
    }

    const from = await center(page, `#s${SOURCE_SONG}c0`.slice(1))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.waitForTimeout(200)
    await page.evaluate((tid) => {
      document.getElementById(tid)?.scrollIntoView({ block: 'center' })
    }, `song-${TARGET_SONG}`)
    const to = await center(page, `song-${TARGET_SONG}`)
    await page.mouse.move(to.x, to.y, { steps: 20 })
    await page.waitForTimeout(250)
    await page.mouse.move(to.x + 1, to.y)
    await page.waitForTimeout(100)
    await page.mouse.up()

    const intents = await page.evaluate(
      () => (window as unknown as AsWindow).__intents ?? []
    )
    expect(intents.length).toBeGreaterThan(0)
    const last = intents[intents.length - 1]
    expect(last.itemCount).toBe(clickOrder.length)
    // The block's source indices come out ascending (DOM order), NOT in
    // the [2,0,4,1,3] click order — that is the multiDrag-order fix.
    expect(last.oldIndexes).toEqual([0, 1, 2, 3, 4])
    // ...and they land as a contiguous ascending run in the target.
    const ni = last.newIndexes ?? []
    for (let i = 1; i < ni.length; i++) {
      expect(ni[i]).toBe(ni[i - 1] + 1)
    }
  })
})
