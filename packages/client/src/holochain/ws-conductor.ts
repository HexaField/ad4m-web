import type {
  HolochainConductor,
  HolochainConfig,
  CellId,
  InstalledCell,
  HolochainSignal,
  HolochainConnectionListener
} from '@ad4m-web/core'
import { HolochainConnectionState } from '@ad4m-web/core'
import { encode, decode } from '@msgpack/msgpack'
import type { Dna } from '@ad4m-web/core'

export class WebSocketHolochainConductor implements HolochainConductor {
  private adminWs: WebSocket | null = null
  private appWs: WebSocket | null = null
  private state: HolochainConnectionState = HolochainConnectionState.Disconnected
  private requestId = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private signalCallbacks: ((signal: HolochainSignal) => void)[] = []
  private stateCallbacks: HolochainConnectionListener[] = []

  async connect(config: HolochainConfig): Promise<void> {
    this.setState(HolochainConnectionState.Connecting)

    try {
      this.adminWs = await this.connectWs(config.conductorAdminUrl)
      this.appWs = await this.connectWs(config.conductorAppUrl)

      this.setupMessageHandler(this.adminWs)
      this.setupMessageHandler(this.appWs)

      this.setState(HolochainConnectionState.Connected)
    } catch (err) {
      this.setState(HolochainConnectionState.Error)
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.adminWs?.close()
    this.appWs?.close()
    this.adminWs = null
    this.appWs = null
    for (const [id, p] of this.pending) {
      p.reject(new Error('Disconnected'))
    }
    this.pending.clear()
    this.setState(HolochainConnectionState.Disconnected)
  }

  getState(): HolochainConnectionState {
    return this.state
  }

  async installApp(dnas: Dna[], agentKey?: Uint8Array): Promise<InstalledCell[]> {
    if (!this.adminWs) throw new Error('Not connected')

    const appId = `app-${Date.now()}`
    const result = await this.callAdmin('InstallApp', {
      installed_app_id: appId,
      agent_key: agentKey ?? null,
      dnas: dnas.map((d) => ({
        hash: d.file?.data ?? null,
        nick: d.nick ?? 'default'
      }))
    })

    await this.callAdmin('EnableApp', { installed_app_id: appId })

    return (
      (result as any).cell_info?.map((info: any) => ({
        cellId: { dnaHash: info.cell_id[0], agentPubKey: info.cell_id[1] },
        nick: info.nick
      })) ?? []
    )
  }

  async callZome(cellId: CellId, zomeName: string, fnName: string, payload: any): Promise<any> {
    if (!this.appWs) throw new Error('Not connected')

    return this.callApp('CallZome', {
      cell_id: [cellId.dnaHash, cellId.agentPubKey],
      zome_name: zomeName,
      fn_name: fnName,
      payload: encode(payload),
      provenance: cellId.agentPubKey
    })
  }

  onSignal(callback: (signal: HolochainSignal) => void): () => void {
    this.signalCallbacks.push(callback)
    return () => {
      const idx = this.signalCallbacks.indexOf(callback)
      if (idx >= 0) this.signalCallbacks.splice(idx, 1)
    }
  }

  onStateChange(callback: HolochainConnectionListener): () => void {
    this.stateCallbacks.push(callback)
    return () => {
      const idx = this.stateCallbacks.indexOf(callback)
      if (idx >= 0) this.stateCallbacks.splice(idx, 1)
    }
  }

  // Private helpers

  private setupMessageHandler(ws: WebSocket): void {
    ws.addEventListener('message', async (event) => {
      const raw =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new Uint8Array(await (event.data as Blob).arrayBuffer())
      const msg = decode(raw) as any

      if (msg.type === 'Signal') {
        const signalData = decode(msg.data as Uint8Array) as any
        const signal: HolochainSignal = {
          cellId: { dnaHash: signalData.cell_id[0], agentPubKey: signalData.cell_id[1] },
          payload: signalData.payload
        }
        for (const cb of this.signalCallbacks) cb(signal)
      } else if (msg.type === 'Response') {
        const pending = this.pending.get(msg.id)
        if (pending) {
          this.pending.delete(msg.id)
          const responseData = decode(msg.data as Uint8Array)
          pending.resolve(responseData)
        }
      }
    })
  }

  private async connectWs(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => resolve(ws)
      ws.onerror = () => reject(new Error(`WebSocket connection failed to ${url}`))
    })
  }

  private setState(state: HolochainConnectionState): void {
    this.state = state
    for (const cb of this.stateCallbacks) cb(state)
  }

  private async callAdmin(method: string, payload: any): Promise<any> {
    return this.sendRequest(this.adminWs!, method, payload)
  }

  private async callApp(method: string, payload: any): Promise<any> {
    return this.sendRequest(this.appWs!, method, payload)
  }

  private async sendRequest(ws: WebSocket, _method: string, payload: any): Promise<any> {
    const id = this.requestId++
    const data = encode(payload)
    const msg = encode({ type: 'Request', id, data })

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      ws.send(msg)

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Request ${_method} timed out`))
        }
      }, 30000)
    })
  }
}
