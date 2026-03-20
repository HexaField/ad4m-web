import type { AgentServiceInterface, BootstrapConfig, ExecutorInterface } from './types'
import type { LinkStore } from '../linkstore/types'
import type { ShaclEngine } from '../shacl/engine'
import type { LanguageManager } from '../language/manager'
import type { HolochainLanguageDelegate } from '../language/types'
import type { PerspectiveManager } from '../perspective/manager'
import type { NeighbourhoodManager } from '../neighbourhood/manager'

import type { PubSub } from '../graphql/subscriptions'
import type { EntanglementService } from '../agent/entanglement'
import type { FriendService } from '../agent/friends'
import type { RuntimeService } from '../runtime/service'

export interface ExecutorDeps {
  agentService: AgentServiceInterface
  perspectiveManager: PerspectiveManager
  languageManager: LanguageManager
  shaclEngine: ShaclEngine
  linkStore: LinkStore
  holochainDelegate?: HolochainLanguageDelegate
  bootstrapConfig: BootstrapConfig
  neighbourhoodManager?: NeighbourhoodManager
  pubsub?: PubSub
  entanglementService?: EntanglementService
  friendService?: FriendService
  runtimeService?: RuntimeService
}

export class Executor implements ExecutorInterface {
  readonly agentService: AgentServiceInterface
  readonly perspectiveManager: PerspectiveManager
  readonly languageManager: LanguageManager
  readonly shaclEngine: ShaclEngine
  readonly linkStore: LinkStore
  readonly holochainDelegate?: HolochainLanguageDelegate
  readonly bootstrapConfig: BootstrapConfig
  readonly neighbourhoodManager?: NeighbourhoodManager
  readonly pubsub?: PubSub
  readonly entanglementService?: EntanglementService
  readonly friendService?: FriendService
  readonly runtimeService?: RuntimeService
  private _isReady = false

  constructor(deps: ExecutorDeps) {
    this.agentService = deps.agentService
    this.perspectiveManager = deps.perspectiveManager
    this.languageManager = deps.languageManager
    this.shaclEngine = deps.shaclEngine
    this.linkStore = deps.linkStore
    this.holochainDelegate = deps.holochainDelegate
    this.bootstrapConfig = deps.bootstrapConfig
    this.neighbourhoodManager = deps.neighbourhoodManager
    this.pubsub = deps.pubsub
    this.entanglementService = deps.entanglementService
    this.friendService = deps.friendService
    this.runtimeService = deps.runtimeService
  }

  get isReady(): boolean {
    return this._isReady
  }

  async initialize(): Promise<void> {
    const status = this.agentService.getStatus()
    if (!status.isInitialized) {
      throw new Error('Agent must be initialized before executor can start. Call AgentService.generate() first.')
    }

    // Load bootstrap languages if a language manager with bundle support is available
    const languages = this.bootstrapConfig.languages
    if (languages && this.languageManager) {
      for (const [name, address] of Object.entries(languages)) {
        try {
          await this.languageManager.install(address)
        } catch (err) {
          // Bootstrap language loading is best-effort — languages may not be available yet
          // (e.g., no network, no bundle resolver configured)
          console.warn(`Failed to load bootstrap language "${name}" (${address}):`, err)
        }
      }
    }

    this._isReady = true
  }

  async shutdown(): Promise<void> {
    this._isReady = false
    // Uninstall all languages
    for (const meta of this.languageManager.getAllInstalled()) {
      await this.languageManager.uninstall(meta.address)
    }
  }

  getAgentService(): AgentServiceInterface {
    return this.agentService
  }

  getPerspectiveManager(): PerspectiveManager {
    return this.perspectiveManager
  }

  getLanguageManager(): LanguageManager {
    return this.languageManager
  }

  getShaclEngine(): ShaclEngine {
    return this.shaclEngine
  }

  getLinkStore(): LinkStore {
    return this.linkStore
  }
}
