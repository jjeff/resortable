import { describe, it, expect, vi } from 'vitest'
import { EventSystem } from '../../src/core/EventSystem'

type Events = { foo: { value: number } }

describe('EventSystem', () => {
  it('emits events to listeners', () => {
    const es = new EventSystem<Events>()
    let result = 0
    es.on('foo', (e) => {
      result = e.value
    })
    es.emit('foo', { value: 42 })
    expect(result).toBe(42)
  })

  it('removes listeners', () => {
    const es = new EventSystem<Events>()
    const cb = vi.fn()
    const off = es.on('foo', cb)
    off()
    es.emit('foo', { value: 1 })
    expect(cb).not.toHaveBeenCalled()
  })
})
