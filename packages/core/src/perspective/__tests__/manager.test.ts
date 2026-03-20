import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PerspectiveManager } from '../manager'
import { PerspectiveState } from '../types'
import { InMemoryLinkStore } from '../../linkstore/store'
import type { LinkExpression } from '../../linkstore/types'
import type { Link } from '../../agent/types'
import type { LinkSyncAdapter, PerspectiveDiff } from '../../language/types'
import type { ShaclEngine } from '../../shacl/engine'
import type { AgentService } from '../../agent/agent'
import type { PerspectiveEvent } from '../types'

function mockShaclEngine(): ShaclEngine {
  return {} as ShaclEngine
}

function mockAgentService(): AgentService {
  return {} as AgentService
}

function mockAdapter(syncResult?: PerspectiveDiff): LinkSyncAdapter & { commits: PerspectiveDiff[] } {
  const commits: PerspectiveDiff[] = []
  return {
    commits,
    writable: () => true,
    public: () => true,
    others: async () => [],
    currentRevision: async () => 'rev1',
    sync: async () => syncResult ?? { additions: [], removals: [] },
    render: async () => ({ links: [] }),
    commit: async (diff: PerspectiveDiff) => {
      commits.push(diff)
      return 'rev2'
    },
    addCallback: () => 0,
    addSyncStateChangeCallback: () => 0
  }
}

function makeLink(source: string, target: string, predicate?: string): Link {
  return { source, target, predicate }
}

function makeLinkExpr(link: Link): LinkExpression {
  return {
    author: 'test',
    timestamp: new Date().toISOString(),
    data: link,
    proof: { key: '', signature: '' }
  }
}

