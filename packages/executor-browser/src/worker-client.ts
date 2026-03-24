import type { WorkerRequest, WorkerResponse, WorkerSubscriptionEvent, WorkerMessage } from './protocol'

const DEFAULT_TIMEOUT = 30000

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Tab-side client that connects to the SharedWorker executor.
 * Provides a GraphQL-compatible interface via postMessage.
 */
export class WorkerClient {
  private port: MessagePort | null = null
  private pending = new Map<string, PendingRequest>()
  private subscriptionListeners = new Map<string, Set<(payload: unknown) => void>>()
  private worker: SharedWorker | null = null
  private timeout: number

  constructor(workerUrl: string | URL, options?: { timeout?: number }) {
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT
    this.worker = new SharedWorker(workerUrl, { type: 'module' })
    this.port = this.worker.port
    this.port.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleMessage(event.data)
    this.port.start()
  }

  private handleMessage(msg: WorkerMessage): void {
    if (msg.type === 'graphql-response') {
      const resp = msg as WorkerResponse
      const pending = this.pending.get(resp.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(resp.id)
        if (resp.error) {
          pending.reject(new Error(resp.error))
        } else {
          pending.resolve(resp.result)
        }
      }
    } else if (msg.type === 'subscription-event') {
      const sub = msg as WorkerSubscriptionEvent
      const listeners = this.subscriptionListeners.get(sub.eventType)
      if (listeners) {
        for (const cb of listeners) cb(sub.payload)
      }
    }
  }

  async execute(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    if (!this.port) throw new Error('WorkerClient not connected')
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('GraphQL request timeout'))
      }, this.timeout)
      this.pending.set(id, { resolve, reject, timer })
      const req: WorkerRequest = { type: 'graphql', id, query, variables }
      this.port!.postMessage(req)
    })
  }

  subscribe(eventType: string, callback: (payload: unknown) => void): () => void {
    if (!this.subscriptionListeners.has(eventType)) {
      this.subscriptionListeners.set(eventType, new Set())
    }
    this.subscriptionListeners.get(eventType)!.add(callback)
    return () => {
      this.subscriptionListeners.get(eventType)?.delete(callback)
    }
  }

  destroy(): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('WorkerClient destroyed'))
    }
    this.pending.clear()
    this.subscriptionListeners.clear()
    this.port?.close()
    this.port = null
    this.worker = null
  }
}
