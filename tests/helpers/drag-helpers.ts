import { Page } from '@playwright/test'

/**
 * Drag and drop test helpers for Playwright
 */

/**
 * Performs a native HTML5 drag and drop operation
 * Uses mouse events to simulate realistic drag behavior
 */
export async function dragAndDropNative(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  options?: {
    sourcePosition?: { x: number; y: number }
    targetPosition?: { x: number; y: number }
    steps?: number
    delay?: number
  }
) {
  const source = page.locator(sourceSelector).first()
  const target = page.locator(targetSelector).first()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  if (!sourceBox || !targetBox) {
    throw new Error('Could not get bounding boxes for source or target')
  }

  const sourceX =
    sourceBox.x + (options?.sourcePosition?.x ?? sourceBox.width / 2)
  const sourceY =
    sourceBox.y + (options?.sourcePosition?.y ?? sourceBox.height / 2)
  const targetX =
    targetBox.x + (options?.targetPosition?.x ?? targetBox.width / 2)
  const targetY =
    targetBox.y + (options?.targetPosition?.y ?? targetBox.height / 2)

  // Move to source
  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()

  // Wait a bit to ensure drag starts
  await page.waitForTimeout(options?.delay ?? 100)

  // Move to target
  await page.mouse.move(targetX, targetY, { steps: options?.steps ?? 5 })

  // Wait before releasing
  await page.waitForTimeout(options?.delay ?? 100)

  // Release
  await page.mouse.up()
}

/**
 * Simulate drag using dispatchEvent for more control
 */
export async function simulateDragWithEvents(
  page: Page,
  sourceSelector: string,
  targetSelector: string
) {
  await page.evaluate(
    ({ source, target }) => {
      const sourceEl = document.querySelector(source)
      const targetEl = document.querySelector(target)

      if (!sourceEl || !targetEl) {
        throw new Error('Elements not found')
      }

      // Create drag start event
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      })
      sourceEl.dispatchEvent(dragStartEvent)

      // Create drag over event on target
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStartEvent.dataTransfer,
      })
      targetEl.dispatchEvent(dragOverEvent)

      // Create drop event
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStartEvent.dataTransfer,
      })
      targetEl.dispatchEvent(dropEvent)

      // Create drag end event
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragStartEvent.dataTransfer,
      })
      sourceEl.dispatchEvent(dragEndEvent)
    },
    { source: sourceSelector, target: targetSelector }
  )
}

/**
 * Check if an element is draggable
 */
export async function isDraggable(
  page: Page,
  selector: string
): Promise<boolean> {
  return await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      return (el as HTMLElement).draggable
    })
}

/**
 * Get the computed style of an element
 */
export async function getComputedStyle(
  page: Page,
  selector: string,
  property: string
): Promise<string> {
  return await page
    .locator(selector)
    .first()
    .evaluate((el, prop) => {
      return window.getComputedStyle(el)[prop as any]
    }, property)
}

/**
 * Monitor console logs during drag operations
 * Returns an array that gets modified by reference
 * as the logs are updated.
 */
export function monitorDragLogs(page: Page): string[] {
  const logs: string[] = []
  page.on('console', (msg) => {
    if (
      msg.text().includes('drag') ||
      msg.text().includes('Drag') ||
      msg.text().includes('DRAG')
    ) {
      logs.push(`[${msg.type()}] ${msg.text()}`)
    }
  })
  return logs
}

/**
 * Wait for drag to be ready (element is draggable and visible)
 */
export async function waitForDraggable(page: Page, selector: string) {
  await page.waitForSelector(selector, { state: 'visible' })
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel) as HTMLElement
      return el && el.draggable === true
    },
    selector,
    { timeout: 5000 }
  )
}

/**
 * Attempt multiple drag strategies and report which works
 */
export async function tryMultipleDragStrategies(
  page: Page,
  sourceSelector: string,
  targetSelector: string
): Promise<{
  nativeWorked: boolean
  eventsWorked: boolean
  dragToWorked: boolean
  logs: string[]
}> {
  const results = {
    nativeWorked: false,
    eventsWorked: false,
    dragToWorked: false,
    logs: [] as string[],
  }

  const logs = monitorDragLogs(page)

  // Get initial position
  const getItemPosition = async () => {
    const items = await page.locator(sourceSelector).all()
    return items.map(async (item) => await item.textContent())
  }

  const initialOrder = await getItemPosition()

  // Try native drag
  try {
    await dragAndDropNative(page, sourceSelector, targetSelector)
    await page.waitForTimeout(500)
    const afterNative = await getItemPosition()
    results.nativeWorked =
      JSON.stringify(initialOrder) !== JSON.stringify(afterNative)
  } catch (e) {
    results.logs.push(`Native drag failed: ${e}`)
  }

  // Reset if needed
  if (results.nativeWorked) {
    await page.reload()
    await page.waitForTimeout(1000)
  }

  // Try Playwright's built-in dragTo
  try {
    const source = page.locator(sourceSelector).first()
    const target = page.locator(targetSelector).first()
    await source.dragTo(target)
    await page.waitForTimeout(500)
    const afterDragTo = await getItemPosition()
    results.dragToWorked =
      JSON.stringify(initialOrder) !== JSON.stringify(afterDragTo)
  } catch (e) {
    results.logs.push(`DragTo failed: ${e}`)
  }

  results.logs = logs
  return results
}