describe('PerspectiveManager', () => {
  let store: InMemoryLinkStore
  let manager: PerspectiveManager

  beforeEach(() => {
    store = new InMemoryLinkStore()
    manager = new PerspectiveManager(store, mockShaclEngine(), mockAgentService())
  })

  // === CRUD ===

  describe('Perspective CRUD', () => {
    it('add creates with UUID and Private state', () => {
      const h = manager.add('test')
      expect(h.uuid).toBeTruthy()
      expect(h.name).toBe('test')
      expect(h.state).toBe(PerspectiveState.Private)
    })

    it('add emits perspectiveAdded', () => {
      const events: PerspectiveEvent[] = []
      manager.addEventListener((e) => events.push(e))
      const h = manager.add('test')
      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({ type: 'perspectiveAdded', handle: h })
    })

    it('update changes name', () => {
      const h = manager.add('old')
      const updated = manager.update(h.uuid, 'new')
      expect(updated.name).toBe('new')
    })

    it('update throws for non-existent', () => {
      expect(() => manager.update('nope', 'x')).toThrow()
    })

    it('remove deletes perspective', () => {
      const h = manager.add('test')
      expect(manager.remove(h.uuid)).toBe(true)
      expect(manager.get(h.uuid)).toBeUndefined()
    })

    it('remove calls linkStore.removePerspective', async () => {
      const spy = vi.spyOn(store, 'removePerspective')
      const h = manager.add('test')
      manager.remove(h.uuid)
      expect(spy).toHaveBeenCalledWith(h.uuid)
    })

    it('get returns handle', () => {
      const h = manager.add('test')
      expect(manager.get(h.uuid)).toBe(h)
    })

    it('getAll returns all', () => {
      manager.add('a')
      manager.add('b')
      expect(manager.getAll()).toHaveLength(2)
    })
  })

  // === Link operations ===

  describe('Link operations', () => {
    it('addLink validates perspective exists', async () => {
      await expect(manager.addLink('nope', makeLink('did:test:a', 'did:test:b'))).rejects.toThrow()
    })

    it('addLink adds to store and emits linkAdded', async () => {
      const h = manager.add('test')
      const events: PerspectiveEvent[] = []
      manager.addEventListener((e) => events.push(e))
      const le = await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      expect(le.data.source).toBe('did:test:a')
      const stored = await store.allLinks(h.uuid)
      expect(stored).toHaveLength(1)
      expect(events.some((e) => e.type === 'linkAdded')).toBe(true)
    })

    it('addLinks batch works', async () => {
      const h = manager.add('test')
      const results = await manager.addLinks(h.uuid, [
        makeLink('did:test:a', 'did:test:b'),
        makeLink('did:test:c', 'did:test:d')
      ])
      expect(results).toHaveLength(2)
      const stored = await store.allLinks(h.uuid)
      expect(stored).toHaveLength(2)
    })

    it('removeLink removes and emits linkRemoved', async () => {
      const h = manager.add('test')
      const le = await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      const events: PerspectiveEvent[] = []
      manager.addEventListener((e) => events.push(e))
      const ok = await manager.removeLink(h.uuid, le)
      expect(ok).toBe(true)
      expect(events.some((e) => e.type === 'linkRemoved')).toBe(true)
    })

    it('updateLink removes old, adds new, emits linkUpdated', async () => {
      const h = manager.add('test')
      const old = await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      const events: PerspectiveEvent[] = []
      manager.addEventListener((e) => events.push(e))
      const newLe = await manager.updateLink(h.uuid, old, makeLink('did:test:c', 'did:test:d'))
      expect(newLe.data.source).toBe('did:test:c')
      expect(events.some((e) => e.type === 'linkUpdated')).toBe(true)
    })

    it('linkMutations applies additions and removals', async () => {
      const h = manager.add('test')
      const existing = await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      const result = await manager.linkMutations(h.uuid, {
        additions: [makeLink('did:test:c', 'did:test:d')],
        removals: [existing]
      })
      expect(result.additions).toHaveLength(1)
      expect(result.removals).toHaveLength(1)
      const stored = await store.allLinks(h.uuid)
      expect(stored).toHaveLength(1)
      expect(stored[0].data.source).toBe('did:test:c')
    })

    it('addLink with sign function produces signed links', async () => {
      const signFn = async (link: Link): Promise<LinkExpression> => ({
        author: 'did:test:123',
        timestamp: '2026-01-01T00:00:00Z',
        data: link,
        proof: { key: 'mykey', signature: 'mysig' }
      })
      const m = new PerspectiveManager(store, mockShaclEngine(), mockAgentService(), signFn)
      const h = m.add('test')
      const le = await m.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      expect(le.author).toBe('did:test:123')
      expect(le.proof.key).toBe('mykey')
    })
  })

  // === Query ===

  describe('Query', () => {
    it('queryLinks delegates to store', async () => {
      const h = manager.add('test')
      await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      await manager.addLink(h.uuid, makeLink('did:test:c', 'did:test:d'))
      const results = await manager.queryLinks(h.uuid, { source: 'did:test:a' })
      expect(results).toHaveLength(1)
      expect(results[0].data.source).toBe('did:test:a')
    })

    it('snapshot returns all links', async () => {
      const h = manager.add('test')
      await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      await manager.addLink(h.uuid, makeLink('did:test:c', 'did:test:d'))
      const snap = await manager.snapshot(h.uuid)
      expect(snap.links).toHaveLength(2)
    })
  })

  // === Sync ===

  describe('Sync integration', () => {
    it('setLinkLanguage stores adapter', () => {
      const h = manager.add('test')
      const adapter = mockAdapter()
      manager.setLinkLanguage(h.uuid, adapter)
      expect(manager.getLinkLanguage(h.uuid)).toBe(adapter)
    })

    it('addLink commits to sync adapter when shared', async () => {
      const h = manager.add('test')
      const adapter = mockAdapter()
      manager.setLinkLanguage(h.uuid, adapter)
      await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      expect(adapter.commits).toHaveLength(1)
      expect(adapter.commits[0].additions).toHaveLength(1)
    })

    it('removeLink commits removal to sync adapter', async () => {
      const h = manager.add('test')
      const adapter = mockAdapter()
      manager.setLinkLanguage(h.uuid, adapter)
      const le = await manager.addLink(h.uuid, makeLink('did:test:a', 'did:test:b'))
      await manager.removeLink(h.uuid, le)
      expect(adapter.commits).toHaveLength(2)
      expect(adapter.commits[1].removals).toHaveLength(1)
    })

    it('syncPerspective applies incoming diffs', async () => {
      const h = manager.add('test')
      const incomingLink = makeLinkExpr(makeLink('did:test:x', 'did:test:y'))
      const adapter = mockAdapter({ additions: [incomingLink], removals: [] })
      manager.setLinkLanguage(h.uuid, adapter)
      const events: PerspectiveEvent[] = []
      manager.addEventListener((e) => events.push(e))
      await manager.syncPerspective(h.uuid)
      const stored = await store.allLinks(h.uuid)
      expect(stored).toHaveLength(1)
      expect(events.some((e) => e.type === 'linkAdded')).toBe(true)
    })
  })

  // === Events ===

  describe('Events', () => {
    it('addEventListener receives events', () => {
      const events: PerspectiveEvent[] = []
      manager.addEventListener((e) => events.push(e))
      manager.add('test')
      expect(events).toHaveLength(1)
    })

    it('unsubscribe stops events', () => {
      const events: PerspectiveEvent[] = []
      const unsub = manager.addEventListener((e) => events.push(e))
      manager.add('a')
      unsub()
      manager.add('b')
      expect(events).toHaveLength(1)
    })
  })
})
