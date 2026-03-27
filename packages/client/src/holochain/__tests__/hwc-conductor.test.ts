import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HolochainConnectionState } from '@ad4m-web/core'
import { HWCConductor } from '../hwc-conductor'

function createMockHolochainAPI() {
  const signalCallbacks: ((signal: unknown) => void)[] = []
  const connectionCallbacks: ((status: string) => void)[] = []

  return {
    isWebConductor: true,
    version: '0.1.0',
    myPubKey: new Uint8Array(39).fill(1),
    installedAppId: null,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    callZome: vi.fn().mockResolvedValue({ result: 'ok' }),
    appInfo: vi.fn().mockResolvedValue({
      contextId: 'test-context',
      agentPubKey: new Uint8Array(39).fill(1),
      cells: [[new Uint8Array(39).fill(2), new Uint8Array(39).fill(1)]],
      status: 'running'
    }),
    installApp: vi.fn().mockResolvedValue(undefined),
    configureNetwork: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, cb: (signal: unknown) => void) => {
      if (event === 'signal') signalCallbacks.push(cb)
      return () => {
        const idx = signalCallbacks.indexOf(cb)
        if (idx >= 0) signalCallbacks.splice(idx, 1)
      }
    }),
    onConnectionChange: vi.fn((cb: (status: string) => void) => {
      connectionCallbacks.push(cb)
      return () => {
        const idx = connectionCallbacks.indexOf(cb)
        if (idx >= 0) connectionCallbacks.splice(idx, 1)
      }
    }),
    provideMemproofs: vi.fn().mockResolvedValue(undefined),
    // Test helpers
    _signalCallbacks: signalCallbacks,
    _connectionCallbacks: connectionCallbacks
  }
}

