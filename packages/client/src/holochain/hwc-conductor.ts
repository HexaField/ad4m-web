import type {
  HolochainConductor,
  HolochainConfig,
  CellId,
  InstalledAppInfo,
  InstallAppRequest,
  HolochainSignal,
  HolochainConnectionListener,
  ZomeCallSigner
} from '@ad4m-web/core'
import { HolochainConnectionState } from '@ad4m-web/core'

/**
 * Types for the Holo Web Conductor browser extension API (`window.holochain`).
 * These mirror the HWC extension's public interface.
 */

interface HWCCallZomeParams {
  cell_id: [Uint8Array, Uint8Array]
  zome_name: string
  fn_name: string
  payload?: unknown
  provenance?: Uint8Array
  cap_secret?: Uint8Array
}

interface HWCInstallAppRequest {
  bundle: Uint8Array | number[]
  installedAppId?: string
  membraneProofs?: Record<string, Uint8Array | number[]>
  dnaModifiers?: { networkSeed?: string; properties?: Record<string, unknown> }
}

interface HWCAppInfo {
  contextId: string
  agentPubKey: Uint8Array | number[]
  cells: Array<[Uint8Array | number[], Uint8Array | number[]]>
  dnaProperties?: Record<string, Record<string, unknown>>
  status?: string
}

type HWCConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

interface HolochainAPI {
  isWebConductor: boolean
  version: string
  myPubKey: Uint8Array | null
  installedAppId: string | null
  connect(): Promise<void>
  disconnect(): Promise<void>
  callZome(params: HWCCallZomeParams): Promise<unknown>
  appInfo(installedAppId?: string): Promise<HWCAppInfo | null>
  installApp(request: HWCInstallAppRequest): Promise<void>
  configureNetwork(config: { linkerUrl: string }): Promise<void>
  on(event: 'signal', callback: (signal: unknown) => void): () => void
  onConnectionChange(callback: (status: HWCConnectionStatus) => void): () => void
  provideMemproofs(params: { contextId?: string; memproofs: Record<string, Uint8Array | number[]> }): Promise<void>
}

declare global {
  interface Window {
    holochain?: HolochainAPI
  }
}

function mapConnectionStatus(status: HWCConnectionStatus): HolochainConnectionState {
  switch (status) {
    case 'connected':
      return HolochainConnectionState.Connected
    case 'connecting':
      return HolochainConnectionState.Connecting
    case 'disconnected':
      return HolochainConnectionState.Disconnected
    case 'error':
      return HolochainConnectionState.Error
    default:
      return HolochainConnectionState.Disconnected
  }
}

function toUint8Array(data: Uint8Array | number[]): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

/**
 * HolochainConductor implementation that delegates to the Holo Web Conductor (HWC)
 * browser extension. HWC runs a full Holochain conductor inside the browser extension
 * and exposes it via `window.holochain`.
 *
 * Key differences from WebSocketHolochainConductor:
 * - No WebSocket connections — all calls go through the extension's JS API
 * - Signing is handled internally by the extension's Lair keystore
 * - The ZomeCallSigner returned by createSigningCredentials is a pass-through;
 *   actual signing happens inside the extension during callZome
 */
export class HWCConductor implements HolochainConductor {
  private state: HolochainConnectionState = HolochainConnectionState.Disconnected
  private stateCallbacks: HolochainConnectionListener[] = []
  private signalCallbacks: ((signal: HolochainSignal) => void)[] = []
  private unsubConnectionChange: (() => void) | null = null

  private getExtension(): HolochainAPI {
    const api = typeof window !== 'undefined' ? window.holochain : undefined
    if (!api?.isWebConductor) {
      throw new Error(
        'Holo Web Conductor extension not detected. ' +
          'Install the HWC browser extension from https://github.com/Holo-Host/holo-web-conductor'
      )
    }
    return api
  }

