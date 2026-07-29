import { describe, it, expect, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'
import type { SortableEvent } from '../../src/types/index'
import { DUPLICATE_CLASS } from '../../src/utils/dom'

/**
 * Unit coverage for the pointer-pipeline slice of `duplicateKey` — the
 * configured modifier (alt/ctrl/meta/shift), evaluated LIVE at drop time,
 * turns a drag into a duplicate instead of a move. Same-zone: a copy lands
 * at the drop slot and the original FLIP-animates back to its start index.
 * Cross-zone: existing `group.pull: 'clone'` semantics apply. Controlled
 * mode: no DOM mutation, events report the intent (see
 * GlobalDragState.endControlledDrag's offset math).
 *
 * Driven through the pointer/PointerEvent pipeline — same technique as
 * `pointer-html5-parity.spec.ts` (jsdom `document.elementFromPoint` stub,
 * `fallbackTolerance: 0`, a PointerEvent-or-MouseEvent-fallback helper).
 */

function makeList(count = 4): HTMLElement {
  const ul = document.createElement('ul')
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li')
    li.className = 'item'
    li.dataset.id = `it-${i}`
    li.textContent = `Item ${i}`
    ul.appendChild(li)
  }
  document.body.appendChild(ul)
  return ul
}

interface Mods {
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

// jsdom lacks the PointerEvent constructor in some CI configurations — fall
// back to a plain MouseEvent cast, same pattern as pointer-html5-parity.spec.ts.
function mkPointer(type: string, pointerId = 1, mods: Mods = {}): PointerEvent {
  const initProps = {
    pointerId,
    isPrimary: true,
    button: 0,
    ...mods,
  }
  try {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      ...initProps,
    })
  } catch {
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...mods,
    }) as unknown as PointerEvent
    // MouseEvent's own props are getter-only — define, don't assign.
    Object.defineProperties(ev, {
      pointerId: { value: pointerId },
      isPrimary: { value: true },
    })
    return ev
  }
}

function click(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  )
}

/**
 * Full `data-id` order of a list. Counts alone can't tell a copy that landed
 * at the drop slot from one appended to the end, so every duplicate test
 * pins the whole order.
 */
function ids(list: HTMLElement): (string | undefined)[] {
  return Array.from(list.querySelectorAll<HTMLElement>('.item')).map(
    (el) => el.dataset.id
  )
}

