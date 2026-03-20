import { describe, it, expect } from 'vitest'
import { Executor } from '../executor'
import { AgentService, NobleCryptoProvider } from '../../agent/index'
import { InMemoryLinkStore } from '../../linkstore/store'
import { ShaclEngine } from '../../shacl/engine'
import { LanguageManager } from '../../language/manager'
import { InProcessLanguageHost } from '../../language/host'
import { PerspectiveManager } from '../../perspective/manager'
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

function createDeps() {
  const crypto = new NobleCryptoProvider()
  const agentService = new AgentService(crypto, new InMemoryWalletStore())
  const linkStore = new InMemoryLinkStore()
  const shaclEngine = new ShaclEngine(linkStore)
  const languageManager = new LanguageManager(new InProcessLanguageHost())
  const perspectiveManager = new PerspectiveManager(linkStore, shaclEngine, agentService)
  return { agentService, linkStore, shaclEngine, languageManager, perspectiveManager, bootstrapConfig }
}

describe('Executor', () => {
  it('starts not ready', () => {
    const executor = new Executor(createDeps())
    expect(executor.isReady).toBe(false)
  })

  it('initialize() throws if agent not initialized', async () => {
    const executor = new Executor(createDeps())
    await expect(executor.initialize()).rejects.toThrow('Agent must be initialized')
  })

  it('initialize() sets isReady after agent is generated', async () => {
    const deps = createDeps()
    await deps.agentService.generate('pass')
    const executor = new Executor(deps)
    await executor.initialize()
    expect(executor.isReady).toBe(true)
  })

  it('accessors return correct services', () => {
    const deps = createDeps()
    const executor = new Executor(deps)
    expect(executor.getAgentService()).toBe(deps.agentService)
    expect(executor.getPerspectiveManager()).toBe(deps.perspectiveManager)
    expect(executor.getLanguageManager()).toBe(deps.languageManager)
    expect(executor.getShaclEngine()).toBe(deps.shaclEngine)
    expect(executor.getLinkStore()).toBe(deps.linkStore)
  })

  it('shutdown() works without error', async () => {
    const deps = createDeps()
    await deps.agentService.generate('pass')
    const executor = new Executor(deps)
    await executor.initialize()
    await executor.shutdown()
    expect(executor.isReady).toBe(false)
  })
})
