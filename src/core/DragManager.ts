import { SortableEvent } from '../types/index.js'
import { DropZone } from './DropZone.js'
import { type SortableEventSystem } from './EventSystem.js'

/**
 * Handles HTML5 drag and drop interactions
 * @internal
 */
export class DragManager {
  private dragItem: HTMLElement | null = null
  private startIndex = -1

  constructor(
    private zone: DropZone,
    private events: SortableEventSystem
  ) {
    // no op
  }

  /** Attach event listeners */
  public attach(): void {
    const el = this.zone.element
    el.addEventListener('dragstart', this.onDragStart)
    el.addEventListener('dragover', this.onDragOver)
    el.addEventListener('drop', this.onDrop)
    el.addEventListener('dragend', this.onDragEnd)

    for (const child of this.zone.getItems()) {
      child.draggable = true
    }
  }

  /** Detach event listeners */
  public detach(): void {
    const el = this.zone.element
    el.removeEventListener('dragstart', this.onDragStart)
    el.removeEventListener('dragover', this.onDragOver)
    el.removeEventListener('drop', this.onDrop)
    el.removeEventListener('dragend', this.onDragEnd)
  }

  private onDragStart = (e: DragEvent): void => {
    const target = e.target as HTMLElement
    if (!target || target.parentElement !== this.zone.element) return
    this.dragItem = target
    this.startIndex = this.zone.getIndex(target)
    const evt: SortableEvent = {
      item: target,
      items: [target],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: this.startIndex,
      newIndex: this.startIndex,
    }
    this.events.emit('start', evt)
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', '')
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  private onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    if (!this.dragItem) return
    const over = (e.target as HTMLElement).closest('.sortable-item')
    if (
      !(over instanceof HTMLElement) ||
      over === this.dragItem ||
      over.parentElement !== this.zone.element
    ) {
      return
    }
    const overIndex = this.zone.getIndex(over)
    const dragIndex = this.zone.getIndex(this.dragItem)
    if (overIndex === dragIndex) return
    // Insert before the hovered item. When dragging from an index before the
    // hovered index, the removal of the dragged element shifts the target
    // position left by 1 in the filtered children array.
    const insertionIndex = dragIndex < overIndex ? overIndex - 1 : overIndex
    this.zone.move(this.dragItem, insertionIndex)
    this.events.emit('update', {
      item: this.dragItem,
      items: [this.dragItem],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: dragIndex,
      newIndex: overIndex,
    })
  }

  private onDrop = (e: DragEvent): void => {
    e.preventDefault()
  }

  private onDragEnd = (): void => {
    if (!this.dragItem) return
    const newIndex = this.zone.getIndex(this.dragItem)
    this.events.emit('end', {
      item: this.dragItem,
      items: [this.dragItem],
      from: this.zone.element,
      to: this.zone.element,
      oldIndex: this.startIndex,
      newIndex,
    })
    this.dragItem = null
    this.startIndex = -1
  }
}
