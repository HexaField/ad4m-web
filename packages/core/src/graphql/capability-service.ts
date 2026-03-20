import { CapabilityStore } from '../agent/capability-store'
import { signJwt } from '../agent/jwt'
import type { AuthInfo, CapabilityClaims } from '../agent/capabilities'
import { didToPublicKey } from '../agent/did'

function generateRequestId(): string {
  return crypto.randomUUID()
}

function generateRandomCode(): string {
  const n = Math.floor(Math.random() * 900000) + 100000
  return n.toString()
}

export interface CapabilityServiceDeps {
  getAgentDid: () => string | undefined
  getPrivateKey: () => Uint8Array | undefined
  adminCredential?: string
}

/**
 * Manages the capability request/approval/JWT flow.
 */
export class CapabilityService {
  readonly store = new CapabilityStore()
  private deps: CapabilityServiceDeps

  constructor(deps: CapabilityServiceDeps) {
    this.deps = deps
  }

  get isSingleUserMode(): boolean {
    return !this.deps.adminCredential
  }

  requestCapability(authInfo: AuthInfo): string {
    const requestId = generateRequestId()
    const rand = generateRandomCode()
    this.store.addPendingRequest(requestId, authInfo, rand)

    if (this.isSingleUserMode) {
      // In single-user mode, log the code for auto-approve
      console.log(`[CapabilityService] Auto-approve mode. Request: ${requestId}, Code: ${rand}`)
    }

    return requestId
  }

  /**
   * Get the random code for a pending request (for auto-approve / UI display).
   */
  getRandomCode(requestId: string): string | undefined {
    return this.store.getPendingRequest(requestId)?.rand
  }

  async generateJwt(requestId: string, rand: string): Promise<string> {
    const pending = this.store.getPendingRequest(requestId)
    if (!pending) throw new Error('No pending capability request found for this ID')
    if (pending.rand !== rand) throw new Error('Invalid verification code')

    const did = this.deps.getAgentDid()
    const privateKey = this.deps.getPrivateKey()
    if (!did || !privateKey) throw new Error('Agent must be unlocked to generate JWT')

    const now = Math.floor(Date.now() / 1000)
    const claims: CapabilityClaims = {
      iss: did,
      aud: pending.authInfo.appName,
      exp: now + 604800, // 7 days
      iat: now,
      nonce: generateRequestId(),
      capabilities: pending.authInfo
    }

    const token = await signJwt(claims, privateKey)

    // Move from pending to granted
    this.store.removePendingRequest(requestId)
    this.store.addGrantedApp(requestId, pending.authInfo, token)

    return token
  }

  revokeToken(requestId: string): boolean {
    return this.store.revokeApp(requestId)
  }

  getApps(): AuthInfo[] {
    return this.store.getGrantedApps().map((app) => app.authInfo)
  }
}
