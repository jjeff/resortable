import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DragManager } from '../../src/core/DragManager'
import { DropZone } from '../../src/core/DropZone'
import { EventSystem } from '../../src/core/EventSystem'
import type { SortableEvents, SortableOptions } from '../../src/types/index'

/**
 * Unit coverage for issue #30 — the `ignore` option (legacy parity:
 * default `'a, img'`). When a pointer-down lands on a descendant of a
 * draggable item matching `ignore`, drag-initiation is aborted so the
 * browser's native handling (link click, `<img>` native drag) proceeds.
 *
 * Implementation lives in `DragManager.shouldAllowDrag` / `shouldIgnoreTarget`.
 * We exercise the pointer path here (HTML5 path shares the same gate).
 */

function makeContainer(): HTMLElement {
  document.body.innerHTML = ''
  const container = document.createElement('div')
  // Two draggable items — first contains an anchor and an image,
  // second contains a button + plain text region.
  container.innerHTML = `
    <div class="sortable-item" data-id="1" style="width:100px;height:40px">
      <a href="#" class="link" style="display:inline-block;width:40px;height:20px">link</a>
      <img class="img" alt="x" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="width:20px;height:20px">
      <span class="body" style="display:inline-block;width:30px;height:20px">body</span>
    </div>
    <div class="sortable-item" data-id="2" style="width:100px;height:40px">
      <button type="button" class="btn">b</button>
      <span class="body">text</span>
    </div>
  `
  document.body.appendChild(container)
  return container
}

function makePointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId = 1
): PointerEvent {
  try {
    return new PointerEvent(type, {
      clientX: 10,
      clientY: 10,
      pointerId,
      button: 0,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    })
  } catch {
    const ev = new MouseEvent(type, {
      clientX: 10,
      clientY: 10,
      button: 0,
      bubbles: true,
      cancelable: true,
    }) as unknown as PointerEvent & { pointerId: number; isPrimary: boolean }
    ;(ev as unknown as { pointerId: number }).pointerId = pointerId
    ;(ev as unknown as { isPrimary: boolean }).isPrimary = true
    return ev
  }
}

function makeManager(
  container: HTMLElement,
  options?: Pick<SortableOptions, 'ignore'>
): { dm: DragManager; events: EventSystem<SortableEvents> } {
  const zone = new DropZone(container)
  const events = new EventSystem<SortableEvents>()
  const dm = new DragManager(zone, events, undefined, {
    delayOnTouchOnly: 0,
    ignore: options?.ignore,
  })
  dm.attach()
  return { dm, events }
}

