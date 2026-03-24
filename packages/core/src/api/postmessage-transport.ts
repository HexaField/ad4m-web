import type { ExecutorAPI } from './executor-api'

// Message protocol for postMessage-based transport
interface TransportRequest {
  type: 'api-request'
  id: string
  method: string
  args: unknown[]
}

interface TransportResponse {
  type: 'api-response'
  id: string
  result?: unknown
  error?: string
}

type TransportMessage = TransportRequest | TransportResponse

/**
 * Server side of the PostMessage transport — runs inside the worker.
 * Wraps an ExecutorAPI and handles incoming requests on a MessagePort.
 */
export class PostMessageTransportServer {
  constructor(
    private api: ExecutorAPI,
    private port: MessagePort
  ) {
    this.port.onmessage = (event: MessageEvent<TransportMessage>) => {
      const msg = event.data
      if (msg.type === 'api-request') {
        this.handleRequest(msg as TransportRequest)
      }
    }
  }

  private async handleRequest(req: TransportRequest): Promise<void> {
    try {
      const method = this.api[req.method as keyof ExecutorAPI]
      if (typeof method !== 'function') {
        throw new Error(`Unknown API method: ${req.method}`)
      }
      const result = await (method as (...args: unknown[]) => Promise<unknown>).apply(this.api, req.args)
      const resp: TransportResponse = { type: 'api-response', id: req.id, result }
      this.port.postMessage(resp)
    } catch (err) {
      const resp: TransportResponse = { type: 'api-response', id: req.id, error: String(err) }
      this.port.postMessage(resp)
    }
  }

  destroy(): void {
    this.port.onmessage = null
  }
}

const DEFAULT_TIMEOUT = 30000

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Client side of the PostMessage transport — runs in the tab.
 * Implements ExecutorAPI by proxying all calls over a MessagePort.
 */
export function createPostMessageTransportClient(port: MessagePort, options?: { timeout?: number }): ExecutorAPI {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT
  const pending = new Map<string, PendingCall>()

  port.onmessage = (event: MessageEvent<TransportMessage>) => {
    const msg = event.data
    if (msg.type === 'api-response') {
      const resp = msg as TransportResponse
      const p = pending.get(resp.id)
      if (p) {
        clearTimeout(p.timer)
        pending.delete(resp.id)
        if (resp.error) {
          p.reject(new Error(resp.error))
        } else {
          p.resolve(resp.result)
        }
      }
    }
  }

  function call(method: string, args: unknown[]): Promise<unknown> {
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`API call timeout: ${method}`))
      }, timeout)
      pending.set(id, { resolve, reject, timer })
      const req: TransportRequest = { type: 'api-request', id, method, args }
      port.postMessage(req)
    })
  }

  // Build proxy that forwards all method calls
  return new Proxy({} as ExecutorAPI, {
    get(_target, prop: string) {
      if (prop === 'then') return undefined
      return (...args: unknown[]) => call(prop, args)
    }
  })
}
