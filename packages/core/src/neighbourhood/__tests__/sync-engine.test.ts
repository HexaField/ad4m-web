import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncEngine, type SyncState } from '../sync-engine'
import type {
  LinkSyncAdapter,
  PerspectiveDiff,
  PerspectiveDiffObserver,
  SyncStateChangeObserver
} from '../../language/types'
import type { LinkExpression } from '../../linkstore/types'

function makeLink(source: string, target: string, predicate = 'ad4m://test'): LinkExpression {
  return {
    author: 'did:test:author',
    timestamp: new Date().toISOString(),
    data: { source, target, predicate },
    proof: { key: '', signature: '' }
  }
}

function createMockAdapter(opts?: { syncDiff?: PerspectiveDiff; revision?: string; commitError?: Error }): {
  adapter: LinkSyncAdapter
  diffCallbacks: PerspectiveDiffObserver[]
  stateCallbacks: SyncStateChangeObserver[]
} {
  const diffCallbacks: PerspectiveDiffObserver[] = []
  const stateCallbacks: SyncStateChangeObserver[] = []

  const adapter: LinkSyncAdapter = {
    writable: () => true,
    public: () => true,
    others: vi.fn(async () => []),
    currentRevision: vi.fn(async () => opts?.revision ?? 'rev-0'),
    sync: vi.fn(async () => opts?.syncDiff ?? { additions: [], removals: [] }),
    render: vi.fn(async () => ({ links: [] })),
    commit: opts?.commitError
      ? vi.fn(async () => {
          throw opts.commitError!
        })
      : vi.fn(async (diff: PerspectiveDiff) => 'rev-1'),
    addCallback: vi.fn((cb: PerspectiveDiffObserver) => {
      diffCallbacks.push(cb)
      return diffCallbacks.length - 1
    }),
    addSyncStateChangeCallback: vi.fn((cb: SyncStateChangeObserver) => {
      stateCallbacks.push(cb)
      return stateCallbacks.length - 1
    })
  }

  return { adapter, diffCallbacks, stateCallbacks }
}

describe('SyncEngine', () => {
  let onDiff: ReturnType<typeof vi.fn>
  let onStateChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onDiff = vi.fn()
    onStateChange = vi.fn()
  })

  it('start() calls sync() and applies initial diff', async () => {
    const link = makeLink('a', 'b')
    const { adapter } = createMockAdapter({ syncDiff: { additions: [link], removals: [] } })

    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    expect(adapter.sync).toHaveBeenCalledOnce()
    expect(onDiff).toHaveBeenCalledWith({ additions: [link], removals: [] })
    expect(engine.isRunning()).toBe(true)
  })

  it('start() does not call onDiff for empty sync result', async () => {
    const { adapter } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    expect(onDiff).not.toHaveBeenCalled()
  })

  it('start() fetches currentRevision after sync', async () => {
    const { adapter } = createMockAdapter({ revision: 'rev-42' })
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    expect(adapter.currentRevision).toHaveBeenCalled()
    expect(engine.getRevision()).toBe('rev-42')
  })

  it('state transitions: idle → syncing → synced on start', async () => {
    const { adapter } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })

    expect(engine.getSyncState()).toBe('idle')
    await engine.start()

    const states = onStateChange.mock.calls.map((c: any) => c[0])
    expect(states).toContain('syncing')
    expect(states).toContain('synced')
    expect(engine.getSyncState()).toBe('synced')
  })

  it('commit() calls adapter.commit() and updates revision', async () => {
    const { adapter } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    const link = makeLink('x', 'y')
    const rev = await engine.commit({ additions: [link], removals: [] })

    expect(adapter.commit).toHaveBeenCalledWith({ additions: [link], removals: [] })
    expect(rev).toBe('rev-1')
    expect(engine.getRevision()).toBe('rev-1')
  })

  it('commit() throws if not started', async () => {
    const { adapter } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })

    await expect(engine.commit({ additions: [], removals: [] })).rejects.toThrow('SyncEngine not started')
  })

  it('commit() sets error state on failure', async () => {
    const { adapter } = createMockAdapter({ commitError: new Error('network fail') })
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    await expect(engine.commit({ additions: [], removals: [] })).rejects.toThrow('network fail')
    expect(engine.getSyncState()).toBe('error')
  })

  it('remote callback applies diff via onDiff', async () => {
    const { adapter, diffCallbacks } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    const remoteLink = makeLink('remote', 'data')
    const diff: PerspectiveDiff = { additions: [remoteLink], removals: [] }
    diffCallbacks[0](diff)

    expect(onDiff).toHaveBeenCalledWith(diff)
  })

  it('stop() sets idle state and prevents further commits', async () => {
    const { adapter } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()

    engine.stop()

    expect(engine.isRunning()).toBe(false)
    expect(engine.getSyncState()).toBe('idle')
    await expect(engine.commit({ additions: [], removals: [] })).rejects.toThrow('SyncEngine not started')
  })

  it('multiple start() calls are idempotent', async () => {
    const { adapter } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })

    await engine.start()
    await engine.start()

    expect(adapter.sync).toHaveBeenCalledOnce()
    expect(adapter.addCallback).toHaveBeenCalledOnce()
  })

  it('error in sync() propagates and engine is left running', async () => {
    const adapter = createMockAdapter().adapter
    ;(adapter.sync as any).mockRejectedValueOnce(new Error('sync failed'))

    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await expect(engine.start()).rejects.toThrow('sync failed')
    // Engine is in indeterminate state but running flag was set
    expect(engine.isRunning()).toBe(true)
  })

  it('remote callbacks are ignored after stop', async () => {
    const { adapter, diffCallbacks } = createMockAdapter()
    const engine = new SyncEngine({ adapter, perspectiveUuid: 'uuid-1', onDiff, onStateChange })
    await engine.start()
    engine.stop()
    onDiff.mockClear()

    diffCallbacks[0]({ additions: [makeLink('a', 'b')], removals: [] })
    expect(onDiff).not.toHaveBeenCalled()
  })
})

