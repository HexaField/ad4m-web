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
    for (const [, p] of this.pending) p.reject(new Error('Disconnected'))
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

    const source = request.happPath
      ? { type: 'path', value: request.happPath }
      : { type: 'bytes', value: request.happBytes }

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
    })) as {
      type: string
      value: { installed_app_id: string; cell_info: Record<string, { type: string; value: any }[]> }
    }

    const appId = installResponse.value.installed_app_id

    await this.sendAdminRequest({
      type: 'enable_app',
      value: { installed_app_id: appId }
    })

    const attachResponse = (await this.sendAdminRequest({
      type: 'attach_app_interface',
      value: { port: 0, allowed_origins: '*', installed_app_id: appId }
    })) as { type: string; value: { port: number } }

    const appPort = attachResponse.value.port

    const tokenResponse = (await this.sendAdminRequest({
      type: 'issue_app_authentication_token',
      value: { installed_app_id: appId, single_use: false, expiry_seconds: 0 }
    })) as { type: string; value: { token: Uint8Array } }

    const token = tokenResponse.value.token

    const baseUrl = this.adminUrl.replace(/:\d+/, `:${appPort}`)
    this.appWs = await this.connectWs(baseUrl)
    this.setupMessageHandler(this.appWs)

    const authData = encode({ token })
    const authMsg = encode({ type: 'authenticate', data: authData })
    this.appWs.send(authMsg)

    const cellInfo: Record<
      string,
      { provisioned: { cellId: [Uint8Array, Uint8Array]; dnaModifiers: Record<string, unknown>; name: string } }[]
    > = {}
    const rawCellInfo = installResponse.value.cell_info
    for (const [role, cells] of Object.entries(rawCellInfo)) {
      cellInfo[role] = (
        cells as { type: string; value: { cell_id: [Uint8Array, Uint8Array]; dna_modifiers: any; name: string } }[]
      ).map((c) => ({
        provisioned: {
          cellId: c.value.cell_id,
          dnaModifiers: c.value.dna_modifiers,
          name: c.value.name
        }
      }))
    }

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

  async grantCapability(cellId: CellId, signer: ZomeCallSigner): Promise<void> {
    if (!this.adminWs) throw new Error('Not connected')
    await this.sendAdminRequest({
      type: 'grant_zome_call_capability',
      value: {
        cell_id: [cellId.dnaHash, cellId.agentPubKey],
        cap_grant: {
          tag: 'ad4m-web',
          access: {
            type: 'assigned',
            value: {
              secret: signer.capSecret,
              assignees: [signer.agentPubKey]
            }
          },
          functions: { type: 'all' }
        }
      }
    })
  }

  async callZome(
    cellId: CellId,
    zomeName: string,
    fnName: string,
    payload: unknown,
    signer: ZomeCallSigner
  ): Promise<unknown> {
    if (!this.appWs) throw new Error('Not connected to app interface')

    const nonce = new Uint8Array(32)
    crypto.getRandomValues(nonce)
    const expiresAt = (Date.now() + 300000) * 1000

    const zomeCallParams = {
      provenance: signer.agentPubKey,
      cell_id: [cellId.dnaHash, cellId.agentPubKey],
      zome_name: zomeName,
      fn_name: fnName,
      cap_secret: signer.capSecret,
      payload: encode(payload),
      nonce,
      expires_at: expiresAt
    }

    const paramsBytes = encode(zomeCallParams)
    const hashBuf = await crypto.subtle.digest('SHA-512', paramsBytes)
    const signature = await signer.sign(new Uint8Array(hashBuf))

    const response = await this.sendAppRequest({
      type: 'call_zome',
      value: {
        bytes: paramsBytes,
        signature
      }
    })

    if (!response || typeof response !== 'object') return response
    const typed = response as { type?: string; value?: unknown }
    if (typed.type === 'zome_called' && typed.value instanceof Uint8Array) {
      try {
        return decode(typed.value)
      } catch {
        return typed.value
      }
    }

    return response
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
            const responseData = decode(msg.data as Uint8Array)
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
    return this.sendRequest(this.adminWs!, request, 'admin')
  }

  private async sendAppRequest(request: Record<string, unknown>): Promise<unknown> {
    return this.sendRequest(this.appWs!, request, 'app')
  }

  private async sendRequest(ws: WebSocket, request: Record<string, unknown>, label: string): Promise<unknown> {
    const id = this.requestId++
    const innerData = encode(request)
    const msg = encode({ type: 'request', id, data: innerData })

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      ws.send(msg)

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`${label} request ${request.type} timed out`))
        }
      }, 30000)
    })
  }
}
