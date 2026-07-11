/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test'
import {
  dragAndDropWithAnimation,
  waitForAnimations,
} from './helpers/animations'

/**
 * #79 — FLIP animation suite, rewritten against the pointer drag pipeline.
 *
 * Same root cause as #73: `locator.dragTo()` is an atomic Playwright action
 * that collapses the whole gesture into a single step, so the pointer
 * pipeline's `pointerdown`/`pointermove`/`pointerup` sequence never fires
 * the way it does for real input, and intermediate drag/animation states
 * aren't observable. This suite drives drags via `page.dragAndDrop` (already
 * proven reliable for this pipeline in on-move.spec.ts) or raw `page.mouse`
 * when a test needs to inspect a mid-drag state (the ghost visibility test).
 *
 * Targets `/playground.html` instead of the original
 * `examples/simple-list.html` / `examples/multi-list.html` fixtures — those
 * two pages import from `../dist/sortable.esm.js`, which doesn't exist until
 * `npm run build` runs, and the e2e CI job never builds dist. Every other
 * e2e spec already avoids those two example pages for the same reason;
 * playground.html imports straight from `src/` via Vite, matching
 * on-move.spec.ts's fixture.
 *
 * Timing: Playwright's `page.clock` fake-timer API does NOT drive the Web
 * Animations API that `AnimationManager` uses for FLIP (`element.animate()`
 * runs off the compositor's document timeline, not `setTimeout` /
 * `requestAnimationFrame`), so `page.clock.fastForward()` cannot advance a
 * FLIP animation. Instead we assert directly on the `Animation` objects
 * `element.animate()` creates (duration/easing/keyframes) for deterministic,
 * non-timing-based checks, and use `waitForAnimations()` (which awaits each
 * animation's `.finished` promise) rather than a fixed `waitForTimeout` when
 * we need the reorder to have settled.
 */

const BASIC_LIST = '#basic-list'
const basicItem = (id: string): string =>
  `${BASIC_LIST} [data-id="basic-${id}"]`

const SHARED_1 = '#shared-a-1'
const SHARED_2 = '#shared-a-2'
const sharedItem = (id: string): string => `.sortable-item[data-id="${id}"]`

async function idsIn(page: Page, listSelector: string): Promise<string[]> {
  return page.$$eval(
    `${listSelector} .sortable-item:not(.sortable-ghost)`,
    (els) =>
      (els as HTMLElement[])
        .map((el) => el.dataset.id ?? '')
        .filter((id) => id !== '')
  )
}

async function setOption(
  page: Page,
  listId: string,
  key: string,
  value: unknown
): Promise<void> {
  await page.evaluate(
    ({ listId, key, value }) => {
      const el = document.getElementById(listId)
      if (!el || !window.Sortable) return
      const sortable = (window.Sortable as any).get(el)
      sortable?.option(key, value)
    },
    { listId, key, value }
  )
}

/** Timing + keyframes of the first WAAPI animation on `selector`, or null. */
async function flipInfo(
  page: Page,
  selector: string
): Promise<{
  duration: number
  easing: string
  from: string
  to: string
} | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const anim = el?.getAnimations()[0]
    const effect = anim?.effect as KeyframeEffect | undefined
    if (!effect) return null
    const timing = effect.getTiming()
    const keyframes = effect.getKeyframes()
    return {
      duration: timing.duration as number,
      easing: timing.easing as string,
      from: String(keyframes[0]?.transform ?? ''),
      to: String(keyframes[keyframes.length - 1]?.transform ?? ''),
    }
  }, selector)
}

/** Count of `.sortable-item` elements in `listSelector` with an active/finished WAAPI animation. */
async function animatingCount(
  page: Page,
  listSelector: string
): Promise<number> {
  return page.evaluate((sel) => {
    const items = Array.from(
      document.querySelectorAll(`${sel} .sortable-item:not(.sortable-ghost)`)
    )
    return items.filter((el) => (el as HTMLElement).getAnimations().length > 0)
      .length
  }, listSelector)
}

