import type { CapabilityClaims, ResourceDomain } from '../agent/capabilities'
import { hasCapability, isAdminCredential } from '../agent/capabilities'

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

export const OPERATION_CAPABILITIES: Record<string, { domain: ResourceDomain; action: string }> = {
  // Queries
  agentStatus: { domain: 'agent', action: 'READ' },
  perspectives: { domain: 'perspective', action: 'READ' },
  perspective: { domain: 'perspective', action: 'READ' },
  perspectiveQueryLinks: { domain: 'perspective', action: 'READ' },
  perspectiveSnapshot: { domain: 'perspective', action: 'READ' },
  runtimeInfo: { domain: 'runtime', action: 'READ' },
  // Mutations
  agentGenerate: { domain: 'agent', action: 'CREATE' },
  agentLock: { domain: 'agent', action: 'UPDATE' },
  agentUnlock: { domain: 'agent', action: 'UPDATE' },
  perspectiveAdd: { domain: 'perspective', action: 'CREATE' },
  perspectiveUpdate: { domain: 'perspective', action: 'UPDATE' },
  perspectiveRemove: { domain: 'perspective', action: 'DELETE' },
  perspectiveAddLink: { domain: 'perspective', action: 'CREATE' },
  perspectiveAddLinks: { domain: 'perspective', action: 'CREATE' },
  perspectiveRemoveLink: { domain: 'perspective', action: 'DELETE' },
  perspectiveUpdateLink: { domain: 'perspective', action: 'UPDATE' },
  neighbourhoodJoinFromUrl: { domain: 'neighbourhood', action: 'CREATE' },
  neighbourhoodPublishFromPerspective: { domain: 'neighbourhood', action: 'CREATE' },
  languageApplyTemplateAndPublish: { domain: 'language', action: 'CREATE' }
}
