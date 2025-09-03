import { SelectionManager } from './SelectionManager.js'
import { DropZone } from './DropZone.js'
import { SortableEventSystem } from './EventSystem.js'
import { globalDragState } from './GlobalDragState.js'

/**
 * Handles keyboard navigation and operations for sortable lists
 * @internal
 */
export class KeyboardManager {
  private isGrabbing = false
  private grabbedItems: HTMLElement[] = []
  private originalIndices: number[] = []
  private announcer: HTMLElement | null = null

  constructor(
    private container: HTMLElement,
    private zone: DropZone,
    private selectionManager: SelectionManager,
    private events: SortableEventSystem,
    private groupName: string
  ) {
    this.setupAnnouncer()
  }

  /**
   * Attach keyboard event listeners
   */
  public attach(): void {
    this.container.addEventListener('keydown', this.onKeyDown)
    this.container.addEventListener('click', this.onClick)
    this.container.addEventListener('focus', this.onFocus, true) // Use capture to handle focus on children
    
    // Make container focusable if it isn't already
    if (!this.container.hasAttribute('tabindex')) {
      this.container.setAttribute('tabindex', '-1')
    }

    // Add ARIA attributes
    this.container.setAttribute('role', 'list')
    this.container.setAttribute('aria-label', 'Sortable list. Use arrow keys to navigate, space to select, and enter to move items.')
    
    // Mark sortable items
    this.updateItemAttributes()
  }

  /**
   * Detach keyboard event listeners
   */
  public detach(): void {
    this.container.removeEventListener('keydown', this.onKeyDown)
    this.container.removeEventListener('click', this.onClick)
    this.container.removeEventListener('focus', this.onFocus, true)
    
    // Clean up ARIA attributes
    this.container.removeAttribute('role')
    this.container.removeAttribute('aria-label')
    
    // Clean up announcer
    if (this.announcer) {
      this.announcer.remove()
      this.announcer = null
    }
  }

  /**
   * Handle keydown events
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement
    
    // Handle events on sortable items or the container
    // When using container.press() in tests, the target is the container
    // When pressing keys normally, the target is the focused element
    if (!target.classList.contains('sortable-item') && target !== this.container && !this.container.contains(target)) {
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (this.isGrabbing) {
          this.moveGrabbedDown()
        } else {
          this.selectionManager.focusNext()
        }
        break

      case 'ArrowUp':
        e.preventDefault()
        if (this.isGrabbing) {
          this.moveGrabbedUp()
        } else {
          this.selectionManager.focusPrevious()
        }
        break

      case ' ': // Space
        e.preventDefault()
        if (!this.isGrabbing) {
          const focused = this.selectionManager.getFocused()
          if (focused) {
            if (e.shiftKey && this.selectionManager.getLastSelected()) {
              // Range selection with Shift+Space
              this.selectionManager.selectRange(
                this.selectionManager.getLastSelected()!,
                focused
              )
            } else if (e.ctrlKey || e.metaKey) {
              // Toggle selection with Ctrl/Cmd+Space
              this.selectionManager.toggle(focused)
            } else {
              // Single selection
              this.selectionManager.select(focused)
            }
          }
        }
        break

      case 'Enter':
        e.preventDefault()
        if (this.isGrabbing) {
          this.drop()
        } else {
          this.grab()
        }
        break

      case 'Escape':
        e.preventDefault()
        if (this.isGrabbing) {
          this.cancelGrab()
        } else {
          this.selectionManager.clearSelection()
        }
        break

      case 'Home':
        e.preventDefault()
        if (!this.isGrabbing) {
          const items = this.zone.getItems()
          if (items.length > 0) {
            this.selectionManager.setFocus(items[0])
          }
        }
        break

      case 'End':
        e.preventDefault()
        if (!this.isGrabbing) {
          const items = this.zone.getItems()
          if (items.length > 0) {
            this.selectionManager.setFocus(items[items.length - 1])
          }
        }
        break

      case 'a':
        // Select all with Ctrl/Cmd+A
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          this.selectAll()
        }
        break
    }
  }

  /**
   * Handle focus events to sync with SelectionManager
   */
  private onFocus = (e: FocusEvent): void => {
    const target = e.target as HTMLElement
    
    // If a sortable item receives focus, update SelectionManager
    if (target.classList.contains('sortable-item')) {
      this.selectionManager.setFocus(target)
    }
  }

  /**
   * Handle click events for selection
   */
  private onClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest('.sortable-item') as HTMLElement
    if (!target) return

    if (e.shiftKey && this.selectionManager.getLastSelected()) {
      // Range selection
      e.preventDefault()
      this.selectionManager.selectRange(
        this.selectionManager.getLastSelected()!,
        target
      )
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      e.preventDefault()
      this.selectionManager.toggle(target)
    } else {
      // Single selection (unless clicking on already selected item)
      if (!this.selectionManager.isSelected(target)) {
        this.selectionManager.select(target)
      }
    }