/**
 * Get the order of items in a container by their text content
 *
 * @param page - Playwright page object
 * @param containerSelector - CSS selector for the container
 * @param itemSelector - Optional CSS selector for items within container (defaults to all children)
 * @returns Array of text content from each item
 *
 * @example
 * const order = await getItemOrder(page, '#list', '.item')
 * expect(order).toEqual(['Item 1', 'Item 2', 'Item 3'])
 */
export async function getItemOrder(
  page: Page,
  containerSelector: string,
  itemSelector?: string
): Promise<string[]> {
  const selector = itemSelector
    ? `${containerSelector} ${itemSelector}`
    : `${containerSelector} > *`
  return await page.locator(selector).allTextContents()
}

/**
 * Wait for the Resortable library to be loaded and ready
 *
 * @param page - Playwright page object
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 *
 * @example
 * await waitForSortableReady(page)
 * // Now safe to interact with sortable elements
 */
export async function waitForSortableReady(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  await page.waitForFunction(() => (window as any).resortableLoaded === true, {
    timeout,
  })
}

/**
 * Inject event listeners to log drag events for debugging
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element to monitor
 * @param events - Array of event names to listen for
 *
 * @example
 * await injectEventLogger(page, '#sortable-list')
 * // Now all drag events on #sortable-list will be logged to console
 */
export async function injectEventLogger(
  page: Page,
  selector: string,
  events: string[] = [
    'dragstart',
    'dragover',
    'drop',
    'dragend',
    'dragenter',
    'dragleave',
  ]
): Promise<void> {
  await page.evaluate(
    ({ sel, evts }) => {
      const element = document.querySelector(sel)
      if (element) {
        evts.forEach((eventName) => {
          element.addEventListener(
            eventName,
            (e) => {
              const target = e.target as HTMLElement
              const text = target.textContent || target.id || target.className
              console.log(`[${eventName}] on ${text}`)
              if (eventName === 'dragstart' || eventName === 'drop') {
                console.log(
                  `  -> data: ${(e as DragEvent).dataTransfer?.types.join(', ')}`
                )
              }
            },
            true // Use capture phase
          )
        })
      }
    },
    { sel: selector, evts: events }
  )
}

/**
 * Simulate touch drag using pointer events
 * Useful for testing touch device interactions
 *
 * @param page - Playwright page object
 * @param sourceSelector - CSS selector for the element to drag
 * @param targetSelector - CSS selector for the drop target
 * @param options - Optional configuration for the drag
 *
 * @example
 * await simulateTouchDrag(page, '.item:first-child', '.item:last-child')
 */
export async function simulateTouchDrag(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  options?: { steps?: number; delay?: number }
): Promise<void> {
  const source = page.locator(sourceSelector).first()
  const target = page.locator(targetSelector).first()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  if (!sourceBox || !targetBox) {
    throw new Error('Could not get bounding boxes for source or target')
  }

  const sourceX = sourceBox.x + sourceBox.width / 2
  const sourceY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2

  // Start touch
  await page.dispatchEvent(sourceSelector, 'pointerdown', {
    button: 0,
    pointerType: 'touch',
    isPrimary: true,
    clientX: sourceX,
    clientY: sourceY,
  })

  await page.waitForTimeout(options?.delay ?? 100)

  // Move in steps
  const steps = options?.steps ?? 5
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps
    await page.dispatchEvent('body', 'pointermove', {
      pointerType: 'touch',
      isPrimary: true,
      clientX: sourceX + (targetX - sourceX) * progress,
      clientY: sourceY + (targetY - sourceY) * progress,
    })
    await page.waitForTimeout(50)
  }

  // End touch
  await page.dispatchEvent('body', 'pointerup', {
    pointerType: 'touch',
    isPrimary: true,
    clientX: targetX,
    clientY: targetY,
  })
}

/**
 * Get comprehensive draggable state information for an element
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element to check
 * @returns Object containing various draggable-related properties
 *
 * @example
 * const state = await getDraggableState(page, '.sortable-item')
 * expect(state.draggable).toBe(true)
 * expect(state.cursor).toBe('move')
 */
