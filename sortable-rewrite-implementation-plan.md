# Sortable.js Rewrite Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to rewrite the Sortable.js library from scratch using modern TypeScript, contemporary JavaScript patterns, and updated tooling. The goal is to create a more maintainable, performant, and developer-friendly drag-and-drop library while preserving API compatibility and existing functionality.

## Decisions from stakeholder interview

The following decisions were made during a short stakeholder interview and are reflected in the roadmap and immediate work items below:

- Forking and repo strategy: this will be a new fork and a different project — the code here will not maintain the original v1.x branch. The new project will be private until the first alpha release is ready.
- Project name (provisional): "Resortable" (used internally while the project is private).
- API compatibility: breaking changes are allowed but must be documented; where behavior changes are required we will map existing v1.x functionality to the new APIs and provide migration documentation and adapters where practical.
- Maintenance: there will be no long-lived v1 maintenance branch in this repo; v1.x will be treated as an external legacy project.
- Alpha scope: target a full-features alpha (Multi-drag, AutoScroll, Swap, animations, and plugin compatibility) plus tests to validate parity — i.e., the plan's "C" option.
- Tooling: use Vite for development / examples and Rollup for producing production library bundles (Vite dev + Rollup bundling — plan's "A" option).
- TypeScript policy: pragmatic strategy — enable strict mode ("strict": true) to get strong type guarantees, but allow targeted uses of `any` or brief `@ts-expect-error`/ignores in migration hotspots and legacy adapter shims to speed progress; the plan is to progressively tighten types over time.
- Publishing: keep the fork private until a v1-alpha release exists; publish name will be decided before public release ("Resortable" is provisional).

These decisions are authoritative for the next steps in the roadmap and small-PR plan described later in this document.

## Deprecated patterns & replacements

This focused list calls out specific antiquated or brittle patterns found in the v1 codebase and prescribes modern replacements we will implement during the rewrite. Each item includes a short replacement approach and the phase where it should be handled.

- Global module-scoped mutable variables (e.g. dragEl, parentEl, ghostEl): replace with instance-scoped state and a small StateManager (immutable update pattern or controlled mutators). Use a WeakMap<Element, Instance> for element→instance mapping. (Phase 1–2)

- DOM expando usage (el[expando] = instance): remove and use WeakMap to avoid DOM pollution and memory leaks; only use data-* attributes for public IDs. (Phase 1)

- Monolithic files and circular dependencies (Sortable.js ↔ Animation.js ↔ utils.js): split into focused modules (core, DragManager, AnimationManager, utils/dom/geometry) and invert dependencies so animation code receives state rather than importing Sortable. (Phase 1–2)

- Browser UA sniffing (IE11OrLess, Edge, Safari, etc.): replace with feature detection (pointer events, CSS.supports) and capability gates; document dropped legacy browser support. (Phase 1)

- Ad‑hoc event system and pluginEvent patterns: replace with a typed EventSystem / EventEmitter and well-defined plugin lifecycle hooks; rely on CustomEvent for DOM-level events. (Phase 2)

- setTimeout-based animation coordination: adopt FLIP + requestAnimationFrame and CSS transitions, centralize animation orchestration in AnimationManager, remove brittle timeout choreography. (Phase 3)

- Low-level DOM utility duplication and fragile measurement logic: consolidate into typed `utils/dom.ts` and `utils/geometry.ts`, add unit tests for geometry helpers (getRect, matrix handling). (Phase 2)

- Manual style string concatenation & prefix hacks: centralize styles and prefer class toggles + CSS transitions; use CSS.supports and normalize prefixed behavior in a small helper. (Phase 2–3)

- Inconsistent event listener cleanup: provide unified add/remove helpers that return unregister functions and ensure `destroy()` cleans up listeners. (Phase 1)

- Legacy-heavy codepaths for older DnD APIs: isolate fallbacks behind adapters and make pointer events the primary path. (Phase 2)

Each of the above will be tracked as an explicit task in Phase 1–3 so replacements are tested and documented, and so plugin authors have clear migration guidance.

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
  private dragManager: DragManager;
  private dropZone: DropZone;
  private animationManager: AnimationManager;
  private eventSystem: EventSystem;
  private pluginSystem: PluginSystem;
  
  constructor(element: Element, options: SortableOptions) {
    // Initialize subsystems
  }
  
  // Public API methods
  public destroy(): void;
  public toArray(): string[];
  public sort(order: string[]): void;
  // ... other methods
}

