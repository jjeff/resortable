// @vitest-environment node
import { describe, it, expect } from 'vitest'

/**
 * SSR safety: importing `resortable/react` (and core through it) in a
 * DOM-less node environment must not throw — no module-scope window /
 * document access. Instantiation only happens in effects/ref callbacks,
 * which never run on the server.
 */
describe('resortable/react SSR', () => {
  it('imports without a DOM', async () => {
    const mod = await import('../../../src/react/index')
    expect(typeof mod.useSortable).toBe('function')
  })
})
