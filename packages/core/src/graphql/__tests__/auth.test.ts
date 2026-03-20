import { describe, it, expect } from 'vitest'
import { checkAuth, OPERATION_CAPABILITIES } from '../auth'
import type { AuthContext } from '../auth'
import type { CapabilityClaims } from '../../agent/capabilities'

function makeClaims(domain: string, actions: string[]): CapabilityClaims {
  return {
    iss: 'did:test:1',
    aud: 'did:test:2',
    exp: Date.now() + 60000,
    iat: Date.now(),
    nonce: 'test-nonce',
    capabilities: {
      appName: 'test',
      appDesc: 'test',
      capabilities: [{ with: { domain, pointers: ['*'] }, can: actions }]
    }
  }
}

describe('GraphQL Auth', () => {
  it('admin credential bypasses capability check', () => {
    const ctx: AuthContext = { credential: 'secret', adminCredential: 'secret' }
    expect(() => checkAuth(ctx, 'agent', 'READ')).not.toThrow()
  })

  it('matching capability is allowed', () => {
    const ctx: AuthContext = { claims: makeClaims('agent', ['READ']) }
    expect(() => checkAuth(ctx, 'agent', 'READ')).not.toThrow()
  })

  it('missing auth is rejected', () => {
    const ctx: AuthContext = {}
    expect(() => checkAuth(ctx, 'agent', 'READ')).toThrow('Unauthorized')
  })

  it('wrong domain is rejected', () => {
    const ctx: AuthContext = { claims: makeClaims('perspective', ['READ']) }
    expect(() => checkAuth(ctx, 'agent', 'READ')).toThrow('Unauthorized')
  })

  it('wrong action is rejected', () => {
    const ctx: AuthContext = { claims: makeClaims('agent', ['CREATE']) }
    expect(() => checkAuth(ctx, 'agent', 'READ')).toThrow('Unauthorized')
  })

  it('OPERATION_CAPABILITIES has entries for all schema operations', () => {
    const expectedOps = [
      'agentStatus',
      'perspectives',
      'perspective',
      'perspectiveQueryLinks',
      'perspectiveSnapshot',
      'runtimeInfo',
      'agentGenerate',
      'agentLock',
      'agentUnlock',
      'perspectiveAdd',
      'perspectiveUpdate',
      'perspectiveRemove',
      'perspectiveAddLink',
      'perspectiveAddLinks',
      'perspectiveRemoveLink',
      'perspectiveUpdateLink',
      'neighbourhoodJoinFromUrl',
      'neighbourhoodPublishFromPerspective',
      'languageApplyTemplateAndPublish'
    ]
    for (const op of expectedOps) {
      expect(OPERATION_CAPABILITIES).toHaveProperty(op)
      expect(OPERATION_CAPABILITIES[op]).toHaveProperty('domain')
      expect(OPERATION_CAPABILITIES[op]).toHaveProperty('action')
    }
  })
})
