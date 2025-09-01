# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Resortable** - a complete rewrite of the Sortable.js library using modern TypeScript and contemporary development patterns. This is a fork/rewrite project with the goal of creating a more maintainable, performant, and developer-friendly drag-and-drop library while maintaining API compatibility with the original Sortable.js.

## Current Status

- **Phase**: Early development (pre-alpha)
- **Legacy Code**: The `legacy-sortable/` directory contains the original Sortable.js codebase as reference
- **New Implementation**: Will be built from scratch using the architecture outlined in `sortable-rewrite-implementation-plan.md`

## Development Setup

### Build Commands
Currently no build system is set up. Based on the implementation plan:
- Use Vite for development server and examples
- Use Rollup for production library bundles
- Target outputs: ESM, CommonJS, and UMD formats

### Testing
No test framework is currently configured. Plan calls for:
- Unit tests with Vitest
- Integration tests with Playwright
- Visual regression tests

## Architecture Plan

### New Structure (from implementation plan)
```
src/
├── core/
│   ├── Sortable.ts              # Main class
│   ├── DragManager.ts           # Drag operation handling  
│   ├── DropZone.ts              # Drop target management
│   ├── ElementTracker.ts        # Element state tracking
│   └── EventSystem.ts           # Event management
├── animation/
│   ├── AnimationManager.ts      # Animation coordination
│   ├── TransitionEngine.ts      # CSS transitions
│   └── SpringPhysics.ts         # Physics-based animations
├── plugins/
│   ├── PluginSystem.ts          # Plugin architecture
│   ├── AutoScroll.ts            # Auto-scroll plugin
│   ├── MultiDrag.ts             # Multi-selection plugin
│   └── SwapMode.ts              # Swap-based sorting
├── utils/
│   ├── dom.ts                   # DOM utilities
│   ├── geometry.ts              # Position calculations
│   ├── performance.ts           # Performance utilities
│   └── browser.ts               # Modern browser detection
└── types/
    ├── index.ts                 # Public type exports
    ├── core.ts                  # Core interfaces
    ├── events.ts                # Event type definitions
    └── plugins.ts               # Plugin interfaces
```

## Key Design Principles

### Legacy Issues to Avoid
- Global module-scoped mutable variables → use instance-scoped state
- DOM expando usage → use WeakMap for element→instance mapping
- Monolithic files → focused, single-responsibility modules
- Browser UA sniffing → feature detection
- setTimeout-based animation → requestAnimationFrame + CSS transitions
- Manual DOM utility duplication → consolidated typed utilities

### Modern Patterns to Use
- TypeScript with strict mode enabled
- Immutable state management patterns
- Class-based architecture with clear separation of concerns
- Composition over inheritance for plugins
- FLIP animations for smooth transitions
- Modern event handling (CustomEvent, proper cleanup)

## Migration Strategy

The rewrite follows a 6-phase approach:
1. **Foundation** - TypeScript setup, build system, project structure
2. **Core Functionality** - Basic drag-and-drop implementation  
3. **Animation System** - Modern animation with CSS transitions
4. **Plugin Architecture** - Extensible plugin system
5. **API Compatibility** - Backward compatibility layer
6. **Documentation & Release** - Complete docs and beta release

## API Compatibility

Must maintain compatibility with existing Sortable.js APIs while allowing breaking changes for:
- Dropping IE support  
- Modern event handling patterns
- Multi-drag first approach (single-drag as special case of multi-drag)
- Consolidated plugin functionality where redundant

## Performance Targets

- Bundle size: <25KB gzipped (vs current ~30KB)
- Animation: 60fps (vs current ~45fps) 
- Memory usage: 50% reduction
- Tree shaking: Plugin-based architecture

## References

- Original Sortable.js docs and examples in `legacy-sortable/README.md`
- Detailed implementation plan in `sortable-rewrite-implementation-plan.md`
- Legacy source code in `legacy-sortable/src/` for reference during rewrite