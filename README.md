# Resortable

Modern TypeScript rewrite of Sortable.js - reorderable drag-and-drop lists

## Overview

Resortable is a complete rewrite of the popular Sortable.js library using modern TypeScript and contemporary development patterns. It provides a more maintainable, performant, and developer-friendly drag-and-drop library while maintaining API compatibility with the original Sortable.js.

## Features

- **Modern TypeScript**: Built with TypeScript and strict typing
- **Performance Focused**: Target bundle size <25KB gzipped with 60fps animations
- **Plugin Architecture**: Extensible design with composition over inheritance
- **API Compatible**: Maintains compatibility with existing Sortable.js APIs
- **Tree Shakeable**: Plugin-based architecture for optimal bundle sizes

## Status

⚠️ **Pre-Alpha**: This project is in early development. Not ready for production use.

## Installation

```bash
npm install resortable
```

## Quick Start

```typescript
import { Sortable } from 'resortable';

const sortable = new Sortable(document.getElementById('my-list'), {
  animation: 150,
  ghostClass: 'sortable-ghost',
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag'
});
```

## Core API

Sortable emits lifecycle events during drag operations:

- `start` – when dragging begins
- `update` – when an item moves
- `end` – when drag completes

These can be subscribed to via options:

```ts
const sortable = new Sortable(list, {
  onStart: (evt) => console.log('start', evt),
  onUpdate: (evt) => console.log('update', evt),
  onEnd: (evt) => console.log('end', evt)
})
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build library
npm run build

# Type checking
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture

The library is built with a modular architecture:

- **Core**: Main Sortable class and drag/drop management
- **Animation**: Modern animation system with CSS transitions
- **Plugins**: Extensible plugin system for additional functionality
- **Utils**: Shared utilities and helpers
- **Types**: TypeScript type definitions

## Migration from Sortable.js

Resortable maintains API compatibility with Sortable.js while adding modern features and improved performance. See the migration guide for details on breaking changes and new features.

## License

MIT License - see LICENSE file for details.