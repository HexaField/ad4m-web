import type { Executor } from '../bootstrap/executor'
import type { CapabilityService } from '../graphql/capability-service'
import type {
  ExecutorAPI,
  AgentStatus,
  AgentInfo,
  AgentSignature,
  EntanglementProof,
  AuthInfo,
  PerspectiveHandle,
  PerspectiveDiff,
  RuntimeInfo,
  OnlineAgent,
  LanguageRef,
  LinkMutations
} from './executor-api'
import type { Link } from '../agent/types'
import type { LinkExpression, LinkQuery } from '../linkstore/types'

function serializeAgentStatus(status: ReturnType<Executor['agentService']['getStatus']>): AgentStatus {
  return {
    ...status,
    didDocument: status.didDocument ? JSON.stringify(status.didDocument) : null
  }
}

function normalizeLinkData(data: { source: string; target: string; predicate?: string }): Link {
  return { source: data.source, target: data.target, predicate: data.predicate ?? undefined }
}

/**
 * Direct implementation of ExecutorAPI that delegates to the Executor instance.
 */
export class ExecutorAPIImpl implements ExecutorAPI {
  constructor(
    private executor: Executor,
    private capabilityService?: CapabilityService
  ) {}

  async agent(): Promise<AgentInfo> {
    const s = this.executor.agentService.getStatus()
    return { did: s.did ?? '', directMessageLanguage: null, perspective: null }
  }

  async agentStatus(): Promise<AgentStatus> {
    return serializeAgentStatus(this.executor.agentService.getStatus())
  }

  async agentIsLocked(): Promise<boolean> {
    return !this.executor.agentService.getStatus().isUnlocked
  }

  async agentGenerate(passphrase: string): Promise<AgentStatus> {
    await (this.executor.agentService as any).generate(passphrase)
    return serializeAgentStatus(this.executor.agentService.getStatus())
  }

  async agentLock(_passphrase: string): Promise<AgentStatus> {
    ;(this.executor.agentService as any).lock()
    return serializeAgentStatus(this.executor.agentService.getStatus())
  }

  async agentUnlock(passphrase: string): Promise<AgentStatus> {
    await (this.executor.agentService as any).unlock(passphrase)
    return serializeAgentStatus(this.executor.agentService.getStatus())
  }

  async agentUpdatePublicPerspective(_perspective: { links: Link[] }): Promise<AgentInfo> {
    const s = this.executor.agentService.getStatus()
    return { did: s.did ?? '', directMessageLanguage: null, perspective: null }
  }

  async agentUpdateDirectMessageLanguage(language: string): Promise<AgentInfo> {
    const s = this.executor.agentService.getStatus()
    return { did: s.did ?? '', directMessageLanguage: language, perspective: null }
  }

  async agentSignMessage(_message: string): Promise<AgentSignature> {
    return { signature: '', publicKey: '' }
  }

  async agentGetEntanglementProofs(): Promise<EntanglementProof[]> {
    return this.executor.entanglementService?.getProofs() ?? []
  }

  async agentAddEntanglementProofs(proofs: EntanglementProof[]): Promise<EntanglementProof[]> {
    if (!this.executor.entanglementService) throw new Error('EntanglementService not available')
    return this.executor.entanglementService.addProofs(proofs)
  }

  async agentDeleteEntanglementProofs(proofs: EntanglementProof[]): Promise<EntanglementProof[]> {
    if (!this.executor.entanglementService) throw new Error('EntanglementService not available')
    return this.executor.entanglementService.deleteProofs(proofs)
  }

  async agentEntanglementProofPreFlight(deviceKey: string, deviceKeyType: string): Promise<EntanglementProof> {
    if (!this.executor.entanglementService) throw new Error('EntanglementService not available')
    return this.executor.entanglementService.preFlight(deviceKey, deviceKeyType)
  }

  async agentGetApps(): Promise<AuthInfo[]> {
    if (!this.capabilityService) throw new Error('CapabilityService not available')
    return this.capabilityService.getApps()
  }

