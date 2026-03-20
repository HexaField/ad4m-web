import type { Dna } from '../language/types'
import type {
  HolochainConductor,
  HolochainConfig,
  HolochainSignal,
  HolochainConnectionListener,
  CellId,
  InstalledCell
} from './types'
import { HolochainConnectionState } from './types'

export class MockHolochainConductor implements HolochainConductor {
  private state: HolochainConnectionState = HolochainConnectionState.Disconnected
  private signalCallbacks: Set<(signal: HolochainSignal) => void> = new Set()
  private stateCallbacks: Set<HolochainConnectionListener> = new Set()
  private handlers: Map<string, (payload: any) => any> = new Map()

  private setState(newState: HolochainConnectionState): void {
    this.state = newState
    for (const cb of this.stateCallbacks) cb(newState)
  }

  async connect(_config: HolochainConfig): Promise<void> {
    this.setState(HolochainConnectionState.Connected)
  }

  async disconnect(): Promise<void> {
    this.setState(HolochainConnectionState.Disconnected)
  }

  getState(): HolochainConnectionState {
    return this.state
  }

  async installApp(dnas: Dna[], agentKey?: Uint8Array): Promise<InstalledCell[]> {
    const agent = agentKey ?? crypto.getRandomValues(new Uint8Array(32))
    return dnas.map((dna) => ({
      cellId: {
        dnaHash: crypto.getRandomValues(new Uint8Array(32)),
        agentPubKey: agent
      },
      nick: dna.nick
    }))
  }

  async callZome(_cellId: CellId, zomeName: string, fnName: string, payload: any): Promise<any> {
    const key = `${zomeName}/${fnName}`
    const handler = this.handlers.get(key)
    if (!handler) {
      throw new Error(`No mock handler for ${key}`)
    }
    return handler(payload)
  }

  registerHandler(zomeName: string, fnName: string, handler: (payload: any) => any): void {
    this.handlers.set(`${zomeName}/${fnName}`, handler)
  }

  emitSignal(signal: HolochainSignal): void {
    for (const cb of this.signalCallbacks) cb(signal)
  }

  onSignal(callback: (signal: HolochainSignal) => void): () => void {
    this.signalCallbacks.add(callback)
    return () => {
      this.signalCallbacks.delete(callback)
    }
  }

  onStateChange(callback: HolochainConnectionListener): () => void {
    this.stateCallbacks.add(callback)
    return () => {
      this.stateCallbacks.delete(callback)
    }
  }
}
