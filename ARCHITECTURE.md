# Resortable Architecture Documentation

## Overview

Resortable is a TypeScript rewrite of Sortable.js that provides drag-and-drop functionality for reorderable lists. This document explains the internal workings, state management, event flow, and core components.

## Core Concepts

### 1. Draggable Items vs. Drop Zones (Containers)

**Current Design Issue**: The library currently marks individual items as draggable but doesn't explicitly mark containers as drop zones. This creates problems when:
- Containers are empty (no items to detect drag-over events)
- Cross-container dragging needs to determine valid drop targets

**How it works now**:
- `draggable` selector (e.g., `.horizontal-item`) identifies which elements can be dragged
- Containers are implicitly drop zones because they contain draggable items
- Empty containers have no draggable children, making drop detection difficult

**Potential improvement**: Explicitly mark containers as drop zones, separate from draggable items.

### 2. Component Structure

```
Sortable (Main Class)
    ├── DropZone (Container management)
    ├── DragManager (Drag operations)
    │   ├── GhostManager (Visual feedback)
    │   ├── AnimationManager (Transitions)
    │   ├── SelectionManager (Multi-select)
    │   └── KeyboardManager (Accessibility)
    ├── GroupManager (Cross-container operations)
    └── EventManager (Event handling)
```

## Key Components

### Sortable (src/Sortable.ts)
- Main entry point
- Creates and configures all sub-components
- Manages options and plugin system

### DropZone (src/core/DropZone.ts)
- Represents a sortable container
- Manages item positions and indices
- Handles DOM operations (add, remove, move)
- **Problem**: No explicit drop zone detection for empty containers

### DragManager (src/core/DragManager.ts)
- Handles all drag operations
- Manages drag events (dragstart, dragover, drop, dragend)
- **Key Methods**:
  - `onDragStart`: Initiates drag, creates ghost/placeholder
  - `onDragOver`: Handles drag movement, determines drop position
  - `onDrop`: Finalizes the drop operation
  - `onDragEnd`: Cleanup after drag

### GlobalDragState (src/core/GlobalDragState.ts)
- Singleton that tracks active drag operations across all Sortable instances
- Enables cross-container dragging
- Stores:
  - Active drag item
  - Source container
  - Target container
  - Group information

## Event Flow

### Standard Drag Operation

1. **User starts drag** (mousedown/touchstart on draggable item)
   ```
   DragManager.onDragStart()
   ├── Check if item is draggable
   ├── Store initial state in GlobalDragState
   ├── Create ghost element (visual feedback)
   └── Emit 'start' event
   ```

2. **User drags over container** (dragover events)
   ```
   DragManager.onDragOver()
   ├── Check if container accepts this drag (group compatibility)
   ├── Find closest draggable item under cursor
   ├── Calculate insertion position
   ├── Move placeholder to show drop position
   └── Emit 'sort' event
   ```

3. **User drops item** (drop event)
   ```
   DragManager.onDrop()
   ├── Determine final position
   ├── Move actual DOM element
   ├── Update indices
   ├── Clean up placeholder/ghost
   └── Emit 'end', 'add', 'remove' events
   ```

## State Management

### Local State (per Sortable instance)
- Container element reference
- Configuration options
- Draggable selector
- Animation settings

### Global State (shared across instances)
- Active drag operation
- Source and target containers
- Group memberships
- Pull/put permissions

## The Empty Container Problem

### Current Issue
When a container is empty:
1. No draggable children exist
2. `event.target.closest(draggable)` returns null
3. Container isn't recognized as a valid drop zone
4. Items can't be dropped

### Current (Broken) Solution Attempt
```typescript
// In DragManager.onDragOver
const draggableChildren = Array.from(this.zone.element.children).filter(
  child => child.matches(this.draggable)
)
if (draggableChildren.length === 0) {
  // Handle empty container
  this.zone.element.appendChild(placeholder)
}
```

### Why It's Not Working
1. The check happens but the placeholder isn't persisting
2. The drop event might not be firing correctly
3. The container itself isn't being recognized as a drop target

### Proposed Solution
1. **Explicit Drop Zones**: Mark containers with a data attribute or class
2. **Container-Level Events**: Attach dragover/drop handlers to containers, not just items
3. **Empty State Handling**: Special logic when `children.length === 0`

## Configuration

### Key Options
- `group`: String or object defining cross-container behavior
  - `name`: Group identifier
  - `pull`: true/false/'clone' - can items be removed?
  - `put`: true/false/array - can items be added?
- `draggable`: CSS selector for draggable items
- `handle`: CSS selector for drag handles
- `filter`: CSS selector for non-draggable items

## Plugin System

Plugins extend functionality:
- **MultiDrag**: Select and drag multiple items
- **Swap**: Swap items instead of insert
- **AutoScroll**: Auto-scroll containers during drag

## Debugging Tips

### Key Places to Set Breakpoints
1. `DragManager.onDragOver` - Watch how drop positions are calculated
2. `DragManager.onDrop` - See if drop events fire for empty containers
3. `GlobalDragState.canAcceptDrop` - Check group compatibility
4. `DropZone.appendChild` - Watch DOM manipulation

### Common Issues
1. **Empty containers**: Not recognized as drop zones
2. **Group configuration**: Incorrect pull/put settings
3. **Event bubbling**: Parent containers intercepting events
4. **Z-index issues**: Ghost elements behind other content

## Recommended Improvements

1. **Explicit Drop Zone Marking**
   ```typescript
   class DropZone {
     markAsDropZone() {
       this.element.dataset.dropZone = 'true'
       this.element.addEventListener('dragover', this.handleEmptyDragOver)
     }
   }
   ```

2. **Container-Level Event Handling**
   ```typescript
   // Attach events to container, not just items
   container.addEventListener('dragover', (e) => {
     if (this.isEmpty()) {
       this.handleEmptyContainerDragOver(e)
     }
   })
   ```

3. **Better Empty State Detection**
   ```typescript
   isValidDropTarget(e: DragEvent): boolean {
     // Check if over container itself
     if (e.target === this.element || this.element.contains(e.target)) {
       return this.canAcceptDrop(globalDragState.currentItem)
     }
     return false
   }
   ```

## Next Steps

1. Fix empty container drops by implementing explicit drop zone detection
2. Add container-level event handlers
3. Improve state management for cross-container operations
4. Add comprehensive logging for debugging