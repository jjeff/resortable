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

  it('calls multiple listeners for the same event, in registration order', () => {
    const es = new EventSystem<Events>()
    const order: number[] = []
    es.on('foo', () => order.push(1))
    es.on('foo', () => order.push(2))
    es.on('foo', () => order.push(3))

    es.emit('foo', { value: 1 })

    expect(order).toEqual([1, 2, 3])
  })

  it('does nothing (and does not throw) when emitting a type with no listeners', () => {
    const es = new EventSystem<Events>()
    expect(() => es.emit('foo', { value: 1 })).not.toThrow()
  })

  it('still invokes a listener registered after one that unsubscribes itself mid-emit', () => {
    // emit() iterates a `[...arr]` copy specifically so a listener that
    // unsubscribes itself doesn't mutate the live listeners array while
    // it's being iterated. Without the copy, splicing out index 0 during
    // its own call shifts the next listener into the slot the iterator has
    // already passed, and it silently never runs.
    const es = new EventSystem<Events>()
    const calls: string[] = []
    // Safe despite referencing `offSelf` before its own declaration line
    // finishes: the callback only runs later, inside `es.emit()` below, by
    // which point `offSelf` is already assigned.
    const offSelf = es.on('foo', () => {
      calls.push('self')
      offSelf()
    })
    es.on('foo', () => calls.push('second'))

    es.emit('foo', { value: 1 })
    expect(calls).toEqual(['self', 'second'])

    // And the unsubscribe really took effect for subsequent emits.
    calls.length = 0
    es.emit('foo', { value: 2 })
    expect(calls).toEqual(['second'])
  })

  it('still invokes a later listener when an earlier one is unsubscribed by a different listener mid-emit', () => {
    // A listener removing a DIFFERENT, already-invoked listener also
    // shrinks the live array during iteration. Without the `[...arr]`
    // copy, that shift makes the iterator terminate one step early and
    // silently drop the last listener, even though nothing ever
    // unsubscribed it.
    const es = new EventSystem<Events>()
    const calls: string[] = []
    const offA = es.on('foo', () => calls.push('a'))
    es.on('foo', () => {
      calls.push('b')
      offA()
    })
    es.on('foo', () => calls.push('c'))

    es.emit('foo', { value: 1 })

    expect(calls).toEqual(['a', 'b', 'c'])
  })
})
