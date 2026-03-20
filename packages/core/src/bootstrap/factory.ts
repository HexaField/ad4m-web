import type { BootstrapConfig } from './types'
import type { CryptoProvider, WalletStore, Link } from '../agent/types'
import type { HolochainConductor } from '../holochain/types'
import type { BundleResolver, BundleExecutor } from '../language/bundle'
import type { LinkExpression } from '../linkstore/types'
import { NobleCryptoProvider } from '../agent/crypto'
import { AgentService } from '../agent/agent'
import { verifyExpression } from '../agent/signing'
import { InMemoryLinkStore } from '../linkstore/store'
import { ShaclEngine } from '../shacl/engine'
import { LanguageManager } from '../language/manager'
import { InProcessLanguageHost } from '../language/host'
import { PerspectiveManager } from '../perspective/manager'
import { HolochainLanguageDelegateImpl } from '../holochain/delegate'
import { NeighbourhoodManager } from '../neighbourhood/manager'
import { InMemoryContentStore } from './content-store'
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

  // Create a real signLink function that delegates to AgentService
  const signLink = async (link: Link): Promise<LinkExpression> => {
    const status = agentService.getStatus()
    if (status.isUnlocked) {
      const expr = await agentService.createSignedExpression(link)
      return { author: expr.author, timestamp: expr.timestamp, data: link, proof: expr.proof }
    }
    // Fallback when agent not yet unlocked
    return {
      author: status.did ?? '',
      timestamp: new Date().toISOString(),
      data: link,
      proof: { key: '', signature: '' }
    }
  }

  const perspectiveManager = new PerspectiveManager(linkStore, shaclEngine, agentService, signLink)

  if (config.bundleResolver) {
    languageManager.setBundleResolver(config.bundleResolver)
  }
  if (config.bundleExecutor) {
    languageManager.setBundleExecutor(config.bundleExecutor)
  }

  // Create LanguageContext and wire it into the language manager
  const languageContext = {
    agent: {
      get did() {
        return agentService.getStatus().did ?? ''
      },
      createSignedExpression: (data: any) => agentService.createSignedExpression(data)
    },
    signatures: {
      verify: async (expr: any) => {
        const result = await verifyExpression(expr, crypto)
        return result.valid
      }
    },
    storageDirectory: '',
    customSettings: {},
    Holochain: undefined as any,
    ad4mSignal: () => {}
  }
  languageManager.setLanguageContext(languageContext)

  const holochainDelegate = config.holochainConductor
    ? new HolochainLanguageDelegateImpl(config.holochainConductor)
    : undefined

  // Create NeighbourhoodManager
  const contentStore = new InMemoryContentStore()
  const signExpression = (data: any) => agentService.createSignedExpression(data)
  const neighbourhoodManager = new NeighbourhoodManager(
    perspectiveManager,
    languageManager,
    contentStore,
    signExpression
  )

  const executor = new Executor({
    agentService,
    perspectiveManager,
    languageManager,
    shaclEngine,
    linkStore,
    holochainDelegate,
    bootstrapConfig: config.bootstrapConfig,
    neighbourhoodManager
  })

  let persistence: PersistenceCoordinator | undefined
  if (config.persistenceConfig) {
    persistence = new PersistenceCoordinator(executor, config.persistenceConfig)
  }

  return { executor, persistence }
}
