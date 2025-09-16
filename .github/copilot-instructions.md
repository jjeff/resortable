# GitHub Copilot Instructions for Resortable

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Project Overview

**Resortable** is a complete rewrite of the Sortable.js library using modern TypeScript and contemporary development patterns. This is a fork/rewrite project with the goal of creating a more maintainable, performant, and developer-friendly drag-and-drop library while maintaining API compatibility with the original Sortable.js.

## Working Effectively

### Initial Setup and Dependencies
```bash
# Install Node.js dependencies (takes ~31 seconds)
npm install
```

### Pre-Commit Validation - CRITICAL
**ALWAYS run these commands BEFORE EVERY commit/push - NO EXCEPTIONS:**
```bash
# 1. Lint check (takes ~7 seconds) - NEVER CANCEL
npm run lint

# 2. TypeScript check (takes ~3 seconds) - NEVER CANCEL  
npm run type-check

# 3. Fix any issues found before proceeding
# 4. Only then commit and push
```

### Build Commands
```bash
# Vite build (takes ~7 seconds) - NEVER CANCEL, set timeout to 60+ seconds
npm run build

# Rollup build (takes ~5 seconds) - NEVER CANCEL, set timeout to 60+ seconds
npm run build:rollup

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Unit tests (takes ~3 seconds, 87 tests) - NEVER CANCEL, set timeout to 30+ seconds
npm run test:unit

# Unit tests with watch mode
npm run test:unit:watch

# Unit tests with coverage
npm run test:unit:coverage

# Unit tests with UI
npm run test:unit:ui

# E2E tests with Playwright (requires browser installation)
npm run test:e2e

# Install Playwright browsers (may fail in constrained environments)
npm run test:install
```

### Development Server
```bash
# Start development server (ready in ~1.3 seconds)
npm run dev
# Server runs on http://localhost:4173/ (note: uses port 4173, not 3000)

# Preview production build
npm run preview
```

## Manual Validation Requirements

**ALWAYS manually validate drag-and-drop functionality after making changes:**

### Core Functionality Testing
1. **Start dev server**: `npm run dev`
2. **Navigate to**: http://localhost:4173/
3. **Verify library loads**: Check "Library Status" shows "Resortable loaded - 21 instances active"
4. **Test basic drag-and-drop**:
   - Drag items within the "Basic Sortable List" 
   - Verify items reorder correctly
   - Check console for event logging
5. **Test cross-list functionality**:
   - Drag items between "Group A - List 1" and "Group A - List 2"
   - Verify items move between lists
   - Check status updates show "add" and "remove" events
6. **Test visual effects**:
   - Test smooth transitions in "Visual Effects" section
   - Verify animations work properly
7. **Test accessibility**:
   - Use keyboard navigation (Tab, Arrow keys, Space, Enter)
   - Verify screen reader compatibility with listbox/listitem roles

### Expected Behavior
- Smooth drag-and-drop with 150ms animation by default
- Proper accessibility with ARIA roles (listbox/listitem)
- Console logging of all drag events with detailed information
- Visual feedback with ghost classes and hover effects
- Cross-list functionality between shared groups
- Keyboard navigation support

## Project Structure

### Key Directories
```
src/                    # Main source code
├── animation/          # Animation system (AnimationManager)
├── core/              # Core drag-and-drop logic (DragManager, DropZone, EventSystem)
├── types/             # TypeScript type definitions
├── utils/             # Shared utilities and helpers
└── index.ts           # Main entry point

tests/                 # Test files
├── unit/              # Unit tests (Vitest)
├── e2e/               # End-to-end tests (Playwright)
└── setup.ts           # Test setup configuration

legacy-sortable/       # Original Sortable.js reference code
examples/              # HTML examples for testing
.github/workflows/     # CI/CD pipelines
```

