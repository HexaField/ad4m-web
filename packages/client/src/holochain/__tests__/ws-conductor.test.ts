import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encode, decode } from '@msgpack/msgpack'
import { HolochainConnectionState } from '@ad4m-web/core'
import { WebSocketHolochainConductor } from '../ws-conductor'
import type { ZomeCallSigner } from '@ad4m-web/core'

class MockWebSocket {
  static instances: MockWebSocket[] = []

  binaryType = 'arraybuffer'
  onopen: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  sent: Uint8Array[] = []
  closeCalled = false
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }

  addEventListener(event: string, handler: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event)!.push(handler)
  }

  send(data: unknown) {
    this.sent.push(new Uint8Array(data as ArrayBuffer))
  }

  close() {
    this.closeCalled = true
  }

  simulateMessage(data: Uint8Array) {
    const buf = new ArrayBuffer(data.byteLength)
    new Uint8Array(buf).set(data)
    const handlers = this.listeners.get('message') ?? []
    for (const h of handlers) h({ data: buf })
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket as unknown)
  vi.stubGlobal('crypto', {
    getRandomValues: (arr: Uint8Array) => arr.fill(1),
    subtle: { digest: async () => new Uint8Array(64).buffer }
  } as unknown)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebSocketHolochainConductor', () => {
  it('starts in Disconnected state', () => {
    const conductor = new WebSocketHolochainConductor()
    expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
  })

  it('connect() creates admin WebSocket connection', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:4444')
    expect(conductor.getState()).toBe(HolochainConnectionState.Connected)
  })

  it('generateAgentPubKey sends correct admin request', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    const adminWs = MockWebSocket.instances[0]
    const agentKey = new Uint8Array(32).fill(42)

    const callPromise = conductor.generateAgentPubKey()

    expect(adminWs.sent).toHaveLength(1)
    const sentMsg = decode(adminWs.sent[0]) as { type: string; id: number; data: Uint8Array }
    expect(sentMsg.type).toBe('request')
    const innerReq = decode(sentMsg.data) as { type: string }
    expect(innerReq.type).toBe('generate_agent_pub_key')

    const responseInner = encode({ type: 'agent_pub_key_generated', value: agentKey })
    const responseMsg = encode({ type: 'response', id: sentMsg.id, data: responseInner })
    adminWs.simulateMessage(responseMsg as Uint8Array)

    const result = await callPromise
    expect(result).toEqual(agentKey)
  })

  it('callZome sends signed call_zome request', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    // Prepare app websocket and fake auth
    const appWs = new MockWebSocket('ws://localhost:5555')
    // @ts-expect-error - force set private field
    conductor['appWs'] = appWs
    // @ts-expect-error - set handler
    conductor['setupMessageHandler'](appWs)

    const signer: ZomeCallSigner = {
      agentPubKey: new Uint8Array([1, 2, 3]),
      capSecret: new Uint8Array(64),
      sign: async () => new Uint8Array(64).fill(9)
    }

    const cellId = {
      dnaHash: new Uint8Array([1, 2, 3]),
      agentPubKey: new Uint8Array([4, 5, 6])
    }

    const callPromise = conductor.callZome(cellId, 'z', 'f', { hello: 'world' }, signer)

    await new Promise((r) => setTimeout(r, 0))
    expect(appWs.sent).toHaveLength(1)
    const sentOuter = decode(appWs.sent[0]) as { type: string; id: number; data: Uint8Array }
    expect(sentOuter.type).toBe('request')
    const inner = decode(sentOuter.data) as { type: string; value: any }
    expect(inner.type).toBe('call_zome')
    expect(inner.value.signature).toBeInstanceOf(Uint8Array)

    const responseInner = encode({ type: 'zome_called', value: encode({ ok: true }) })
    const responseMsg = encode({ type: 'response', id: sentOuter.id, data: responseInner })
    appWs.simulateMessage(responseMsg as Uint8Array)

    const result = await callPromise
    expect(result).toEqual({ ok: true })
  })
})
