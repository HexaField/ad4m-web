import { describe, it, expect } from 'vitest'
import { hasCapability, isAdminCredential, createAdminCapabilities, type CapabilityClaims } from '../capabilities'

function makeClaims(capabilities: any[]): CapabilityClaims {
  return {
    iss: 'did:key:test',
    aud: 'did:key:app',
    exp: Date.now() / 1000 + 3600,
    iat: Date.now() / 1000,
    nonce: 'test-nonce',
    capabilities: {
      appName: 'test',
      appDesc: 'test',
      capabilities
    }
  }
}

describe('Capabilities', () => {
  it('hasCapability returns true for matching domain and action', () => {
    const claims = makeClaims([{ with: { domain: 'agent', pointers: ['*'] }, can: ['READ'] }])
    expect(hasCapability(claims, 'agent', 'READ')).toBe(true)
  })

  it('hasCapability returns false for non-matching domain', () => {
    const claims = makeClaims([{ with: { domain: 'agent', pointers: ['*'] }, can: ['READ'] }])
    expect(hasCapability(claims, 'perspective', 'READ')).toBe(false)
  })

  it('hasCapability returns false for non-matching action', () => {
    const claims = makeClaims([{ with: { domain: 'agent', pointers: ['*'] }, can: ['READ'] }])
    expect(hasCapability(claims, 'agent', 'DELETE')).toBe(false)
  })

  it('hasCapability returns false when no capabilities', () => {
    const claims: CapabilityClaims = {
      iss: 'did:key:test',
      aud: 'did:key:app',
      exp: 0,
      iat: 0,
      nonce: '',
      capabilities: { appName: 'test', appDesc: 'test' }
    }
    expect(hasCapability(claims, 'agent', 'READ')).toBe(false)
  })

  it('isAdminCredential matches correctly', () => {
    expect(isAdminCredential('secret123', 'secret123')).toBe(true)
    expect(isAdminCredential('wrong', 'secret123')).toBe(false)
  })

  it('createAdminCapabilities grants all domains', () => {
    const info = createAdminCapabilities('admin-app')
    expect(info.appName).toBe('admin-app')
    expect(info.capabilities).toHaveLength(5)
    const domains = info.capabilities!.map((c) => c.with.domain)
    expect(domains).toContain('agent')
    expect(domains).toContain('perspective')
    expect(domains).toContain('language')
    expect(domains).toContain('runtime')
    expect(domains).toContain('neighbourhood')
    for (const cap of info.capabilities!) {
      expect(cap.can).toEqual(['READ', 'CREATE', 'UPDATE', 'DELETE', 'PERMIT'])
      expect(cap.with.pointers).toEqual(['*'])
    }
  })
})
