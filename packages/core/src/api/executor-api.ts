import type { Link } from '../agent/types'
import type { LinkExpression, LinkQuery } from '../linkstore/types'

// Agent types
export interface AgentStatus {
  did: string | null
  didDocument: string | null
  error: string | null
  isInitialized: boolean
  isUnlocked: boolean
}

export interface AgentInfo {
  did: string
  directMessageLanguage: string | null
  perspective: { links: LinkExpression[] } | null
}

export interface AgentSignature {
  signature: string
  publicKey: string
}

export interface EntanglementProof {
  did: string
  didSigningKeyId: string
  deviceKey: string
  deviceKeySignedByDid: string
  didSignedByDeviceKey: string
}

export interface AuthInfo {
  appName: string
  appDesc: string
  appDomain?: string
  appUrl?: string
  capabilities?: Array<{ with: { domain: string; pointers: string[] }; can: string[] }>
}

// Perspective types
export interface PerspectiveHandle {
  uuid: string
  name?: string
  sharedUrl?: string
  state: string
}

export interface LinkMutations {
  additions: Link[]
  removals: LinkExpression[]
}

export interface PerspectiveDiff {
  additions: LinkExpression[]
  removals: LinkExpression[]
}

// Runtime types
export interface RuntimeInfo {
  ad4mExecutorVersion: string
  isInitialized: boolean
  isUnlocked: boolean
}

export interface OnlineAgent {
  did: string
  status?: string
}

export interface LanguageRef {
  address: string
  name: string
}

/**
 * Transport-agnostic API interface for all executor operations.
 * Implementations may delegate directly to the Executor or proxy over postMessage/fetch.
 */
export interface ExecutorAPI {
  // Agent
  agent(): Promise<AgentInfo>
  agentStatus(): Promise<AgentStatus>
  agentIsLocked(): Promise<boolean>
  agentGenerate(passphrase: string): Promise<AgentStatus>
  agentLock(passphrase: string): Promise<AgentStatus>
  agentUnlock(passphrase: string): Promise<AgentStatus>
  agentUpdatePublicPerspective(perspective: { links: Link[] }): Promise<AgentInfo>
  agentUpdateDirectMessageLanguage(language: string): Promise<AgentInfo>
  agentSignMessage(message: string): Promise<AgentSignature>
  agentGetEntanglementProofs(): Promise<EntanglementProof[]>
  agentAddEntanglementProofs(proofs: EntanglementProof[]): Promise<EntanglementProof[]>
  agentDeleteEntanglementProofs(proofs: EntanglementProof[]): Promise<EntanglementProof[]>
  agentEntanglementProofPreFlight(deviceKey: string, deviceKeyType: string): Promise<EntanglementProof>
  agentGetApps(): Promise<AuthInfo[]>
  agentPermitCapability(auth: string): Promise<string>
  agentRequestCapability(authInfo: AuthInfo): Promise<string>
  agentGenerateJwt(requestId: string, rand: string): Promise<string>
  agentRevokeToken(requestId: string): Promise<boolean>

  // Perspectives
  perspectives(): Promise<PerspectiveHandle[]>
  perspective(uuid: string): Promise<PerspectiveHandle | null>
  perspectiveAdd(name: string): Promise<PerspectiveHandle>
  perspectiveUpdate(uuid: string, name: string): Promise<PerspectiveHandle>
  perspectiveRemove(uuid: string): Promise<boolean>
  perspectiveSnapshot(uuid: string): Promise<{ links: LinkExpression[] }>
  perspectiveQueryLinks(uuid: string, query: LinkQuery): Promise<LinkExpression[]>
  perspectiveQuerySparql(uuid: string, query: string): Promise<string>
  perspectiveAddLink(uuid: string, link: Link): Promise<LinkExpression>
  perspectiveAddLinks(uuid: string, links: Link[]): Promise<LinkExpression[]>
  perspectiveRemoveLink(uuid: string, link: LinkExpression): Promise<boolean>
  perspectiveUpdateLink(uuid: string, oldLink: LinkExpression, newLink: Link): Promise<LinkExpression>
  perspectiveLinkMutations(uuid: string, mutations: LinkMutations): Promise<PerspectiveDiff>
  perspectiveAddSdna(uuid: string, name: string, sdnaCode: string, sdnaType: string): Promise<boolean>

  // Neighbourhood
  neighbourhoodJoinFromUrl(url: string): Promise<PerspectiveHandle>
  neighbourhoodPublishFromPerspective(uuid: string, linkLanguage: string, meta: string): Promise<string>
  neighbourhoodSetOnlineStatus(perspectiveUUID: string, status: unknown): Promise<boolean>
  neighbourhoodSendSignal(perspectiveUUID: string, remoteAgentDid: string, payload: unknown): Promise<boolean>
  neighbourhoodSendBroadcast(perspectiveUUID: string, payload: unknown): Promise<boolean>
  neighbourhoodOtherAgents(perspectiveUUID: string): Promise<string[]>
  neighbourhoodOnlineAgents(perspectiveUUID: string): Promise<OnlineAgent[]>
  neighbourhoodHasTelepresenceAdapter(perspectiveUUID: string): Promise<boolean>

  // Runtime
  runtimeInfo(): Promise<RuntimeInfo>
  runtimeFriends(): Promise<string[]>
  runtimeKnownLinkLanguageTemplates(): Promise<string[]>
  runtimeAddFriend(did: string): Promise<string[]>
  runtimeRemoveFriend(did: string): Promise<string[]>
  runtimeAddKnownLinkLanguageTemplate(address: string): Promise<string[]>
  runtimeRemoveKnownLinkLanguageTemplate(address: string): Promise<string[]>
  getTrustedAgents(): Promise<string[]>
  addTrustedAgents(agents: string[]): Promise<string[]>
  removeTrustedAgents(agents: string[]): Promise<string[]>

  // Language
  languageApplyTemplateAndPublish(sourceLanguageHash: string, templateData: string): Promise<LanguageRef>
}