async function center(
  page: Page,
  selector: string
): Promise<{ x: number; y: number }> {
  await page.locator(selector).scrollIntoViewIfNeeded()
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no bounding box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.describe('Animation System - Full Integration (#79)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground.html')
    await page.waitForFunction(() => window.resortableLoaded === true)
    await expect(page.locator(`${BASIC_LIST} .sortable-item`)).toHaveCount(4)
  })

  test('should animate item reordering with FLIP technique', async ({
    page,
  }) => {
    // basic-1 (index 0) dragged DOWN onto basic-2 (index 1) inserts AFTER
    // basic-2 (natural drag-down placement) — an adjacent swap.
    await page.dragAndDrop(basicItem('1'), basicItem('2'))

    // FLIP: AnimationManager captures the pre-move rect (First), performs
    // the DOM move (Last), then Inverts via a `translate()` keyframe
    // animating back to neutral (Play) — see
    // src/animation/AnimationManager.ts `animateReorder`.
    const flip = await flipInfo(page, basicItem('2'))
    expect(flip).not.toBeNull()
    expect(flip?.duration).toBe(150)
    expect(flip?.from).not.toBe('translate(0px, 0px)')
    // Chromium normalizes the authored `'translate(0, 0)'` keyframe value
    // (src/animation/AnimationManager.ts) to `'translate(0px, 0px)'` when
    // read back via `getKeyframes()`.
    expect(flip?.to).toBe('translate(0px, 0px)')

    await waitForAnimations(page)
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-2',
      'basic-1',
      'basic-3',
      'basic-4',
    ])
  })

  test('should respect animation duration option', async ({ page }) => {
    await setOption(page, 'basic-list', 'animation', 500)

    // Drag basic-1 (top) DOWN onto basic-4 (last) — natural placement =
    // insert AFTER basic-4.
    await page.dragAndDrop(basicItem('1'), basicItem('4'))

    const flip = await flipInfo(page, basicItem('2'))
    expect(flip?.duration).toBe(500)

    await waitForAnimations(page)
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-2',
      'basic-3',
      'basic-4',
      'basic-1',
    ])
  })

  test('should skip animation when duration is 0', async ({ page }) => {
    await setOption(page, 'basic-list', 'animation', 0)

    await page.dragAndDrop(basicItem('1'), basicItem('2'))

    // With animation: 0, AnimationManager.animateReorder runs the DOM move
    // synchronously and never calls element.animate() — no WAAPI animations
    // at all, and the reorder is already complete (no wait needed).
    expect(await animatingCount(page, BASIC_LIST)).toBe(0)
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-2',
      'basic-1',
      'basic-3',
      'basic-4',
    ])
  })

  test('should animate ghost element appearance and removal', async ({
    page,
  }) => {
    const from = await center(page, basicItem('1'))
    const to = await center(page, basicItem('2'))

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 10 })

    const ghost = page.locator(`${BASIC_LIST} .sortable-ghost`)
    await expect(ghost).toBeVisible()

    await page.mouse.up()

    await expect(ghost).toHaveCount(0)
  })

  test('should animate items when moving between lists', async ({ page }) => {
    const list1Items = page.locator(`${SHARED_1} .sortable-item`)
    const list2Items = page.locator(`${SHARED_2} .sortable-item`)

    const list1InitialCount = await list1Items.count()
    const list2InitialCount = await list2Items.count()

    await dragAndDropWithAnimation(page, sharedItem('a-1'), sharedItem('a-6'))

    await expect(list1Items).toHaveCount(list1InitialCount - 1)
    await expect(list2Items).toHaveCount(list2InitialCount + 1)
    expect(await idsIn(page, SHARED_2)).toContain('a-1')
  })

  test('should support custom easing functions', async ({ page }) => {
    await setOption(page, 'basic-list', 'animation', 300)
    await setOption(page, 'basic-list', 'easing', 'ease-in-out')

    await page.dragAndDrop(basicItem('1'), basicItem('4'))

    const flip = await flipInfo(page, basicItem('2'))
    expect(flip?.duration).toBe(300)
    expect(flip?.easing).toBe('ease-in-out')

    await waitForAnimations(page)
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-2',
      'basic-3',
      'basic-4',
      'basic-1',
    ])
  })

  test('should handle rapid successive drags with animation cancellation', async ({
    page,
  }) => {
    // Chain three drags without waiting for each 150ms FLIP animation to
    // settle — later drags can start while earlier animations are still
    // running. The interesting property isn't the exact final order (that's
    // an implementation detail of overlapping animations), it's that the
    // data set survives intact: no item duplicated or dropped.
    await page.dragAndDrop(basicItem('1'), basicItem('2'))
    await page.dragAndDrop(basicItem('2'), basicItem('3'))
    await page.dragAndDrop(basicItem('3'), basicItem('1'))

    await waitForAnimations(page)

    const order = await idsIn(page, BASIC_LIST)
    expect(order).toHaveLength(4)
    expect(new Set(order)).toEqual(
      new Set(['basic-1', 'basic-2', 'basic-3', 'basic-4'])
    )
  })

  test('should animate items affected by reordering', async ({ page }) => {
    // Drag basic-1 (index 0) to the last slot — basic-2/3/4 all shift up
    // one row, so all four items should receive a FLIP animation, not just
    // the dragged one.
    await page.dragAndDrop(basicItem('1'), basicItem('4'))

    expect(await animatingCount(page, BASIC_LIST)).toBe(4)

    await waitForAnimations(page)
    expect(await idsIn(page, BASIC_LIST)).toEqual([
      'basic-2',
      'basic-3',
      'basic-4',
      'basic-1',
    ])
  })
})