    // Set focus to clicked item
    this.selectionManager.setFocus(target)
  }

  /**
   * Grab selected items for moving
   */
  private grab(): void {
    const selected = this.selectionManager.getSelected()
    if (selected.length === 0) {
      // If nothing selected, grab the focused item
      const focused = this.selectionManager.getFocused()
      if (focused) {
        this.selectionManager.select(focused)
        selected.push(focused)
      } else {
        return
      }
    }

    this.isGrabbing = true
    this.grabbedItems = selected
    this.originalIndices = selected.map(item => this.zone.getIndex(item))

    // Add grabbing state
    selected.forEach(item => {
      item.classList.add('sortable-grabbing')
      item.setAttribute('aria-grabbed', 'true')
    })

    // Start drag in global state
    const dragId = 'keyboard-drag'
    globalDragState.startDrag(
      dragId,
      selected[0],
      this.container,
      { zone: this.zone, events: this.events },
      this.groupName,
      this.originalIndices[0],
      this.events
    )

    // Announce grab
    this.announce(`Grabbed ${selected.length} item${selected.length > 1 ? 's' : ''}. Use arrow keys to move, Enter to drop, Escape to cancel.`)
  }

  /**
   * Drop grabbed items at current position
   */
  private drop(): void {
    if (!this.isGrabbing) return

    // Remove grabbing state
    this.grabbedItems.forEach(item => {
      item.classList.remove('sortable-grabbing')
      item.setAttribute('aria-grabbed', 'false')
    })

    // End drag in global state
    const dragId = 'keyboard-drag'
    globalDragState.endDrag(dragId)

    // Announce drop
    const newIndex = this.zone.getIndex(this.grabbedItems[0])
    this.announce(`Dropped ${this.grabbedItems.length} item${this.grabbedItems.length > 1 ? 's' : ''} at position ${newIndex + 1}`)

    this.isGrabbing = false
    this.grabbedItems = []
    this.originalIndices = []
  }

  /**
   * Cancel grab and restore original positions
   */
  private cancelGrab(): void {
    if (!this.isGrabbing) return

    // Restore original positions
    this.grabbedItems.forEach((item, i) => {
      const currentIndex = this.zone.getIndex(item)
      const originalIndex = this.originalIndices[i]
      if (currentIndex !== originalIndex) {
        this.zone.move(item, originalIndex)
      }
      item.classList.remove('sortable-grabbing')
      item.setAttribute('aria-grabbed', 'false')
    })

    // End drag in global state
    const dragId = 'keyboard-drag'
    globalDragState.endDrag(dragId)

    // Announce cancellation
    this.announce('Move cancelled')

    this.isGrabbing = false
    this.grabbedItems = []
    this.originalIndices = []
  }

  /**
   * Move grabbed items up
   */
  private moveGrabbedUp(): void {
    if (!this.isGrabbing || this.grabbedItems.length === 0) return

    const firstItem = this.grabbedItems[0]
    const currentIndex = this.zone.getIndex(firstItem)
    
    if (currentIndex > 0) {
      // Move all grabbed items up by one position
      this.grabbedItems.forEach(item => {
        const itemIndex = this.zone.getIndex(item)
        if (itemIndex > 0) {
          this.zone.move(item, itemIndex - 1)
        }
      })

      // Announce move
      this.announce(`Moved to position ${currentIndex}`)
    }
  }

  /**
   * Move grabbed items down
   */
  private moveGrabbedDown(): void {
    if (!this.isGrabbing || this.grabbedItems.length === 0) return

    const lastItem = this.grabbedItems[this.grabbedItems.length - 1]
    const currentIndex = this.zone.getIndex(lastItem)
    const maxIndex = this.zone.getItems().length - 1
    
    if (currentIndex < maxIndex) {
      // Move all grabbed items down by one position (in reverse order)
      for (let i = this.grabbedItems.length - 1; i >= 0; i--) {
        const item = this.grabbedItems[i]
        const itemIndex = this.zone.getIndex(item)
        if (itemIndex < maxIndex) {
          this.zone.move(item, itemIndex + 1)
        }
      }

      // Announce move
      const newIndex = this.zone.getIndex(this.grabbedItems[0])
      this.announce(`Moved to position ${newIndex + 1}`)
    }
  }

  /**
   * Select all items
   */
  private selectAll(): void {
    const items = this.zone.getItems()
    items.forEach(item => this.selectionManager.select(item, true))
    this.announce(`Selected all ${items.length} items`)
  }

  /**
   * Update ARIA attributes on sortable items
   */
  private updateItemAttributes(): void {
    const items = this.zone.getItems()
    items.forEach((item, index) => {
      item.setAttribute('role', 'listitem')
      item.setAttribute('aria-setsize', items.length.toString())
      item.setAttribute('aria-posinset', (index + 1).toString())
      item.setAttribute('aria-selected', 'false')
      item.setAttribute('aria-grabbed', 'false')
      
      // Make items focusable - first item gets tabindex="0", others get "-1"
      item.setAttribute('tabindex', index === 0 ? '0' : '-1')
    })
  }

  /**
   * Setup screen reader announcer
   */
  private setupAnnouncer(): void {
    this.announcer = document.createElement('div')
    this.announcer.setAttribute('role', 'status')
    this.announcer.setAttribute('aria-live', 'assertive')
    this.announcer.setAttribute('aria-atomic', 'true')
    this.announcer.className = 'sr-only'
    this.announcer.style.position = 'absolute'
    this.announcer.style.left = '-10000px'
    this.announcer.style.width = '1px'
    this.announcer.style.height = '1px'
    this.announcer.style.overflow = 'hidden'
    document.body.appendChild(this.announcer)
  }

  /**
   * Announce message to screen readers
   */
  public announce(message: string): void {
    if (this.announcer) {
      this.announcer.textContent = message
      // Clear after a delay to allow re-announcement of same message
      setTimeout(() => {
        if (this.announcer) {
          this.announcer.textContent = ''
        }
      }, 100)
    }
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.detach()
    if (this.isGrabbing) {
      this.cancelGrab()
    }
  }
}