export async function getDraggableState(
  page: Page,
  selector: string
): Promise<{
  draggable: boolean
  display: string
  cursor: string
  userSelect: string
  ariaGrabbed: string | null
  tabIndex: number
  classList: string[]
}> {
  return await page
    .locator(selector)
    .first()
    .evaluate((el: HTMLElement) => ({
      draggable: el.draggable,
      display: window.getComputedStyle(el).display,
      cursor: window.getComputedStyle(el).cursor,
      userSelect: window.getComputedStyle(el).userSelect,
      ariaGrabbed: el.getAttribute('aria-grabbed'),
      tabIndex: el.tabIndex,
      classList: Array.from(el.classList),
    }))
}

/**
 * Hover over an element and wait for a specified duration
 * Useful for testing hover states and delayed interactions
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element to hover
 * @param delay - Time to wait after hovering in milliseconds
 *
 * @example
 * await hoverAndWait(page, '.menu-item', 200)
 * // Menu should now be expanded
 */
export async function hoverAndWait(
  page: Page,
  selector: string,
  delay: number = 100
): Promise<void> {
  await page.locator(selector).hover()
  await page.waitForTimeout(delay)
}

/**
 * Get all data attributes from an element
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element
 * @returns Object with all data-* attributes as key-value pairs
 *
 * @example
 * const data = await getDataAttributes(page, '.item')
 * expect(data['data-id']).toBe('item-1')
 * expect(data['data-index']).toBe('0')
 */
export async function getDataAttributes(
  page: Page,
  selector: string
): Promise<Record<string, string>> {
  return await page
    .locator(selector)
    .first()
    .evaluate((el: HTMLElement) => {
      const attrs: Record<string, string> = {}
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value
        }
      }
      return attrs
    })
}

/**
 * Verify that no drag operation occurred by comparing item order
 *
 * @param page - Playwright page object
 * @param containerSelector - CSS selector for the container
 * @param initialOrder - The initial order to compare against
 * @param itemSelector - Optional CSS selector for items within container
 * @returns true if order is unchanged, false if items moved
 *
 * @example
 * const initialOrder = await getItemOrder(page, '#list')
 * await someDragOperation()
 * const unchanged = await verifyNoDrag(page, '#list', initialOrder)
 * expect(unchanged).toBe(true) // Drag was prevented
 */
export async function verifyNoDrag(
  page: Page,
  containerSelector: string,
  initialOrder: string[],
  itemSelector?: string
): Promise<boolean> {
  const currentOrder = await getItemOrder(page, containerSelector, itemSelector)
  return JSON.stringify(initialOrder) === JSON.stringify(currentOrder)
}

/**
 * Wait for drag animation to complete
 *
 * @param page - Playwright page object
 * @param duration - Animation duration in milliseconds (default: 300)
 *
 * @example
 * await dragAndDropNative(page, source, target)
 * await waitForAnimation(page)
 * // Now check final positions
 */
export async function waitForAnimation(
  page: Page,
  duration: number = 300
): Promise<void> {
  await page.waitForTimeout(duration)
}

/**
 * Get the index of an element within its parent container
 *
 * @param page - Playwright page object
 * @param selector - CSS selector for the element
 * @returns Zero-based index of the element, or -1 if not found
 *
 * @example
 * const index = await getElementIndex(page, '[data-id="item-3"]')
 * expect(index).toBe(2) // Third item (0-indexed)
 */
export async function getElementIndex(
  page: Page,
  selector: string
): Promise<number> {
  return await page
    .locator(selector)
    .first()
    .evaluate((el: HTMLElement) => {
      const parent = el.parentElement
      if (!parent) return -1
      return Array.from(parent.children).indexOf(el)
    })
}

/**
 * Simulate a multi-item drag operation
 * Useful for testing multi-select drag functionality
 *
 * @param page - Playwright page object
 * @param itemSelectors - Array of CSS selectors for items to select
 * @param targetSelector - CSS selector for the drop target
 *
 * @example
 * await simulateMultiDrag(page, ['.item:nth-child(1)', '.item:nth-child(3)'], '#target-list')
 */
export async function simulateMultiDrag(
  page: Page,
  itemSelectors: string[],
  targetSelector: string
): Promise<void> {
  // Select items with Ctrl/Cmd+Click
  for (let i = 0; i < itemSelectors.length; i++) {
    const selector = itemSelectors[i]
    if (i === 0) {
      // First item: regular click
      await page.locator(selector).click()
    } else {
      // Additional items: Ctrl+Click
      await page.locator(selector).click({ modifiers: ['Control'] })
    }
  }

  // Drag the first selected item (others should follow)
  const firstItem = page.locator(itemSelectors[0]).first()
  const target = page.locator(targetSelector).first()
  await firstItem.dragTo(target)
}
