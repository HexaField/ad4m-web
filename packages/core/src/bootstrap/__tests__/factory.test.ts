import { describe, it, expect } from 'vitest'
import { createExecutor } from '../factory'
import type { WalletStore, WalletData } from '../../agent/types'
import type { BootstrapConfig } from '../types'

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

describe('createExecutor', () => {
  it('wires services correctly', async () => {
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: new InMemoryWalletStore()
    })
    expect(executor.agentService).toBeDefined()
    expect(executor.perspectiveManager).toBeDefined()
    expect(executor.languageManager).toBeDefined()
    expect(executor.shaclEngine).toBeDefined()
    expect(executor.linkStore).toBeDefined()
    expect(executor.isReady).toBe(false)
  })

  it('AgentService can generate and sign', async () => {
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: new InMemoryWalletStore()
    })
    const agent = executor.getAgentService() as any
    await agent.generate('pass')
    const expr = await agent.createSignedExpression({ hello: 'world' })
    expect(expr.author).toMatch(/^did:key:z/)
    expect(expr.proof.signature).toBeDefined()
  })

  it('PerspectiveManager can add and query perspectives', async () => {
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: new InMemoryWalletStore()
    })
    const pm = executor.getPerspectiveManager()
    const handle = pm.add('test')
    expect(handle.uuid).toBeDefined()
    expect(pm.getAll()).toHaveLength(1)
  })

  it('full flow: create → generate → initialize → add perspective → add link → query', async () => {
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: new InMemoryWalletStore()
    })

    // Generate agent
    const agent = executor.getAgentService() as any
    await agent.generate('pass')

    // Initialize
    await executor.initialize()
    expect(executor.isReady).toBe(true)

    // Add perspective
    const pm = executor.getPerspectiveManager()
    const handle = pm.add('my-perspective')

    // Add link
    const link = await pm.addLink(handle.uuid, {
      source: 'src://a',
      target: 'tgt://b',
      predicate: 'pred://c'
    })
    expect(link.data.source).toBe('src://a')

    // Query
    const results = await pm.queryLinks(handle.uuid, { source: 'src://a' })
    expect(results).toHaveLength(1)
    expect(results[0].data.target).toBe('tgt://b')
  })
})