### Important Files
- `package.json` - Dependencies and npm scripts
- `vite.config.ts` - Vite development and build configuration
- `vitest.config.ts` - Unit test configuration
- `playwright.config.ts` - E2E test configuration
- `eslint.config.js` - Linting rules
- `tsconfig.json` - TypeScript configuration
- `index.html` - Main demo page with comprehensive examples
- `sortable-rewrite-implementation-plan.md` - Detailed architecture and development plan

## Build System

### Tools Used
- **Vite**: Development server and library building
- **Rollup**: Production library bundles (ESM, CommonJS, UMD)
- **TypeScript**: Strict type checking and compilation
- **Vitest**: Unit testing with JSDOM environment
- **Playwright**: E2E testing with browser automation
- **ESLint**: Code linting with TypeScript rules

### Output Formats
- `dist/sortable.es.js` - ES modules (76.72 kB, 14.37 kB gzipped)
- `dist/sortable.cjs.js` - CommonJS (39.58 kB, 8.97 kB gzipped)
- `dist/sortable.umd.js` - UMD (39.79 kB, 9.06 kB gzipped)
- `dist/types/index.d.ts` - TypeScript declarations

## Architecture Overview

### Modern Patterns Used
- **Instance-scoped state** instead of global variables
- **WeakMap for element tracking** instead of DOM expandos
- **Modular architecture** with dependency inversion
- **Event-driven system** with typed EventEmitter
- **Plugin-based architecture** for extensibility
- **FLIP animation system** with requestAnimationFrame
- **Feature detection** instead of browser sniffing

### Core Classes
- `Sortable` - Main class for creating sortable instances
- `DragManager` - Handles drag-and-drop interactions
- `DropZone` - Manages drop targets and positioning
- `EventSystem` - Type-safe event emission and handling
- `AnimationManager` - Modern animation orchestration

## Development Guidelines

### TypeScript
- Uses strict mode with full type safety
- Targeted use of `any` allowed in migration hotspots
- Progressive type tightening over time
- Full API compatibility with original Sortable.js

### Code Quality
- ESLint with TypeScript rules enforced
- Prettier formatting required
- 80%+ test coverage targets
- TSDoc comments for public APIs

### Performance Targets
- Target bundle size <25KB gzipped
- 60fps animations
- Modern DOM APIs preferred
- Tree-shakeable plugin architecture

## Common Tasks

### Adding New Features
1. Create feature branch
2. Add TypeScript types in `src/types/`
3. Implement core logic in appropriate module
4. Add unit tests in `tests/unit/`
5. Update main demo page if needed
6. **ALWAYS run validation before committing**:
   - `npm run lint && npm run type-check`
   - `npm run test:unit`
   - `npm run build`
   - Manual drag-and-drop testing

### Debugging Issues
1. Start dev server: `npm run dev`
2. Open browser dev tools
3. Check console for event logs
4. Test on http://localhost:4173/
5. Use Playwright for automated testing
6. Check status updates in demo page

### CI/CD Information
- Runs on Node.js 20
- Tests on Ubuntu (GitHub-hosted) and macOS (self-hosted)
- Linting, type-checking, unit tests, and builds are required
- E2E tests run on self-hosted runners only
- All validation must pass before merge

## Known Issues and Workarounds

### Playwright Installation
- May fail in constrained environments due to download issues
- Document as "may not work in all environments" if installation fails
- E2E tests require successful browser installation

### Development Environment
- Uses port 4173 for dev server (not standard 3000)
- Vite dev server starts quickly (~1.3 seconds)
- Hot module reloading works for TypeScript changes

## Legacy Reference

The `legacy-sortable/` directory contains the original Sortable.js codebase for reference during development. Do not modify these files - they are read-only reference material.

## Getting Help

1. Check the implementation plan: `sortable-rewrite-implementation-plan.md`
2. Review the demo page: http://localhost:4173/ (after `npm run dev`)
3. Check existing unit tests for usage patterns
4. Refer to TypeScript definitions in `src/types/`
5. Use the comprehensive demo page for testing all functionality

**Remember: Always validate drag-and-drop functionality manually after any changes to ensure the core library features work correctly.**