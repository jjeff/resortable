# Resortable Constitution

## Core Principles

### I. TypeScript-First
Every feature must be implemented in TypeScript with strict type checking enabled. Types must be comprehensive and exported for consumers. No use of `any` without explicit justification and `@ts-expect-error` annotation.

### II. Modern Build System
Vite for development and Rollup for production builds. Support ESM, CJS, and UMD formats. Build must produce optimized bundles under 50KB gzipped for core functionality.

### III. Test-First (NON-NEGOTIABLE)
TDD mandatory: Tests written → Tests fail → Then implement. Vitest for unit tests, Playwright for E2E. Minimum 80% coverage on all new code. Red-Green-Refactor cycle strictly enforced.

### IV. API Compatibility
Maintain compatibility with original Sortable.js API where possible. Breaking changes must be documented and migration guides provided. Deprecate before removing features.

### V. Performance & Browser Support
Target modern browsers (ES2020+). 60fps drag performance. Memory efficient - no memory leaks during repeated operations. Support for touch devices and accessibility.

## Development Standards

### Code Quality
- ESLint + Prettier for consistent formatting
- TSDoc comments for all public APIs
- TypeDoc for documentation generation
- Semantic versioning and conventional commits

### Architecture
- Clean separation of concerns: Core → Plugins → UI
- Event-driven architecture with proper TypeScript events
- Modular plugin system for extensions
- Tree-shakable exports for optimal bundling

## Quality Gates

### Pre-commit Requirements
- All linting passes (`npm run lint`)
- All type checking passes (`npm run type-check`)
- All tests pass (`npm test`)
- Documentation builds successfully

### Code Review
- All PRs require review
- Performance implications must be documented
- Breaking changes require explicit approval
- New features require corresponding tests and documentation

## Governance

This constitution supersedes all other development practices. Changes require approval and must maintain backward compatibility commitments.

**Version**: 1.0.0 | **Ratified**: 2024-09-16 | **Last Amended**: 2024-09-16