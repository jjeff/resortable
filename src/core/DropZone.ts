import { insertAt } from '../utils/dom.js'

/**
 * Manages sortable container and basic DOM operations
 * @internal
 */
export class DropZone {
  constructor(public readonly element: HTMLElement) {}

  /** Get sortable items */
  public getItems(): HTMLElement[] {
    return Array.from(this.element.children) as HTMLElement[]
  }

  /** Get index of an item within container */
  public getIndex(item: HTMLElement): number {
    return this.getItems().indexOf(item)
  }

  /** Move item to new index within container */
  public move(item: HTMLElement, toIndex: number): void {
    insertAt(this.element, item, toIndex)
  }
}
