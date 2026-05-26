# Plugin Development Guide

This guide explains how to create custom plugins for the Resortable library.

## Overview

The Resortable plugin system allows you to extend the library's functionality by creating reusable components that can be installed and uninstalled from Sortable instances. Plugins follow a simple interface and lifecycle pattern.

## Plugin Interface

All plugins must implement the `SortablePlugin` interface:

```typescript
interface SortablePlugin {
  readonly name: string      // Unique plugin identifier
  readonly version: string   // Plugin version
  install(sortable: any): void    // Called when plugin is installed
  uninstall(sortable: any): void  // Called when plugin is uninstalled
}
```

## Creating a Basic Plugin

Here's a simple example of a plugin that adds logging functionality:

```typescript
import { SortablePlugin } from 'resortable'

export class LoggerPlugin implements SortablePlugin {
  public readonly name = 'Logger'
  public readonly version = '1.0.0'

  private loggers = new WeakMap<any, (message: string) => void>()

  public static create(prefix: string = '[Sortable]'): LoggerPlugin {
    return new LoggerPlugin(prefix)
  }

  constructor(private prefix: string) {}

  public install(sortable: any): void {
    const logger = (message: string) => {
      console.log(`${this.prefix} ${message}`)
    }

    this.loggers.set(sortable, logger)

    // Listen to sortable events
    sortable.eventSystem.on('start', () => logger('Drag started'))
    sortable.eventSystem.on('end', () => logger('Drag ended'))
  }

  public uninstall(sortable: any): void {
    // Clean up resources
    this.loggers.delete(sortable)

    // Event listeners are automatically cleaned up when sortable is destroyed,
    // but you can manually remove them if needed
  }
}
```

## Plugin Registration and Usage

### Registering a Plugin

```typescript
import { PluginSystem, LoggerPlugin } from 'resortable'

// Register the plugin globally
PluginSystem.register(LoggerPlugin.create('[MyApp]'))
```

### Using a Plugin

```typescript
import { Sortable, PluginSystem } from 'resortable'

// Create a sortable instance
const sortable = new Sortable(element)

// Install the plugin
PluginSystem.install(sortable, 'Logger')
// or using the sortable instance method
sortable.usePlugin('Logger')
```

### Uninstalling a Plugin

```typescript
// Uninstall specific plugin
PluginSystem.uninstall(sortable, 'Logger')
// or
sortable.removePlugin('Logger')

// Uninstall all plugins
PluginSystem.uninstallAll(sortable)
```

## Advanced Plugin Development

### Configuration Options

Create configurable plugins by accepting options in the constructor:

```typescript
interface MyPluginOptions {
  enabled?: boolean
  delay?: number
  className?: string
}

export class MyPlugin implements SortablePlugin {
  public readonly name = 'MyPlugin'
  public readonly version = '1.0.0'

  private options: Required<MyPluginOptions>

  public static create(options: MyPluginOptions = {}): MyPlugin {
    return new MyPlugin(options)
  }

  constructor(options: MyPluginOptions = {}) {
    this.options = {
      enabled: true,
      delay: 100,
      className: 'my-plugin-active',
      ...options
    }
  }

  public install(sortable: any): void {
    if (!this.options.enabled) return

    // Use configuration options
    // ...
  }

  public uninstall(sortable: any): void {
    // Cleanup
  }
}
```

### State Management

Use WeakMap to store plugin state per sortable instance:

```typescript
export class StatefulPlugin implements SortablePlugin {
  public readonly name = 'StatefulPlugin'
  public readonly version = '1.0.0'

  private states = new WeakMap<any, PluginState>()

  public install(sortable: any): void {
    const state = {
      isActive: false,
      dragCount: 0,
      timers: new Set<number>()
    }

    this.states.set(sortable, state)

    sortable.eventSystem.on('start', () => {
      state.isActive = true
      state.dragCount++
    })

    sortable.eventSystem.on('end', () => {
      state.isActive = false
    })
  }

  public uninstall(sortable: any): void {
    const state = this.states.get(sortable)
    if (state) {
      // Clean up timers
      state.timers.forEach(timer => clearTimeout(timer))
      this.states.delete(sortable)
    }
  }
}
```

### DOM Manipulation

Plugins can safely manipulate the DOM and add event listeners:

```typescript
export class DOMPlugin implements SortablePlugin {
  public readonly name = 'DOMPlugin'
  public readonly version = '1.0.0'

  private handlers = new WeakMap<any, Map<string, EventListener>>()

  public install(sortable: any): void {
    const handlerMap = new Map<string, EventListener>()
    this.handlers.set(sortable, handlerMap)

    // Add custom event listeners
    const clickHandler = (event: Event) => {
      // Handle click events
    }

    const keyHandler = (event: KeyboardEvent) => {
      // Handle keyboard events
    }

    sortable.element.addEventListener('click', clickHandler)
    document.addEventListener('keydown', keyHandler)

    // Store handlers for cleanup
    handlerMap.set('click', clickHandler)
    handlerMap.set('keydown', keyHandler)

    // Add custom DOM elements
    const indicator = document.createElement('div')
    indicator.className = 'plugin-indicator'
    sortable.element.appendChild(indicator)
  }

  public uninstall(sortable: any): void {
    const handlerMap = this.handlers.get(sortable)
    if (handlerMap) {
      // Remove event listeners
      handlerMap.forEach((handler, type) => {
        if (type === 'keydown') {
          document.removeEventListener(type, handler)
        } else {
          sortable.element.removeEventListener(type, handler)
        }
      })

      // Remove custom DOM elements
      const indicator = sortable.element.querySelector('.plugin-indicator')
      if (indicator) {
        indicator.remove()
      }

      this.handlers.delete(sortable)
    }
  }
}
```