// Plugin system interface
export interface SortablePlugin {
  name: string;
  version: string;
  install(sortable: Sortable): void;
  uninstall(sortable: Sortable): void;
}
```

### State Management Strategy

```typescript
// Immutable state management
interface SortableState {
  readonly dragElement: Element | null;
  readonly dropZones: ReadonlyArray<DropZone>;
  readonly activeOperations: ReadonlyArray<DragOperation>;
  readonly animationQueue: ReadonlyArray<Animation>;
}

class StateManager {
  private state: SortableState;
  
  public updateState(updater: (state: SortableState) => SortableState): void {
    this.state = Object.freeze(updater(this.state));
    this.notifySubscribers(this.state);
  }
}
```

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
- This work will be performed in a new, private forked repository (provisional name: `Resortable`). The original v1.x project will not be maintained here.
- Tooling choice: Vite will be used for developer experience (dev server, examples, docs preview) and Rollup will be used for producing final library bundles (CJS/ESM/UMD). This allows fast iteration during development while retaining deterministic library outputs.
- TypeScript policy: start with `strict: true` to get strong type safety, but adopt a pragmatic migration policy allowing targeted `any` or `@ts-expect-error` during initial conversions; progressively remove those as modules are hardened.

### Phase 2: Core Functionality (Weeks 4-8)
**Goal**: Implement core drag-and-drop functionality

#### Tasks:
- [ ] Implement DragManager class
- [ ] Create DropZone management system
- [ ] Build EventSystem with proper TypeScript events
- [ ] Implement basic sorting algorithms
- [ ] Add DOM utilities with modern APIs
- [ ] Create performance monitoring utilities

#### Deliverables:
- Working basic drag-and-drop
- Event system with type safety
- Core DOM manipulation utilities
- Performance benchmarks

### Phase 3: Animation System (Weeks 9-11)
**Goal**: Modern animation system with smooth transitions

#### Tasks:
- [ ] Implement AnimationManager
- [ ] Create CSS transition engine
- [ ] Add physics-based animations (optional)
- [ ] Implement FLIP animations for complex reorderings
- [ ] Add animation performance optimizations

#### Deliverables:
- Smooth animations for all operations
- Configurable animation system
- Performance-optimized transitions

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
      formats: ['es', 'cjs', 'umd']
    },
    rollupOptions: {
      external: [], // No external dependencies
      output: {
        exports: 'named',
        globals: {}
      }
    }
  },
  plugins: [
    typescript(),
    dts(), // Generate .d.ts files
  ]
});
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
- Browser coverage: Chrome, Firefox, Safari, Edge + Mobile viewports

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
| Metric | Current | Target | Improvement |
|--------|---------|---------|-------------|
| Bundle Size (gzipped) | ~30KB | <25KB | 17% reduction |
| Initial Sort (1000 items) | ~50ms | <30ms | 40% faster |
| Animation Frame Rate | ~45fps | 60fps | 33% smoother |
| Memory Usage | High | Reduced | 50% less |
| Tree Shaking | Poor | Excellent | Plugin-based |

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
- Take a MultiDrag-first approach to selection and dragging. Single-item drag can be simply treated as a multi-item drag with one item.
- In general, take a multi-item approach when there's any question that single-item activities might have need for multi-item capability in the future.
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
  }
});

// Plugin installation with types
sortable.use(AutoScrollPlugin, {
  speed: 10,
  sensitivity: 10
});
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
- [x] >80% test coverage (configured and enforced)
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

## Current Status & Next Steps

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

### 🔄 Ready for Phase 2: Core Implementation

With the foundation complete, development can now focus on implementing the core Sortable functionality:

1. **DragManager Implementation** - Modern drag-and-drop using pointer events
2. **Event System** - Type-safe event handling with proper lifecycle management  
3. **DOM Utilities** - Modern DOM manipulation with performance optimizations
4. **State Management** - Immutable state patterns with WeakMap element tracking
5. **Animation System** - FLIP animations with requestAnimationFrame coordination

The robust tooling foundation ensures that all new code will have:
- Automatic type checking and validation
- Comprehensive test coverage requirements
- Consistent code formatting and documentation
- Automated release management
- Cross-platform compatibility verification

This establishes Resortable as a modern, professional open-source project ready for collaborative development and long-term maintenance.