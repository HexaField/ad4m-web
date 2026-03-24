import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkerClient } from '../worker-client'
import type { WorkerResponse, WorkerSubscriptionEvent } from '../protocol'

// Mock SharedWorker since it's not available in Node
class MockMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null
  private otherEnd: MockMessagePort | null = null

  start(): void {}
  close(): void {}

  postMessage(data: unknown): void {
    // Emit to the other end
    if (this.otherEnd?.onmessage) {
      this.otherEnd.onmessage(new MessageEvent('message', { data }))
    }
  }

  _setOtherEnd(port: MockMessagePort): void {
    this.otherEnd = port
  }
}

let workerPort: MockMessagePort
let clientPort: MockMessagePort

vi.stubGlobal(
  'SharedWorker',
  class MockSharedWorker {
    port: MockMessagePort
    constructor(_url: string | URL) {
      clientPort = new MockMessagePort()
      workerPort = new MockMessagePort()
      clientPort._setOtherEnd(workerPort)
      workerPort._setOtherEnd(clientPort)
      this.port = clientPort
    }
  }
)

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2)
})

describe('WorkerClient', () => {
  let client: WorkerClient

  beforeEach(() => {
    client = new WorkerClient('test-worker.js', { timeout: 1000 })
  })

  afterEach(() => {
    client.destroy()
  })

  it('sends graphql request and receives response', async () => {
    // Set up worker side to respond
    workerPort.onmessage = (event: MessageEvent) => {
      const req = event.data
      if (req.type === 'graphql') {
        const resp: WorkerResponse = {
          type: 'graphql-response',
          id: req.id,
          result: { data: { agentStatus: { isInitialized: true } } }
        }
        workerPort.postMessage(resp)
      }
    }

    const result = await client.execute('{ agentStatus { isInitialized } }')
    expect(result).toEqual({ data: { agentStatus: { isInitialized: true } } })
  })

  it('rejects on error response', async () => {
    workerPort.onmessage = (event: MessageEvent) => {
      const req = event.data
      if (req.type === 'graphql') {
        const resp: WorkerResponse = {
          type: 'graphql-response',
          id: req.id,
          result: null,
          error: 'Something went wrong'
        }
        workerPort.postMessage(resp)
      }
    }

    await expect(client.execute('{ bad }')).rejects.toThrow('Something went wrong')
  })

  it('times out if no response', async () => {
    // Don't set up worker response handler
    await expect(client.execute('{ slow }')).rejects.toThrow('GraphQL request timeout')
  })

  it('receives subscription events', async () => {
    const events: unknown[] = []
    client.subscribe('perspectiveAdded', (payload) => events.push(payload))

    // Simulate worker sending subscription event
    const subEvent: WorkerSubscriptionEvent = {
      type: 'subscription-event',
      eventType: 'perspectiveAdded',
      payload: { uuid: 'test-uuid', name: 'Test' }
    }
    workerPort.postMessage(subEvent)

    // Give it a tick
    await new Promise((r) => setTimeout(r, 10))
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ uuid: 'test-uuid', name: 'Test' })
  })

  it('unsubscribe stops receiving events', async () => {
    const events: unknown[] = []
    const unsub = client.subscribe('perspectiveAdded', (payload) => events.push(payload))
    unsub()

    const subEvent: WorkerSubscriptionEvent = {
      type: 'subscription-event',
      eventType: 'perspectiveAdded',
      payload: { uuid: 'test-uuid' }
    }
    workerPort.postMessage(subEvent)

    await new Promise((r) => setTimeout(r, 10))
    expect(events).toHaveLength(0)
  })

  it('destroy rejects pending requests', async () => {
    const promise = client.execute('{ slow }')
    client.destroy()
    await expect(promise).rejects.toThrow('WorkerClient destroyed')
  })
})
