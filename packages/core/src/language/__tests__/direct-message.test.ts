import { describe, it, expect } from 'vitest'
import { InMemoryDirectMessageAdapter } from '../direct-message'
import type { Expression } from '../../agent/types'
import type { Perspective } from '../types'

function makePerspectiveExpression(links: any[] = []): Expression<Perspective> {
  return {
    author: 'did:test:sender',
    timestamp: new Date().toISOString(),
    data: { links },
    proof: { key: 'k', signature: 's' }
  }
}

describe('InMemoryDirectMessageAdapter', () => {
  it('returns configured recipient', () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    expect(adapter.recipient()).toBe('did:test:bob')
  })

  it('starts with empty inbox', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    const msgs = await adapter.inbox()
    expect(msgs).toEqual([])
  })

  it('sendP2P stores message and returns it', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    const msg = makePerspectiveExpression()
    const result = await adapter.sendP2P(msg)
    expect(result).toEqual(msg)
    expect(await adapter.inbox()).toHaveLength(1)
  })

  it('sendInbox stores message', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    await adapter.sendInbox(makePerspectiveExpression())
    expect(await adapter.inbox()).toHaveLength(1)
  })

  it('inbox filter works', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    await adapter.sendP2P(makePerspectiveExpression([{ source: 'a', target: 'hello' }]))
    await adapter.sendP2P(makePerspectiveExpression([{ source: 'b', target: 'world' }]))
    const filtered = await adapter.inbox('hello')
    expect(filtered).toHaveLength(1)
  })

  it('message callbacks fire on sendP2P', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    const received: any[] = []
    adapter.addMessageCallback((m) => received.push(m))
    const msg = makePerspectiveExpression()
    await adapter.sendP2P(msg)
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(msg)
  })

  it('status is initially undefined', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    expect(await adapter.status()).toBeUndefined()
  })

  it('setStatus / status round-trip', async () => {
    const adapter = new InMemoryDirectMessageAdapter('did:test:bob')
    const s = makePerspectiveExpression()
    adapter.setStatus(s)
    expect(await adapter.status()).toEqual(s)
  })
})
