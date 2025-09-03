# Sortable.js Rewrite Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to rewrite the Sortable.js library from scratch using modern TypeScript,
contemporary JavaScript patterns, and updated tooling. The goal is to create a more maintainable, performant, and
developer-friendly drag-and-drop library while preserving API compatibility and existing functionality.

## Decisions from stakeholder interview

The following decisions were made during a short stakeholder interview and are reflected in the roadmap and immediate
work items below:

- Forking and repo strategy: this will be a new fork and a different project — the code here will not maintain the
  original v1.x branch. The new project will be private until the first alpha release is ready.
- Project name (provisional): "Resortable" (used internally while the project is private).
- API compatibility: breaking changes are allowed but must be documented; where behavior changes are required we will
  map existing v1.x functionality to the new APIs and provide migration documentation and adapters where practical.
- Maintenance: there will be no long-lived v1 maintenance branch in this repo; v1.x will be treated as an external
  legacy project.
- Alpha scope: target a full-features alpha (Multi-drag, AutoScroll, Swap, animations, and plugin compatibility) plus
  tests to validate parity — i.e., the plan's "C" option.
- Tooling: use Vite for development / examples and Rollup for producing production library bundles (Vite dev + Rollup
  bundling — plan's "A" option).
- TypeScript policy: pragmatic strategy — enable strict mode ("strict": true) to get strong type guarantees, but allow
  targeted uses of `any` or brief `@ts-expect-error`/ignores in migration hotspots and legacy adapter shims to speed
  progress; the plan is to progressively tighten types over time.
- Publishing: keep the fork private until a v1-alpha release exists; publish name will be decided before public release
  ("Resortable" is provisional).

These decisions are authoritative for the next steps in the roadmap and small-PR plan described later in this document.

## Deprecated patterns & replacements

This focused list calls out specific antiquated or brittle patterns found in the v1 codebase and prescribes modern
replacements we will implement during the rewrite. Each item includes a short replacement approach and the phase where
it should be handled.

- Global module-scoped mutable variables (e.g. dragEl, parentEl, ghostEl): replace with instance-scoped state and a
  small StateManager (immutable update pattern or controlled mutators). Use a WeakMap<Element, Instance> for
  element→instance mapping. (Phase 1–2)

- DOM expando usage (el[expando] = instance): remove and use WeakMap to avoid DOM pollution and memory leaks; only use
  data-\* attributes for public IDs. (Phase 1)

- Monolithic files and circular dependencies (Sortable.js ↔ Animation.js ↔ utils.js): split into focused modules
  (core, DragManager, AnimationManager, utils/dom/geometry) and invert dependencies so animation code receives state
  rather than importing Sortable. (Phase 1–2)

- Browser UA sniffing (IE11OrLess, Edge, Safari, etc.): replace with feature detection (pointer events, CSS.supports)
  and capability gates; document dropped legacy browser support. (Phase 1)

- Ad‑hoc event system and pluginEvent patterns: replace with a typed EventSystem / EventEmitter and well-defined plugin
  lifecycle hooks; rely on CustomEvent for DOM-level events. (Phase 2)

- setTimeout-based animation coordination: adopt FLIP + requestAnimationFrame and CSS transitions, centralize animation
  orchestration in AnimationManager, remove brittle timeout choreography. (Phase 3)

- Low-level DOM utility duplication and fragile measurement logic: consolidate into typed `utils/dom.ts` and
  `utils/geometry.ts`, add unit tests for geometry helpers (getRect, matrix handling). (Phase 2)

- Manual style string concatenation & prefix hacks: centralize styles and prefer class toggles + CSS transitions; use
  CSS.supports and normalize prefixed behavior in a small helper. (Phase 2–3)

- Inconsistent event listener cleanup: provide unified add/remove helpers that return unregister functions and ensure
  `destroy()` cleans up listeners. (Phase 1)

- Legacy-heavy codepaths for older DnD APIs: isolate fallbacks behind adapters and make pointer events the primary path.
  (Phase 2)

Each of the above will be tracked as an explicit task in Phase 1–3 so replacements are tested and documented, and so
plugin authors have clear migration guidance.

## Current State Analysis

### Strengths

- Well-established library with strong adoption (2.8M+ weekly downloads)
- Comprehensive feature set including multi-drag, auto-scroll, and plugin system
- Good browser compatibility
- Active community and ecosystem integrations

### Technical Debt & Issues

- **Monolithic Architecture**: 51KB single Sortable.js file with mixed concerns
- **Circular Dependencies**: Core modules have circular references (Sortable.js ↔ Animation.js ↔ utils.js)
- **Legacy Code**: Extensive IE9+ compatibility code mixed with modern features
- **No TypeScript**: Lack of type safety and modern development experience
- **Deprecated Tooling**: Uses outdated build tools (rollup-plugin-babel@4, etc.)
- **Global State**: Heavy reliance on global variables and mutable state
- **Testing Gaps**: Limited test coverage for edge cases
- **Performance Issues**: Inefficient DOM queries and event handling patterns

### Current Architecture Problems

```
Current Structure:
├── src/
│   ├── Sortable.js (51KB monolith)    // ⚠️ Too large, mixed concerns
│   ├── Animation.js                    // ⚠️ Circular dependency
│   ├── utils.js                        // ⚠️ Circular dependency
│   ├── BrowserInfo.js                  // ⚠️ Legacy browser detection
│   ├── EventDispatcher.js              // ⚠️ Simple event system
│   └── PluginManager.js                // ⚠️ Basic plugin architecture
```

## Goals & Principles

### Primary Goals

1. **Type Safety**: Full TypeScript implementation with comprehensive type definitions
2. **Modern Architecture**: Class-based design with clear separation of concerns
3. **Performance**: Optimized DOM operations and memory usage
4. **Maintainability**: Modular, testable, and well-documented code
5. **Developer Experience**: Better APIs, debugging tools, and error messages
6. **Compatibility**: Maintain API compatibility while allowing modern usage patterns

### Design Principles

- **Single Responsibility**: Each module has one clear purpose
- **Immutability**: Prefer immutable patterns where possible
- **Composition over Inheritance**: Use composition for plugin architecture
- **Progressive Enhancement**: Modern features with graceful degradation
- **Easy Migration**: Provide clear migration paths and documentation for users upgrading from v1.x

## New Architecture Design

### Core Architecture Overview

```typescript
New Structure:
├── src/
│   ├── core/
│   │   ├── Sortable.ts                 // Main class
│   │   ├── DragManager.ts              // Drag operation handling
│   │   ├── DropZone.ts                 // Drop target management
│   │   ├── ElementTracker.ts           // Element state tracking
│   │   └── EventSystem.ts              // Event management
│   ├── animation/
│   │   ├── AnimationManager.ts         // Animation coordination
│   │   ├── TransitionEngine.ts         // CSS transitions
│   │   └── SpringPhysics.ts            // Physics-based animations
│   ├── plugins/
│   │   ├── PluginSystem.ts             // Plugin architecture
│   │   ├── AutoScroll.ts               // Auto-scroll plugin
│   │   ├── MultiDrag.ts                // Multi-selection plugin
│   │   └── SwapMode.ts                 // Swap-based sorting
│   ├── utils/
│   │   ├── dom.ts                      // DOM utilities
│   │   ├── geometry.ts                 // Position calculations
│   │   ├── performance.ts              // Performance utilities
│   │   └── browser.ts                  // Modern browser detection
│   ├── types/
│   │   ├── index.ts                    // Public type exports
│   │   ├── core.ts                     // Core interfaces
│   │   ├── events.ts                   // Event type definitions
│   │   └── plugins.ts                  // Plugin interfaces
│   └── index.ts                        // Main entry point
```

### Class-Based Core Design

```typescript
// Core Sortable class
export class Sortable {
  private dragManager: DragManager
  private dropZone: DropZone
  private animationManager: AnimationManager
  private eventSystem: EventSystem
  private pluginSystem: PluginSystem

  constructor(element: Element, options: SortableOptions) {
    // Initialize subsystems
  }

  // Public API methods
  public destroy(): void
  public toArray(): string[]
  public sort(order: string[]): void
  // ... other methods
}

// Plugin system interface
export interface SortablePlugin {
  name: string
  version: string
  install(sortable: Sortable): void
  uninstall(sortable: Sortable): void
}
```

### State Management Strategy

```typescript
// Immutable state management
interface SortableState {
  readonly dragElement: Element | null
  readonly dropZones: ReadonlyArray<DropZone>
  readonly activeOperations: ReadonlyArray<DragOperation>
  readonly animationQueue: ReadonlyArray<Animation>
}

class StateManager {
  private state: SortableState

  public updateState(updater: (state: SortableState) => SortableState): void {
    this.state = Object.freeze(updater(this.state))
    this.notifySubscribers(this.state)
  }
}
```

## Note On Parity With v1.x

A good place to find a list of "features" to determine parity with v1.x is the #options section in the
[README.md file of the original repository](/legacy-sortable/README.md#options). We could (and probably should) turn
this into a checklist of functionality.

## Feature Parity Checklist

This comprehensive checklist tracks implementation status of all Sortable v1.x features, organized by category and
mapped to implementation phases.

### Core Options

- [x] **group** - Group configuration for sharing items between lists
  - [x] Basic group name string support (Phase 2)
  - [x] Group object configuration (name, pull, put) (Phase 2)
  - [ ] `revertClone` option (Phase 5)
- [x] **sort** - Enable/disable sorting within list (Phase 2)
- [ ] **delay** - Time in milliseconds to define when sorting should start (Phase 2.4)
- [ ] **delayOnTouchOnly** - Only delay if user is using touch (Phase 2.4)
- [ ] **touchStartThreshold** - Pixels movement before cancelling delayed drag (Phase 2.4)
- [x] **disabled** - Disable the sortable functionality (Phase 2)
- [ ] **dataIdAttr** - HTML attribute used by `toArray()` method (Phase 2.4)

### Visual/Class Options

- [x] **ghostClass** - Class for the drop placeholder (Phase 2)
- [x] **chosenClass** - Class for the chosen item (Phase 2)
- [x] **dragClass** - Class for the dragging item (Phase 2)
- [ ] **animation** - Animation speed in milliseconds (Phase 3) ⏸️ Ready to start
- [ ] **easing** - Easing function for animations (Phase 3)

### Behavior Options

- [ ] **swapThreshold** - Threshold of the swap zone (Phase 2.5)
- [ ] **invertSwap** - Always use inverted swap zone (Phase 2.5)
- [ ] **invertedSwapThreshold** - Threshold of inverted swap zone (Phase 2.5)
- [ ] **direction** - Direction of Sortable (auto-detect or manual) (Phase 2.5)
- [ ] **forceFallback** - Force fallback behavior (Phase 2.5)
- [ ] **fallbackClass** - Class for cloned DOM element in fallback (Phase 2.5)
- [ ] **fallbackOnBody** - Append cloned element to document body (Phase 2.5)
- [ ] **fallbackTolerance** - Pixels mouse should move before drag (Phase 2.5)
- [ ] **dragoverBubble** - Allow dragover event to bubble (Phase 2.5)
- [ ] **removeCloneOnHide** - Remove clone when not showing (Phase 2.5)
- [ ] **emptyInsertThreshold** - Distance from empty sortable to insert (Phase 2.5)
- [ ] **setData** - Custom data transfer configuration (Phase 5)

### Event Callbacks

- [x] **onStart** - Element dragging started (Phase 2)
- [x] **onEnd** - Element dragging ended (Phase 2)
- [x] **onAdd** - Element added from another list (Phase 2)
- [x] **onUpdate** - Changed sorting within list (Phase 2)
- [x] **onRemove** - Element removed to another list (Phase 2)
- [x] **onSelect** - Items selected/deselected (Phase 2.3) ✅ New feature
- [ ] **onChoose** - Element is chosen (Phase 2.5)
- [ ] **onUnchoose** - Element is unchosen (Phase 2.5)
- [ ] **onSort** - Called by any change to the list (Phase 2.5)
- [ ] **onFilter** - Attempt to drag a filtered element (Phase 2.5)
- [ ] **onMove** - Item moved in list or between lists (Phase 2.5)
- [ ] **onClone** - Called when creating a clone of element (Phase 2.5)
- [ ] **onChange** - Element changes position during drag (Phase 2.5)

### Handle and Filter Options

- [ ] **handle** - Drag handle selector within list items (Phase 2.4)
- [ ] **filter** - Selectors that do not lead to dragging (Phase 2.4)
- [ ] **preventOnFilter** - Call preventDefault when filter triggered (Phase 2.4)
- [ ] **draggable** - Specifies which items should be draggable (Phase 2.4)

### API Methods

- [x] **toArray()** - Serialize sortable's item data-ids into array (Phase 2)
- [ ] **sort(order, useAnimation)** - Sort elements according to array (Phase 3)
- [ ] **save()** - Save current sorting (Phase 5)
- [ ] **closest(el, selector)** - DOM traversal utility (Phase 2.4)
- [ ] **option(name, value)** - Get/set option values (Phase 2.4)
- [x] **destroy()** - Remove sortable functionality (Phase 2)

### Static Properties & Methods

- [ ] **Sortable.active** - The active Sortable instance (Phase 2.4)
- [ ] **Sortable.dragged** - The element being dragged (Phase 2.4)
- [ ] **Sortable.ghost** - The ghost element (Phase 2.4)
- [ ] **Sortable.clone** - The clone element (Phase 2.4)
- [ ] **Sortable.get(element)** - Get Sortable instance on element (Phase 2.4)
- [ ] **Sortable.mount(plugin)** - Mount plugin to Sortable (Phase 4)
- [ ] **Sortable.utils** - Utility functions collection (Phase 2.4)

### Plugins

- [ ] **AutoScroll** - Automatic scrolling during drag (Phase 4)
  - [ ] Auto-scroll speed configuration
  - [ ] Scroll sensitivity settings
  - [ ] Edge detection and thresholds
- [ ] **MultiDrag** - Multi-item selection and dragging (Phase 4)
  - [x] Multi-item selection with keyboard (Phase 2.3) ✅ Implemented
  - [x] Multi-item selection with mouse (Phase 2.3) ✅ Implemented
  - [x] Multi-item dragging support (Phase 2.3) ✅ Implemented
  - [ ] Plugin API compatibility (Phase 4)
- [ ] **Swap** - Swap-based sorting instead of insertion (Phase 4)
- [ ] **OnSpill** - Handle drag operations outside sortable areas (Phase 4)

### Browser Compatibility Features

- [x] **Modern Pointer Events** - Mouse, touch, and pen input support (Phase 2.2) ✅ Implemented
- [x] **Multi-touch Support** - Multiple simultaneous touch gestures (Phase 2.2) ✅ Implemented
- [ ] **HTML5 Drag and Drop Fallback** - Legacy browser support (Phase 2.5)
- [ ] **Touch Device Optimization** - Enhanced touch device experience (Phase 2.5)

### Accessibility Features ✅ NEW IN V2.0

- [x] **Keyboard Navigation** - Arrow keys, Space/Enter interaction (Phase 2.3) ✅ Implemented
- [x] **ARIA Support** - Screen reader compatibility with roles and attributes (Phase 2.3) ✅ Implemented
- [x] **Focus Management** - Proper tabindex and focus handling (Phase 2.3) ✅ Implemented
- [x] **Live Region Announcements** - Real-time feedback for screen readers (Phase 2.3) ✅ Implemented
- [x] **Multi-Selection Accessibility** - Keyboard multi-select patterns (Phase 2.3) ✅ Implemented

### Framework Integration Support (Future)

- [ ] **React Integration** - React wrapper and hooks (Post v2.0)
- [ ] **Vue Integration** - Vue 3 composition API support (Post v2.0)
- [ ] **Angular Integration** - Angular directive and service (Post v2.0)
- [ ] **TypeScript Definitions** - Comprehensive type definitions (Phase 1) ✅ Completed

### Performance & Modern Features ✅ NEW IN V2.0

- [x] **TypeScript-first** - Full TypeScript implementation with strict typing (Phase 1) ✅ Completed
- [x] **ES Modules** - Modern module system with tree-shaking (Phase 1) ✅ Completed
- [x] **Event System** - Type-safe event handling with proper cleanup (Phase 2) ✅ Completed
- [x] **Memory Management** - WeakMap-based element tracking (Phase 2) ✅ Completed
- [x] **Cross-browser Testing** - Automated testing across major browsers (Phase 1) ✅ Completed
- [x] **Modern Build System** - Vite dev server + Rollup production builds (Phase 1) ✅ Completed

### Implementation Progress Summary

**✅ Phase 1 Complete (Foundation)**: TypeScript setup, build system, testing framework, documentation system

**✅ Phase 2 Complete (Core Functionality)**: Basic drag-and-drop, event system, DOM utilities, cross-zone operations

**✅ Phase 2.2 Complete (Touch/Pen Support)**: Modern pointer events, multi-touch, cross-platform testing

**✅ Phase 2.3 Complete (Accessibility)**: Keyboard navigation, ARIA support, screen reader compatibility,
multi-selection

**📋 Phase 2.4 Pending (More Basics)**: Handle/filter options, delay settings, utility methods

**📋 Phase 2.5 Pending (Better Parity)**: Swap thresholds, direction detection, fallback options

**⏸️ Phase 3 Ready (Animation System)**: Smooth animations, FLIP transitions, performance optimization

**📋 Phase 4 Pending (Plugin Architecture)**: AutoScroll, MultiDrag plugin API, Swap mode

**📋 Phase 5 Pending (API Compatibility)**: Legacy API compatibility layer, migration tools

**Test Coverage**: 52/55 E2E tests passing (95% pass rate) - 3 failing tests need investigation

**Modern Features Added**: Full accessibility support, TypeScript types, pointer events, multi-touch support - features
not available in original Sortable v1.x

## Migration Strategy

### Phase 1: Foundation (Weeks 1-3) ✅ COMPLETED

**Goal**: Establish TypeScript foundation and build system

#### Tasks:

- [x] Set up modern build toolchain (Vite/Rollup + TypeScript)
- [x] Create project structure and TypeScript configuration
- [x] Implement core types and interfaces
- [x] Set up testing framework (Vitest + Playwright)
- [x] Create basic Sortable class shell
- [x] Establish CI/CD pipeline
- [x] Set up documentation system (TypeDoc + JSDoc)
- [x] Configure semantic release automation
- [x] Set up code quality tools (ESLint, Prettier, TSDoc validation)

#### Deliverables: ✅ COMPLETED

- ✅ TypeScript project structure with strict mode enabled
- ✅ Build system producing CommonJS, ESM, and UMD outputs
- ✅ Comprehensive test suite with Vitest (unit) + Playwright (e2e)
- ✅ TypeDoc documentation framework with GitHub Pages deployment
- ✅ GitHub Actions CI/CD pipeline with cross-platform testing
- ✅ Semantic release automation with conventional commits
- ✅ VS Code integration with IntelliSense and format-on-save

Notes and constraints for Phase 1

- This work will be performed in a new, private forked repository (provisional name: `Resortable`). The original v1.x
  project will not be maintained here.
- Tooling choice: Vite will be used for developer experience (dev server, examples, docs preview) and Rollup will be
  used for producing final library bundles (CJS/ESM/UMD). This allows fast iteration during development while retaining
  deterministic library outputs.
- TypeScript policy: start with `strict: true` to get strong type safety, but adopt a pragmatic migration policy
  allowing targeted `any` or `@ts-expect-error` during initial conversions; progressively remove those as modules are
  hardened.

### Phase 2: Core Functionality (Weeks 4-8) ✅ COMPLETED

**Goal**: Implement core drag-and-drop functionality

#### Tasks:

- [x] Implement DragManager class with HTML5 drag API
- [x] Create DropZone management system
- [x] Build EventSystem with proper TypeScript events
- [x] Implement basic sorting algorithms and DOM operations
- [x] Add DOM utilities with modern APIs
- [x] Create performance monitoring utilities
- [x] Implement GlobalDragState for cross-zone operations
- [x] Unit tests for core functionality (Vitest + jsdom)
- [x] E2E tests for drag-and-drop interactions (Playwright - 52/55 passing)
- [x] Documentation for core API and functionality

#### Plural-first drag model (added)

- Adopt a plural-first drag model across core APIs to support multi-drag natively.
  - Global active drag context stores `items: HTMLElement[]` rather than a single element.
  - Events already expose `items: HTMLElement[]`; `item` remains the primary/anchor.
  - Drop operations assume all dragged items land in the same `DropZone` at the same index.
  - `DropZone.move(items: HTMLElement[], toIndex: number)` inserts items in-order at the computed index, excluding the
    dragged items from the target’s current children to avoid index shifts.
  - Within-list reorders emit `update` continuously; cross-list moves emit `remove` (origin), `add` (destination), and
    `end` (origin), with `oldIndex/newIndex` referring to the primary item.

Rationale: Makes multi-drag a first-class concern and avoids retrofitting single-item code paths later. The assumption
that all dragged items go to the same place simplifies index math and DOM ops and mirrors Sortable v1’s MultiDrag
behavior.

#### Deliverables: ✅ COMPLETED

- ✅ Working basic drag-and-drop with HTML5 API
- ✅ Event system with full TypeScript type safety
- ✅ Core DOM manipulation utilities (dom.ts, performance.ts)
- ✅ GlobalDragState for managing cross-zone drag operations
- ✅ Comprehensive test coverage (unit + e2e)
- ✅ Cross-browser compatibility verified with Playwright

#### Implementation Highlights:

- **DragManager**: Handles HTML5 drag events with proper lifecycle management, supports both HTML5 drag API and modern
  pointer events
- **DropZone**: Manages sortable containers with DOM operations and element tracking
- **EventSystem**: Type-safe event emitter with proper cleanup and full TypeScript support
- **GlobalDragState**: Singleton state manager for cross-zone operations using WeakMap
- **Cross-zone dragging**: Full support for dragging between different sortable lists with shared groups
- **Modern Input Support**: Comprehensive pointer events support for mouse, touch, and pen inputs
- **Test Coverage**: 52/55 e2e tests passing, covering basic sorting, cross-group operations, touch/pen input, and event
  callbacks

### Phase 2.2: First-Class Touch/Pen Support ✅ COMPLETED

**Goal**: Implement modern touch and pen support

#### Tasks:

- [x] Replace all Mouse Events to Pointer Events
- [x] Update tests to test Mouse, Touch, and Pen events (5 tests covering touch/pen input)
- [x] Ensure library support for multi-touch (dragging multiple elements with multiple fingers)
- [x] Create multi-touch tests (4 tests covering multi-touch scenarios)

#### Implementation Notes:

- **Pointer Events**: DragManager now uses modern pointer events alongside HTML5 drag API
- **Multi-input Support**: Tests verify mouse, touch, and pen input work correctly
- **Cross-platform**: All input tests run across Chrome, Firefox, and Safari via Playwright
- **Modern API**: Uses setPointerCapture for proper touch handling

### Phase 2.3: Accessibility Improvements ✅ COMPLETED

**Goal**: Enhance accessibility for all users

#### Tasks:

- [x] Implement KeyboardManager for full keyboard navigation and control
- [x] Implement SelectionManager for multi-item selection support
- [x] Add ARIA roles and attributes for screen reader support
- [x] Create comprehensive accessibility test suite
- [x] Support keyboard drag-and-drop with Enter/Space keys
- [x] Add focus management and visual indicators
- [x] Implement screen reader announcements for all operations

#### Implementation Highlights:

- **KeyboardManager**: Full keyboard navigation with arrow keys, Space/Enter for selection and dragging
  - Arrow keys for navigation between items
  - Space/Enter for selecting and grabbing items
  - Shift+Arrow for range selection
  - Ctrl/Cmd+Space for multi-selection
  - Escape to cancel drag operations
  - Tab/Shift+Tab for focus navigation
- **SelectionManager**: Multi-item selection with keyboard and mouse support
  - Single and multi-item selection
  - Range selection with Shift modifier
  - Toggle selection with Ctrl/Cmd modifier
  - Visual feedback with customizable CSS classes
- **ARIA Support**: Complete screen reader integration
  - `role="listbox"` on containers, `role="option"` on items
  - Dynamic `aria-selected` and `aria-grabbed` states
  - Live region announcements for all drag operations
  - Proper `aria-label` and `aria-describedby` attributes
  - `tabindex` management for keyboard focus
- **Test Coverage**: 9 comprehensive E2E tests for accessibility features
  - Keyboard navigation tests
  - Multi-selection interaction tests
  - Screen reader announcement validation
  - Focus management verification

### Phase 2.4: Handle, Filter & Core Utilities 📋 NEXT PRIORITY

**Goal**: Implement essential v1.x features for controlling draggable behavior

#### Tasks:

- [ ] **Handle Option Implementation**
  - [ ] Add `handle` selector support to DragManager
  - [ ] Only allow dragging when initiated from handle element
  - [ ] Add handle tests with keyboard and pointer events
  - [ ] Update documentation with handle examples

- [ ] **Filter Option Implementation**
  - [ ] Add `filter` selector support to exclude elements
  - [ ] Implement `onFilter` callback for filtered element interactions
  - [ ] Prevent drag initiation on filtered elements
  - [ ] Add comprehensive filter tests

- [ ] **Draggable Selector**
  - [ ] Implement `draggable` option to specify which items can be dragged
  - [ ] Default to all direct children if not specified
  - [ ] Ensure compatibility with handle and filter options

- [ ] **Delay Options**
  - [ ] Implement `delay` option for drag start delay
  - [ ] Add `delayOnTouchOnly` for touch-specific delays
  - [ ] Implement `touchStartThreshold` for touch movement tolerance
  - [ ] Add `preventOnFilter` option

- [ ] **Utility Methods**
  - [ ] Implement `option()` method for getting/setting options
  - [ ] Add `closest()` utility method
  - [ ] Implement `sort()` method for programmatic reordering
  - [ ] Add `save()` method for persistence

#### Deliverables:

- Working handle option with full test coverage
- Filter system with onFilter callback support
- Configurable draggable selector
- Delay options for better UX on touch devices
- Core utility methods for programmatic control
- Updated TypeScript types for all new options
- Documentation and examples for each feature

### Phase 2.5: Advanced Behavior Options 📋 FUTURE

**Goal**: Implement advanced v1.x behavior customization options

#### Tasks:

- [ ] **Swap Behavior Options**
  - [ ] Implement `swapThreshold` for swap zone detection
  - [ ] Add `invertSwap` option for inverted swap zones
  - [ ] Implement `invertedSwapThreshold` for fine-tuning
  - [ ] Add swap behavior tests

- [ ] **Direction Detection**
  - [ ] Implement automatic `direction` detection (vertical/horizontal)
  - [ ] Add manual direction override option
  - [ ] Optimize sorting algorithms based on direction

- [ ] **Fallback System**
  - [ ] Implement `forceFallback` for non-HTML5 drag behavior
  - [ ] Add `fallbackClass` for fallback element styling
  - [ ] Implement `fallbackOnBody` option
  - [ ] Add `fallbackTolerance` for drag threshold
  - [ ] Create `fallbackOffset` for positioning

- [ ] **Additional Event Callbacks**
  - [ ] Implement `onChoose` callback
  - [ ] Add `onUnchoose` callback
  - [ ] Implement `onSort` callback
  - [ ] Add `onMove` callback with cancel support
  - [ ] Implement `onClone` callback
  - [ ] Add `onChange` callback

- [ ] **Data Management**
  - [ ] Implement `dataIdAttr` configuration
  - [ ] Add `setData` method for DataTransfer customization
  - [ ] Implement store functionality for persistence

- [ ] **Visual Customization**
  - [ ] Add `dragoverBubble` option
  - [ ] Implement `removeCloneOnHide` option
  - [ ] Add `emptyInsertThreshold` for empty list handling

#### Deliverables:

- Complete swap behavior system with thresholds
- Automatic and manual direction detection
- Full fallback system for legacy browser support
- All remaining v1.x event callbacks
- Data management and persistence features
- Visual customization options
- Comprehensive test coverage for all features
- Migration guide for v1.x users

### Phase 3: Animation System (Weeks 9-11) ⏸️ READY TO START

**Goal**: Modern animation system with smooth transitions

#### Current Status:

The core drag-and-drop functionality is complete and stable (52/55 tests passing). Phase 3 is ready to begin with a
focus on adding smooth animations to enhance user experience.

#### High Priority Tasks (Next Sprint):

- [ ] Implement AnimationManager class for centralized animation coordination
- [ ] Create CSS transition engine with requestAnimationFrame coordination
- [ ] Add basic FLIP animations for element reordering during drag operations
- [ ] Integrate animations with existing DragManager operations
- [ ] Add animation configuration to SortableOptions interface (duration, easing, etc.)

#### Medium Priority Tasks:

- [ ] Add physics-based animations (spring/easing functions) for natural movement
- [ ] Implement performance optimizations (will-change, transform layers)
- [ ] Add animation event callbacks (onAnimationStart, onAnimationComplete)
- [ ] Create animation utilities (duration calculation, easing presets)
- [ ] Add tests for animation behavior and performance

#### Low Priority Tasks:

- [ ] Advanced FLIP animations for complex reorderings (multi-item, cross-zone)
- [ ] Animation timeline coordination for multiple simultaneous operations
- [ ] Custom animation plugin architecture for advanced use cases
- [ ] Performance monitoring and metrics for animations

#### Deliverables:

- Smooth 60fps animations for all drag-and-drop operations
- Configurable animation system with presets
- FLIP animation support for seamless reordering
- Performance-optimized transitions using modern CSS properties
- Animation API integrated with existing event system

#### Next Steps for Phase 3:

1. **Stabilization First**: Fix the 3 failing tests in grid-layout and independent-groups specs
2. **AnimationManager Implementation**: Create core animation coordination class with FLIP pattern
3. **CSS Integration**: Use modern CSS properties (transform, transition) with proper GPU acceleration
4. **Performance**: Ensure animations don't block main thread or cause layout thrashing
5. **Configuration**: Add animation options to SortableOptions with sensible defaults
6. **Animation Tests**: Add e2e tests for smooth animation behavior and performance validation

### Phase 4: Plugin Architecture (Weeks 12-14)

**Goal**: Extensible plugin system

#### Tasks:

- [ ] Design and implement PluginSystem
- [ ] Migrate AutoScroll plugin
- [ ] Migrate MultiDrag plugin
- [ ] Migrate Swap plugin
- [ ] Create plugin development guide
- [ ] Add plugin testing utilities

#### Deliverables:

- Complete plugin system
- Migrated existing plugins
- Plugin development documentation

### Phase 5: API Compatibility (Weeks 15-17)

**Goal**: Ensure backward compatibility

#### Tasks:

- [ ] Implement legacy API compatibility layer
- [ ] Create migration guide for TypeScript users
- [ ] Add runtime type checking for development
- [ ] Comprehensive integration testing
- [ ] Performance comparison with v1.x

#### Deliverables:

- Majority API compatibility
- Migration documentation
- Performance analysis report

### Phase 6: Documentation & Release (Weeks 18-20)

**Goal**: Production-ready release

#### Tasks:

- [ ] Complete API documentation
- [ ] Create interactive examples
- [ ] Write migration guide
- [ ] Beta testing with key users
- [ ] Performance optimization
- [ ] Release candidate preparation

#### Deliverables:

- Complete documentation
- Beta release
- Migration tools

## Modern Build System ✅ IMPLEMENTED

### Technology Stack

```json
{
  "build": {
    "bundler": "Vite/Rollup",
    "typescript": "5.9.2",
    "testing": "Vitest + Playwright",
    "linting": "ESLint + Prettier",
    "docs": "TypeDoc + JSDoc",
    "automation": "Semantic Release + GitHub Actions"
  },
  "outputs": {
    "esm": "dist/sortable.esm.js",
    "cjs": "dist/sortable.cjs.js",
    "umd": "dist/sortable.umd.js",
    "types": "dist/types/index.d.ts"
  },
  "quality": {
    "typescript": "strict mode enabled",
    "linting": "ESLint with TypeScript + TSDoc validation",
    "formatting": "Prettier with VS Code integration",
    "testing": "Unit + E2E + Coverage reporting",
    "documentation": "TypeDoc with GitHub Pages deployment"
  }
}
```

### Build Configuration

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Sortable',
      formats: ['es', 'cjs', 'umd'],
    },
    rollupOptions: {
      external: [], // No external dependencies
      output: {
        exports: 'named',
        globals: {},
      },
    },
  },
  plugins: [
    typescript(),
    dts(), // Generate .d.ts files
  ],
})
```

## Testing Strategy ✅ IMPLEMENTED

### Test Structure

```
tests/
├── unit/                    // Unit tests for individual classes (Vitest + jsdom)
│   ├── setup.ts            // Test setup with DOM mocking
│   └── *.test.ts           // Unit test files
├── e2e/                    // End-to-end browser tests (Playwright)
│   └── *.spec.ts          // E2E test files
```

### Testing Tools ✅ CONFIGURED

- **Unit Tests**: Vitest with jsdom for DOM testing
- **Integration Tests**: Playwright for cross-browser testing
- **Coverage**: V8 provider with 80% thresholds
- **CI Integration**: Tests run on every PR and push
- **Browsers**: Chrome, Firefox, Safari, Mobile (Chrome/Safari)

### Coverage Targets

- Unit test coverage: >80% (configured)
- E2E test coverage: Cross-browser validation
- Browser coverage: Chrome, Firefox, Safari, Edge + Mobile view ports

### Test Configuration Features

- **DOM Mocking**: ResizeObserver, IntersectionObserver, getBoundingClientRect
- **Animation Mocking**: requestAnimationFrame/cancelAnimationFrame
- **CI/CD Integration**: Parallel test execution with artifact uploads
- **Test Reports**: JUnit XML + HTML reports with GitHub Actions integration

## Documentation System ✅ IMPLEMENTED

### TypeScript JSDoc Documentation

- **TypeDoc**: Generates comprehensive API documentation from TypeScript + JSDoc
- **TSDoc Validation**: ESLint plugin ensures documentation quality
- **VS Code Integration**: Rich IntelliSense with parameter hints and examples
- **GitHub Pages**: Automatic deployment of documentation on releases

### Documentation Features

- **Rich Examples**: Multiple code examples for different use cases
- **Cross-references**: Linked types and related functionality
- **Categorization**: Organized by Core, Animation, Plugins, Utils, Types
- **Version Tracking**: Tracks API changes across versions
- **Issue Templates**: Documentation issue tracking on GitHub

### Documentation Workflow

```bash
# Build documentation locally
npm run docs:build

