import { describe, it, expect } from 'vitest'
import { MockHolochainConductor } from '../mock'
import { HolochainConnectionState } from '../types'
import type { HolochainSignal } from '../types'

describe('MockHolochainConductor', () => {
  it('connect transitions to Connected', async () => {
    const conductor = new MockHolochainConductor()
    expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
    await conductor.connect({ conductorAdminUrl: '' })
    expect(conductor.getState()).toBe(HolochainConnectionState.Connected)
  })

  it('disconnect transitions to Disconnected', async () => {
    const conductor = new MockHolochainConductor()
    await conductor.connect({ conductorAdminUrl: '' })
    await conductor.disconnect()
    expect(conductor.getState()).toBe(HolochainConnectionState.Disconnected)
  })

  it('generateAgentPubKey returns 32 bytes', async () => {
    const conductor = new MockHolochainConductor()
    const key = await conductor.generateAgentPubKey()
    expect(key).toHaveLength(32)
  })

  it('installApp returns InstalledAppInfo', async () => {
    const conductor = new MockHolochainConductor()
    const info = await conductor.installApp({
      installedAppId: 'test-app',
      happBytes: new Uint8Array([1, 2, 3])
    })
    expect(info.installedAppId).toBe('test-app')
    expect(info.agentKey).toHaveLength(32)
    expect(Object.keys(info.cellInfo)).toHaveLength(1)
    const cells = info.cellInfo['default']
    expect(cells).toHaveLength(1)
    expect(cells[0].provisioned.cellId[0]).toHaveLength(32)
  })

  it('callZome with registered handler returns result', async () => {
    const conductor = new MockHolochainConductor()
    conductor.registerHandler('my_zome', 'my_fn', (p) => ({ echo: p }))
    const cellId = { dnaHash: new Uint8Array(32), agentPubKey: new Uint8Array(32) }
    const result = await conductor.callZome(cellId, 'my_zome', 'my_fn', 'hello')
    expect(result).toEqual({ echo: 'hello' })
  })

  it('callZome without handler throws', async () => {
    const conductor = new MockHolochainConductor()
    const cellId = { dnaHash: new Uint8Array(32), agentPubKey: new Uint8Array(32) }
    await expect(conductor.callZome(cellId, 'z', 'f', {})).rejects.toThrow('No mock handler for z/f')
  })

  it('emitSignal triggers callbacks', () => {
    const conductor = new MockHolochainConductor()
    const received: HolochainSignal[] = []
    conductor.onSignal((s) => received.push(s))

    const signal: HolochainSignal = {
      cellId: { dnaHash: new Uint8Array(32), agentPubKey: new Uint8Array(32) },
      payload: 'test'
    }
    conductor.emitSignal(signal)
    expect(received).toHaveLength(1)
    expect(received[0].payload).toBe('test')
  })

  it('onStateChange fires on connect/disconnect', async () => {
    const conductor = new MockHolochainConductor()
    const states: string[] = []
    conductor.onStateChange((s) => states.push(s))

    await conductor.connect({ conductorAdminUrl: '' })
    await conductor.disconnect()
    expect(states).toEqual([HolochainConnectionState.Connected, HolochainConnectionState.Disconnected])
  })
})
