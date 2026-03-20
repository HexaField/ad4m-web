import { describe, it, expect, beforeEach } from 'vitest'
import { OxigraphLinkStore } from '../oxigraph-store'
import type { LinkExpression } from '@ad4m-web/core'

function makeLink(
  overrides: Partial<{ source: string; target: string; predicate?: string; author: string; timestamp: string }> = {}
): LinkExpression {
  return {
    author: overrides.author ?? 'did:test:alice',
    timestamp: overrides.timestamp ?? '2024-01-01T00:00:00.000Z',
    data: {
      source: overrides.source ?? 'ad4m://src',
      target: overrides.target ?? 'ad4m://tgt',
      predicate: overrides.predicate
    },
    proof: { key: 'k1', signature: 'sig1' }
  }
}

describe('OxigraphLinkStore', () => {
  let store: OxigraphLinkStore

  beforeEach(() => {
    store = new OxigraphLinkStore()
  })

  it('adds and queries links', async () => {
    const link = makeLink()
    await store.addLink('p1', link)
    const all = await store.allLinks('p1')
    expect(all).toHaveLength(1)
    expect(all[0].data.source).toBe('ad4m://src')
  })

  it('deduplicates on add', async () => {
    const link = makeLink()
    await store.addLink('p1', link)
    await store.addLink('p1', link)
    const all = await store.allLinks('p1')
    expect(all).toHaveLength(1)
  })

  it('removes links', async () => {
    const link = makeLink()
    await store.addLink('p1', link)
    const removed = await store.removeLink('p1', link)
    expect(removed).toBe(true)
    expect(await store.allLinks('p1')).toHaveLength(0)
  })

  it('queryLinks filters by source', async () => {
    await store.addLink('p1', makeLink({ source: 'ad4m://a' }))
    await store.addLink('p1', makeLink({ source: 'ad4m://b', timestamp: '2024-01-02T00:00:00.000Z' }))
    const result = await store.queryLinks('p1', { source: 'ad4m://a' })
    expect(result).toHaveLength(1)
    expect(result[0].data.source).toBe('ad4m://a')
  })

  it('queryLinks filters by predicate', async () => {
    await store.addLink('p1', makeLink({ predicate: 'ad4m://rel' }))
    await store.addLink('p1', makeLink({ predicate: 'ad4m://other', timestamp: '2024-01-02T00:00:00.000Z' }))
    const result = await store.queryLinks('p1', { predicate: 'ad4m://rel' })
    expect(result).toHaveLength(1)
  })

  it('handles default predicate when predicate is empty', async () => {
    const link = makeLink() // no predicate
    await store.addLink('p1', link)
    const all = await store.allLinks('p1')
    expect(all[0].data.predicate).toBeUndefined()
  })

  it('named graph isolation between perspectives', async () => {
    await store.addLink('p1', makeLink({ source: 'ad4m://a' }))
    await store.addLink('p2', makeLink({ source: 'ad4m://b' }))
    expect(await store.allLinks('p1')).toHaveLength(1)
    expect(await store.allLinks('p2')).toHaveLength(1)
    expect((await store.allLinks('p1'))[0].data.source).toBe('ad4m://a')
    expect((await store.allLinks('p2'))[0].data.source).toBe('ad4m://b')
  })

  it('removePerspective clears all links', async () => {
    await store.addLink('p1', makeLink())
    await store.removePerspective('p1')
    expect(await store.allLinks('p1')).toHaveLength(0)
  })

  it('SPARQL queries work against named graph', async () => {
    await store.addLink('p1', makeLink({ source: 'ad4m://src', target: 'ad4m://tgt', predicate: 'ad4m://rel' }))
    const results = await store.querySparql(
      'p1',
      'SELECT ?s ?o WHERE { GRAPH <urn:ad4m:perspective:p1> { ?s <ad4m://rel> ?o } }'
    )
    expect(results).toHaveLength(1)
    expect(results[0].s).toBe('ad4m://src')
    expect(results[0].o).toBe('ad4m://tgt')
  })

  it('dump and load roundtrip', async () => {
    await store.addLink('p1', makeLink({ predicate: 'ad4m://rel' }))
    await store.addLink('p2', makeLink({ source: 'ad4m://other', timestamp: '2024-02-01T00:00:00.000Z' }))

    const dumped = await store.dump()

    const store2 = new OxigraphLinkStore()
    await store2.load(dumped)

    expect(await store2.allLinks('p1')).toHaveLength(1)
    expect(await store2.allLinks('p2')).toHaveLength(1)
    expect((await store2.allLinks('p1'))[0].data.predicate).toBe('ad4m://rel')

    // SPARQL still works after load
    const results = await store2.querySparql(
      'p1',
      'SELECT ?o WHERE { GRAPH <urn:ad4m:perspective:p1> { <ad4m://src> <ad4m://rel> ?o } }'
    )
    expect(results).toHaveLength(1)
  })

  it('addLinks batch', async () => {
    await store.addLinks('p1', [
      makeLink({ source: 'ad4m://a' }),
      makeLink({ source: 'ad4m://b', timestamp: '2024-01-02T00:00:00.000Z' })
    ])
    expect(await store.allLinks('p1')).toHaveLength(2)
  })

  it('queryLinks with limit', async () => {
    await store.addLinks('p1', [
      makeLink({ source: 'ad4m://a' }),
      makeLink({ source: 'ad4m://b', timestamp: '2024-01-02T00:00:00.000Z' }),
      makeLink({ source: 'ad4m://c', timestamp: '2024-01-03T00:00:00.000Z' })
    ])
    const result = await store.queryLinks('p1', { limit: 2 })
    expect(result).toHaveLength(2)
  })

  it('queryLinks with date range', async () => {
    await store.addLinks('p1', [
      makeLink({ timestamp: '2024-01-01T00:00:00.000Z' }),
      makeLink({ source: 'ad4m://b', timestamp: '2024-06-01T00:00:00.000Z' }),
      makeLink({ source: 'ad4m://c', timestamp: '2024-12-01T00:00:00.000Z' })
    ])
    const result = await store.queryLinks('p1', {
      fromDate: '2024-03-01T00:00:00.000Z',
      untilDate: '2024-09-01T00:00:00.000Z'
    })
    expect(result).toHaveLength(1)
    expect(result[0].data.source).toBe('ad4m://b')
  })
})
