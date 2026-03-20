import type { BootstrapConfig } from './types'
import type { CryptoProvider, WalletStore } from '../agent/types'
import type { HolochainConductor } from '../holochain/types'
import type { BundleResolver, BundleExecutor } from '../language/bundle'
import { NobleCryptoProvider } from '../agent/crypto'
import { AgentService } from '../agent/agent'
import { InMemoryLinkStore } from '../linkstore/store'
import { ShaclEngine } from '../shacl/engine'
import { LanguageManager } from '../language/manager'
import { InProcessLanguageHost } from '../language/host'
import { PerspectiveManager } from '../perspective/manager'
import { HolochainLanguageDelegateImpl } from '../holochain/delegate'
import { Executor } from './executor'
import type { PersistenceConfig } from '../persistence/types'
import { PersistenceCoordinator } from '../persistence/coordinator'

export interface CreateExecutorConfig {
  bootstrapConfig: BootstrapConfig
  walletStore: WalletStore
  cryptoProvider?: CryptoProvider
  holochainConductor?: HolochainConductor
  persistenceConfig?: PersistenceConfig
  bundleResolver?: BundleResolver
  bundleExecutor?: BundleExecutor
}

export interface CreateExecutorResult {
  executor: Executor
  persistence?: PersistenceCoordinator
}

export async function createExecutor(config: CreateExecutorConfig): Promise<CreateExecutorResult> {
  const crypto = config.cryptoProvider ?? new NobleCryptoProvider()
  const agentService = new AgentService(crypto, config.walletStore)
  const linkStore = new InMemoryLinkStore()
  const shaclEngine = new ShaclEngine(linkStore)
  const languageHost = new InProcessLanguageHost()
  const languageManager = new LanguageManager(languageHost)
  const perspectiveManager = new PerspectiveManager(linkStore, shaclEngine, agentService)

  if (config.bundleResolver) {
    languageManager.setBundleResolver(config.bundleResolver)
  }
  if (config.bundleExecutor) {
    languageManager.setBundleExecutor(config.bundleExecutor)
  }

  const holochainDelegate = config.holochainConductor
    ? new HolochainLanguageDelegateImpl(config.holochainConductor)
    : undefined

  const executor = new Executor({
    agentService,
    perspectiveManager,
    languageManager,
    shaclEngine,
    linkStore,
    holochainDelegate,
    bootstrapConfig: config.bootstrapConfig
  })

  let persistence: PersistenceCoordinator | undefined
  if (config.persistenceConfig) {
    persistence = new PersistenceCoordinator(executor, config.persistenceConfig)
  }

  return { executor, persistence }
}