  async agentPermitCapability(_auth: string): Promise<string> {
    return ''
  }

  async agentRequestCapability(authInfo: AuthInfo): Promise<string> {
    if (!this.capabilityService) throw new Error('CapabilityService not available')
    return this.capabilityService.requestCapability(authInfo)
  }

  async agentGenerateJwt(requestId: string, rand: string): Promise<string> {
    if (!this.capabilityService) throw new Error('CapabilityService not available')
    return this.capabilityService.generateJwt(requestId, rand)
  }

  async agentRevokeToken(requestId: string): Promise<boolean> {
    if (!this.capabilityService) throw new Error('CapabilityService not available')
    return this.capabilityService.revokeToken(requestId)
  }

  async perspectives(): Promise<PerspectiveHandle[]> {
    return this.executor.perspectiveManager.getAll()
  }

  async perspective(uuid: string): Promise<PerspectiveHandle | null> {
    return this.executor.perspectiveManager.get(uuid) ?? null
  }

  async perspectiveAdd(name: string): Promise<PerspectiveHandle> {
    return this.executor.perspectiveManager.add(name)
  }

  async perspectiveUpdate(uuid: string, name: string): Promise<PerspectiveHandle> {
    return this.executor.perspectiveManager.update(uuid, name)
  }

  async perspectiveRemove(uuid: string): Promise<boolean> {
    return this.executor.perspectiveManager.remove(uuid)
  }

  async perspectiveSnapshot(uuid: string): Promise<{ links: LinkExpression[] }> {
    return this.executor.perspectiveManager.snapshot(uuid)
  }

  async perspectiveQueryLinks(uuid: string, query: LinkQuery): Promise<LinkExpression[]> {
    return this.executor.perspectiveManager.queryLinks(uuid, query)
  }

  async perspectiveQuerySparql(uuid: string, query: string): Promise<string> {
    return JSON.stringify({ results: [] })
  }

  async perspectiveAddLink(uuid: string, link: Link): Promise<LinkExpression> {
    return this.executor.perspectiveManager.addLink(uuid, normalizeLinkData(link))
  }

  async perspectiveAddLinks(uuid: string, links: Link[]): Promise<LinkExpression[]> {
    return this.executor.perspectiveManager.addLinks(uuid, links.map(normalizeLinkData))
  }

  async perspectiveRemoveLink(uuid: string, link: LinkExpression): Promise<boolean> {
    const le: LinkExpression = {
      author: link.author,
      timestamp: link.timestamp,
      data: normalizeLinkData(link.data),
      proof: link.proof
    }
    return this.executor.perspectiveManager.removeLink(uuid, le)
  }

  async perspectiveUpdateLink(uuid: string, oldLink: LinkExpression, newLink: Link): Promise<LinkExpression> {
    const old: LinkExpression = {
      author: oldLink.author,
      timestamp: oldLink.timestamp,
      data: normalizeLinkData(oldLink.data),
      proof: oldLink.proof
    }
    return this.executor.perspectiveManager.updateLink(uuid, old, normalizeLinkData(newLink))
  }

  async perspectiveLinkMutations(uuid: string, mutations: LinkMutations): Promise<PerspectiveDiff> {
    return this.executor.perspectiveManager.linkMutations(uuid, {
      additions: mutations.additions.map(normalizeLinkData),
      removals: mutations.removals.map((r) => ({
        author: r.author,
        timestamp: r.timestamp,
        data: normalizeLinkData(r.data),
        proof: r.proof
      }))
    })
  }

  async perspectiveAddSdna(uuid: string, name: string, sdnaCode: string, sdnaType: string): Promise<boolean> {
    return this.executor.perspectiveManager.addSdna(uuid, name, sdnaCode, sdnaType)
  }

