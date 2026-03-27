export interface HolochainConfig {
  conductorAdminUrl: string
  /** Linker URL for Holo Web Conductor network configuration */
  linkerUrl?: string
}

export interface CellId {
  dnaHash: Uint8Array
  agentPubKey: Uint8Array
}

export interface ProvisionedCellInfo {
  provisioned: {
    cellId: [Uint8Array, Uint8Array]
    dnaModifiers: Record<string, unknown>
    name: string
  }
}

export type CellInfo = ProvisionedCellInfo

export interface InstalledAppInfo {
  installedAppId: string
  agentKey: Uint8Array
  cellInfo: Record<string, CellInfo[]>
}

export interface InstallAppRequest {
  happPath?: string
  happBytes?: Uint8Array
  installedAppId: string
  agentKey?: Uint8Array
  networkSeed?: string
}

export interface HolochainSignal {
  cellId: CellId
  payload: unknown
}

export const HolochainConnectionState = {
  Disconnected: 'Disconnected',
  Connecting: 'Connecting',
  Connected: 'Connected',
  Error: 'Error'
} as const
export type HolochainConnectionState = (typeof HolochainConnectionState)[keyof typeof HolochainConnectionState]

export type HolochainConnectionListener = (state: HolochainConnectionState) => void

/**
 * Platform-agnostic interface for signing zome calls.
 * Implementations must generate ed25519 keypairs and sign SHA-512 hashes.
 */
export interface ZomeCallSigner {
  /** The 39-byte HoloHash AgentPubKey for this signer (prefix + ed25519 pubkey + DHT location) */
  readonly agentPubKey: Uint8Array
  /** The 64-byte capability secret associated with this signer's grant */
  readonly capSecret: Uint8Array
  /** Sign the SHA-512 hash of the given data with ed25519 */
  sign(data: Uint8Array): Promise<Uint8Array>
}

export interface HolochainConductor {
  connect(config: HolochainConfig): Promise<void>
  disconnect(): Promise<void>
  getState(): HolochainConnectionState
  generateAgentPubKey(): Promise<Uint8Array>
  installApp(request: InstallAppRequest): Promise<InstalledAppInfo>
  /**
   * Grant a capability for the given signer to call zome functions on the given cell.
   * Must be called before callZome for non-author calls.
   */
  grantCapability(cellId: CellId, signer: ZomeCallSigner): Promise<void>
  /**
   * Create a new ZomeCallSigner and grant it capability on the given cell.
   * This generates an ed25519 keypair, grants a transferable cap, and returns a ready-to-use signer.
   */
  createSigningCredentials(cellId: CellId): Promise<ZomeCallSigner>
  callZome(cellId: CellId, zomeName: string, fnName: string, payload: unknown, signer: ZomeCallSigner): Promise<unknown>
  onSignal(callback: (signal: HolochainSignal) => void): () => void
  onStateChange(callback: HolochainConnectionListener): () => void
}
