import type { CapabilityClaims, ResourceDomain } from '../agent/capabilities'
import { hasCapability, isAdminCredential } from '../agent/capabilities'
import { verifyJwt } from '../agent/jwt'
import { didToPublicKey } from '../agent/did'

export interface AuthContext {
  claims?: CapabilityClaims
  credential?: string
  adminCredential?: string
}

export function checkAuth(context: AuthContext, domain: ResourceDomain, action: string): void {
  // Admin credential bypasses all checks
  if (context.credential && context.adminCredential && isAdminCredential(context.credential, context.adminCredential)) {
    return
  }

  // Check capability claims
  if (context.claims && hasCapability(context.claims, domain, action)) {
    return
  }

  throw new Error(`Unauthorized: requires ${action} on ${domain}`)
}

/**
 * Extract and verify an AuthContext from an Authorization header value.
 * Supports: "Bearer <jwt>" or plain admin credential string.
 */
export async function extractAuthContext(
  authHeader: string | undefined,
  adminCredential: string | undefined,
  issuerDid: string | undefined
): Promise<AuthContext> {
  if (!authHeader) return {}

  // Check if it's the admin credential (plain string)
  if (adminCredential && authHeader === adminCredential) {
    return { credential: authHeader, adminCredential }
  }

  // Try Bearer JWT
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (issuerDid) {
    try {
      const publicKey = didToPublicKey(issuerDid)
      const claims = await verifyJwt(token, publicKey, { issuerDid })
      return { claims }
    } catch {
      throw new Error('Invalid or expired token')
    }
  }

  return {}
}

