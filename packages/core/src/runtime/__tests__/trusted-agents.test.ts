import { describe, it, expect } from 'vitest'
import { TrustedAgentService } from '../trusted-agents'

describe('TrustedAgentService', () => {
  it('starts empty', () => {
    const svc = new TrustedAgentService()
    expect(svc.getTrustedAgents()).toEqual([])
  })

  it('accepts initial agents', () => {
    const svc = new TrustedAgentService(['did:test:a'])
    expect(svc.getTrustedAgents()).toEqual(['did:test:a'])
  })

  it('addTrustedAgents adds and returns all', () => {
    const svc = new TrustedAgentService()
    const result = svc.addTrustedAgents(['did:test:a', 'did:test:b'])
    expect(result).toContain('did:test:a')
    expect(result).toContain('did:test:b')
  })

  it('deduplicates agents', () => {
    const svc = new TrustedAgentService()
    svc.addTrustedAgents(['did:test:a', 'did:test:a'])
    expect(svc.getTrustedAgents()).toHaveLength(1)
  })

  it('removeTrustedAgents removes and returns remaining', () => {
    const svc = new TrustedAgentService(['did:test:a', 'did:test:b'])
    const result = svc.removeTrustedAgents(['did:test:a'])
    expect(result).toEqual(['did:test:b'])
  })

  it('isTrusted checks membership', () => {
    const svc = new TrustedAgentService(['did:test:a'])
    expect(svc.isTrusted('did:test:a')).toBe(true)
    expect(svc.isTrusted('did:test:b')).toBe(false)
  })

  it('toJSON / fromJSON round-trip', () => {
    const svc = new TrustedAgentService(['did:test:a', 'did:test:b'])
    const json = svc.toJSON()
    const restored = TrustedAgentService.fromJSON(json)
    expect(restored.getTrustedAgents()).toEqual(svc.getTrustedAgents())
  })
})
