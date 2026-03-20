import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encode, decode } from '@msgpack/msgpack'
import { HolochainConnectionState } from '@ad4m-web/core'
import { WebSocketHolochainConductor } from '../ws-conductor'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []

  binaryType = 'arraybuffer'
  onopen: (() => void) | null = null
  onerror: ((e: any) => void) | null = null
  listeners = new Map<string, Function[]>()
  sent: Uint8Array[] = []
  closeCalled = false
  url: string

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    // Auto-connect after microtask
    queueMicrotask(() => this.onopen?.())
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event)!.push(handler)
  }

  send(data: any) {
    this.sent.push(new Uint8Array(data))
  }

  close() {
    this.closeCalled = true
  }

  // Test helper: simulate incoming message
  simulateMessage(data: Uint8Array) {
    // Create a properly-sized ArrayBuffer (msgpack encode may return a view into a larger buffer)
    const buf = new ArrayBuffer(data.byteLength)
    new Uint8Array(buf).set(data)
    const handlers = this.listeners.get('message') ?? []
    for (const h of handlers) h({ data: buf })
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket as any)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebSocketHolochainConductor', () => {
  it('starts in Disconnected state', () => {
    const conductor = new WebSocketHolochainConductor()
    expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
  })

  it('connect() creates admin and app WebSocket connections', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:4444')
    expect(MockWebSocket.instances[1].url).toBe('ws://localhost:5555')
    expect(conductor.getState()).toBe(HolochainConnectionState.Connected)
  })

  it('disconnect() closes both WebSockets', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    await conductor.disconnect()

    expect(MockWebSocket.instances[0].closeCalled).toBe(true)
    expect(MockWebSocket.instances[1].closeCalled).toBe(true)
    expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
  })

  it('state transitions fire callbacks', async () => {
    const conductor = new WebSocketHolochainConductor()
    const states: string[] = []
    conductor.onStateChange((s) => states.push(s))

    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    expect(states).toEqual([HolochainConnectionState.Connecting, HolochainConnectionState.Connected])

    await conductor.disconnect()
    expect(states).toEqual([
      HolochainConnectionState.Connecting,
      HolochainConnectionState.Connected,
      HolochainConnectionState.Disconnected
    ])
  })

  it('onStateChange returns unsubscribe function', async () => {
    const conductor = new WebSocketHolochainConductor()
    const states: string[] = []
    const unsub = conductor.onStateChange((s) => states.push(s))

    unsub()

    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    expect(states).toEqual([])
  })

  it('callZome() sends msgpack-encoded request on app WS', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    const appWs = MockWebSocket.instances[1]

    const cellId = {
      dnaHash: new Uint8Array([1, 2, 3]),
      agentPubKey: new Uint8Array([4, 5, 6])
    }

    // Start the call (won't resolve until we send a response)
    const callPromise = conductor.callZome(cellId, 'my_zome', 'my_fn', { hello: 'world' })

    // Verify a message was sent
    expect(appWs.sent).toHaveLength(1)

    // Decode the sent message to verify structure
    const sentMsg = decode(appWs.sent[0]) as any
    expect(sentMsg.type).toBe('Request')
    expect(sentMsg.id).toBe(0)

    // Send a response back
    const responsePayload = encode({ result: 'ok' })
    const responseMsg = encode({ type: 'Response', id: 0, data: responsePayload })
    appWs.simulateMessage(responseMsg as Uint8Array)

    const result = await callPromise
    expect(result).toEqual({ result: 'ok' })
  })

  it('callZome() throws when not connected', async () => {
    const conductor = new WebSocketHolochainConductor()
    const cellId = {
      dnaHash: new Uint8Array([1]),
      agentPubKey: new Uint8Array([2])
    }

    await expect(conductor.callZome(cellId, 'z', 'f', {})).rejects.toThrow('Not connected')
  })

  it('signal handling dispatches to callbacks', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    const signals: any[] = []
    conductor.onSignal((s) => signals.push(s))

    const appWs = MockWebSocket.instances[1]

    const dnaHash = new Uint8Array([10, 20, 30])
    const agentKey = new Uint8Array([40, 50, 60])
    const signalPayload = { some: 'data' }

    const signalData = encode({
      cell_id: [dnaHash, agentKey],
      payload: signalPayload
    })
    const signalMsg = encode({ type: 'Signal', data: signalData })
    appWs.simulateMessage(signalMsg as Uint8Array)

    // Wait for async message processing
    await new Promise((r) => setTimeout(r, 10))

    expect(signals).toHaveLength(1)
    expect(signals[0].cellId.dnaHash).toEqual(dnaHash)
    expect(signals[0].cellId.agentPubKey).toEqual(agentKey)
    expect(signals[0].payload).toEqual(signalPayload)
  })

  it('onSignal returns unsubscribe function', async () => {
    const conductor = new WebSocketHolochainConductor()
    await conductor.connect({
      conductorAdminUrl: 'ws://localhost:4444',
      conductorAppUrl: 'ws://localhost:5555'
    })

    const signals: any[] = []
    const unsub = conductor.onSignal((s) => signals.push(s))
    unsub()

    const appWs = MockWebSocket.instances[1]
    const signalData = encode({ cell_id: [new Uint8Array([1]), new Uint8Array([2])], payload: {} })
    const signalMsg = encode({ type: 'Signal', data: signalData })
    appWs.simulateMessage(signalMsg as Uint8Array)

    await new Promise((r) => setTimeout(r, 10))
    expect(signals).toHaveLength(0)
  })

  it('connect() transitions to Error on WebSocket failure', async () => {
    // Override to simulate failure
    vi.stubGlobal(
      'WebSocket',
      class {
        binaryType = 'arraybuffer'
        onopen: any = null
        onerror: any = null
        constructor() {
          queueMicrotask(() => this.onerror?.(new Error('fail')))
        }
        addEventListener() {}
        send() {}
        close() {}
      } as any
    )

    const conductor = new WebSocketHolochainConductor()
    const states: string[] = []
    conductor.onStateChange((s) => states.push(s))

    await expect(
      conductor.connect({
        conductorAdminUrl: 'ws://localhost:4444',
        conductorAppUrl: 'ws://localhost:5555'
      })
    ).rejects.toThrow()

    expect(conductor.getState()).toBe(HolochainConnectionState.Error)
  })
})
