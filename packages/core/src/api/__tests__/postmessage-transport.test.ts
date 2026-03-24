import { describe, it, expect, vi } from 'vitest'
import { PostMessageTransportServer, createPostMessageTransportClient } from '../postmessage-transport'
import type { ExecutorAPI } from '../executor-api'

vi.stubGlobal('crypto', {
  randomUUID: () => 'test-' + Math.random().toString(36).slice(2)
})

// Simple MessageChannel mock
class MockMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null
  private other: MockMessagePort | null = null

  start(): void {}
  close(): void {}

  _connect(other: MockMessagePort): void {
    this.other = other
    other.other = this
  }

  postMessage(data: unknown): void {
    if (this.other?.onmessage) {
      // Async to simulate real postMessage
      const handler = this.other.onmessage
      setTimeout(() => handler(new MessageEvent('message', { data })), 0)
    }
  }
}

function createMockChannel(): [MockMessagePort, MockMessagePort] {
  const p1 = new MockMessagePort()
  const p2 = new MockMessagePort()
  p1._connect(p2)
  return [p1, p2]
}

function createMockAPI(): ExecutorAPI {
  return {
    agentStatus: vi.fn().mockResolvedValue({
      did: 'did:test:123',
      didDocument: null,
      error: null,
      isInitialized: true,
      isUnlocked: true
    }),
    perspectives: vi.fn().mockResolvedValue([{ uuid: 'p1', name: 'Test', state: 'Private' }]),
    perspectiveAdd: vi.fn().mockResolvedValue({ uuid: 'p2', name: 'New', state: 'Private' })
  } as unknown as ExecutorAPI
}

describe('PostMessageTransport', () => {
  it('proxies method calls from client to server', async () => {
    const [serverPort, clientPort] = createMockChannel()
    const api = createMockAPI()
    new PostMessageTransportServer(api, serverPort as unknown as MessagePort)
    const client = createPostMessageTransportClient(clientPort as unknown as MessagePort, { timeout: 5000 })

    const status = await client.agentStatus()
    expect(status).toEqual({
      did: 'did:test:123',
      didDocument: null,
      error: null,
      isInitialized: true,
      isUnlocked: true
    })
    expect(api.agentStatus).toHaveBeenCalled()
  })

  it('passes arguments correctly', async () => {
    const [serverPort, clientPort] = createMockChannel()
    const api = createMockAPI()
    new PostMessageTransportServer(api, serverPort as unknown as MessagePort)
    const client = createPostMessageTransportClient(clientPort as unknown as MessagePort, { timeout: 5000 })

    await client.perspectiveAdd('New Perspective')
    expect(api.perspectiveAdd).toHaveBeenCalledWith('New Perspective')
  })

  it('rejects on unknown method', async () => {
    const [serverPort, clientPort] = createMockChannel()
    const api = createMockAPI()
    new PostMessageTransportServer(api, serverPort as unknown as MessagePort)
    const client = createPostMessageTransportClient(clientPort as unknown as MessagePort, { timeout: 5000 })

    await expect((client as any).nonExistentMethod()).rejects.toThrow('Unknown API method')
  })

  it('rejects on timeout', async () => {
    const [, clientPort] = createMockChannel()
    // No server connected
    const client = createPostMessageTransportClient(clientPort as unknown as MessagePort, { timeout: 100 })

    await expect(client.agentStatus()).rejects.toThrow('API call timeout')
  })
})