# Serve documentation for review
npm run docs:serve

# Clean documentation output
npm run docs:clean
```

### IntelliSense Benefits

- Parameter tooltips with types and descriptions
- Auto-completion with contextual examples
- Error highlighting for TSDoc syntax
- Cross-reference navigation between types

## Performance Targets

### Metrics

| Metric                    | Current | Target    | Improvement   |
| ------------------------- | ------- | --------- | ------------- |
| Bundle Size (gzipped)     | ~30KB   | <25KB     | 17% reduction |
| Initial Sort (1000 items) | ~50ms   | <30ms     | 40% faster    |
| Animation Frame Rate      | ~45fps  | 60fps     | 33% smoother  |
| Memory Usage              | High    | Reduced   | 50% less      |
| Tree Shaking              | Poor    | Excellent | Plugin-based  |

### Optimization Strategies

- Use modern DOM APIs (Intersection Observer, ResizeObserver)
- Implement efficient diffing algorithms
- Optimize event listener management
- Use requestAnimationFrame for smooth animations
- Implement virtual scrolling for large lists

## Breaking Changes & Migration

### Non-Breaking Changes

- All existing APIs remain functional (except for those where we have dropped functionality)
- Same event names and signatures
- Same initialization patterns
- Same plugin interfaces

### Breaking Changes

- Drop IE support
- Drop support for all browsers over 2 years old
- Pull MultiDrag and Swap plugins into core and remove duplicated functionality where unnecessary
- Take a MultiDrag-first approach to selection and dragging. Single-item drag can be simply treated as a multi-item drag
  with one item.
- In general, take a multi-item approach when there's any question that single-item activities might have need for
  multi-item capability in the future.
- Use modern event handling patterns (e.g., Promises, async/await)
- We will break existing APIs when support for newer, more flexible functionality would create redundancy.

### New TypeScript APIs

```typescript
// Enhanced type-safe initialization
const sortable = new Sortable(element, {
  group: 'shared',
  animation: 150,
  onEnd: (event: SortableEvent) => {
    // event is fully typed
  },
})

