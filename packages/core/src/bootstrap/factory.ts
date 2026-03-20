import type { BootstrapConfig } from './types'
import type { CryptoProvider, WalletStore } from '../agent/types'
import type { HolochainConductor } from '../holochain/types'
import { NobleCryptoProvider } from '../agent/crypto'
import { AgentService } from '../agent/agent'
import { InMemoryLinkStore } from '../linkstore/store'
import { ShaclEngine } from '../shacl/engine'
import { LanguageManager } from '../language/manager'
import { InProcessLanguageHost } from '../language/host'
import { PerspectiveManager } from '../perspective/manager'
import { HolochainLanguageDelegateImpl } from '../holochain/delegate'
import { Executor } from './executor'

export interface CreateExecutorConfig {
  bootstrapConfig: BootstrapConfig
  walletStore: WalletStore
  cryptoProvider?: CryptoProvider
  holochainConductor?: HolochainConductor
}

export async function createExecutor(config: CreateExecutorConfig): Promise<Executor> {
  const crypto = config.cryptoProvider ?? new NobleCryptoProvider()
  const agentService = new AgentService(crypto, config.walletStore)
  const linkStore = new InMemoryLinkStore()
  const shaclEngine = new ShaclEngine(linkStore)
  const languageHost = new InProcessLanguageHost()
  const languageManager = new LanguageManager(languageHost)
  const perspectiveManager = new PerspectiveManager(linkStore, shaclEngine, agentService)

  const holochainDelegate = config.holochainConductor
    ? new HolochainLanguageDelegateImpl(config.holochainConductor)
    : undefined

  return new Executor({
    agentService,
    perspectiveManager,
    languageManager,
    shaclEngine,
    linkStore,
    holochainDelegate,
    bootstrapConfig: config.bootstrapConfig
  })
}