  async neighbourhoodJoinFromUrl(url: string): Promise<PerspectiveHandle> {
    if (!this.executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
    return this.executor.neighbourhoodManager.joinFromUrl(url)
  }

  async neighbourhoodPublishFromPerspective(uuid: string, linkLanguage: string, meta: string): Promise<string> {
    if (!this.executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
    return this.executor.neighbourhoodManager.publishFromPerspective(uuid, linkLanguage, JSON.parse(meta))
  }

  async neighbourhoodSetOnlineStatus(perspectiveUUID: string, status: unknown): Promise<boolean> {
    if (!this.executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
    await this.executor.neighbourhoodManager.setOnlineStatus(perspectiveUUID, status)
    return true
  }

  async neighbourhoodSendSignal(perspectiveUUID: string, remoteAgentDid: string, payload: unknown): Promise<boolean> {
    if (!this.executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
    await this.executor.neighbourhoodManager.sendSignal(perspectiveUUID, remoteAgentDid, payload)
    return true
  }

  async neighbourhoodSendBroadcast(perspectiveUUID: string, payload: unknown): Promise<boolean> {
    if (!this.executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
    await this.executor.neighbourhoodManager.sendBroadcast(perspectiveUUID, payload)
    return true
  }

  async neighbourhoodOtherAgents(perspectiveUUID: string): Promise<string[]> {
    return this.executor.neighbourhoodManager?.getOtherAgents(perspectiveUUID) ?? []
  }

  async neighbourhoodOnlineAgents(perspectiveUUID: string): Promise<OnlineAgent[]> {
    return this.executor.neighbourhoodManager?.getOnlineAgents(perspectiveUUID) ?? []
  }

  async neighbourhoodHasTelepresenceAdapter(perspectiveUUID: string): Promise<boolean> {
    return this.executor.neighbourhoodManager?.hasTelepresenceAdapter(perspectiveUUID) ?? false
  }

  async runtimeInfo(): Promise<RuntimeInfo> {
    const s = this.executor.agentService.getStatus()
    return { ad4mExecutorVersion: '0.1.0', isInitialized: s.isInitialized, isUnlocked: s.isUnlocked }
  }

  async runtimeFriends(): Promise<string[]> {
    return this.executor.friendService?.getFriends() ?? []
  }

  async runtimeKnownLinkLanguageTemplates(): Promise<string[]> {
    return this.executor.runtimeService?.getKnownLinkLanguageTemplates() ?? []
  }

  async runtimeAddFriend(did: string): Promise<string[]> {
    if (!this.executor.friendService) throw new Error('FriendService not available')
    return this.executor.friendService.addFriend(did)
  }

  async runtimeRemoveFriend(did: string): Promise<string[]> {
    if (!this.executor.friendService) throw new Error('FriendService not available')
    return this.executor.friendService.removeFriend(did)
  }

  async runtimeAddKnownLinkLanguageTemplate(address: string): Promise<string[]> {
    if (!this.executor.runtimeService) throw new Error('RuntimeService not available')
    return this.executor.runtimeService.addKnownLinkLanguageTemplate(address)
  }

  async runtimeRemoveKnownLinkLanguageTemplate(address: string): Promise<string[]> {
    if (!this.executor.runtimeService) throw new Error('RuntimeService not available')
    return this.executor.runtimeService.removeKnownLinkLanguageTemplate(address)
  }

  async getTrustedAgents(): Promise<string[]> {
    return this.executor.runtimeService?.getTrustedAgents() ?? []
  }

  async addTrustedAgents(agents: string[]): Promise<string[]> {
    if (!this.executor.runtimeService) throw new Error('RuntimeService not available')
    return this.executor.runtimeService.addTrustedAgents(agents)
  }

  async removeTrustedAgents(agents: string[]): Promise<string[]> {
    if (!this.executor.runtimeService) throw new Error('RuntimeService not available')
    return this.executor.runtimeService.removeTrustedAgents(agents)
  }

  async languageApplyTemplateAndPublish(sourceLanguageHash: string, templateData: string): Promise<LanguageRef> {
    const r = await this.executor.languageManager.applyTemplateAndPublish(sourceLanguageHash, templateData)
    return { address: r.address, name: r.meta.name }
  }
}
