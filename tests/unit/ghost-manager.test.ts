import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GhostManager } from '../../src/core/GhostManager'

/**
 * Unit coverage for two GhostManager paths with no unit tests today:
 *
 * - `createStackedGhost` (multi-item drag ghost: count badge + stacked
 *   shadow) — exercised only by e2e, and e2e doesn't feed the coverage gate.
 * - `updatePlaceholder` (controlled-mode placeholder insert/append) — no
 *   coverage anywhere, unit or e2e.
 *
 * `tests/setup.ts` stubs `getBoundingClientRect` to an all-zero rect and
 * resets it before every test. GhostManager reads real geometry off the
 * dragged/anchor element (`rect.width` / `rect.height` become the ghost's
 * fixed dimensions), so every element whose size matters below gets its own
 * stubbed rect — relying on the zero-rect default would prove nothing.
 */

function createItems(count: number): HTMLElement[] {
  const items: HTMLElement[] = []
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    el.className = 'sortable-item'
    el.dataset.id = `item-${i}`
    el.textContent = `Item ${i}`
    items.push(el)
  }
  return items
}

function stubRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number }
): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(rect.left, rect.top, rect.width, rect.height)
  )
}

describe('GhostManager', () => {
  let container: HTMLElement
  let items: HTMLElement[]
  let ghostManager: GhostManager

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    items = createItems(4)
    items.forEach((item) => container.appendChild(item))
    ghostManager = new GhostManager()
  })

  afterEach(() => {
    ghostManager.destroy()
    document.body.removeChild(container)
    vi.restoreAllMocks()
  })

  describe('createStackedGhost', () => {
    it('builds a ghost with the stacked class, stacked shadow, real dimensions, and a count badge', () => {
      const anchor = items[1]
      stubRect(anchor, { left: 50, top: 60, width: 120, height: 40 })
      const event = new MouseEvent('mousedown', { clientX: 90, clientY: 75 })

      const ghost = ghostManager.createStackedGhost(anchor, 3, event)

      expect(ghost.classList.contains('sortable-ghost-stacked')).toBe(true)
      expect(ghost.style.boxShadow).toBe(
        '3px 3px 0 rgba(0,0,0,0.1), 6px 6px 0 rgba(0,0,0,0.05)'
      )
      // Dimensions come from the anchor's real (stubbed) rect, not the
      // zero-rect default — proves the base createGhost ran with our stub.
      expect(ghost.style.width).toBe('120px')
      expect(ghost.style.height).toBe('40px')

      const badge = ghost.querySelector('.sortable-drag-count')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('3')
      expect(badge?.parentElement).toBe(ghost)

      // The anchor (not the ghost) gets marked as the chosen/dragged source
      // — evidence createStackedGhost actually delegates to createGhost
      // rather than building a bespoke element that skips that step.
      expect(anchor.classList.contains(ghostManager.getChosenClass())).toBe(
        true
      )
      expect(anchor.classList.contains(ghostManager.getDragClass())).toBe(true)

      expect(ghost.parentElement).toBe(document.body)
      expect(ghostManager.getGhostElement()).toBe(ghost)
    })

    it.each([2, 5, 10])(
      'shows the actual item count (%i) in the badge text',
      (count) => {
        const anchor = items[0]
        stubRect(anchor, { left: 0, top: 0, width: 100, height: 30 })
        const event = new MouseEvent('mousedown', { clientX: 10, clientY: 10 })

        const ghost = ghostManager.createStackedGhost(anchor, count, event)
        const badge = ghost.querySelector('.sortable-drag-count')

        expect(badge?.textContent).toBe(String(count))
      }
    )

    it('removing the ghost also removes the count badge — no orphaned node in the document', () => {
      const anchor = items[0]
      stubRect(anchor, { left: 0, top: 0, width: 100, height: 30 })
      const event = new MouseEvent('mousedown', { clientX: 10, clientY: 10 })

      ghostManager.createStackedGhost(anchor, 4, event)
      expect(document.body.querySelector('.sortable-drag-count')).not.toBeNull()

      ghostManager.destroyGhost(anchor)

      expect(document.body.querySelector('.sortable-drag-count')).toBeNull()
      expect(anchor.classList.contains(ghostManager.getChosenClass())).toBe(
        false
      )
    })
  })

  describe('updatePlaceholder', () => {
    it('does nothing when no placeholder has been created yet', () => {
      const before = Array.from(container.children)

      ghostManager.updatePlaceholder(container, items[2])

      expect(Array.from(container.children)).toEqual(before)
    })

    it('inserts the placeholder immediately before the given element', () => {
      stubRect(items[0], { left: 0, top: 0, width: 50, height: 20 })
      ghostManager.createPlaceholder(items[0])
      const placeholder = ghostManager.getPlaceholderElement()
      expect(placeholder).not.toBeNull()

      ghostManager.updatePlaceholder(container, items[2])

      const order = Array.from(container.children)
      expect(order.indexOf(placeholder as HTMLElement)).toBe(
        order.indexOf(items[2]) - 1
      )
    })

    it('appends the placeholder to the end when beforeElement is null', () => {
      stubRect(items[0], { left: 0, top: 0, width: 50, height: 20 })
      ghostManager.createPlaceholder(items[0])
      const placeholder = ghostManager.getPlaceholderElement()
      expect(placeholder).not.toBeNull()

      ghostManager.updatePlaceholder(container, null)

      expect(container.lastElementChild).toBe(placeholder)
    })

    it('moves the placeholder to a new position on a later call, without duplicating it', () => {
      stubRect(items[0], { left: 0, top: 0, width: 50, height: 20 })
      ghostManager.createPlaceholder(items[0])
      const placeholder = ghostManager.getPlaceholderElement()
      expect(placeholder).not.toBeNull()

      ghostManager.updatePlaceholder(container, items[1])
      ghostManager.updatePlaceholder(container, items[3])

      const order = Array.from(container.children)
      expect(order.indexOf(placeholder as HTMLElement)).toBe(
        order.indexOf(items[3]) - 1
      )
      // A move re-inserts the SAME node rather than cloning a second one.
      expect(
        container.querySelectorAll('[data-resortable-placeholder]').length
      ).toBe(1)
    })
  })
})
