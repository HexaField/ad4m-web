import type { AuthInfo, CapabilityClaims } from './capabilities'

export interface PendingRequest {
  authInfo: AuthInfo
  rand: string
}

export interface GrantedApp {
  requestId: string
  authInfo: AuthInfo
  token: string
}

/**
 * In-memory store for capability requests and granted tokens.
 * Could be backed by a persistent WalletStore in the future.
 */
export class CapabilityStore {
  private pendingRequests = new Map<string, PendingRequest>()
  private grantedApps = new Map<string, GrantedApp>()

  // --- Pending requests ---

  addPendingRequest(requestId: string, authInfo: AuthInfo, rand: string): void {
    this.pendingRequests.set(requestId, { authInfo, rand })
  }

  getPendingRequest(requestId: string): PendingRequest | undefined {
    return this.pendingRequests.get(requestId)
  }

  removePendingRequest(requestId: string): void {
    this.pendingRequests.delete(requestId)
  }

  // --- Granted apps ---

  addGrantedApp(requestId: string, authInfo: AuthInfo, token: string): void {
    this.grantedApps.set(requestId, { requestId, authInfo, token })
  }

  getGrantedApps(): GrantedApp[] {
    return Array.from(this.grantedApps.values())
  }

  revokeApp(requestId: string): boolean {
    return this.grantedApps.delete(requestId)
  }

  isTokenRevoked(requestId: string): boolean {
    // If the requestId was once granted but is no longer present, it's revoked.
    // We can't track all ever-granted IDs without persistence, so we check if it exists.
    // For now, a valid JWT whose requestId is not in grantedApps is considered revoked.
    return !this.grantedApps.has(requestId)
  }
}
