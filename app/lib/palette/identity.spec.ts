import { beforeEach, describe, expect, it } from 'vitest'
import { identityFor, rememberLink } from '@/lib/palette/identity'

// The tests run in node, which has no session storage; a map stands in.
function stubStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  })
}

describe('the note beside a link', () => {
  beforeEach(stubStorage)

  it('is returned for the link it was written beside, and for no other', () => {
    rememberLink('abc', { uuid: 'u1', title: 'Harbour', dirty: true })
    expect(identityFor('abc')).toEqual({ uuid: 'u1', title: 'Harbour', dirty: true })
    expect(identityFor('xyz')).toBeNull()
  })

  it('reads an unsaved palette as one', () => {
    rememberLink('abc', { uuid: null, title: '', dirty: false })
    expect(identityFor('abc')).toEqual({ uuid: null, title: '', dirty: false })
  })

  it('is replaced by the next link, not accumulated', () => {
    rememberLink('first', { uuid: 'u1', title: 'One', dirty: false })
    rememberLink('second', { uuid: null, title: 'Two', dirty: false })
    expect(identityFor('first')).toBeNull()
    expect(identityFor('second')?.title).toBe('Two')
  })

  it('treats every link as foreign when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    rememberLink('abc', { uuid: 'u1', title: 'Harbour', dirty: false })
    expect(identityFor('abc')).toBeNull()
  })
})
