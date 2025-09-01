import { describe, it, expect } from 'vitest';

describe('Example test suite', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with DOM elements', () => {
    const div = document.createElement('div');
    div.textContent = 'Hello World';

    expect(div.textContent).toBe('Hello World');
    expect(div.tagName).toBe('DIV');
  });
});