export const OPERATION_CAPABILITIES: Record<string, { domain: ResourceDomain; action: string }> = {
  agent: { domain: 'agent', action: 'READ' },
  agentByDID: { domain: 'agent', action: 'READ' },
  agentStatus: { domain: 'agent', action: 'READ' },
  agentIsLocked: { domain: 'agent', action: 'READ' },
  agentGetEntanglementProofs: { domain: 'agent', action: 'READ' },
  agentGetApps: { domain: 'agent', action: 'READ' },
  perspectives: { domain: 'perspective', action: 'READ' },
  perspective: { domain: 'perspective', action: 'READ' },
  perspectiveQueryLinks: { domain: 'perspective', action: 'READ' },
  perspectiveSnapshot: { domain: 'perspective', action: 'READ' },
  perspectiveQuerySurreal: { domain: 'perspective', action: 'READ' },
  neighbourhoodOtherAgents: { domain: 'neighbourhood', action: 'READ' },
  neighbourhoodOnlineAgents: { domain: 'neighbourhood', action: 'READ' },
  neighbourhoodHasTelepresenceAdapter: { domain: 'neighbourhood', action: 'READ' },
  runtimeInfo: { domain: 'runtime', action: 'READ' },
  runtimeFriends: { domain: 'runtime', action: 'READ' },
  runtimeFriendStatus: { domain: 'runtime', action: 'READ' },
  runtimeKnownLinkLanguageTemplates: { domain: 'runtime', action: 'READ' },
  runtimeHcAgentInfos: { domain: 'runtime', action: 'READ' },
  runtimeGetNetworkMetrics: { domain: 'runtime', action: 'READ' },
  runtimeReadiness: { domain: 'runtime', action: 'READ' },
  runtimeTlsDomain: { domain: 'runtime', action: 'READ' },
  runtimeHostingUserInfo: { domain: 'runtime', action: 'READ' },
  getTrustedAgents: { domain: 'runtime', action: 'READ' },
  agentGenerate: { domain: 'agent', action: 'CREATE' },
  agentLock: { domain: 'agent', action: 'UPDATE' },
  agentUnlock: { domain: 'agent', action: 'UPDATE' },
  agentUpdatePublicPerspective: { domain: 'agent', action: 'UPDATE' },
  agentUpdateDirectMessageLanguage: { domain: 'agent', action: 'UPDATE' },
  agentAddEntanglementProofs: { domain: 'agent', action: 'CREATE' },
  agentDeleteEntanglementProofs: { domain: 'agent', action: 'DELETE' },
  agentEntanglementProofPreFlight: { domain: 'agent', action: 'CREATE' },
  agentSignMessage: { domain: 'agent', action: 'READ' },
  agentPermitCapability: { domain: 'agent', action: 'PERMIT' },
  agentRequestCapability: { domain: 'agent', action: 'CREATE' },
  agentGenerateJwt: { domain: 'agent', action: 'PERMIT' },
  agentRevokeToken: { domain: 'agent', action: 'UPDATE' },
  perspectiveAdd: { domain: 'perspective', action: 'CREATE' },
  perspectiveUpdate: { domain: 'perspective', action: 'UPDATE' },
  perspectiveRemove: { domain: 'perspective', action: 'DELETE' },
  perspectiveAddLink: { domain: 'perspective', action: 'CREATE' },
  perspectiveAddLinks: { domain: 'perspective', action: 'CREATE' },
  perspectiveRemoveLink: { domain: 'perspective', action: 'DELETE' },
  perspectiveUpdateLink: { domain: 'perspective', action: 'UPDATE' },
  perspectiveLinkMutations: { domain: 'perspective', action: 'UPDATE' },
  perspectiveAddSdna: { domain: 'perspective', action: 'CREATE' },
  neighbourhoodJoinFromUrl: { domain: 'neighbourhood', action: 'CREATE' },
  neighbourhoodPublishFromPerspective: { domain: 'neighbourhood', action: 'CREATE' },
  neighbourhoodSetOnlineStatus: { domain: 'neighbourhood', action: 'UPDATE' },
  neighbourhoodSendSignal: { domain: 'neighbourhood', action: 'CREATE' },
  neighbourhoodSendBroadcast: { domain: 'neighbourhood', action: 'CREATE' },
  languageApplyTemplateAndPublish: { domain: 'language', action: 'CREATE' },
  addTrustedAgents: { domain: 'runtime', action: 'UPDATE' },
  removeTrustedAgents: { domain: 'runtime', action: 'UPDATE' },
  runtimeAddFriend: { domain: 'runtime', action: 'UPDATE' },
  runtimeRemoveFriend: { domain: 'runtime', action: 'UPDATE' },
  runtimeAddKnownLinkLanguageTemplate: { domain: 'runtime', action: 'UPDATE' },
  runtimeRemoveKnownLinkLanguageTemplate: { domain: 'runtime', action: 'UPDATE' },
  runtimeSetHotWalletAddress: { domain: 'runtime', action: 'UPDATE' },
  runtimeRequestPayment: { domain: 'runtime', action: 'CREATE' },
  runtimeSetUserCredits: { domain: 'runtime', action: 'UPDATE' },
  runtimeSetUserFreeAccess: { domain: 'runtime', action: 'UPDATE' },
  agentStatusChanged: { domain: 'agent', action: 'READ' },
  perspectiveAdded: { domain: 'perspective', action: 'READ' },
  perspectiveUpdated: { domain: 'perspective', action: 'READ' },
  perspectiveRemoved: { domain: 'perspective', action: 'READ' },
  perspectiveLinkAdded: { domain: 'perspective', action: 'READ' },
  perspectiveLinkRemoved: { domain: 'perspective', action: 'READ' },
  perspectiveLinkUpdated: { domain: 'perspective', action: 'READ' },
  perspectiveSyncStateChange: { domain: 'perspective', action: 'READ' },
  neighbourhoodSignal: { domain: 'neighbourhood', action: 'READ' },
  exceptionOccurred: { domain: 'runtime', action: 'READ' },
  runtimeMessageReceived: { domain: 'runtime', action: 'READ' },
  language: { domain: 'language', action: 'READ' },
  languageMeta: { domain: 'language', action: 'READ' },
  languages: { domain: 'language', action: 'READ' },
  languageSource: { domain: 'language', action: 'READ' },
  runtimeFriendSendMessage: { domain: 'runtime', action: 'CREATE' },
  languagePublish: { domain: 'language', action: 'CREATE' },
  languageRemove: { domain: 'language', action: 'DELETE' },
  languageWriteSettings: { domain: 'language', action: 'UPDATE' },
  agentUpdated: { domain: 'agent', action: 'READ' }
}
