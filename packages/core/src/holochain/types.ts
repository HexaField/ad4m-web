export interface HolochainConfig {
  conductorAdminUrl: string
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

export interface HolochainConductor {
  connect(config: HolochainConfig): Promise<void>
  disconnect(): Promise<void>
  getState(): HolochainConnectionState
  generateAgentPubKey(): Promise<Uint8Array>
  installApp(request: InstallAppRequest): Promise<InstalledAppInfo>
  callZome(cellId: CellId, zomeName: string, fnName: string, payload: unknown): Promise<unknown>
  onSignal(callback: (signal: HolochainSignal) => void): () => void
  onStateChange(callback: HolochainConnectionListener): () => void
}