// Plugin installation with types
sortable.use(AutoScrollPlugin, {
  speed: 10,
  sensitivity: 10,
})
```

### Migration Guide Outline

1. **Immediate Benefits**: Drop-in replacement with better performance
2. **TypeScript Migration**: Gradual adoption of typed APIs
3. **Modern Features**: New APIs for advanced use cases
4. **Plugin Updates**: Updated plugin APIs with better composability

## Release Timeline & Automation ✅ IMPLEMENTED

### Semantic Release Automation

- **Conventional Commits**: Automated versioning based on commit messages
- **GitHub Actions**: Automated release workflow on main/develop/alpha branches
- **Multi-branch Strategy**:
  - `main` → Stable releases (2.0.0)
  - `develop` → Beta releases (2.0.0-beta.x)
  - `alpha` → Alpha releases (2.0.0-alpha.x)

### Release Workflow

- **CI/CD Pipeline**: Full test suite runs before any release
- **Automated Changelog**: Generated from conventional commit messages
- **GitHub Releases**: Created with build artifacts
- **Documentation Deploy**: Automatic GitHub Pages deployment

### Current Release Status

- ✅ **v2.0.0-alpha.1**: Foundation complete with full tooling setup
- 🔄 **Next**: Core functionality implementation (Phase 2)

### Upcoming Releases

- **v2.0.0-alpha.2**: Basic Sortable class implementation
- **v2.0.0-alpha.3**: Core drag-and-drop functionality
- **v2.0.0-beta.1**: Plugin system + essential plugins
- **v2.0.0**: Full production release

## Success Criteria

### Technical Metrics

- [ ] 100% API compatibility with v1.x
- [x] > 80% test coverage (configured and enforced)
- [ ] Bundle size <25KB gzipped
- [ ] 60fps animations on modern devices
- [x] Zero circular dependencies (enforced by TypeScript strict mode)
- [x] Full TypeScript support with comprehensive type definitions
- [x] Modern build system with ESM/CJS/UMD outputs
- [x] Automated documentation generation and deployment

### Community Metrics

- [ ] Migration guide completion rate >80%
- [ ] Community plugin compatibility >90%
- [ ] Performance improvement >30%
- [ ] Developer satisfaction score >4.5/5

## Risk Mitigation

### Technical Risks

- **Complexity Underestimation**: Use time-boxed sprints with clear deliverables
- **Performance Regression**: Continuous benchmarking and optimization
- **API Incompatibility**: Comprehensive compatibility testing

### Community Risks

- **Adoption Resistance**: Clear migration path and benefits communication
- **Ecosystem Fragmentation**: Maintain v1.x compatibility during transition
- **Plugin Breakage**: Provide plugin migration tools and documentation

## Development Notes & Learnings

### Phase 2 Implementation Insights

The core implementation phase revealed several key insights that shaped the architecture:

#### 1. **WeakMap-based Element Tracking**

- Successfully replaced DOM expando properties (v1.x pattern) with WeakMap for element-to-instance mapping
- Eliminates memory leaks and DOM pollution
- Provides cleaner separation between library state and DOM elements

#### 2. **Dual API Approach: HTML5 + Pointer Events**

- HTML5 drag-and-drop API handles the primary drag operations and browser integration
- Pointer events provide enhanced touch, pen, and multi-input support
- This hybrid approach maximizes compatibility while enabling modern input handling

#### 3. **GlobalDragState Pattern**

- Singleton pattern effectively manages cross-zone drag operations
- Enables shared group functionality without complex inter-instance communication
- WeakMap-based storage prevents memory leaks during zone cleanup

#### 4. **TypeScript-first Architecture Benefits**

- Strong typing caught numerous potential runtime errors during development
- IntelliSense integration provides excellent developer experience
- JSDoc + TypeScript combination generates comprehensive documentation automatically

#### 5. **Test-Driven Development Success**

- Playwright e2e tests provided confidence in cross-browser compatibility
- Test coverage helped identify edge cases in touch/pen input handling
- Comprehensive test suite (52/55 passing) validates core functionality stability

#### 6. **Modern Build Tooling Impact**

- Vite dev server enables rapid iteration with hot module reloading
- Rollup build produces optimized library bundles for distribution
- Semantic release automation streamlines version management

### Phase 2.3 Accessibility Implementation Insights

#### 1. **Keyboard Navigation Design**

- Implemented intuitive keyboard patterns following W3C ARIA best practices
- Arrow keys for navigation, Space/Enter for selection and dragging
- Modifier keys (Shift, Ctrl/Cmd) enable advanced multi-selection patterns
- Escape key provides universal cancel operation for better UX

#### 2. **Multi-Selection Architecture**

- SelectionManager provides centralized selection state management
- Visual feedback through customizable CSS classes (selectedClass, focusClass)
- Event-driven architecture ensures UI stays synchronized with selection state
- Supports both keyboard and mouse selection patterns seamlessly

#### 3. **ARIA Integration Strategy**

- Used semantic roles (listbox/option) for proper screen reader interpretation
- Dynamic aria-selected and aria-grabbed attributes track interaction state
- Live region announcements provide real-time feedback for all operations
- Proper tabindex management ensures keyboard navigability

#### 4. **Testing Accessibility**

- Created 9 comprehensive E2E tests covering all accessibility features
- Tests validate keyboard navigation, multi-selection, and screen reader support
- Cross-browser testing ensures consistent behavior across platforms
- Tests serve as living documentation for accessibility behavior

### Outstanding Technical Debt

#### 1. **Three Failing Tests**

- Need investigation into specific failure scenarios in grid-layout and independent-groups specs
- May indicate edge cases in complex layout scenarios or group isolation
- Priority for Phase 3 stabilization efforts before animation work begins

#### 2. **Animation System Missing**

- Core drag-and-drop is functional but lacks visual polish expected by users
- Reorder operations happen instantly without smooth transitions
- Phase 3 focus area with high user experience impact

#### 3. **Plugin Architecture Not Yet Implemented**

- Current architecture supports plugins but no formal plugin system exists
- AutoScroll, MultiDrag, and Swap features need plugin implementation
- Note: MultiDrag functionality partially implemented via SelectionManager
- Phase 4 priority for full v1.x feature parity

## Current Status & Next Steps

### Recent Development Progress (December 2024)

**Latest Accomplishment: Phase 2.3 Accessibility Complete (branch: `phase-2.3/accessibility-improvements`)**

- ✅ Implemented comprehensive keyboard navigation system
- ✅ Added multi-item selection with keyboard and mouse support
- ✅ Integrated complete ARIA attributes and screen reader support
- ✅ Created 9 comprehensive E2E tests for accessibility features
- ✅ Fixed all TypeScript and ESLint errors
- ✅ Successfully merged with main branch

**Previous Milestones:**

**Phase 2.2 Complete: `refactor: Phase 2.3`**

- Refactored DragManager with improved event handling
- Introduced GlobalDragState singleton for cross-zone drag operations
- Enhanced pointer events support for touch and pen input
- Improved TypeScript types and documentation

**Phase 2 Core: `feat(core): implement basic drag-and-drop system`**

- Complete implementation of core drag-and-drop functionality
- Working DragManager, DropZone, and EventSystem classes
- Full cross-browser compatibility with HTML5 drag API
- Comprehensive test suite with Playwright e2e tests

### ✅ Phase 1 Complete: Foundation Established

The Resortable project now has a complete modern development foundation with:

**Development Infrastructure:**

- TypeScript 5.9 with strict mode and comprehensive type system
- Vite + Rollup build system producing ESM, CJS, and UMD outputs
- Complete testing setup with Vitest (unit) + Playwright (e2e)
- ESLint + Prettier + TSDoc validation for code quality
- VS Code integration with IntelliSense and format-on-save

**Automation & CI/CD:**

- GitHub Actions pipeline with cross-platform testing (Ubuntu, Windows, macOS)
- Semantic release automation with conventional commits
- Multi-branch release strategy (main/develop/alpha)
- Automated documentation deployment to GitHub Pages
- Issue templates and community contribution guidelines

**Documentation System:**

- TypeDoc with rich JSDoc comments for excellent VS Code IntelliSense
- Comprehensive type definitions with examples and cross-references
- Automated API documentation generation and GitHub Pages deployment
- Documentation quality validation through ESLint TSDoc plugin

### ✅ Phase 2 Complete: Core Implementation

Phase 2 has been successfully completed with a fully functional drag-and-drop system:

1. ✅ **DragManager Implementation** - Modern drag-and-drop using HTML5 API + Pointer Events
2. ✅ **Event System** - Type-safe event handling with proper lifecycle management
3. ✅ **DOM Utilities** - Modern DOM manipulation with performance optimizations
4. ✅ **State Management** - GlobalDragState with WeakMap element tracking
5. ✅ **Cross-zone Operations** - Support for dragging between different lists with shared groups
6. ✅ **Multi-input Support** - Mouse, touch, and pen input handling via pointer events
7. ✅ **Comprehensive Testing** - 52/55 e2e tests passing across multiple browsers

### ✅ Phase 2.2 Complete: Touch/Pen Support

Modern input handling has been successfully implemented:

1. ✅ **Pointer Events API** - Modern event handling for all input types
2. ✅ **Multi-touch Support** - Proper handling of simultaneous touch gestures
3. ✅ **Cross-platform Testing** - Validation across Chrome, Firefox, and Safari
4. ✅ **Input-specific Tests** - Dedicated test coverage for touch and pen inputs

### ⏸️ Ready for Phase 3: Animation System

With core functionality stable, the next focus is implementing smooth animations:

1. **Test Stabilization** - Fix remaining 3 failing tests for solid foundation
2. **AnimationManager** - Coordinate all animation operations with FLIP pattern
3. **TransitionEngine** - CSS transition-based animations with requestAnimationFrame
4. **Performance Optimization** - Efficient animation with minimal reflows and 60fps target
5. **Animation Configuration** - User-configurable animation settings and presets

The robust tooling foundation ensures that all new code will have:

- Automatic type checking and validation
- Comprehensive test coverage requirements
- Consistent code formatting and documentation
- Automated release management
- Cross-platform compatibility verification

This establishes Resortable as a modern, professional open-source project ready for collaborative development and
long-term maintenance.

## Next Steps: Phase 2.4 Handle, Filter & Core Utilities

### 🎯 Immediate Priorities (Week 1)

1. **Handle Option Implementation**
   - Add drag handle support to DragManager
   - Restrict drag initiation to handle elements only
   - Ensure keyboard and pointer event compatibility
   - Create comprehensive tests for handle behavior

2. **Filter System**
   - Implement filter selector to exclude elements from dragging
   - Add onFilter callback for handling clicks on filtered elements
   - Prevent drag operations on filtered elements
   - Test filter behavior with various selectors

3. **Core Utilities**
   - Implement `option()` method for runtime configuration
   - Add `draggable` selector support
   - Create delay options for touch devices
   - Implement remaining utility methods

### 📋 Week 2 Goals

4. **Testing & Documentation**
   - Create comprehensive test suite for all new features
   - Add TypeScript types for new options
   - Write documentation with examples
   - Ensure backward compatibility where possible

5. **Integration & Polish**
   - Integrate handle/filter with accessibility features
   - Ensure smooth interaction with existing drag system
   - Performance testing with complex selectors
   - Edge case handling and error messages

### ✅ Success Criteria for Phase 2.4

- Handle option fully functional with keyboard and mouse
- Filter system prevents dragging of excluded elements
- Draggable selector properly limits draggable items
- Delay options improve touch device UX
- All utility methods implemented with TypeScript types
- 100% test coverage for new features
- Documentation complete with migration examples

## 🔮 Future Phases Overview

### Phase 2.5: Advanced Behavior Options
- Swap thresholds and direction detection
- Fallback system for legacy browsers
- Remaining event callbacks
- Data management features

### Phase 3: Animation System 🎨
- FLIP animations for smooth transitions
- Configurable animation duration and easing
- Performance optimization for 60fps
- Integration with drag operations

### Phase 4: Plugin Architecture 🔌
- Formal plugin system implementation
- AutoScroll plugin
- Complete MultiDrag plugin API
- Swap mode plugin

### Phase 5: API Compatibility 🔄
- Legacy API compatibility layer
- Migration tools and guides
- Performance benchmarking
- v1.x feature parity validation
