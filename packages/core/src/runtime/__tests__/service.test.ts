import { describe, it, expect } from 'vitest'
import { RuntimeService } from '../service'

describe('RuntimeService', () => {
  it('manages trusted agents', () => {
    const svc = new RuntimeService()
    expect(svc.getTrustedAgents()).toEqual([])
    svc.addTrustedAgents(['did:test:a'])
    expect(svc.getTrustedAgents()).toContain('did:test:a')
    svc.removeTrustedAgents(['did:test:a'])
    expect(svc.getTrustedAgents()).toEqual([])
  })

  it('manages known link language templates', () => {
    const svc = new RuntimeService()
    svc.addKnownLinkLanguageTemplate('addr1')
    expect(svc.getKnownLinkLanguageTemplates()).toContain('addr1')
    svc.removeKnownLinkLanguageTemplate('addr1')
    expect(svc.getKnownLinkLanguageTemplates()).toEqual([])
  })

  it('returns readiness status', () => {
    const svc = new RuntimeService()
    const status = svc.getReadiness()
    expect(status.graphqlReady).toBe(true)
  })

  it('returns placeholder HC agent infos', () => {
    const svc = new RuntimeService()
    expect(JSON.parse(svc.getHcAgentInfos())).toEqual([])
  })

  it('sets hot wallet address', () => {
    const svc = new RuntimeService()
    expect(svc.setHotWalletAddress('0xabc')).toBe(true)
    expect(svc.getHotWalletAddress()).toBe('0xabc')
  })

  it('returns hosting user info', () => {
    const svc = new RuntimeService()
    const info = svc.getHostingUserInfo()
    expect(info).toHaveProperty('did')
    expect(info).toHaveProperty('credits')
  })
})
