# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Pre-Commit Checklist

**ALWAYS run these commands BEFORE EVERY commit/push:**
1. `npm run lint` - Check for linting errors
2. `npm run type-check` - Check for TypeScript errors
3. Fix any issues found
4. Only then commit and push

**NO EXCEPTIONS - The user has emphasized this multiple times.**

If you forget to do this, the CI will fail and the user will be frustrated.

## Project Overview

This is **Resortable** - a complete rewrite of the Sortable.js library using modern TypeScript and contemporary
development patterns. This is a fork/rewrite project with the goal of creating a more maintainable, performant, and
developer-friendly drag-and-drop library while maintaining API compatibility with the original Sortable.js.

## Current Status

- **Legacy Code**: The `legacy-sortable/` directory contains the original Sortable.js codebase as reference
- **New Implementation**: The entire build plan is outlined in `sortable-rewrite-implementation-plan.md`. Use this
  document as the primary reference for architecture, design principles, and development steps.

## Development Setup

### Build Commands

Currently no build system is set up. Based on the implementation plan:

- Use Vite for development server and examples
- Use Rollup for production library bundles
- Target outputs: ESM, CommonJS, and UMD formats

### Testing

- Unit tests with Vitest
- Integration tests with Playwright

## Debugging and Development Tips

- If you (Claude) have the Playwright MCP tool installed, you can use Vite's dev server and "see" your changes live in the browser.
- Leverage Playwright's debugging capabilities, to troubleshoot issues interactively.

## References

- Original Sortable.js docs and examples in `legacy-sortable/README.md`
- Detailed implementation plan in `sortable-rewrite-implementation-plan.md`
- Legacy source code in `legacy-sortable/src/` for reference during rewrite
- Always fix eslint & typescript typing issues before pushing to origin.
- Give me at least one URL to test functionality if you've made changes and the dev server is still running.