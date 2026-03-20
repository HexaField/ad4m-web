export interface CapabilityClaims {
  iss: string // Issuer (executor DID)
  sub?: string // Subject
  aud: string // Audience
  exp: number // Expiration (Unix timestamp)
  iat: number // Issued at
  nonce: string // UUID v4
  capabilities: AuthInfo
}

export interface AuthInfo {
  appName: string
  appDesc: string
  appDomain?: string
  appUrl?: string
  capabilities?: Capability[]
}

export interface Capability {
  with: { domain: string; pointers: string[] }
  can: string[] // "READ" | "CREATE" | "UPDATE" | "DELETE" | "PERMIT"
}

export type ResourceDomain = 'agent' | 'perspective' | 'language' | 'runtime' | 'neighbourhood'

/** Check if capability claims grant a specific action on a domain */
export function hasCapability(claims: CapabilityClaims, domain: ResourceDomain, action: string): boolean {
  if (!claims.capabilities.capabilities) return false
  return claims.capabilities.capabilities.some((cap) => cap.with.domain === domain && cap.can.includes(action))
}

/** Constant-time-ish admin credential check */
export function isAdminCredential(credential: string, adminCredential: string): boolean {
  return credential === adminCredential
}

/** Create full-access capabilities for admin users */
export function createAdminCapabilities(appName: string): AuthInfo {
  const domains: ResourceDomain[] = ['agent', 'perspective', 'language', 'runtime', 'neighbourhood']
  return {
    appName,
    appDesc: 'Admin access',
    capabilities: domains.map((domain) => ({
      with: { domain, pointers: ['*'] },
      can: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'PERMIT']
    }))
  }
}
