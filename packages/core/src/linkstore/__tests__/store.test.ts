import { describe, it, expect } from 'vitest'
import { InMemoryLinkStore } from '../store'
import type { LinkExpression } from '../types'

function createTestLink(overrides?: {
  author?: string
  timestamp?: string
  data?: Partial<LinkExpression['data']>
}): LinkExpression {
  const data = {
    source: overrides?.data?.source ?? 'did:key:z6MkSource',
    target: overrides?.data?.target ?? 'literal://string:hello',
    predicate: overrides?.data?.predicate ?? 'ad4m://has_child'
  }
  return {
    author: overrides?.author ?? 'did:key:z6MkTEST',
    timestamp: overrides?.timestamp ?? '2026-01-15T10:00:00.000Z',
    data,
    proof: { key: 'test-key', signature: 'test-sig' }
  }
}

const UUID = 'test-perspective-uuid'

describe('InMemoryLinkStore', () => {
  it('addLink + queryLinks round-trip', async () => {
    const store = new InMemoryLinkStore()
    const link = createTestLink()
    await store.addLink(UUID, link)
    const results = await store.queryLinks(UUID, {})
    expect(results).toHaveLength(1)
    expect(results[0].data.source).toBe(link.data.source)
  })

  it('deduplicates identical links', async () => {
    const store = new InMemoryLinkStore()
    const link = createTestLink()
    await store.addLink(UUID, link)
    await store.addLink(UUID, link)
    expect(await store.allLinks(UUID)).toHaveLength(1)
  })

  it('queryLinks filters by source', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink({ data: { source: 'did:key:A', target: 'did:key:B' } }))
    await store.addLink(UUID, createTestLink({ data: { source: 'did:key:C', target: 'did:key:B' } }))
    const results = await store.queryLinks(UUID, { source: 'did:key:A' })
    expect(results).toHaveLength(1)
  })

  it('queryLinks filters by target', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink({ data: { source: 'did:key:A', target: 'did:key:B' } }))
    await store.addLink(UUID, createTestLink({ data: { source: 'did:key:A', target: 'did:key:C' } }))
    const results = await store.queryLinks(UUID, { target: 'did:key:C' })
    expect(results).toHaveLength(1)
  })

  it('queryLinks filters by predicate', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(
      UUID,
      createTestLink({ data: { source: 'did:key:A', target: 'did:key:B', predicate: 'ad4m://type' } })
    )
    await store.addLink(
      UUID,
      createTestLink({ data: { source: 'did:key:A', target: 'did:key:B', predicate: 'ad4m://name' } })
    )
    const results = await store.queryLinks(UUID, { predicate: 'ad4m://type' })
    expect(results).toHaveLength(1)
  })

  it('queryLinks filters by fromDate', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink({ timestamp: '2026-01-01T00:00:00.000Z' }))
    await store.addLink(
      UUID,
      createTestLink({
        timestamp: '2026-06-01T00:00:00.000Z',
        data: { source: 'did:key:z6MkOther', target: 'literal://string:hello' }
      })
    )
    const results = await store.queryLinks(UUID, { fromDate: '2026-03-01T00:00:00.000Z' })
    expect(results).toHaveLength(1)
    expect(results[0].timestamp).toBe('2026-06-01T00:00:00.000Z')
  })

  it('queryLinks filters by untilDate', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink({ timestamp: '2026-01-01T00:00:00.000Z' }))
    await store.addLink(
      UUID,
      createTestLink({
        timestamp: '2026-06-01T00:00:00.000Z',
        data: { source: 'did:key:z6MkOther', target: 'literal://string:hello' }
      })
    )
    const results = await store.queryLinks(UUID, { untilDate: '2026-03-01T00:00:00.000Z' })
    expect(results).toHaveLength(1)
    expect(results[0].timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  it('queryLinks applies limit', async () => {
    const store = new InMemoryLinkStore()
    for (let i = 0; i < 5; i++) {
      await store.addLink(
        UUID,
        createTestLink({
          timestamp: `2026-01-0${i + 1}T00:00:00.000Z`,
          data: { source: `did:key:z6Mk${i}`, target: 'literal://string:hello' }
        })
      )
    }
    const results = await store.queryLinks(UUID, { limit: 3 })
    expect(results).toHaveLength(3)
  })

  it('queryLinks with no filters returns all', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink())
    await store.addLink(UUID, createTestLink({ data: { source: 'did:key:other', target: 'literal://string:world' } }))
    const results = await store.queryLinks(UUID, {})
    expect(results).toHaveLength(2)
  })

  it('removeLink returns true and removes', async () => {
    const store = new InMemoryLinkStore()
    const link = createTestLink()
    await store.addLink(UUID, link)
    expect(await store.removeLink(UUID, link)).toBe(true)
    expect(await store.allLinks(UUID)).toHaveLength(0)
  })

  it('removeLink returns false for non-existent', async () => {
    const store = new InMemoryLinkStore()
    expect(await store.removeLink(UUID, createTestLink())).toBe(false)
  })

  it('allLinks returns everything', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink())
    await store.addLink(UUID, createTestLink({ data: { source: 'did:key:other', target: 'literal://string:world' } }))
    expect(await store.allLinks(UUID)).toHaveLength(2)
  })

  it('removePerspective clears all links', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink(UUID, createTestLink())
    await store.removePerspective(UUID)
    expect(await store.allLinks(UUID)).toHaveLength(0)
  })

  it('dump/load round-trip preserves data', async () => {
    const store = new InMemoryLinkStore()
    const link = createTestLink()
    await store.addLink(UUID, link)
    const dumped = await store.dump()
    const store2 = new InMemoryLinkStore()
    await store2.load(dumped)
    const results = await store2.allLinks(UUID)
    expect(results).toHaveLength(1)
    expect(results[0].data.source).toBe(link.data.source)
  })

  it('multiple perspectives are isolated', async () => {
    const store = new InMemoryLinkStore()
    await store.addLink('uuid-1', createTestLink())
    await store.addLink(
      'uuid-2',
      createTestLink({ data: { source: 'did:key:other', target: 'literal://string:world' } })
    )
    expect(await store.allLinks('uuid-1')).toHaveLength(1)
    expect(await store.allLinks('uuid-2')).toHaveLength(1)
    expect((await store.allLinks('uuid-1'))[0].data.source).toBe('did:key:z6MkSource')
  })
})