  async connect(config: HolochainConfig): Promise<void> {
    const api = this.getExtension()
    this.setState(HolochainConnectionState.Connecting)

    try {
      await api.connect()

      if (config.linkerUrl) {
        await api.configureNetwork({ linkerUrl: config.linkerUrl })
      }

      // Subscribe to connection status changes from the extension
      this.unsubConnectionChange = api.onConnectionChange((status) => {
        this.setState(mapConnectionStatus(status))
      })

      this.setState(HolochainConnectionState.Connected)
    } catch (err) {
      this.setState(HolochainConnectionState.Error)
      throw new Error(`HWC connect failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async disconnect(): Promise<void> {
    try {
      const api = this.getExtension()
      await api.disconnect()
    } catch {
      // Extension may already be gone
    }
    this.unsubConnectionChange?.()
    this.unsubConnectionChange = null
    this.setState(HolochainConnectionState.Disconnected)
  }

  getState(): HolochainConnectionState {
    return this.state
  }

  async generateAgentPubKey(): Promise<Uint8Array> {
    const api = this.getExtension()
    if (!api.myPubKey) {
      // Ensure connected so the extension has generated a key
      await api.connect()
    }
    if (!api.myPubKey) {
      throw new Error('HWC: agent public key not available after connect')
    }
    return toUint8Array(api.myPubKey)
  }

  async installApp(request: InstallAppRequest): Promise<InstalledAppInfo> {
    const api = this.getExtension()

    if (!request.happBytes) {
      throw new Error('HWC requires happBytes (the .happ bundle as Uint8Array). happPath is not supported.')
    }

    const hwcRequest: HWCInstallAppRequest = {
      bundle: request.happBytes,
      installedAppId: request.installedAppId,
      dnaModifiers: request.networkSeed ? { networkSeed: request.networkSeed } : undefined
    }

    try {
      await api.installApp(hwcRequest)
    } catch (err) {
      throw new Error(`HWC installApp failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    // After install, fetch app info to build our InstalledAppInfo
    const appInfo = await api.appInfo(request.installedAppId)
    if (!appInfo) {
      throw new Error(`HWC: appInfo returned null after installing ${request.installedAppId}`)
    }

    const agentKey = toUint8Array(appInfo.agentPubKey)

    // Map HWC cells to our CellInfo format
    // HWC returns cells as Array<[dnaHash, agentPubKey]>
    const cellInfo: Record<
      string,
      { provisioned: { cellId: [Uint8Array, Uint8Array]; dnaModifiers: Record<string, unknown>; name: string } }[]
    > = {}

    // HWC doesn't provide role names in cells array, so we use a single "default" role
    // Assumption: HWC's flat cell list maps to a single role. If HWC adds role info later, update this.
    const cells = appInfo.cells.map((cell) => ({
      provisioned: {
        cellId: [toUint8Array(cell[0]), toUint8Array(cell[1])] as [Uint8Array, Uint8Array],
        dnaModifiers: appInfo.dnaProperties ?? {},
        name: request.installedAppId
      }
    }))

    if (cells.length > 0) {
      cellInfo['default'] = cells
    }

    return {
      installedAppId: request.installedAppId,
      agentKey,
      cellInfo
    }
  }

  /**
   * No-op for HWC — the extension handles capability grants internally
   * through its built-in Lair keystore.
   */
  async grantCapability(_cellId: CellId, _signer: ZomeCallSigner): Promise<void> {
    // HWC manages signing and capabilities internally
  }

  /**
   * Creates a pass-through ZomeCallSigner. HWC handles actual signing internally,
   * so the signer's `sign()` returns a dummy signature. The real signing happens
   * inside the extension when `callZome` is invoked.
   */
  async createSigningCredentials(_cellId: CellId): Promise<ZomeCallSigner> {
    const api = this.getExtension()
    const agentPubKey = api.myPubKey ? toUint8Array(api.myPubKey) : new Uint8Array(39)

    // Dummy cap secret — HWC doesn't use external cap secrets
    const capSecret = new Uint8Array(64)

    return {
      agentPubKey,
      capSecret,
      async sign(_data: Uint8Array): Promise<Uint8Array> {
        // HWC signs internally during callZome — this is a pass-through
        return new Uint8Array(64)
      }
    }
  }

  async callZome(
    cellId: CellId,
    zomeName: string,
    fnName: string,
    payload: unknown,
    signer: ZomeCallSigner
  ): Promise<unknown> {
    const api = this.getExtension()

    try {
      return await api.callZome({
        cell_id: [cellId.dnaHash, cellId.agentPubKey],
        zome_name: zomeName,
        fn_name: fnName,
        payload,
        provenance: signer.agentPubKey,
        cap_secret: signer.capSecret
      })
    } catch (err) {
      throw new Error(`HWC callZome ${zomeName}/${fnName} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  onSignal(callback: (signal: HolochainSignal) => void): () => void {
    this.signalCallbacks.push(callback)

    let unsubExtension: (() => void) | null = null
    try {
      const api = this.getExtension()
      unsubExtension = api.on('signal', (rawSignal: unknown) => {
        // Map raw HWC signal to our HolochainSignal type
        const sig = rawSignal as { cell_id?: [Uint8Array, Uint8Array]; payload?: unknown }
        if (sig.cell_id) {
          const signal: HolochainSignal = {
            cellId: {
              dnaHash: toUint8Array(sig.cell_id[0]),
              agentPubKey: toUint8Array(sig.cell_id[1])
            },
            payload: sig.payload
          }
          for (const cb of this.signalCallbacks) cb(signal)
        }
      })
    } catch {
      // Extension not available yet — signals will work after connect
    }

    return () => {
      const idx = this.signalCallbacks.indexOf(callback)
      if (idx >= 0) this.signalCallbacks.splice(idx, 1)
      unsubExtension?.()
    }
  }

  onStateChange(callback: HolochainConnectionListener): () => void {
    this.stateCallbacks.push(callback)
    return () => {
      const idx = this.stateCallbacks.indexOf(callback)
      if (idx >= 0) this.stateCallbacks.splice(idx, 1)
    }
  }

  private setState(state: HolochainConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }
}
