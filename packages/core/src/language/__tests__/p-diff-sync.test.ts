import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDiffSyncLinkAdapter, PDiffSyncTelepresenceAdapter, createPDiffSyncLanguage } from '../p-diff-sync'
import type { HolochainLanguageDelegate, Dna, LanguageContext } from '../types'
import type { HolochainSignal, ZomeCallSigner } from '../../holochain/types'

function makeDelegate(handlers: Record<string, unknown> = {}): HolochainLanguageDelegate {
  const registerDNAs = vi.fn()
  const call = vi.fn(async (_nick: string, _zome: string, fn: string, _params: unknown) => {
    if (fn in handlers) {
      const handler = handlers[fn]
      return typeof handler === 'function' ? handler(_params) : handler
    }
    return null
  })
  return { registerDNAs, call }
}

function makeContext(delegate: HolochainLanguageDelegate): LanguageContext {
  return {
    agent: {
      did: 'did:key:zTestAgent',
      createSignedExpression: vi.fn()
    },
    signatures: { verify: vi.fn() },
    storageDirectory: '/tmp/test',
    customSettings: {},
    Holochain: delegate,
    ad4mSignal: vi.fn()
  }
}

describe('PDiffSyncLinkAdapter', () => {
  let adapter: PDiffSyncLinkAdapter
  let delegate: HolochainLanguageDelegate

  beforeEach(() => {
    delegate = makeDelegate({
      get_others: ['did:key:zPeer1', 'did:key:zPeer2'],
      current_revision: 'rev-abc',
      sync: new Uint8Array([1, 2, 3]),
      render: {
        links: [
          {
            data: { source: 'a', target: 'b', predicate: 'c' },
            author: 'x',
            timestamp: 'now',
            proof: { key: '', signature: '' }
          }
        ]
      },
      create_did_pub_key_link: null,
      commit: new Uint8Array([4, 5, 6])
    })
    adapter = new PDiffSyncLinkAdapter(delegate, 'did:key:zTestAgent')
  })

  it('writable returns true', () => {
    expect(adapter.writable()).toBe(true)
  })

  it('public returns false', () => {
    expect(adapter.public()).toBe(false)
  })

  it('others calls get_others zome function', async () => {
    const result = await adapter.others()
    expect(result).toEqual(['did:key:zPeer1', 'did:key:zPeer2'])
    expect(delegate.call).toHaveBeenCalledWith('perspective-diff-sync', 'perspective_diff_sync', 'get_others', null)
  })

  it('currentRevision calls zome', async () => {
    const rev = await adapter.currentRevision()
    expect(rev).toBe('rev-abc')
  })

  it('sync creates DID link on first call', async () => {
    await adapter.sync()
    expect(delegate.call).toHaveBeenCalledWith(
      'perspective-diff-sync',
      'perspective_diff_sync',
      'create_did_pub_key_link',
      'did:key:zTestAgent'
    )
  })

  it('render returns perspective links', async () => {
    const result = await adapter.render()
    expect(result.links).toHaveLength(1)
    expect(result.links[0].data.source).toBe('a')
  })

  it('commit calls zome with normalised diff', async () => {
    const rev = await adapter.commit({
      additions: [
        {
          data: { source: 'x', target: 'y', predicate: '' },
          author: 'a',
          timestamp: 'now',
          proof: { key: '', signature: '' }
        }
      ],
      removals: []
    })
    expect(typeof rev).toBe('string')
    expect(delegate.call).toHaveBeenCalledWith(
      'perspective-diff-sync',
      'perspective_diff_sync',
      'commit',
      expect.objectContaining({ my_did: 'did:key:zTestAgent' })
    )
  })

  it('addCallback stores callback', () => {
    const cb = vi.fn()
    const id = adapter.addCallback(cb)
    expect(id).toBe(1)
  })

  it('handleSignal records peer info for HashBroadcast', async () => {
    await adapter.handleSignal({
      cellId: { dnaHash: new Uint8Array(32), agentPubKey: new Uint8Array(32) },
      payload: {
        reference_hash: new Uint8Array([10, 20]),
        reference: { some: 'data' },
        broadcast_author: 'did:key:zPeer1'
      }
    })
    // No error thrown = success, peer recorded internally
  })

  it('handleSignal dispatches link diffs to callback', async () => {
    const cb = vi.fn()
    adapter.addCallback(cb)
    await adapter.handleSignal({
      cellId: { dnaHash: new Uint8Array(32), agentPubKey: new Uint8Array(32) },
      payload: { additions: [], removals: [] }
    })
    expect(cb).toHaveBeenCalled()
  })
})

describe('PDiffSyncTelepresenceAdapter', () => {
  it('setOnlineStatus calls zome', async () => {
    const delegate = makeDelegate()
    const adapter = new PDiffSyncTelepresenceAdapter(delegate)
    await adapter.setOnlineStatus({ online: true })
    expect(delegate.call).toHaveBeenCalledWith('perspective-diff-sync', 'perspective_diff_sync', 'set_online_status', {
      online: true
    })
  })

  it('sendSignal calls zome with correct params', async () => {
    const delegate = makeDelegate({ send_signal: {} })
    const adapter = new PDiffSyncTelepresenceAdapter(delegate)
    await adapter.sendSignal('did:key:zRemote', { msg: 'hello' })
    expect(delegate.call).toHaveBeenCalledWith('perspective-diff-sync', 'perspective_diff_sync', 'send_signal', {
      remote_agent_did: 'did:key:zRemote',
      payload: { msg: 'hello' }
    })
  })

  it('registerSignalCallback stores callback and dispatches', async () => {
    const delegate = makeDelegate()
    const adapter = new PDiffSyncTelepresenceAdapter(delegate)
    const cb = vi.fn()
    await adapter.registerSignalCallback(cb)
    await adapter.handleTelepresenceSignal({ some: 'broadcast' })
    expect(cb).toHaveBeenCalledWith({ some: 'broadcast' })
  })

  it('routes signals with recipient_did', async () => {
    const delegate = makeDelegate()
    const adapter = new PDiffSyncTelepresenceAdapter(delegate)
    const cb = vi.fn()
    await adapter.registerSignalCallback(cb)
    await adapter.handleTelepresenceSignal({
      recipient_did: 'did:key:zMe',
      author: 'did:key:zSender',
      data: { text: 'hi' },
      timestamp: '2024-01-01',
      proof: {}
    })
    expect(cb).toHaveBeenCalledWith(
      { author: 'did:key:zSender', data: { text: 'hi' }, timestamp: '2024-01-01', proof: {} },
      'did:key:zMe'
    )
  })
})

describe('createPDiffSyncLanguage', () => {
  it('creates a language with linksAdapter and telepresenceAdapter', async () => {
    const delegate = makeDelegate({
      create_did_pub_key_link: null,
      sync: null,
      current_revision: 'rev-0'
    })
    const context = makeContext(delegate)

    const lang = await createPDiffSyncLanguage('test-pdiff', context, new Uint8Array([1, 2, 3]))
    expect(lang.name).toBe('test-pdiff')
    expect(lang.linksAdapter).toBeDefined()
    expect(lang.telepresenceAdapter).toBeDefined()
    expect(lang.interactions('')).toEqual([])
    expect(delegate.registerDNAs).toHaveBeenCalledOnce()
  })

  it('throws without Holochain delegate', async () => {
    const context = makeContext(makeDelegate())
    context.Holochain = undefined
    await expect(createPDiffSyncLanguage('test', context, new Uint8Array())).rejects.toThrow(
      'HolochainLanguageDelegate required'
    )
  })
})
