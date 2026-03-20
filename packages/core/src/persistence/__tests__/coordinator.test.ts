import { describe, it, expect } from 'vitest'
import { createExecutor } from '../../bootstrap/factory'
import { PersistenceCoordinator } from '../coordinator'
import { InMemoryKVStore, InMemoryBlobStore } from '../memory-store'
import type { WalletStore, WalletData } from '../../agent/types'
import type { BootstrapConfig } from '../../bootstrap/types'
import type { PersistenceConfig } from '../types'

class InMemoryWalletStore implements WalletStore {
  private store = new Map<string, { passphrase: string; data: WalletData }>()
  async exists(key: string) {
    return this.store.has(key)
  }
  async load(key: string, passphrase: string) {
    const e = this.store.get(key)
    if (!e || e.passphrase !== passphrase) throw new Error('Invalid')
    return e.data
  }
  async save(key: string, passphrase: string, data: WalletData) {
    this.store.set(key, { passphrase, data })
  }
  async destroy(key: string) {
    this.store.delete(key)
  }
}

const bootstrapConfig: BootstrapConfig = {
  languages: {
    languageLanguageAddress: 'lang-lang-addr',
    agentLanguageAddress: 'agent-lang-addr',
    neighbourhoodLanguageAddress: 'neighbourhood-lang-addr',
    perspectiveLanguageAddress: 'perspective-lang-addr'
  }
}

function createStores(): { walletStore: InMemoryWalletStore; persistenceConfig: PersistenceConfig } {
  const walletStore = new InMemoryWalletStore()
  return {
    walletStore,
    persistenceConfig: {
      agentStore: new InMemoryKVStore(),
      walletStore,
      perspectiveStore: new InMemoryKVStore(),
      linkStoreData: new InMemoryKVStore(),
      languageCache: new InMemoryBlobStore()
    }
  }
}

describe('PersistenceCoordinator', () => {
  it('saveState persists agent data', async () => {
    const stores = createStores()
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    await (executor.agentService as any).generate('pass')
    await executor.initialize()

    const coordinator = new PersistenceCoordinator(executor, stores.persistenceConfig)
    await coordinator.saveState()

    const saved = await stores.persistenceConfig.agentStore.get('agent-status')
    expect(saved).toBeTruthy()
    const parsed = JSON.parse(saved!)
    expect(parsed.did).toMatch(/^did:key:z/)
    expect(parsed.isInitialized).toBe(true)
  })

  it('saveState persists perspective handles', async () => {
    const stores = createStores()
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    await (executor.agentService as any).generate('pass')
    await executor.initialize()
    executor.perspectiveManager.add('test-perspective')

    const coordinator = new PersistenceCoordinator(executor, stores.persistenceConfig)
    await coordinator.saveState()

    const saved = await stores.persistenceConfig.perspectiveStore.get('perspective-handles')
    const handles = JSON.parse(saved!)
    expect(handles).toHaveLength(1)
    expect(handles[0].name).toBe('test-perspective')
  })

  it('saveState persists link store', async () => {
    const stores = createStores()
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    await (executor.agentService as any).generate('pass')
    await executor.initialize()
    const handle = executor.perspectiveManager.add('test')
    await executor.perspectiveManager.addLink(handle.uuid, {
      source: 'src://a',
      target: 'tgt://b',
      predicate: 'pred://c'
    })

    const coordinator = new PersistenceCoordinator(executor, stores.persistenceConfig)
    await coordinator.saveState()

    const saved = await stores.persistenceConfig.linkStoreData.get('link-store-dump')
    expect(saved).toBeTruthy()
    expect(saved).toContain('src://a')
  })

  it('loadState restores perspectives', async () => {
    const stores = createStores()

    // Create and save
    const { executor: ex1 } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    await (ex1.agentService as any).generate('pass')
    await ex1.initialize()
    ex1.perspectiveManager.add('restored-perspective')
    const coord1 = new PersistenceCoordinator(ex1, stores.persistenceConfig)
    await coord1.saveState()

    // Create new executor and load
    const { executor: ex2 } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    const coord2 = new PersistenceCoordinator(ex2, stores.persistenceConfig)
    await coord2.loadState()

    const perspectives = ex2.perspectiveManager.getAll()
    expect(perspectives).toHaveLength(1)
    expect(perspectives[0].name).toBe('restored-perspective')
  })

  it('loadState restores links', async () => {
    const stores = createStores()

    const { executor: ex1 } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    await (ex1.agentService as any).generate('pass')
    await ex1.initialize()
    const handle = ex1.perspectiveManager.add('test')
    await ex1.perspectiveManager.addLink(handle.uuid, {
      source: 'src://x',
      target: 'tgt://y',
      predicate: 'pred://z'
    })
    const coord1 = new PersistenceCoordinator(ex1, stores.persistenceConfig)
    await coord1.saveState()

    const { executor: ex2 } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    const coord2 = new PersistenceCoordinator(ex2, stores.persistenceConfig)
    await coord2.loadState()

    const links = await ex2.linkStore.queryLinks(handle.uuid, { source: 'src://x' })
    expect(links).toHaveLength(1)
    expect(links[0].data.target).toBe('tgt://y')
  })

  it('full round-trip: create → add data → save → new executor → load → verify', async () => {
    const stores = createStores()

    // Build and populate
    const { executor: ex1 } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    await (ex1.agentService as any).generate('pass')
    await ex1.initialize()
    const h1 = ex1.perspectiveManager.add('alpha')
    const h2 = ex1.perspectiveManager.add('beta')
    await ex1.perspectiveManager.addLink(h1.uuid, {
      source: 'src://1',
      target: 'tgt://2',
      predicate: 'pred://3'
    })
    await ex1.perspectiveManager.addLink(h2.uuid, {
      source: 'src://4',
      target: 'tgt://5',
      predicate: 'pred://6'
    })

    const coord1 = new PersistenceCoordinator(ex1, stores.persistenceConfig)
    await coord1.saveState()

    // Restore into fresh executor
    const { executor: ex2 } = await createExecutor({
      bootstrapConfig,
      walletStore: stores.walletStore
    })
    const coord2 = new PersistenceCoordinator(ex2, stores.persistenceConfig)
    await coord2.loadState()

    // Verify perspectives
    const perspectives = ex2.perspectiveManager.getAll()
    expect(perspectives).toHaveLength(2)
    const names = perspectives.map((p) => p.name).sort()
    expect(names).toEqual(['alpha', 'beta'])

    // Verify links
    const links1 = await ex2.linkStore.queryLinks(h1.uuid, {})
    expect(links1).toHaveLength(1)
    expect(links1[0].data.source).toBe('src://1')

    const links2 = await ex2.linkStore.queryLinks(h2.uuid, {})
    expect(links2).toHaveLength(1)
    expect(links2[0].data.source).toBe('src://4')
  })
})
