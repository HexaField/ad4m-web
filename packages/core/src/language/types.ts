import type { LinkExpression } from '../linkstore/types'
import type { Expression } from '../agent/types'
import type { ZomeCallSigner } from '../holochain/types'

// Language object returned by create()
export interface Language {
  readonly name: string
  readonly expressionAdapter?: ExpressionAdapter
  readonly linksAdapter?: LinkSyncAdapter
  readonly telepresenceAdapter?: TelepresenceAdapter
  readonly languageAdapter?: LanguageAdapter
  readonly getByAuthorAdapter?: GetByAuthorAdapter
  readonly getAllAdapter?: GetAllAdapter
  readonly directMessageAdapter?: DirectMessageAdapter
  readonly settingsUI?: SettingsUI
  readonly expressionUI?: ExpressionUI
  readonly teardown?: () => void
  isImmutableExpression?(address: string): boolean
  interactions(address: string): Interaction[]
}

// Expression storage
export interface ExpressionAdapter {
  get(address: string): Promise<any | null>
  putAdapter: PublicSharing | ReadOnlyLanguage
}

export interface PublicSharing {
  createPublic(content: object): Promise<string>
}

export interface ReadOnlyLanguage {
  addressOf(content: object): Promise<string>
}

// Link sync
export interface LinkSyncAdapter {
  writable(): boolean
  public(): boolean
  others(): Promise<string[]>
  currentRevision(): Promise<string>
  sync(): Promise<PerspectiveDiff>
  render(): Promise<Perspective>
  commit(diff: PerspectiveDiff): Promise<string>
  addCallback(callback: PerspectiveDiffObserver): number
  addSyncStateChangeCallback(callback: SyncStateChangeObserver): number
}

// Telepresence
export interface TelepresenceAdapter {
  setOnlineStatus(status: any): Promise<void>
  getOnlineAgents(): Promise<OnlineAgent[]>
  sendSignal(remoteAgentDid: string, payload: any): Promise<object>
  sendBroadcast(payload: any): Promise<object>
  registerSignalCallback(callback: TelepresenceSignalCallback): Promise<void>
}

export interface OnlineAgent {
  did: string
  status: any
}

// Language source retrieval
export interface LanguageAdapter {
  getLanguageSource(address: string): Promise<string>
}

// Query adapters
export interface GetByAuthorAdapter {
  getByAuthor(did: string, count: number, page: number): Promise<any[]>
}

export interface GetAllAdapter {
  getAll(filter: any, count: number, page: number): Promise<any[]>
}

// Direct messages
export interface DirectMessageAdapter {
  recipient(): string
  status(): Promise<any | void>
  sendP2P(message: any): Promise<any | void>
  sendInbox(message: any): Promise<any | void>
  setStatus(status: any): void
  inbox(filter?: string): Promise<any[]>
  addMessageCallback(callback: MessageCallback): void
}

// UI
export interface SettingsUI {
  settingsIcon(): string
  settingsComponent(): string
}

export interface ExpressionUI {
  icon(): string
  constructorIcon(): string
}

// Callbacks
export type PerspectiveDiffObserver = (diff: PerspectiveDiff) => void
export type SyncStateChangeObserver = (state: string) => void
export type TelepresenceSignalCallback = (signal: any) => void
export type MessageCallback = (message: any) => void
export type Ad4mSignalCB = (signal: any) => void

// Perspective types (used by sync)
export interface Perspective {
  links: LinkExpression[]
}

export interface PerspectiveDiff {
  additions: LinkExpression[]
  removals: LinkExpression[]
}

// Interaction
export interface Interaction {
  label: string
  name: string
  execute(parameters: Record<string, string>): Promise<any>
}

// Context passed to Language create()
export interface LanguageContext {
  agent: LanguageAgentService
  signatures: SignaturesService
  storageDirectory: string
  customSettings: object
  Holochain?: HolochainLanguageDelegate
  ad4mSignal: Ad4mSignalCB
}

export interface LanguageAgentService {
  readonly did: string
  createSignedExpression(data: any): Promise<Expression<any>>
}

export interface SignaturesService {
  verify(expr: Expression<any>): Promise<boolean>
}

export interface HolochainLanguageDelegate {
  registerDNAs(dnas: Dna[], holochainSignalCallback?: any, signer?: ZomeCallSigner): Promise<void>
  call(dnaNick: string, zomeName: string, fnName: string, params: any, signer?: ZomeCallSigner): Promise<any>
}

export interface Dna {
  file: Uint8Array
  nick: string
  zomeCalls: [string, string][]
}

// Language metadata
export interface LanguageMeta {
  address: string
  author: string
  description?: string
  name: string
  possibleTemplateParams?: string[]
  sourceCodeLink?: string
  templateAppliedParams?: string
  templateSourceLanguageAddress?: string
  templated?: boolean
}

// Language host
export interface LanguageHandle {
  address: string
  name: string
  language: Language
}

export interface LanguageHost {
  load(address: string, bundle: string, context: LanguageContext): Promise<LanguageHandle>
  call<T>(handle: LanguageHandle, adapter: string, method: string, args: any[]): Promise<T>
  unload(handle: LanguageHandle): Promise<void>
  getLoaded(address: string): LanguageHandle | undefined
  getAllLoaded(): LanguageHandle[]
}

// Language create function type
export type LanguageCreateFunction = (context: LanguageContext) => Promise<Language>
