import type {
  HolochainConductor,
  HolochainConfig,
  CellId,
  InstalledCell,
  HolochainSignal,
  HolochainConnectionListener
} from '@ad4m-web/core'
import { HolochainConnectionState } from '@ad4m-web/core'
import type { Dna } from '@ad4m-web/core'
import { WebSocketHolochainConductor } from './ws-conductor'

interface QueuedCall {
  cellId: CellId
  zomeName: string
  fnName: string
  payload: any
  resolve: (v: any) => void
  reject: (e: Error) => void
}

export class ReconnectingHolochainConductor implements HolochainConductor {
  private inner: WebSocketHolochainConductor
  private config: HolochainConfig | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private maxRetries: number
  private baseDelayMs: number
  private queue: QueuedCall[] = []
  private signalCallbacks: ((signal: HolochainSignal) => void)[] = []
  private stateCallbacks: HolochainConnectionListener[] = []

  constructor(options?: { maxRetries?: number; baseDelayMs?: number }) {
    this.maxRetries = options?.maxRetries ?? 10
    this.baseDelayMs = options?.baseDelayMs ?? 1000
    this.inner = new WebSocketHolochainConductor()

    // Monitor inner state for auto-reconnect
    this.inner.onStateChange((state) => {
      for (const cb of this.stateCallbacks) cb(state)

      if (state === HolochainConnectionState.Connected) {
        this.retryCount = 0
        this.drainQueue()
      }

      if (
        (state === HolochainConnectionState.Disconnected || state === HolochainConnectionState.Error) &&
        this.config
      ) {
        this.scheduleReconnect()
      }
    })

    // Forward signals
    this.inner.onSignal((signal) => {
      for (const cb of this.signalCallbacks) cb(signal)
    })
  }

  async connect(config: HolochainConfig): Promise<void> {
    this.config = config
    this.retryCount = 0
    await this.inner.connect(config)
  }

  async disconnect(): Promise<void> {
    this.config = null
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    // Reject queued calls
    for (const q of this.queue) {
      q.reject(new Error('Disconnected'))
    }
    this.queue = []
    await this.inner.disconnect()
  }

  getState(): HolochainConnectionState {
    return this.inner.getState()
  }

  async installApp(dnas: Dna[], agentKey?: Uint8Array): Promise<InstalledCell[]> {
    return this.inner.installApp(dnas, agentKey)
  }

  async callZome(cellId: CellId, zomeName: string, fnName: string, payload: any): Promise<any> {
    if (this.inner.getState() === HolochainConnectionState.Connected) {
      return this.inner.callZome(cellId, zomeName, fnName, payload)
    }

    // Queue during reconnection
    return new Promise((resolve, reject) => {
      this.queue.push({ cellId, zomeName, fnName, payload, resolve, reject })
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.config) return
    if (this.retryCount >= this.maxRetries) {
      // Reject all queued calls
      for (const q of this.queue) {
        q.reject(new Error('Max reconnection attempts exceeded'))
      }
      this.queue = []
      return
    }

    const delay = Math.min(this.baseDelayMs * Math.pow(2, this.retryCount), 30000)
    this.retryCount++

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        this.inner = new WebSocketHolochainConductor()
        this.inner.onStateChange((state) => {
          for (const cb of this.stateCallbacks) cb(state)
          if (state === HolochainConnectionState.Connected) {
            this.retryCount = 0
            this.drainQueue()
          }
          if (
            (state === HolochainConnectionState.Disconnected || state === HolochainConnectionState.Error) &&
            this.config
          ) {
            this.scheduleReconnect()
          }
        })
        this.inner.onSignal((signal) => {
          for (const cb of this.signalCallbacks) cb(signal)
        })
        await this.inner.connect(this.config!)
      } catch {
        this.scheduleReconnect()
      }
    }, delay)
  }

  private async drainQueue(): Promise<void> {
    const queued = this.queue.splice(0)
    for (const q of queued) {
      try {
        const result = await this.inner.callZome(q.cellId, q.zomeName, q.fnName, q.payload)
        q.resolve(result)
      } catch (e: any) {
        q.reject(e)
      }
    }
  }
}
