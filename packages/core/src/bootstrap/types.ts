import type { AgentStatus, Expression } from '../agent/types'
import type { LinkStore } from '../linkstore/types'
import type { ShaclEngine } from '../shacl/engine'
import type { LanguageManager } from '../language/manager'
import type { LanguageMeta, HolochainLanguageDelegate } from '../language/types'
import type { PerspectiveManager } from '../perspective/manager'

export interface BootstrapLanguages {
  languageLanguageAddress: string
  agentLanguageAddress: string
  neighbourhoodLanguageAddress: string
  perspectiveLanguageAddress: string
}

export interface LanguageLanguageInput {
  bundle: string
  meta: LanguageMeta
}

export interface ContentStore {
  get(address: string): Promise<string | null>
  put(content: string): Promise<string>
}

export interface BootstrapConfig {
  languages: BootstrapLanguages
  contentStoreUrl?: string
}

export interface AgentServiceInterface {
  getStatus(): AgentStatus
  createSignedExpression(data: any): Promise<Expression<any>>
  verifyExpression(expr: Expression<any>): Promise<{ valid?: boolean }>
}

export interface ExecutorInterface {
  readonly agentService: AgentServiceInterface
  readonly perspectiveManager: PerspectiveManager
  readonly languageManager: LanguageManager
  readonly shaclEngine: ShaclEngine
  readonly linkStore: LinkStore
  readonly holochainDelegate?: HolochainLanguageDelegate
  readonly bootstrapConfig: BootstrapConfig
  readonly isReady: boolean
  initialize(): Promise<void>
  shutdown(): Promise<void>
  getAgentService(): AgentServiceInterface
  getPerspectiveManager(): PerspectiveManager
  getLanguageManager(): LanguageManager
  getShaclEngine(): ShaclEngine
  getLinkStore(): LinkStore
}
