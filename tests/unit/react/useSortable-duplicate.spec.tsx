import { describe, it, expect, afterEach, vi } from 'vitest'
import type { JSX } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { useSortable } from '../../../src/react/index'
import type { SortIntent, UseSortableOptions } from '../../../src/react/index'

/**
 * `duplicateKey` through the React adapter. The adapter builds its SortIntent
 * from the core `end` event, so these tests pin the contract that `end`
 * carries the drag's outcome: `pullMode: 'clone'` (with the offset-adjusted
 * landing index for a same-zone duplicate) — the exact signal a controlled
 * consumer needs to insert a copy instead of committing a move. Regression
 * coverage for the gap where `end` omitted `pullMode` and every alt-drag
 * reached consumers as a plain move.
 *
 * Pointer pipeline + jsdom `document.elementFromPoint` stub, same technique
 * as duplicate-key.spec.ts.
 */

interface HarnessProps {
  options: UseSortableOptions
  items: string[]
}

function Harness({ options, items }: HarnessProps): JSX.Element {
  const api = useSortable<HTMLUListElement>(options)
  return (
    <ul ref={api.ref}>
      {items.map((id) => (
        <li key={id} data-id={id} className="sortable-item">
          {id}
        </li>
      ))}
    </ul>
  )
}

interface Mods {
  altKey?: boolean
}

// jsdom lacks the PointerEvent constructor in some CI configurations — fall
// back to a plain MouseEvent cast, same pattern as duplicate-key.spec.ts.
function mkPointer(type: string, pointerId = 1, mods: Mods = {}): PointerEvent {
  try {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      isPrimary: true,
      button: 0,
      ...mods,
    })
  } catch {
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...mods,
    }) as unknown as PointerEvent
    Object.defineProperties(ev, {
      pointerId: { value: pointerId },
      isPrimary: { value: true },
    })
    return ev
  }
}

function pointerDrag(from: HTMLElement, over: HTMLElement, mods: Mods): void {
  document.elementFromPoint = () => over
  act(() => {
    from.dispatchEvent(mkPointer('pointerdown', 7, mods))
    document.dispatchEvent(mkPointer('pointermove', 7, mods))
    document.dispatchEvent(mkPointer('pointerup', 7, mods))
  })
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  delete (document as unknown as { elementFromPoint?: unknown })
    .elementFromPoint
})

describe('useSortable duplicateKey', () => {
  it('same-zone alt-drag delivers a clone intent at the offset-adjusted index', () => {
    const onSort = vi.fn<(intent: SortIntent) => void>()
    const { container } = render(
      <Harness
        options={{
          animation: 0,
          fallbackTolerance: 0,
          duplicateKey: 'alt',
          onSort,
        }}
        items={['a', 'b', 'c', 'd']}
      />
    )
    const list = container.querySelector('ul') as HTMLElement

    pointerDrag(
      list.children[0] as HTMLElement,
      list.children[2] as HTMLElement,
      { altKey: true }
    )

    expect(onSort).toHaveBeenCalledTimes(1)
    const intent = onSort.mock.calls[0][0]
    expect(intent.pullMode).toBe('clone')
    expect(intent.dataIds).toEqual(['a'])
    expect(intent.oldIndexes).toEqual([0])
    // pending.index 2 (hovering children[2]) + offset 1: the drag's own start
    // slot (0) sits at or before the drop point and the original never leaves
    // the list, so the copy lands one past the hovered slot.
    expect(intent.newIndexes).toEqual([3])
    expect(intent.from).toBe(intent.to)
    // Consumer DOM untouched — React still owns the order.
    expect(
      Array.from(list.children).map((el) => (el as HTMLElement).dataset.id)
    ).toEqual(['a', 'b', 'c', 'd'])
  })

  it('cross-zone alt-drag delivers a clone intent into the target zone', () => {
    const onSortA = vi.fn<(intent: SortIntent) => void>()
    const onSortB = vi.fn<(intent: SortIntent) => void>()
    const { container } = render(
      <div>
        <Harness
          options={{
            id: 'A',
            group: 'shared',
            animation: 0,
            fallbackTolerance: 0,
            duplicateKey: 'alt',
            onSort: onSortA,
          }}
          items={['a', 'b', 'c']}
        />
        <Harness
          options={{
            id: 'B',
            group: 'shared',
            animation: 0,
            fallbackTolerance: 0,
            duplicateKey: 'alt',
            onSort: onSortB,
          }}
          items={['x', 'y']}
        />
      </div>
    )
    const lists = container.querySelectorAll('ul')
    const listA = lists[0] as HTMLElement
    const listB = lists[1] as HTMLElement

    pointerDrag(
      listA.children[0] as HTMLElement,
      listB.children[1] as HTMLElement,
      { altKey: true }
    )

    // Intent fires on the SOURCE zone's hook, addressed to the target.
    expect(onSortA).toHaveBeenCalledTimes(1)
    expect(onSortB).not.toHaveBeenCalled()
    const intent = onSortA.mock.calls[0][0]
    expect(intent.pullMode).toBe('clone')
    expect(intent.dataIds).toEqual(['a'])
    expect(intent.fromId).toBe('A')
    expect(intent.toId).toBe('B')
  })

  it('plain drag (no modifier) still delivers a move intent, pullMode undefined', () => {
    const onSort = vi.fn<(intent: SortIntent) => void>()
    const { container } = render(
      <Harness
        options={{
          animation: 0,
          fallbackTolerance: 0,
          duplicateKey: 'alt',
          onSort,
        }}
        items={['a', 'b', 'c', 'd']}
      />
    )
    const list = container.querySelector('ul') as HTMLElement

    pointerDrag(
      list.children[0] as HTMLElement,
      list.children[2] as HTMLElement,
      {}
    )

    expect(onSort).toHaveBeenCalledTimes(1)
    const intent = onSort.mock.calls[0][0]
    expect(intent.pullMode).toBeUndefined()
    expect(intent.newIndexes).toEqual([2])
  })
})
