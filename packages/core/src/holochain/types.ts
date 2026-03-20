import type { Dna } from '../language/types'

export interface HolochainConfig {
  conductorAdminUrl: string
  conductorAppUrl: string
  agentPubKey?: string
}

export interface CellId {
  dnaHash: Uint8Array
  agentPubKey: Uint8Array
}

export interface InstalledCell {
  cellId: CellId
  nick: string
}

export interface HolochainSignal {
  cellId: CellId
  payload: any
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
  installApp(dnas: Dna[], agentKey?: Uint8Array): Promise<InstalledCell[]>
  callZome(cellId: CellId, zomeName: string, fnName: string, payload: any): Promise<any>
  onSignal(callback: (signal: HolochainSignal) => void): () => void
  onStateChange(callback: HolochainConnectionListener): () => void
}