describe('SyncEngine integration: two engines sharing a store', () => {
  it('agent A commits, agent B receives via callback', async () => {
    // Shared link store
    const links: LinkExpression[] = []
    const observers: PerspectiveDiffObserver[] = []

    function makeSharedAdapter(): LinkSyncAdapter {
      return {
        writable: () => true,
        public: () => true,
        others: async () => [],
        currentRevision: async () => `rev-${links.length}`,
        sync: async () => ({ additions: [...links], removals: [] }),
        render: async () => ({ links: [...links] }),
        commit: async (diff: PerspectiveDiff) => {
          links.push(...diff.additions)
          for (const rem of diff.removals) {
            const idx = links.findIndex((l) => l.data.source === rem.data.source && l.data.target === rem.data.target)
            if (idx >= 0) links.splice(idx, 1)
          }
          // Notify all observers
          for (const obs of observers) obs(diff)
          return `rev-${links.length}`
        },
        addCallback: (cb: PerspectiveDiffObserver) => {
          observers.push(cb)
          return observers.length - 1
        },
        addSyncStateChangeCallback: () => 0
      }
    }

    const linksA: LinkExpression[] = []
    const linksB: LinkExpression[] = []

    const engineA = new SyncEngine({
      adapter: makeSharedAdapter(),
      perspectiveUuid: 'persp-A',
      onDiff: (diff) => {
        linksA.push(...diff.additions)
        // handle removals if needed
      },
      onStateChange: () => {}
    })

    const engineB = new SyncEngine({
      adapter: makeSharedAdapter(),
      perspectiveUuid: 'persp-B',
      onDiff: (diff) => {
        linksB.push(...diff.additions)
      },
      onStateChange: () => {}
    })

    await engineA.start()
    await engineB.start()

    // Agent A commits a link
    const linkFromA = makeLink('ad4m://agentA', 'literal://hello')
    await engineA.commit({ additions: [linkFromA], removals: [] })

    // Both engines should have received the diff via observer
    // engineA's onDiff is called by the observer too
    expect(linksA.some((l) => l.data.source === 'ad4m://agentA')).toBe(true)
    expect(linksB.some((l) => l.data.source === 'ad4m://agentA')).toBe(true)

    // Agent B commits
    const linkFromB = makeLink('ad4m://agentB', 'literal://world')
    await engineB.commit({ additions: [linkFromB], removals: [] })

    expect(linksA.some((l) => l.data.source === 'ad4m://agentB')).toBe(true)
    expect(linksB.some((l) => l.data.source === 'ad4m://agentB')).toBe(true)

    // Shared store has both
    expect(links.length).toBe(2)
  })
})
