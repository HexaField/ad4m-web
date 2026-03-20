import { describe, it, expect } from 'vitest'
import { InMemoryContentStore } from '../content-store'

describe('InMemoryContentStore', () => {
  it('put returns a hash and get retrieves the content', async () => {
    const store = new InMemoryContentStore()
    const hash = await store.put('hello world')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    const result = await store.get(hash)
    expect(result).toBe('hello world')
  })

  it('get returns null for missing address', async () => {
    const store = new InMemoryContentStore()
    expect(await store.get('nonexistent')).toBeNull()
  })

  it('same content produces same hash', async () => {
    const store = new InMemoryContentStore()
    const h1 = await store.put('duplicate')
    const h2 = await store.put('duplicate')
    expect(h1).toBe(h2)
  })

  it('different content produces different hashes', async () => {
    const store = new InMemoryContentStore()
    const h1 = await store.put('content-a')
    const h2 = await store.put('content-b')
    expect(h1).not.toBe(h2)
  })
})
