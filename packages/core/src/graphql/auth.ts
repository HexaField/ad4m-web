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
  // Queries
  agentStatus: { domain: 'agent', action: 'READ' },
  agentGetApps: { domain: 'agent', action: 'READ' },
  perspectives: { domain: 'perspective', action: 'READ' },
  perspective: { domain: 'perspective', action: 'READ' },
  perspectiveQueryLinks: { domain: 'perspective', action: 'READ' },
  perspectiveSnapshot: { domain: 'perspective', action: 'READ' },
  runtimeInfo: { domain: 'runtime', action: 'READ' },
  // Mutations
  agentGenerate: { domain: 'agent', action: 'CREATE' },
  agentLock: { domain: 'agent', action: 'UPDATE' },
  agentUnlock: { domain: 'agent', action: 'UPDATE' },
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
  neighbourhoodJoinFromUrl: { domain: 'neighbourhood', action: 'CREATE' },
  neighbourhoodPublishFromPerspective: { domain: 'neighbourhood', action: 'CREATE' },
  languageApplyTemplateAndPublish: { domain: 'language', action: 'CREATE' },
  // Subscriptions
  agentStatusChanged: { domain: 'agent', action: 'READ' },
  perspectiveAdded: { domain: 'perspective', action: 'READ' },
  perspectiveUpdated: { domain: 'perspective', action: 'READ' },
  perspectiveRemoved: { domain: 'perspective', action: 'READ' },
  perspectiveLinkAdded: { domain: 'perspective', action: 'READ' },
  perspectiveLinkRemoved: { domain: 'perspective', action: 'READ' }
}
