import type {
  HolochainConductor,
  HolochainConfig,
  CellId,
  InstalledAppInfo,
  InstallAppRequest,
  HolochainSignal,
  HolochainConnectionListener
} from '@ad4m-web/core'
import { HolochainConnectionState } from '@ad4m-web/core'
import { encode, decode } from '@msgpack/msgpack'

export class WebSocketHolochainConductor implements HolochainConductor {
  private adminWs: WebSocket | null = null
  private appWs: WebSocket | null = null
  private state: HolochainConnectionState = HolochainConnectionState.Disconnected
  private requestId = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private signalCallbacks: ((signal: HolochainSignal) => void)[] = []
  private stateCallbacks: HolochainConnectionListener[] = []
  private adminUrl = ''

  async connect(config: HolochainConfig): Promise<void> {
    this.setState(HolochainConnectionState.Connecting)
    this.adminUrl = config.conductorAdminUrl

    try {
      this.adminWs = await this.connectWs(config.conductorAdminUrl)
      this.setupMessageHandler(this.adminWs)
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
    for (const [, p] of this.pending) {
      p.reject(new Error('Disconnected'))
    }
    this.pending.clear()
    this.setState(HolochainConnectionState.Disconnected)
  }

  getState(): HolochainConnectionState {
    return this.state
  }

  async generateAgentPubKey(): Promise<Uint8Array> {
    if (!this.adminWs) throw new Error('Not connected')
    const response = await this.sendAdminRequest({ type: 'generate_agent_pub_key' })
    return (response as { type: string; value: Uint8Array }).value
  }

  async installApp(request: InstallAppRequest): Promise<InstalledAppInfo> {
    if (!this.adminWs) throw new Error('Not connected')

    const source = request.happPath ? { path: request.happPath } : { bundle: request.happBytes }

    // Install
    const installResponse = (await this.sendAdminRequest({
      type: 'install_app',
      value: {
        source,
        agent_key: request.agentKey ?? null,
        installed_app_id: request.installedAppId,
        network_seed: request.networkSeed ?? null,
        roles_settings: null,
        ignore_genesis_failure: false
      }
    })) as { type: string; value: { installed_app_id: string; cell_info: Record<string, unknown[]> } }

    const appId = installResponse.value.installed_app_id

    // Enable
    await this.sendAdminRequest({
      type: 'enable_app',
      value: { installed_app_id: appId }
    })

    // Attach app interface
    const attachResponse = (await this.sendAdminRequest({
      type: 'attach_app_interface',
      value: { port: 0, allowed_origins: '*', installed_app_id: appId }
    })) as { type: string; value: { port: number } }

    const appPort = attachResponse.value.port

    // Issue auth token
    const tokenResponse = (await this.sendAdminRequest({
      type: 'issue_app_authentication_token',
      value: { installed_app_id: appId, single_use: false, expiry_seconds: 0 }
    })) as { type: string; value: { token: Uint8Array } }

    const token = tokenResponse.value.token

    // Connect to app interface
    const baseUrl = this.adminUrl.replace(/:\d+/, `:${appPort}`)
    this.appWs = await this.connectWs(baseUrl)
    this.setupMessageHandler(this.appWs)

    // Authenticate
    const authData = encode({ token })
    const authMsg = encode({ type: 'authenticate', data: authData })
    this.appWs.send(authMsg)

    // Parse cell_info
    const cellInfo: Record<
      string,
      { provisioned: { cellId: [Uint8Array, Uint8Array]; dnaModifiers: Record<string, unknown>; name: string } }[]
    > = {}
    const rawCellInfo = installResponse.value.cell_info as Record<string, unknown[]>
    for (const [role, cells] of Object.entries(rawCellInfo)) {
      cellInfo[role] = (
        cells as {
          provisioned: { cell_id: [Uint8Array, Uint8Array]; dna_modifiers: Record<string, unknown>; name: string }
        }[]
      ).map((c) => ({
        provisioned: {
          cellId: c.provisioned.cell_id,
          dnaModifiers: c.provisioned.dna_modifiers,
          name: c.provisioned.name
        }
      }))
    }

    // Determine agent key from first cell
    let agentKey = new Uint8Array(0)
    for (const cells of Object.values(cellInfo)) {
      if (cells.length > 0) {
        agentKey = cells[0].provisioned.cellId[1]
        break
      }
    }

    return {
      installedAppId: appId,
      agentKey,
      cellInfo
    }
  }

  async callZome(cellId: CellId, zomeName: string, fnName: string, payload: unknown): Promise<unknown> {
    if (!this.appWs) throw new Error('Not connected to app interface')

    const nonce = new Uint8Array(32)
    crypto.getRandomValues(nonce)
    const expiresAt = BigInt((Date.now() + 300000) * 1000) // 5 min from now in microseconds

    const innerPayload = encode({
      type: 'call_zome',
      value: {
        cell_id: [cellId.dnaHash, cellId.agentPubKey],
        zome_name: zomeName,
        fn_name: fnName,
        payload: encode(payload),
        provenance: cellId.agentPubKey,
        nonce,
        expires_at: expiresAt
      }
    })

    const id = this.requestId++
    const msg = encode({ type: 'request', id, data: innerPayload })

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.appWs!.send(msg)

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Request callZome ${zomeName}/${fnName} timed out`))
        }
      }, 30000)
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
      const msg = decode(raw) as Record<string, unknown>

      if (msg.type === 'signal') {
        const signalData = decode(msg.data as Uint8Array) as { cell_id: [Uint8Array, Uint8Array]; payload: unknown }
        const signal: HolochainSignal = {
          cellId: { dnaHash: signalData.cell_id[0], agentPubKey: signalData.cell_id[1] },
          payload: signalData.payload
        }
        for (const cb of this.signalCallbacks) cb(signal)
      } else if (msg.type === 'response') {
        const pending = this.pending.get(msg.id as number)
        if (pending) {
          this.pending.delete(msg.id as number)
          if (msg.data) {
            const responseData = decode(msg.data as Uint8Array) as { type: string; value: unknown }
            pending.resolve(responseData)
          } else {
            pending.resolve(null)
          }
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

  private async sendAdminRequest(request: Record<string, unknown>): Promise<unknown> {
    const id = this.requestId++
    const innerData = encode(request)
    const msg = encode({ type: 'request', id, data: innerData })

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.adminWs!.send(msg)

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Admin request ${request.type} timed out`))
        }
      }, 30000)
    })
  }
}