### Animation Integration

Plugins can integrate with the animation system:

```typescript
export class AnimationPlugin implements SortablePlugin {
  public readonly name = 'AnimationPlugin'
  public readonly version = '1.0.0'

  public install(sortable: any): void {
    const animationManager = sortable.animationManager

    sortable.eventSystem.on('start', (event: any) => {
      // Animate drag start
      const element = event.item
      element.style.transition = 'transform 0.2s ease'
      element.style.transform = 'scale(1.05)'
    })

    sortable.eventSystem.on('end', (event: any) => {
      // Animate drag end
      const element = event.item
      element.style.transform = 'scale(1)'

      setTimeout(() => {
        element.style.transition = ''
        element.style.transform = ''
      }, 200)
    })
  }

  public uninstall(sortable: any): void {
    // Event listeners are automatically cleaned up
  }
}
```

## Testing Plugins

### Unit Testing

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MyPlugin } from './MyPlugin'

describe('MyPlugin', () => {
  let plugin: MyPlugin
  let mockSortable: any

  beforeEach(() => {
    plugin = MyPlugin.create()
    mockSortable = {
      eventSystem: {
        on: vi.fn(),
        off: vi.fn()
      },
      element: document.createElement('div')
    }
  })

  it('should install correctly', () => {
    plugin.install(mockSortable)
    expect(mockSortable.eventSystem.on).toHaveBeenCalled()
  })

  it('should uninstall correctly', () => {
    plugin.install(mockSortable)
    plugin.uninstall(mockSortable)
    // Assert cleanup occurred
  })
})
```

### Integration Testing

```typescript
import { test, expect } from '@playwright/test'

test('MyPlugin integration', async ({ page }) => {
  await page.goto('/test-page.html')

  await page.evaluate(() => {
    const { Sortable, PluginSystem, MyPlugin } = (window as any)

    PluginSystem.register(MyPlugin.create())

    const sortable = new Sortable(document.getElementById('sortable'))
    PluginSystem.install(sortable, 'MyPlugin')
  })

  // Test plugin functionality
  // ...
})
```

## Best Practices

### 1. Resource Cleanup

Always clean up resources in the `uninstall` method:

```typescript
public uninstall(sortable: any): void {
  // Remove event listeners
  // Clear timers and intervals
  // Remove DOM elements
  // Delete from WeakMaps
  // Cancel ongoing operations
}
```

### 2. Error Handling

Handle errors gracefully:

```typescript
public install(sortable: any): void {
  try {
    // Plugin logic
  } catch (error) {
    console.error(`${this.name} plugin installation failed:`, error)
    // Cleanup any partial state
  }
}
```

### 3. Feature Detection

Check for required features before using them:

```typescript
public install(sortable: any): void {
  if (!sortable.eventSystem) {
    console.warn(`${this.name} requires event system`)
    return
  }

  if (!sortable.options.multiDrag) {
    console.warn(`${this.name} requires multiDrag to be enabled`)
    return
  }

  // Continue with installation
}
```

### 4. Performance Considerations

- Use WeakMap for instance-specific data
- Avoid memory leaks by cleaning up properly
- Use requestAnimationFrame for animations
- Debounce expensive operations

### 5. TypeScript Support

Provide proper TypeScript definitions:

```typescript
// Export types for consumers
export interface MyPluginOptions {
  enabled?: boolean
  delay?: number
}

export interface MyPluginState {
  isActive: boolean
  count: number
}

// Extend global interfaces if needed
declare global {
  interface Window {
    MyPlugin: typeof MyPlugin
  }
}
```

## Built-in Plugins

Study the built-in plugins for examples:

- **AutoScrollPlugin**: Automatic scrolling during drag operations
- **MultiDragPlugin**: Multi-item selection and dragging
- **SwapPlugin**: Swap-based sorting instead of insertion

These plugins demonstrate different patterns and can serve as templates for your own plugins.

## Plugin Distribution

### NPM Package

Create a separate NPM package for your plugin:

```json
{
  "name": "resortable-my-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "peerDependencies": {
    "resortable": "^2.0.0"
  }
}
```

### Usage

```typescript
import { PluginSystem } from 'resortable'
import { MyPlugin } from 'resortable-my-plugin'

PluginSystem.register(MyPlugin.create())
```

## Conclusion

The Resortable plugin system provides a powerful way to extend functionality while maintaining clean separation of concerns. Follow the patterns shown in this guide to create robust, reusable plugins that integrate seamlessly with the library.

For more examples and advanced use cases, refer to the built-in plugins in the `src/plugins/` directory.