import { describe, it, expect } from 'vitest'
import { checkAuth, extractAuthContext, OPERATION_CAPABILITIES } from '../auth'
import type { AuthContext } from '../auth'
import type { CapabilityClaims } from '../../agent/capabilities'
import { NobleCryptoProvider } from '../../agent/crypto'
import { publicKeyToDid } from '../../agent/did'
import { signJwt } from '../../agent/jwt'

const crypto = new NobleCryptoProvider()

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
      'agentGetApps',
      'perspectives',
      'perspective',
      'perspectiveQueryLinks',
      'perspectiveSnapshot',
      'runtimeInfo',
      'agentGenerate',
      'agentLock',
      'agentUnlock',
      'agentRequestCapability',
      'agentGenerateJwt',
      'agentRevokeToken',
      'perspectiveAdd',
      'perspectiveUpdate',
      'perspectiveRemove',
      'perspectiveAddLink',
      'perspectiveAddLinks',
      'perspectiveRemoveLink',
      'perspectiveUpdateLink',
      'neighbourhoodJoinFromUrl',
      'neighbourhoodPublishFromPerspective',
      'languageApplyTemplateAndPublish',
      'agentStatusChanged',
      'perspectiveAdded',
      'perspectiveUpdated',
      'perspectiveRemoved',
      'perspectiveLinkAdded',
      'perspectiveLinkRemoved'
    ]
    for (const op of expectedOps) {
      expect(OPERATION_CAPABILITIES).toHaveProperty(op)
      expect(OPERATION_CAPABILITIES[op]).toHaveProperty('domain')
      expect(OPERATION_CAPABILITIES[op]).toHaveProperty('action')
    }
  })
})

describe('extractAuthContext', () => {
  it('returns empty context for no header', async () => {
    const ctx = await extractAuthContext(undefined, undefined, undefined)
    expect(ctx).toEqual({})
  })

  it('returns admin context for matching credential', async () => {
    const ctx = await extractAuthContext('my-secret', 'my-secret', undefined)
    expect(ctx.credential).toBe('my-secret')
    expect(ctx.adminCredential).toBe('my-secret')
  })

  it('extracts claims from valid Bearer JWT', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const claims: CapabilityClaims = {
      iss: did,
      aud: 'test',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      nonce: 'n1',
      capabilities: { appName: 'test', appDesc: 'test' }
    }
    const token = await signJwt(claims, privateKey)
    const ctx = await extractAuthContext(`Bearer ${token}`, undefined, did)
    expect(ctx.claims).toBeDefined()
    expect(ctx.claims!.iss).toBe(did)
  })

  it('rejects invalid JWT', async () => {
    const { publicKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    await expect(extractAuthContext('Bearer invalid.token.here', undefined, did)).rejects.toThrow(
      'Invalid or expired token'
    )
  })
})
