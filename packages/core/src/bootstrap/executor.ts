import type { AgentServiceInterface, BootstrapConfig, ExecutorInterface } from './types'
import type { LinkStore } from '../linkstore/types'
import type { ShaclEngine } from '../shacl/engine'
import type { LanguageManager } from '../language/manager'
import type { HolochainLanguageDelegate } from '../language/types'
import type { PerspectiveManager } from '../perspective/manager'
import type { NeighbourhoodManager } from '../neighbourhood/manager'

export interface ExecutorDeps {
  agentService: AgentServiceInterface
  perspectiveManager: PerspectiveManager
  languageManager: LanguageManager
  shaclEngine: ShaclEngine
  linkStore: LinkStore
  holochainDelegate?: HolochainLanguageDelegate
  bootstrapConfig: BootstrapConfig
  neighbourhoodManager?: NeighbourhoodManager
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
  }

  get isReady(): boolean {
    return this._isReady
  }

  async initialize(): Promise<void> {
    const status = this.agentService.getStatus()
    if (!status.isInitialized) {
      throw new Error('Agent must be initialized before executor can start. Call AgentService.generate() first.')
    }

    // System language addresses stored for future loading
    // Actual language bundle loading is deferred to integration phase
    void this.bootstrapConfig.languages

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
