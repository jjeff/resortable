import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Sortable } from '../../src/index'

describe('Sortable.utils', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('on / off', () => {
    it('on() registers a listener and returns an unsubscribe function', () => {
      const el = document.createElement('div')
      const handler = vi.fn()

      const unsubscribe = Sortable.utils.on(el, 'click', handler)
      el.dispatchEvent(new MouseEvent('click'))
      expect(handler).toHaveBeenCalledTimes(1)

      unsubscribe()
      el.dispatchEvent(new MouseEvent('click'))
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('off() removes a previously-registered listener', () => {
      const el = document.createElement('div')
      const handler = vi.fn()

      Sortable.utils.on(el, 'click', handler)
      Sortable.utils.off(el, 'click', handler)
      el.dispatchEvent(new MouseEvent('click'))
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('index', () => {
    it('returns -1 when the element has no parent', () => {
      const el = document.createElement('div')
      expect(Sortable.utils.index(el)).toBe(-1)
    })

    it('returns the position of the element among its siblings', () => {
      const parent = document.createElement('div')
      const a = document.createElement('div')
      const b = document.createElement('div')
      const c = document.createElement('div')
      parent.append(a, b, c)
      expect(Sortable.utils.index(a)).toBe(0)
      expect(Sortable.utils.index(b)).toBe(1)
      expect(Sortable.utils.index(c)).toBe(2)
    })
  })

  describe('insertAt', () => {
    it('inserts an element at the given index', () => {
      const parent = document.createElement('div')
      const a = document.createElement('div')
      const b = document.createElement('div')
      const c = document.createElement('div')
      a.id = 'a'
      b.id = 'b'
      c.id = 'c'
      parent.append(a, b)

      Sortable.utils.insertAt(parent, c, 1)
      expect([...parent.children].map((n) => (n as HTMLElement).id)).toEqual([
        'a',
        'c',
        'b',
      ])
    })

    it('appends when index >= children.length', () => {
      const parent = document.createElement('div')
      const a = document.createElement('div')
      const b = document.createElement('div')
      a.id = 'a'
      b.id = 'b'
      parent.append(a)

      Sortable.utils.insertAt(parent, b, 99)
      expect([...parent.children].map((n) => (n as HTMLElement).id)).toEqual([
        'a',
        'b',
      ])
    })
  })

  describe('closest', () => {
    it('returns the element itself if it matches the selector', () => {
      const el = document.createElement('div')
      el.className = 'target'
      expect(Sortable.utils.closest(el, '.target')).toBe(el)
    })

    it('walks up the tree to find a matching ancestor', () => {
      document.body.innerHTML = `
        <section class="outer">
          <article class="inner">
            <span class="leaf"></span>
          </article>
        </section>
      `
      const leaf = document.querySelector('.leaf') as HTMLElement
      const inner = document.querySelector('.inner') as HTMLElement
      const outer = document.querySelector('.outer') as HTMLElement

      expect(Sortable.utils.closest(leaf, '.inner')).toBe(inner)
      expect(Sortable.utils.closest(leaf, '.outer')).toBe(outer)
    })

    it('returns null when no ancestor matches', () => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      expect(Sortable.utils.closest(el, '.missing')).toBeNull()
    })

    it('honours the ctx bound — does not walk above it', () => {
      document.body.innerHTML = `
        <section class="outer">
          <article class="inner">
            <span class="leaf"></span>
          </article>
        </section>
      `
      const leaf = document.querySelector('.leaf') as HTMLElement
      const inner = document.querySelector('.inner') as HTMLElement
      const outer = document.querySelector('.outer') as HTMLElement

      // `.outer` is above `inner`; bounding search to `inner` must not find it.
      expect(Sortable.utils.closest(leaf, '.outer', inner)).toBeNull()
      // But within `outer` ctx, the leaf still finds `.outer`.
      expect(Sortable.utils.closest(leaf, '.outer', outer)).toBe(outer)
    })

    it('returns null when el is null', () => {
      expect(Sortable.utils.closest(null, '.x')).toBeNull()
    })
  })

  describe('toggleClass', () => {
    it('toggles a class on and off when force is omitted', () => {
      const el = document.createElement('div')
      Sortable.utils.toggleClass(el, 'on')
      expect(el.classList.contains('on')).toBe(true)
      Sortable.utils.toggleClass(el, 'on')
      expect(el.classList.contains('on')).toBe(false)
    })

    it('adds the class when force is true', () => {
      const el = document.createElement('div')
      Sortable.utils.toggleClass(el, 'on', true)
      Sortable.utils.toggleClass(el, 'on', true) // idempotent
      expect(el.classList.contains('on')).toBe(true)
    })

    it('removes the class when force is false', () => {
      const el = document.createElement('div')
      el.classList.add('on')
      Sortable.utils.toggleClass(el, 'on', false)
      Sortable.utils.toggleClass(el, 'on', false) // idempotent
      expect(el.classList.contains('on')).toBe(false)
    })
  })

  describe('clone', () => {
    it('deep-clones an element including descendants', () => {
      const el = document.createElement('div')
      el.id = 'orig'
      const child = document.createElement('span')
      child.textContent = 'hello'
      el.appendChild(child)

      const dup = Sortable.utils.clone(el)
      expect(dup).not.toBe(el)
      expect(dup.id).toBe('orig')
      expect(dup.children.length).toBe(1)
      expect(dup.children[0].textContent).toBe('hello')
    })

    it('clones are independent — mutating the clone does not affect the original', () => {
      const el = document.createElement('div')
      el.textContent = 'a'
      const dup = Sortable.utils.clone(el)
      dup.textContent = 'b'
      expect(el.textContent).toBe('a')
      expect(dup.textContent).toBe('b')
    })
  })
})
