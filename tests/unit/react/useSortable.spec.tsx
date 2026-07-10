import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import type { JSX } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { useSortable } from '../../../src/react/index'
import type {
  SortIntent,
  UseSortableOptions,
  UseSortableReturn,
} from '../../../src/react/index'
import { Sortable } from '../../../src/index'

/**
 * `resortable/react` — useSortable hook.
 *
 * Drag mechanics are covered by the controlled-mode core suite; these tests
 * cover the adapter contract: mount/StrictMode safety, intent assembly and
 * single delivery, option diffing without remount, selection bridge, and
 * keyboard focus restore. Real HTML5 drag events drive the integration
 * paths (same jsdom-friendly approach as controlled-mode.spec.ts).
 */

let api: UseSortableReturn<HTMLUListElement>

interface HarnessProps {
  options: UseSortableOptions
  items: string[]
}

function Harness({ options, items }: HarnessProps): JSX.Element {
  api = useSortable<HTMLUListElement>(options)
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

function makeDragEvent(type: string, init: DragEventInit = {}): DragEvent {
  try {
    return new DragEvent(type, { bubbles: true, cancelable: true, ...init })
  } catch {
    return new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  }
}

function item(container: HTMLElement, dataId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-id="${dataId}"]`)
  if (!el) throw new Error(`no item ${dataId}`)
  return el
}

/** Full same-zone HTML5 drag */
function html5Drag(from: HTMLElement, over: HTMLElement): void {
  act(() => {
    from.dispatchEvent(makeDragEvent('dragstart'))
    over.dispatchEvent(makeDragEvent('dragover'))
    over.dispatchEvent(makeDragEvent('drop'))
    from.dispatchEvent(makeDragEvent('dragend'))
  })
}

const ITEMS = ['a', 'b', 'c', 'd']

describe('useSortable', () => {
  let onSort: ReturnType<typeof vi.fn<(intent: SortIntent) => void>>

  beforeEach(() => {
    onSort = vi.fn<(intent: SortIntent) => void>()
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  it('mounts one live instance and a drag delivers exactly one intent', () => {
    const { container } = render(
      <Harness options={{ animation: 0, onSort }} items={ITEMS} />
    )
    const list = container.querySelector('ul') as HTMLElement
    expect(api.sortable.current).toBeInstanceOf(Sortable)
    expect(Sortable.get(list)).toBe(api.sortable.current)

    html5Drag(item(list, 'a'), item(list, 'c'))

    expect(onSort).toHaveBeenCalledTimes(1)
    const intent = onSort.mock.calls[0][0]
    expect(intent.dataIds).toEqual(['a'])
    expect(intent.oldIndexes).toEqual([0])
    expect(intent.newIndexes).toEqual([2])
    expect(intent.from).toBe(list)
    expect(intent.to).toBe(list)
    // Consumer DOM untouched — React still owns the order
    expect(
      Array.from(list.children).map((el) => (el as HTMLElement).dataset.id)
    ).toEqual(ITEMS)
  })

  it('is StrictMode-safe: double effect leaves one instance, one intent per drag', () => {
    const { container } = render(
      <StrictMode>
        <Harness options={{ animation: 0, onSort }} items={ITEMS} />
      </StrictMode>
    )
    const list = container.querySelector('ul') as HTMLElement

    html5Drag(item(list, 'a'), item(list, 'c'))

    expect(onSort).toHaveBeenCalledTimes(1)
    expect(Sortable.get(list)).toBe(api.sortable.current)
  })

  it('unmount destroys the instance', () => {
    const { container, unmount } = render(
      <Harness options={{ animation: 0, onSort }} items={ITEMS} />
    )
    const list = container.querySelector('ul') as HTMLElement
    const instance = api.sortable.current
    expect(instance).not.toBeNull()
    const destroy = vi.spyOn(instance as Sortable, 'destroy')

    unmount()

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(Sortable.get(list)).toBeUndefined()
    expect(api.sortable.current).toBeNull()
  })

  it('cancelled drag (no drop) fires no intent', () => {
    const { container } = render(
      <Harness options={{ animation: 0, onSort }} items={ITEMS} />
    )
    const list = container.querySelector('ul') as HTMLElement

    act(() => {
      item(list, 'a').dispatchEvent(makeDragEvent('dragstart'))
      item(list, 'c').dispatchEvent(makeDragEvent('dragover'))
      item(list, 'a').dispatchEvent(makeDragEvent('dragend'))
    })

    expect(onSort).not.toHaveBeenCalled()
  })

  it('cross-list drag delivers one intent on the source hook with fromId/toId', () => {
    let apiA!: UseSortableReturn<HTMLUListElement>
    let apiB!: UseSortableReturn<HTMLUListElement>
    const onSortA = vi.fn<(intent: SortIntent) => void>()
    const onSortB = vi.fn<(intent: SortIntent) => void>()

    function Pair(): JSX.Element {
      apiA = useSortable<HTMLUListElement>({
        animation: 0,
        group: 'shared',
        id: 'list-a',
        onSort: onSortA,
      })
      apiB = useSortable<HTMLUListElement>({
        animation: 0,
        group: 'shared',
        id: 'list-b',
        onSort: onSortB,
      })
      return (
        <div>
          <ul ref={apiA.ref} data-testid="a">
            {['a1', 'a2'].map((id) => (
              <li key={id} data-id={id} className="sortable-item">
                {id}
              </li>
            ))}
          </ul>
          <ul ref={apiB.ref} data-testid="b">
            {['b1', 'b2'].map((id) => (
              <li key={id} data-id={id} className="sortable-item">
                {id}
              </li>
            ))}
          </ul>
        </div>
      )
    }

    const { container } = render(<Pair />)
    const listA = container.querySelector('[data-testid="a"]') as HTMLElement
    const listB = container.querySelector('[data-testid="b"]') as HTMLElement

    act(() => {
      item(listA, 'a2').dispatchEvent(makeDragEvent('dragstart'))
      item(listB, 'b1').dispatchEvent(makeDragEvent('dragover'))
      item(listB, 'b1').dispatchEvent(makeDragEvent('drop'))
      item(listA, 'a2').dispatchEvent(makeDragEvent('dragend'))
    })

    expect(onSortA).toHaveBeenCalledTimes(1)
    expect(onSortB).not.toHaveBeenCalled()
    const intent = onSortA.mock.calls[0][0]
    expect(intent.dataIds).toEqual(['a2'])
    expect(intent.fromId).toBe('list-a')
    expect(intent.toId).toBe('list-b')
    expect(intent.from).toBe(listA)
    expect(intent.to).toBe(listB)
    expect(intent.oldIndexes).toEqual([1])
    expect(intent.newIndexes).toEqual([0])
  })

  it('applies option value changes via option() without remounting', () => {
    const { container, rerender } = render(
      <Harness options={{ animation: 0, onSort }} items={ITEMS} />
    )
    const list = container.querySelector('ul') as HTMLElement
    const instance = api.sortable.current as Sortable
    const option = vi.spyOn(instance, 'option')
    const destroy = vi.spyOn(instance, 'destroy')

    // Changed value → option() call; changed callback identity → nothing.
    rerender(
      <Harness options={{ animation: 250, onSort: vi.fn() }} items={ITEMS} />
    )

    expect(option).toHaveBeenCalledWith('animation', 250)
    expect(option).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
    expect(Sortable.get(list)).toBe(instance)
  })

  it('latest onSort callback is used without touching the instance', () => {
    const { container, rerender } = render(
      <Harness options={{ animation: 0, onSort }} items={ITEMS} />
    )
    const list = container.querySelector('ul') as HTMLElement
    const replacement = vi.fn<(intent: SortIntent) => void>()
    rerender(
      <Harness options={{ animation: 0, onSort: replacement }} items={ITEMS} />
    )

    html5Drag(item(list, 'a'), item(list, 'c'))

    expect(onSort).not.toHaveBeenCalled()
    expect(replacement).toHaveBeenCalledTimes(1)
  })

  it('bridges selection to data-ids: onSelectionChange + get/setSelectedIds', () => {
    const onSelectionChange = vi.fn<(ids: string[]) => void>()
    const { container } = render(
      <Harness
        options={{ animation: 0, multiDrag: true, onSort, onSelectionChange }}
        items={ITEMS}
      />
    )
    const list = container.querySelector('ul') as HTMLElement

    act(() => {
      item(list, 'b').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      item(list, 'c').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelectionChange).toHaveBeenCalled()
    expect(api.getSelectedIds().sort()).toEqual(['b', 'c'])
    const lastIds =
      onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1][0]
    expect([...lastIds].sort()).toEqual(['b', 'c'])

    act(() => {
      api.setSelectedIds(['a', 'd'])
    })
    expect(api.getSelectedIds().sort()).toEqual(['a', 'd'])
  })

  it('restores keyboard focus to the moved item after the commit re-render', async () => {
    let order = [...ITEMS]
    const commit = (intent: SortIntent): void => {
      const moved = intent.dataIds
      const rest = order.filter((id) => !moved.includes(id))
      rest.splice(intent.newIndexes[0], 0, ...moved)
      order = rest
    }
    const { container, rerender } = render(
      <Harness
        options={{
          animation: 0,
          onSort: (intent) => {
            commit(intent)
            onSort(intent)
          },
        }}
        items={order}
      />
    )
    const list = container.querySelector('ul') as HTMLElement

    act(() => {
      item(list, 'b').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      item(list, 'b').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
      list.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      )
      list.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
    })

    expect(onSort).toHaveBeenCalledTimes(1)
    // Consumer commits: re-render with the new order (keys move nodes).
    rerender(<Harness options={{ animation: 0, onSort }} items={order} />)
    expect(order).toEqual(['a', 'c', 'b', 'd'])

    // Focus restore happens one rAF after onSort.
    await act(
      () =>
        new Promise<void>((resolve) =>
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => resolve())
          )
        )
    )
    expect((document.activeElement as HTMLElement | null)?.dataset.id).toBe('b')
  })
})
