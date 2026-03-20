import { describe, it, expect } from 'vitest'
import { InMemoryKVStore, InMemoryBlobStore } from '../memory-store'

describe('InMemoryKVStore', () => {
  it('get returns null for missing key', async () => {
    const store = new InMemoryKVStore()
    expect(await store.get('nope')).toBeNull()
  })

  it('set and get', async () => {
    const store = new InMemoryKVStore()
    await store.set('a', 'hello')
    expect(await store.get('a')).toBe('hello')
  })

  it('delete removes key', async () => {
    const store = new InMemoryKVStore()
    await store.set('a', 'hello')
    await store.delete('a')
    expect(await store.get('a')).toBeNull()
  })

  it('keys returns all keys', async () => {
    const store = new InMemoryKVStore()
    await store.set('a', '1')
    await store.set('b', '2')
    expect(await store.keys()).toEqual(['a', 'b'])
  })

  it('clear removes all keys', async () => {
    const store = new InMemoryKVStore()
    await store.set('a', '1')
    await store.set('b', '2')
    await store.clear()
    expect(await store.keys()).toEqual([])
  })
})

describe('InMemoryBlobStore', () => {
  it('get returns null for missing key', async () => {
    const store = new InMemoryBlobStore()
    expect(await store.get('nope')).toBeNull()
  })

  it('set and get', async () => {
    const store = new InMemoryBlobStore()
    const data = new Uint8Array([1, 2, 3])
    await store.set('a', data)
    expect(await store.get('a')).toEqual(data)
  })

  it('delete removes key', async () => {
    const store = new InMemoryBlobStore()
    await store.set('a', new Uint8Array([1]))
    await store.delete('a')
    expect(await store.get('a')).toBeNull()
  })

  it('has returns correct boolean', async () => {
    const store = new InMemoryBlobStore()
    expect(await store.has('a')).toBe(false)
    await store.set('a', new Uint8Array([1]))
    expect(await store.has('a')).toBe(true)
  })
})