describe('duplicateKey', () => {
  let sortable: Sortable | undefined
  let toSortable: Sortable | undefined

  afterEach(() => {
    sortable?.destroy()
    toSortable?.destroy()
    sortable = undefined
    toSortable = undefined
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint
  })

  it('same-zone alt-drag duplicates: original stays put, copy lands at the drop slot', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 1, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 1, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 1, { altKey: true }))

    // Pinned order, not just a count: the copy lands at the DROP SLOT
    // (index 3, before it-3) — an implementation that appended copies to the
    // end would still satisfy a length check.
    expect(ids(ul)).toEqual(['it-0', 'it-1', 'it-2', 'it-0', 'it-3'])
    // The original node is the SAME reference, restored to index 0.
    expect(ul.children[0]).toBe(dragged)

    expect(cloneSpy).toHaveBeenCalledTimes(1)
    const payload = cloneSpy.mock.calls[0][0] as SortableEvent
    expect(payload.to).toBe(payload.from)
    expect(payload.pullMode).toBe('clone')
    expect(payload.oldIndex).toBe(0)
    expect(payload.newIndex).toBe(3)
    expect(payload.oldIndexes).toEqual([0])
    expect(payload.newIndexes).toEqual([3])

    // The copy is a distinct node carrying the original's data-id (identity
    // attrs are the clone-event handler's job to re-mint, per the option doc).
    const copy = Array.from(ul.children).find(
      (el) => el !== dragged && (el as HTMLElement).dataset.id === 'it-0'
    )
    expect(copy).toBeTruthy()
    expect(payload.clone).toBe(copy)
  })

  it('same-zone drag without the modifier is a plain move (regression)', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 2))
    document.dispatchEvent(mkPointer('pointermove', 2))
    document.dispatchEvent(mkPointer('pointerup', 2))

    expect(ul.children.length).toBe(4)
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  it('arms duplicate mid-drag on a keydown alone, no pointermove required', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 3))
    document.dispatchEvent(mkPointer('pointermove', 3))

    const ghost = document.querySelector<HTMLElement>('[data-resortable-ghost]')
    if (!ghost) throw new Error('expected a ghost element')
    expect(ghost.classList.contains(DUPLICATE_CLASS)).toBe(false)

    // Alt pressed mid-drag — a keyboard event alone, no mouse movement.
    document.dispatchEvent(new KeyboardEvent('keydown', { altKey: true }))
    expect(ghost.classList.contains(DUPLICATE_CLASS)).toBe(true)

    // Alt is still physically held at release, so the pointerup carries it too.
    document.dispatchEvent(mkPointer('pointerup', 3, { altKey: true }))

    expect(ul.children.length).toBe(5)
  })

  it('a keyup release before pointerup falls back to a plain move', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 4, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 4, { altKey: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { altKey: false }))
    // Alt has been released — the real pointerup would no longer carry it.
    document.dispatchEvent(mkPointer('pointerup', 4))

    expect(ul.children.length).toBe(4)
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  it('cross-zone alt-drag duplicates: copy lands in the target, original returns to its source slot', () => {
    const from = makeList(3)
    const to = makeList(3)
    Array.from(to.children).forEach((el, i) => {
      ;(el as HTMLElement).dataset.id = `to-${i}`
    })
    const cloneSpy = vi.fn()
    const addSpy = vi.fn()
    const opts = {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt' as const,
    }
    sortable = new Sortable(from, {
      ...opts,
      group: 'shared',
      onClone: cloneSpy,
    })
    toSortable = new Sortable(to, { ...opts, group: 'shared', onAdd: addSpy })

    const dragged = from.children[1] as HTMLElement
    const hit = to.children[0] as HTMLElement
    document.elementFromPoint = () => hit

    dragged.dispatchEvent(mkPointer('pointerdown', 5, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 5, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 5, { altKey: true }))

    // Source: unchanged order, original back at its start index (1).
    expect(ids(from)).toEqual(['it-0', 'it-1', 'it-2'])
    expect(from.children[1]).toBe(dragged)
    // Target: the copy lands at the hovered slot (index 0), not appended.
    expect(ids(to)).toEqual(['it-1', 'to-0', 'to-1', 'to-2'])

    expect(cloneSpy).toHaveBeenCalledTimes(1)
    expect(addSpy).toHaveBeenCalledTimes(1)
    const clonePayload = cloneSpy.mock.calls[0][0] as SortableEvent
    expect(clonePayload.from).toBe(from)
    expect(clonePayload.to).toBe(to)
  })

  it('group pull:"clone" cross-zone + duplicateKey still produces exactly one clone', () => {
    const from = makeList(3)
    const to = makeList(3)
    const cloneSpy = vi.fn()
    const opts = {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt' as const,
    }
    sortable = new Sortable(from, {
      ...opts,
      group: { name: 'shared', pull: 'clone' },
      onClone: cloneSpy,
    })
    toSortable = new Sortable(to, { ...opts, group: 'shared' })

    const dragged = from.children[0] as HTMLElement
    const hit = to.children[0] as HTMLElement
    document.elementFromPoint = () => hit

    dragged.dispatchEvent(mkPointer('pointerdown', 6, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 6, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 6, { altKey: true }))

    expect(cloneSpy).toHaveBeenCalledTimes(1)
    // Anti-double-clone: materializeDuplicate must bail when group
    // pull:'clone' already created the copy — only ONE extra node total.
    expect(from.children.length + to.children.length).toBe(3 + 3 + 1)
  })

  it('controlled mode same-zone duplicate: zero consumer-DOM mutation, offset-adjusted newIndex', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      controlled: true,
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const idsBefore = Array.from(ul.children).map(
      (el) => (el as HTMLElement).dataset.id
    )

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 7, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 7, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 7, { altKey: true }))

    const idsAfter = Array.from(ul.querySelectorAll('.item')).map(
      (el) => (el as HTMLElement).dataset.id
    )
    expect(idsAfter).toEqual(idsBefore)

    expect(cloneSpy).toHaveBeenCalledTimes(1)
    const payload = cloneSpy.mock.calls[0][0] as SortableEvent
    expect(payload.pullMode).toBe('clone')
    expect(payload.to).toBe(payload.from)
    // pending.index (2, hovering children[2]) + offset (1, since the drag's
    // own start index 0 sits <= 2 and so shifts the landing spot by one).
    expect(payload.newIndex).toBe(3)
  })

  it('duplicateKey unset: alt held has no effect (fully inert, plain move)', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 8, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 8, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 8, { altKey: true }))

    expect(ul.children.length).toBe(4)
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  describe('duplicateKey relaxes the selection-modifier pointerdown guard', () => {
    it('ctrl+pointerdown starts a drag when multiDrag is off', () => {
      const ul = makeList(4)
      const startSpy = vi.fn()
      sortable = new Sortable(ul, {
        draggable: '.item',
        animation: 0,
        fallbackTolerance: 0,
        duplicateKey: 'ctrl',
        onStart: startSpy,
      })

      const dragged = ul.children[0] as HTMLElement
      const target = ul.children[2] as HTMLElement
      document.elementFromPoint = () => target

      dragged.dispatchEvent(mkPointer('pointerdown', 9, { ctrlKey: true }))
      expect(startSpy).toHaveBeenCalledTimes(1)
      document.dispatchEvent(mkPointer('pointermove', 9, { ctrlKey: true }))
      document.dispatchEvent(mkPointer('pointerup', 9, { ctrlKey: true }))

      // The relaxation is only useful if the drag it allows actually
      // duplicates — assert the outcome, not just that `start` fired.
      expect(ids(ul)).toEqual(['it-0', 'it-1', 'it-2', 'it-0', 'it-3'])
    })

    it('ctrl+pointerdown does NOT start a drag when multiDrag is on (stays a selection gesture)', () => {
      const ul = makeList(4)
      const startSpy = vi.fn()
      sortable = new Sortable(ul, {
        draggable: '.item',
        animation: 0,
        fallbackTolerance: 0,
        duplicateKey: 'ctrl',
        multiDrag: true,
        onStart: startSpy,
      })

      const dragged = ul.children[0] as HTMLElement
      dragged.dispatchEvent(mkPointer('pointerdown', 10, { ctrlKey: true }))
      expect(startSpy).not.toHaveBeenCalled()
    })
  })

  it('multi-drag: two selected items duplicate together in the same zone', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      multiDrag: true,
      multiDragKey: 'meta',
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const a = ul.children[0] as HTMLElement
    const b = ul.children[1] as HTMLElement
    click(a, { metaKey: true })
    click(b, { metaKey: true })
    expect(a.classList.contains('sortable-selected')).toBe(true)
    expect(b.classList.contains('sortable-selected')).toBe(true)

    const target = ul.children[3] as HTMLElement
    document.elementFromPoint = () => target

    a.dispatchEvent(mkPointer('pointerdown', 11, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 11, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 11, { altKey: true }))

    // Both originals restored to their start indices (0, 1); the two copies
    // land together at the drop slot, which for a drop on the LAST item is
    // the end of the list.
    expect(ids(ul)).toEqual(['it-0', 'it-1', 'it-2', 'it-3', 'it-0', 'it-1'])
    expect(ul.children[0]).toBe(a)
    expect(ul.children[1]).toBe(b)
    expect(cloneSpy).toHaveBeenCalledTimes(1)

    const payload = cloneSpy.mock.calls[0][0] as SortableEvent
    expect(payload.oldIndexes).toEqual([0, 1])
    expect(payload.newIndexes).toEqual([4, 5])
  })

  // ---------------------------------------------------------------------
  // Regressions: things that must NOT duplicate.
  // ---------------------------------------------------------------------

  it('alt+click with no pointermove does not duplicate', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    document.elementFromPoint = () => dragged

    // fallbackTolerance defaults to 0, so pointerdown commits the drag
    // immediately — without a movement check this bare click would duplicate.
    dragged.dispatchEvent(mkPointer('pointerdown', 12, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 12, { altKey: true }))

    expect(ids(ul)).toEqual(['it-0', 'it-1', 'it-2', 'it-3'])
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  it('destroy() mid-drag with the modifier held adds no phantom copy', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 13, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 13, { altKey: true }))

    // Teardown mid-drag (React unmount, or `option()` rebuilding the manager)
    // must stay behaviourally neutral — no phantom copy, no clone event.
    // Teardown is non-reverting by design, so the item keeps whatever slot
    // the live drag gave it; what must NOT happen is a duplicate.
    sortable.destroy()
    sortable = undefined

    expect(ids(ul)).toEqual(['it-1', 'it-2', 'it-0', 'it-3'])
    expect(ul.querySelectorAll('[data-id="it-0"]')).toHaveLength(1)
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  it('pointercancel with the modifier held does not duplicate', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 14, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 14, { altKey: true }))
    // An interrupted gesture, not a drop — no copy is materialized.
    document.dispatchEvent(mkPointer('pointercancel', 14, { altKey: true }))

    expect(ul.querySelectorAll('.item')).toHaveLength(4)
    expect(cloneSpy).not.toHaveBeenCalled()
  })

  it('an item orphaned mid-drag warns and degrades to a plain move', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'alt',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 15, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 15, { altKey: true }))
    // An external re-render detaches the item out from under the drag.
    dragged.remove()
    document.dispatchEvent(mkPointer('pointerup', 15, { altKey: true }))

    expect(cloneSpy).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[resortable] materializeDuplicate: item has no parent, aborting duplicate'
    )
    // No detached clone smuggled into the list.
    expect(ul.querySelectorAll('.item')).toHaveLength(3)
  })

  it('a duplicated copy of a selected item is not itself selected', () => {
    const ul = makeList(4)
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      multiDrag: true,
      multiDragKey: 'meta',
      duplicateKey: 'alt',
    })

    const a = ul.children[0] as HTMLElement
    click(a, { metaKey: true })
    expect(a.classList.contains('sortable-selected')).toBe(true)

    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    a.dispatchEvent(mkPointer('pointerdown', 16, { altKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 16, { altKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 16, { altKey: true }))

    const copy = Array.from(ul.querySelectorAll<HTMLElement>('.item')).find(
      (el) => el !== a && el.dataset.id === 'it-0'
    )
    expect(copy).toBeTruthy()
    // SelectionManager never learns about the copy, so a highlight it carried
    // over would be unclearable.
    expect(copy!.classList.contains('sortable-selected')).toBe(false)
    expect(a.classList.contains('sortable-selected')).toBe(true)
  })

  it('ctrl+click with no movement toggles selection but does NOT duplicate', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'ctrl',
      // enableAccessibility defaults to true — click selection is live.
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    document.elementFromPoint = () => dragged

    dragged.dispatchEvent(mkPointer('pointerdown', 17, { ctrlKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 17, { ctrlKey: true }))
    click(dragged, { ctrlKey: true })

    expect(ids(ul)).toEqual(['it-0', 'it-1', 'it-2', 'it-3'])
    expect(cloneSpy).not.toHaveBeenCalled()
    expect(dragged.classList.contains('sortable-selected')).toBe(true)
  })

  it('documents the ctrl-drag double side effect: the trailing click also selects', () => {
    const ul = makeList(4)
    const cloneSpy = vi.fn()
    sortable = new Sortable(ul, {
      draggable: '.item',
      animation: 0,
      fallbackTolerance: 0,
      duplicateKey: 'ctrl',
      onClone: cloneSpy,
    })

    const dragged = ul.children[0] as HTMLElement
    const target = ul.children[2] as HTMLElement
    document.elementFromPoint = () => target

    dragged.dispatchEvent(mkPointer('pointerdown', 18, { ctrlKey: true }))
    document.dispatchEvent(mkPointer('pointermove', 18, { ctrlKey: true }))
    document.dispatchEvent(mkPointer('pointerup', 18, { ctrlKey: true }))
    // Browsers fire `click` after `pointerup`.
    click(dragged, { ctrlKey: true })

    expect(ids(ul)).toEqual(['it-0', 'it-1', 'it-2', 'it-0', 'it-3'])
    expect(cloneSpy).toHaveBeenCalledTimes(1)
    // KNOWN, DOCUMENTED behaviour (see the `duplicateKey` TSDoc): a
    // ctrl/meta/shift duplicate drag ALSO toggles selection on the trailing
    // click. Nothing suppresses it — 'alt' is the recommended value.
    expect(dragged.classList.contains('sortable-selected')).toBe(true)
  })
})
