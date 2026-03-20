import type {
  HolochainConductor,
  HolochainConfig,
  HolochainSignal,
  HolochainConnectionListener,
  CellId,
  InstalledAppInfo,
  InstallAppRequest,
  ZomeCallSigner
} from './types'
import { HolochainConnectionState } from './types'

export class MockHolochainConductor implements HolochainConductor {
  private state: HolochainConnectionState = HolochainConnectionState.Disconnected
  private signalCallbacks: Set<(signal: HolochainSignal) => void> = new Set()
  private stateCallbacks: Set<HolochainConnectionListener> = new Set()
  private handlers: Map<string, (payload: unknown) => unknown> = new Map()

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

  async generateAgentPubKey(): Promise<Uint8Array> {
    return crypto.getRandomValues(new Uint8Array(32))
  }

  async installApp(request: InstallAppRequest): Promise<InstalledAppInfo> {
    const agentKey = request.agentKey ?? crypto.getRandomValues(new Uint8Array(32))
    const dnaHash = crypto.getRandomValues(new Uint8Array(32))
    return {
      installedAppId: request.installedAppId,
      agentKey,
      cellInfo: {
        default: [
          {
            provisioned: {
              cellId: [dnaHash, agentKey],
              dnaModifiers: {},
              name: request.installedAppId
            }
          }
        ]
      }
    }
  }

  async grantCapability(_cellId: CellId, _signer: ZomeCallSigner): Promise<void> {
    // No-op in mock
  }

  async createSigningCredentials(_cellId: CellId): Promise<ZomeCallSigner> {
    const agentPubKey = crypto.getRandomValues(new Uint8Array(39))
    agentPubKey[0] = 132
    agentPubKey[1] = 32
    agentPubKey[2] = 36
    const capSecret = crypto.getRandomValues(new Uint8Array(64))
    return {
      agentPubKey,
      capSecret,
      async sign(_data: Uint8Array): Promise<Uint8Array> {
        return new Uint8Array(64) // mock signature
      }
    }
  }

  async callZome(
    _cellId: CellId,
    zomeName: string,
    fnName: string,
    payload: unknown,
    _signer: ZomeCallSigner
  ): Promise<unknown> {
    const key = `${zomeName}/${fnName}`
    const handler = this.handlers.get(key)
    if (!handler) throw new Error(`No mock handler for ${key}`)
    return handler(payload)
  }

  registerHandler(zomeName: string, fnName: string, handler: (payload: unknown) => unknown): void {
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
