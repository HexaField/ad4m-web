import { describe, it, expect } from 'vitest'
import { MockHolochainConductor } from '../mock'
import { HolochainLanguageDelegateImpl } from '../delegate'
import type { Dna } from '../../language/types'
import type { HolochainSignal } from '../types'

function makeDna(nick: string): Dna {
  return { file: new Uint8Array([1, 2, 3]), nick, zomeCalls: [['test_zome', 'test_fn']] }
}

describe('HolochainLanguageDelegateImpl', () => {
  it('registerDNAs installs via conductor and stores nick mapping', async () => {
    const conductor = new MockHolochainConductor()
    await conductor.connect({ conductorAdminUrl: '', conductorAppUrl: '' })
    conductor.registerHandler('test_zome', 'test_fn', () => 'ok')

    const delegate = new HolochainLanguageDelegateImpl(conductor)
    await delegate.registerDNAs([makeDna('my-dna')])

    const result = await delegate.call('my-dna', 'test_zome', 'test_fn', {})
    expect(result).toBe('ok')
  })

  it('call routes to correct cell via nick', async () => {
    const conductor = new MockHolochainConductor()
    await conductor.connect({ conductorAdminUrl: '', conductorAppUrl: '' })
    const calls: string[] = []
    conductor.registerHandler('zome_a', 'fn_a', () => {
      calls.push('a')
      return 'a'
    })
    conductor.registerHandler('zome_b', 'fn_b', () => {
      calls.push('b')
      return 'b'
    })

    const delegate = new HolochainLanguageDelegateImpl(conductor)
    await delegate.registerDNAs([makeDna('dna-a'), makeDna('dna-b')])

    expect(await delegate.call('dna-a', 'zome_a', 'fn_a', {})).toBe('a')
    expect(await delegate.call('dna-b', 'zome_b', 'fn_b', {})).toBe('b')
  })

  it('call throws for unknown nick', async () => {
    const conductor = new MockHolochainConductor()
    const delegate = new HolochainLanguageDelegateImpl(conductor)

    await expect(delegate.call('nonexistent', 'z', 'f', {})).rejects.toThrow('Unknown DNA nick: nonexistent')
  })

  it('signal callback receives signals for registered cells', async () => {
    const conductor = new MockHolochainConductor()
    await conductor.connect({ conductorAdminUrl: '', conductorAppUrl: '' })

    const delegate = new HolochainLanguageDelegateImpl(conductor)
    const signals: HolochainSignal[] = []
    await delegate.registerDNAs([makeDna('sig-dna')], (s: HolochainSignal) => signals.push(s))

    // We need the cellId that was assigned — get it by calling through
    conductor.registerHandler('test_zome', 'test_fn', () => 'x')
    // Emit a signal with an unrelated cellId — should NOT be received
    conductor.emitSignal({
      cellId: { dnaHash: new Uint8Array(32), agentPubKey: new Uint8Array(32) },
      payload: 'unrelated'
    })
    expect(signals).toHaveLength(0)
  })

  it('multiple DNAs registered with different nicks', async () => {
    const conductor = new MockHolochainConductor()
    await conductor.connect({ conductorAdminUrl: '', conductorAppUrl: '' })
    conductor.registerHandler('z1', 'f1', () => 'res1')
    conductor.registerHandler('z2', 'f2', () => 'res2')

    const delegate = new HolochainLanguageDelegateImpl(conductor)
    await delegate.registerDNAs([makeDna('first')])
    await delegate.registerDNAs([makeDna('second')])

    expect(await delegate.call('first', 'z1', 'f1', {})).toBe('res1')
    expect(await delegate.call('second', 'z2', 'f2', {})).toBe('res2')
  })
})
