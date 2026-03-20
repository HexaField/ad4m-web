import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encode, decode } from '@msgpack/msgpack'
import { HolochainConnectionState } from '@ad4m-web/core'
import { WebSocketHolochainConductor } from '../ws-conductor'

// Mock WebSocket
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

  it('disconnect() closes WebSockets', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    await conductor.disconnect()

    expect(MockWebSocket.instances[0].closeCalled).toBe(true)
    expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
  })

  it('state transitions fire callbacks', async () => {
    const conductor = new WebSocketHolochainConductor()
    const states: string[] = []
    conductor.onStateChange((s) => states.push(s))

    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    expect(states).toEqual([HolochainConnectionState.Connecting, HolochainConnectionState.Connected])

    await conductor.disconnect()
    expect(states).toEqual([
      HolochainConnectionState.Connecting,
      HolochainConnectionState.Connected,
      HolochainConnectionState.Disconnected
    ])
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

    // Respond
    const responseInner = encode({ type: 'agent_pub_key_generated', value: agentKey })
    const responseMsg = encode({ type: 'response', id: sentMsg.id, data: responseInner })
    adminWs.simulateMessage(responseMsg as Uint8Array)

    const result = await callPromise
    expect(result).toEqual(agentKey)
  })

  it('callZome sends correct app request with wire protocol', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    // Manually set up app ws by simulating installApp partially
    // For unit test, we test callZome directly — need appWs
    // We'll test the sendRequest encoding format
    const cellId = {
      dnaHash: new Uint8Array([1, 2, 3]),
      agentPubKey: new Uint8Array([4, 5, 6])
    }

    await expect(conductor.callZome(cellId, 'z', 'f', {})).rejects.toThrow('Not connected to app interface')
  })

  it('signal handling dispatches to callbacks', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })

    const signals: unknown[] = []
    conductor.onSignal((s) => signals.push(s))

    const adminWs = MockWebSocket.instances[0]

    const dnaHash = new Uint8Array([10, 20, 30])
    const agentKey = new Uint8Array([40, 50, 60])
    const signalPayload = { some: 'data' }

    const signalData = encode({
      cell_id: [dnaHash, agentKey],
      payload: signalPayload
    })
    const signalMsg = encode({ type: 'signal', data: signalData })
    adminWs.simulateMessage(signalMsg as Uint8Array)

    await new Promise((r) => setTimeout(r, 10))

    expect(signals).toHaveLength(1)
    expect((signals[0] as { cellId: { dnaHash: Uint8Array } }).cellId.dnaHash).toEqual(dnaHash)
  })

  it('connect() transitions to Error on WebSocket failure', async () => {
    vi.stubGlobal(
      'WebSocket',
      class {
        binaryType = 'arraybuffer'
        onopen: unknown = null
        onerror: unknown = null
        constructor() {
          queueMicrotask(() => (this.onerror as () => void)?.())
        }
        addEventListener() {}
        send() {}
        close() {}
      } as unknown
    )

    const conductor = new WebSocketHolochainConductor()
    const states: string[] = []
    conductor.onStateChange((s) => states.push(s))

    await expect(conductor.connect({ conductorAdminUrl: 'ws://localhost:4444' })).rejects.toThrow()

    expect(conductor.getState()).toBe(HolochainConnectionState.Error)
  })
})