describe('ignore option (issue #30)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('exposes `ignore?: string` on SortableOptions with type-level optionality', () => {
    // Compile-time check: this should typecheck without error.
    const opts: SortableOptions = { ignore: 'a, img' }
    expect(opts.ignore).toBe('a, img')

    const empty: SortableOptions = { ignore: '' }
    expect(empty.ignore).toBe('')

    const omitted: SortableOptions = {}
    expect(omitted.ignore).toBeUndefined()
  })

  it('defaults to "a, img" — drag does NOT start from <a> or <img>', () => {
    const container = makeContainer()
    // No `ignore` passed — legacy default `'a, img'` should apply.
    const { dm, events } = makeManager(container)

    const chooseSpy = vi.fn()
    events.on('choose', chooseSpy)

    const link = container.querySelector('.link') as HTMLElement
    link.dispatchEvent(makePointer('pointerdown'))

    expect(dm.isDragging).toBe(false)
    expect(chooseSpy).not.toHaveBeenCalled()

    const img = container.querySelector('.img') as HTMLElement
    img.dispatchEvent(makePointer('pointerdown'))

    expect(dm.isDragging).toBe(false)
    expect(chooseSpy).not.toHaveBeenCalled()

    document.dispatchEvent(makePointer('pointerup'))
    dm.detach()
  })

  it('default does NOT block drag from non-ignored descendants', () => {
    const container = makeContainer()
    const { dm, events } = makeManager(container)

    const startSpy = vi.fn()
    events.on('choose', startSpy)

    const bodySpan = container.querySelector(
      '.sortable-item[data-id="1"] .body'
    ) as HTMLElement
    bodySpan.dispatchEvent(makePointer('pointerdown'))

    expect(dm.isDragging).toBe(true)
    expect(startSpy).toHaveBeenCalledTimes(1)

    document.dispatchEvent(makePointer('pointerup'))
    dm.detach()
  })

  it('custom selector honors user value — `ignore: "button"` blocks button, NOT link', () => {
    const container = makeContainer()
    const { dm, events } = makeManager(container, { ignore: 'button' })

    const startSpy = vi.fn()
    events.on('choose', startSpy)

    // Button — should be ignored.
    const btn = container.querySelector('.btn') as HTMLElement
    btn.dispatchEvent(makePointer('pointerdown'))
    expect(dm.isDragging).toBe(false)
    expect(startSpy).not.toHaveBeenCalled()

    // Link — NOT in custom `ignore`, so drag IS allowed.
    const link = container.querySelector('.link') as HTMLElement
    link.dispatchEvent(makePointer('pointerdown'))
    expect(dm.isDragging).toBe(true)
    expect(startSpy).toHaveBeenCalledTimes(1)

    document.dispatchEvent(makePointer('pointerup'))
    dm.detach()
  })

  it('empty string disables the default — drag CAN start from <a>', () => {
    const container = makeContainer()
    const { dm, events } = makeManager(container, { ignore: '' })

    const startSpy = vi.fn()
    events.on('choose', startSpy)

    const link = container.querySelector('.link') as HTMLElement
    link.dispatchEvent(makePointer('pointerdown'))

    expect(dm.isDragging).toBe(true)
    expect(startSpy).toHaveBeenCalledTimes(1)

    document.dispatchEvent(makePointer('pointerup'))
    dm.detach()
  })

  it('tolerates a malformed criterion without aborting the rest', () => {
    const container = makeContainer()
    // First criterion is invalid CSS; the second one (`a`) must still match.
    const { dm, events } = makeManager(container, { ignore: ':::bogus, a' })

    const startSpy = vi.fn()
    events.on('choose', startSpy)

    const link = container.querySelector('.link') as HTMLElement
    link.dispatchEvent(makePointer('pointerdown'))

    expect(dm.isDragging).toBe(false)
    expect(startSpy).not.toHaveBeenCalled()

    document.dispatchEvent(makePointer('pointerup'))
    dm.detach()
  })

  it('ignore + handle both respected: handle restricts where drag CAN start, ignore restricts where it CANNOT', () => {
    const container = makeContainer()
    // Adjust item to include a handle inside.
    const item = container.querySelector(
      '.sortable-item[data-id="1"]'
    ) as HTMLElement
    item.innerHTML = `
      <span class="drag-handle">≡</span>
      <a href="#" class="link">link</a>
    `
    const zone = new DropZone(container)
    const events = new EventSystem<SortableEvents>()
    const dm = new DragManager(zone, events, undefined, {
      delayOnTouchOnly: 0,
      handle: '.drag-handle',
      // ignore defaults to 'a, img'
    })
    dm.attach()

    const startSpy = vi.fn()
    events.on('choose', startSpy)

    // Click the link — ignore wins (link is in default ignore selector).
    const link = item.querySelector('.link') as HTMLElement
    link.dispatchEvent(makePointer('pointerdown'))
    expect(dm.isDragging).toBe(false)
    expect(startSpy).not.toHaveBeenCalled()

    // Click the handle — drag starts (not ignored, matches handle).
    const handleEl = item.querySelector('.drag-handle') as HTMLElement
    handleEl.dispatchEvent(makePointer('pointerdown'))
    expect(dm.isDragging).toBe(true)
    expect(startSpy).toHaveBeenCalledTimes(1)

    document.dispatchEvent(makePointer('pointerup'))
    dm.detach()
  })
})
