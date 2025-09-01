# Documentation Guidelines for Resortable

This document provides guidelines for writing excellent JSDoc comments that generate both great VS Code IntelliSense and comprehensive documentation.

## JSDoc Comment Structure

### Basic Structure
```typescript
/**
 * Brief one-line description
 * 
 * @remarks
 * Detailed explanation of the functionality, including important notes,
 * behavioral details, and any caveats developers should know about.
 * 
 * @param paramName - Description of the parameter
 * @returns Description of what is returned
 * 
 * @throws {@link ErrorClass}
 * When this error occurs and why
 * 
 * @example Basic usage
 * ```typescript
 * // Simple example showing basic usage
 * const result = myFunction('example');
 * ```
 * 
 * @example Advanced usage
 * ```typescript
 * // More complex example with full configuration
 * const advanced = myFunction('example', {
 *   option1: true,
 *   option2: 'value'
 * });
 * ```
 * 
 * @see {@link RelatedFunction} for related functionality
 * @since 2.0.0
 * @public
 */
```

## Key Tags to Use

### Visibility Tags
- `@public` - Public API (appears in docs)
- `@internal` - Internal use only (hidden from docs)
- `@beta` - Beta/experimental features
- `@alpha` - Alpha features (very unstable)
- `@deprecated` - Mark deprecated features

### Documentation Tags
- `@param` - Parameter descriptions
- `@returns` - Return value description
- `@throws` - Exceptions that may be thrown
- `@example` - Code examples (use multiple for different scenarios)
- `@remarks` - Detailed explanations
- `@see` - Links to related items
- `@since` - Version when feature was added

### Type-Related Tags
- `@defaultValue` - Default values for parameters
- `@readonly` - Read-only properties
- `@override` - Overridden methods

## Best Practices

### 1. Write for Your Audience
- **VS Code Users**: Focus on parameter types, return values, and brief descriptions
- **Documentation Readers**: Provide comprehensive examples and explanations

### 2. Use Examples Liberally
```typescript
/**
 * Creates a new sortable list
 * 
 * @example Basic sortable list
 * ```typescript
 * const sortable = new Sortable(document.getElementById('list'));
 * ```
 * 
 * @example With configuration options
 * ```typescript
 * const sortable = new Sortable(element, {
 *   animation: 150,
 *   ghostClass: 'ghost-style',
 *   onEnd: (evt) => console.log('Sorting complete')
 * });
 * ```
 * 
 * @example Multi-drag enabled
 * ```typescript
 * const multiDragSortable = new Sortable(element, {
 *   multiDrag: true,
 *   selectedClass: 'selected-item'
 * });
 * ```
 */
```

### 3. Link Related Items
Use `{@link}` tags to create connections:
```typescript
/**
 * @see {@link SortableOptions} for configuration details
 * @see {@link SortableEvent} for event object structure
 * @throws {@link SortableError} when element is invalid
 */
```

### 4. Document State and Side Effects
```typescript
/**
 * Destroys the sortable instance
 * 
 * @remarks
 * After calling this method:
 * - All event listeners will be removed
 * - The instance should not be used again
 * - The DOM element returns to its original state
 * 
 * This method is safe to call multiple times.
 */
```

### 5. Use Proper Categorization
Organize related functionality with `@category` tags:
```typescript
/**
 * @category Core
 */
export class Sortable { }

/**
 * @category Animation
 */
export class AnimationManager { }

/**
 * @category Utils
 */
export function debounce() { }
```

## Documentation Testing

### VS Code Testing
1. Hover over functions to see IntelliSense
2. Check parameter hints while typing
3. Verify examples render correctly

### Generated Docs Testing
```bash
# Build documentation
npm run docs:build

# Serve locally to review
npm run docs:serve
```

## Common Patterns

### Options Objects
```typescript
/**
 * Configuration options for sortable behavior
 * 
 * @example Minimal configuration
 * ```typescript
 * { animation: 150 }
 * ```
 * 
 * @example Complete configuration
 * ```typescript
 * {
 *   animation: 300,
 *   ghostClass: 'ghost',
 *   group: 'shared',
 *   onEnd: (evt) => console.log(evt)
 * }
 * ```
 */
interface SortableOptions {
  /**
   * Animation duration in milliseconds
   * @defaultValue 150
   */
  animation?: number;
}
```

### Event Handlers
```typescript
/**
 * Callback fired when sorting ends
 * 
 * @param event - Event object containing drag details
 * 
 * @example
 * ```typescript
 * onEnd: (evt) => {
 *   console.log(`Item moved from ${evt.oldIndex} to ${evt.newIndex}`);
 *   updateDatabase(evt.item.dataset.id, evt.newIndex);
 * }
 * ```
 */
onEnd?: (event: SortableEvent) => void;
```

### Error Documentation
```typescript
/**
 * @throws {@link SortableError}
 * Thrown when:
 * - Element is null or undefined
 * - Element is not an HTMLElement
 * - Element is already initialized as sortable
 */
```

This documentation system ensures developers get excellent IntelliSense support while also generating comprehensive API documentation for the project website.