describe('HWCConductor', () => {
  let mockAPI: ReturnType<typeof createMockHolochainAPI>
  let conductor: HWCConductor

  beforeEach(() => {
    mockAPI = createMockHolochainAPI()
    ;(globalThis as any).window = { holochain: mockAPI }
    conductor = new HWCConductor()
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  describe('extension detection', () => {
    it('throws when extension is not installed', async () => {
      ;(globalThis as any).window = {}
      const c = new HWCConductor()
      await expect(c.connect({ conductorAdminUrl: '' })).rejects.toThrow('Holo Web Conductor extension not detected')
    })

    it('throws when window is undefined', async () => {
      delete (globalThis as any).window
      const c = new HWCConductor()
      await expect(c.connect({ conductorAdminUrl: '' })).rejects.toThrow('Holo Web Conductor extension not detected')
    })
  })

  describe('connect/disconnect', () => {
    it('connects and sets state to Connected', async () => {
      await conductor.connect({ conductorAdminUrl: '' })
      expect(mockAPI.connect).toHaveBeenCalled()
      expect(conductor.getState()).toBe(HolochainConnectionState.Connected)
    })

    it('configures linker URL if provided', async () => {
      await conductor.connect({ conductorAdminUrl: '', linkerUrl: 'https://linker.example.com' })
      expect(mockAPI.configureNetwork).toHaveBeenCalledWith({ linkerUrl: 'https://linker.example.com' })
    })

    it('does not configure network if no linkerUrl', async () => {
      await conductor.connect({ conductorAdminUrl: '' })
      expect(mockAPI.configureNetwork).not.toHaveBeenCalled()
    })

    it('sets Error state on connect failure', async () => {
      mockAPI.connect.mockRejectedValue(new Error('fail'))
      await expect(conductor.connect({ conductorAdminUrl: '' })).rejects.toThrow('HWC connect failed')
      expect(conductor.getState()).toBe(HolochainConnectionState.Error)
    })

    it('disconnects and sets state to Disconnected', async () => {
      await conductor.connect({ conductorAdminUrl: '' })
      await conductor.disconnect()
      expect(mockAPI.disconnect).toHaveBeenCalled()
      expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
    })
  })

  describe('generateAgentPubKey', () => {
    it('returns myPubKey from extension', async () => {
      const key = await conductor.generateAgentPubKey()
      expect(key).toEqual(new Uint8Array(39).fill(1))
    })

    it('calls connect if myPubKey is null', async () => {
      mockAPI.myPubKey = null
      // After connect, myPubKey is still null → should throw
      await expect(conductor.generateAgentPubKey()).rejects.toThrow('agent public key not available')
    })
  })

  describe('callZome', () => {
    it('delegates to extension callZome', async () => {
      const cellId = { dnaHash: new Uint8Array(39).fill(2), agentPubKey: new Uint8Array(39).fill(1) }
      const signer = { agentPubKey: new Uint8Array(39).fill(1), capSecret: new Uint8Array(64), sign: vi.fn() }

      const result = await conductor.callZome(cellId, 'my_zome', 'my_fn', { data: 'test' }, signer)

      expect(mockAPI.callZome).toHaveBeenCalledWith({
        cell_id: [cellId.dnaHash, cellId.agentPubKey],
        zome_name: 'my_zome',
        fn_name: 'my_fn',
        payload: { data: 'test' },
        provenance: signer.agentPubKey,
        cap_secret: signer.capSecret
      })
      expect(result).toEqual({ result: 'ok' })
    })

    it('wraps callZome errors', async () => {
      mockAPI.callZome.mockRejectedValue(new Error('zome error'))
      const cellId = { dnaHash: new Uint8Array(39), agentPubKey: new Uint8Array(39) }
      const signer = { agentPubKey: new Uint8Array(39), capSecret: new Uint8Array(64), sign: vi.fn() }

      await expect(conductor.callZome(cellId, 'z', 'f', null, signer)).rejects.toThrow('HWC callZome z/f failed')
    })
  })

  describe('installApp', () => {
    it('maps InstallAppRequest to HWC format', async () => {
      const happBytes = new Uint8Array([1, 2, 3])
      const result = await conductor.installApp({
        happBytes,
        installedAppId: 'my-app',
        networkSeed: 'seed-123'
      })

      expect(mockAPI.installApp).toHaveBeenCalledWith({
        bundle: happBytes,
        installedAppId: 'my-app',
        dnaModifiers: { networkSeed: 'seed-123' }
      })

      expect(result.installedAppId).toBe('my-app')
      expect(result.agentKey).toEqual(new Uint8Array(39).fill(1))
      expect(result.cellInfo).toHaveProperty('default')
    })

    it('throws if happBytes not provided', async () => {
      await expect(conductor.installApp({ installedAppId: 'app', happPath: '/path' })).rejects.toThrow(
        'HWC requires happBytes'
      )
    })
  })

  describe('signals', () => {
    it('forwards signals from extension', () => {
      const received: unknown[] = []
      conductor.onSignal((sig) => received.push(sig))

      // Simulate extension emitting a signal
      const rawSignal = {
        cell_id: [new Uint8Array(39).fill(2), new Uint8Array(39).fill(1)],
        payload: { type: 'test' }
      }
      for (const cb of mockAPI._signalCallbacks) cb(rawSignal)

      expect(received).toHaveLength(1)
      expect((received[0] as any).payload).toEqual({ type: 'test' })
    })

    it('unsubscribes from signals', () => {
      const received: unknown[] = []
      const unsub = conductor.onSignal((sig) => received.push(sig))
      unsub()

      for (const cb of mockAPI._signalCallbacks) {
        cb({ cell_id: [new Uint8Array(39), new Uint8Array(39)], payload: {} })
      }
      // The callback was removed from signalCallbacks, but the extension callback still fires
      // The signal loop checks this.signalCallbacks which no longer has our cb
      expect(received).toHaveLength(0)
    })
  })

  describe('state changes', () => {
    it('notifies listeners on state change', async () => {
      const states: string[] = []
      conductor.onStateChange((s) => states.push(s))

      await conductor.connect({ conductorAdminUrl: '' })

      expect(states).toContain(HolochainConnectionState.Connecting)
      expect(states).toContain(HolochainConnectionState.Connected)
    })

    it('maps extension connection status changes', async () => {
      await conductor.connect({ conductorAdminUrl: '' })

      const states: string[] = []
      conductor.onStateChange((s) => states.push(s))

      // Simulate extension reporting disconnected
      for (const cb of mockAPI._connectionCallbacks) cb('disconnected')
      expect(states).toContain(HolochainConnectionState.Disconnected)

      for (const cb of mockAPI._connectionCallbacks) cb('error')
      expect(states).toContain(HolochainConnectionState.Error)
    })
  })

  describe('grantCapability', () => {
    it('is a no-op', async () => {
      const cellId = { dnaHash: new Uint8Array(39), agentPubKey: new Uint8Array(39) }
      const signer = { agentPubKey: new Uint8Array(39), capSecret: new Uint8Array(64), sign: vi.fn() }
      await expect(conductor.grantCapability(cellId, signer)).resolves.toBeUndefined()
    })
  })

  describe('createSigningCredentials', () => {
    it('returns a pass-through signer with extension pubkey', async () => {
      const cellId = { dnaHash: new Uint8Array(39), agentPubKey: new Uint8Array(39) }
      const signer = await conductor.createSigningCredentials(cellId)

      expect(signer.agentPubKey).toEqual(new Uint8Array(39).fill(1))
      expect(signer.capSecret).toHaveLength(64)

      // sign returns dummy 64-byte signature
      const sig = await signer.sign(new Uint8Array(32))
      expect(sig).toHaveLength(64)
    })
  })
})
