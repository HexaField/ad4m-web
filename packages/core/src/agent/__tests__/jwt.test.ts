import { describe, it, expect } from 'vitest'
import { signJwt, verifyJwt, decodeJwtUnsafe } from '../jwt'
import { NobleCryptoProvider } from '../crypto'
import { publicKeyToDid } from '../did'
import type { CapabilityClaims } from '../capabilities'

const crypto = new NobleCryptoProvider()

async function makeKeyPairAndClaims() {
  const { publicKey, privateKey } = await crypto.generateKeyPair()
  const did = publicKeyToDid(publicKey)
  const claims: CapabilityClaims = {
    iss: did,
    aud: 'test-app',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    nonce: 'test-nonce-123',
    capabilities: {
      appName: 'TestApp',
      appDesc: 'A test application',
      capabilities: [{ with: { domain: 'agent', pointers: ['*'] }, can: ['READ'] }]
    }
  }
  return { publicKey, privateKey, did, claims }
}

describe('JWT', () => {
  it('sign and verify round-trip', async () => {
    const { publicKey, privateKey, claims } = await makeKeyPairAndClaims()
    const token = await signJwt(claims, privateKey)
    const verified = await verifyJwt(token, publicKey)
    expect(verified.iss).toBe(claims.iss)
    expect(verified.aud).toBe(claims.aud)
    expect(verified.nonce).toBe(claims.nonce)
    expect(verified.capabilities.appName).toBe('TestApp')
  })

  it('produces three dot-separated base64url parts', async () => {
    const { privateKey, claims } = await makeKeyPairAndClaims()
    const token = await signJwt(claims, privateKey)
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    // No padding characters
    for (const part of parts) {
      expect(part).not.toContain('=')
      expect(part).not.toContain('+')
      expect(part).not.toContain('/')
    }
  })

  it('header contains EdDSA alg', async () => {
    const { privateKey, claims } = await makeKeyPairAndClaims()
    const token = await signJwt(claims, privateKey)
    const headerJson = Buffer.from(token.split('.')[0], 'base64url').toString()
    const header = JSON.parse(headerJson)
    expect(header.alg).toBe('EdDSA')
    expect(header.typ).toBe('JWT')
  })

  it('rejects expired token', async () => {
    const { publicKey, privateKey, claims } = await makeKeyPairAndClaims()
    claims.exp = Math.floor(Date.now() / 1000) - 10 // expired
    const token = await signJwt(claims, privateKey)
    await expect(verifyJwt(token, publicKey)).rejects.toThrow('expired')
  })

  it('rejects tampered payload', async () => {
    const { publicKey, privateKey, claims } = await makeKeyPairAndClaims()
    const token = await signJwt(claims, privateKey)
    const parts = token.split('.')
    // Tamper with payload
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    payload.aud = 'evil-app'
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const tampered = parts.join('.')
    await expect(verifyJwt(tampered, publicKey)).rejects.toThrow('signature')
  })

  it('rejects wrong public key', async () => {
    const { privateKey, claims } = await makeKeyPairAndClaims()
    const otherKp = await crypto.generateKeyPair()
    const token = await signJwt(claims, privateKey)
    await expect(verifyJwt(token, otherKp.publicKey)).rejects.toThrow('signature')
  })

  it('rejects issuer mismatch', async () => {
    const { publicKey, privateKey, claims } = await makeKeyPairAndClaims()
    const token = await signJwt(claims, privateKey)
    await expect(verifyJwt(token, publicKey, { issuerDid: 'did:key:zWRONG' })).rejects.toThrow('issuer mismatch')
  })

  it('rejects invalid format', async () => {
    const { publicKey } = await makeKeyPairAndClaims()
    await expect(verifyJwt('not-a-jwt', publicKey)).rejects.toThrow('Invalid JWT format')
  })

  it('decodeJwtUnsafe works without verification', async () => {
    const { privateKey, claims } = await makeKeyPairAndClaims()
    const token = await signJwt(claims, privateKey)
    const decoded = decodeJwtUnsafe(token)
    expect(decoded.iss).toBe(claims.iss)
    expect(decoded.capabilities.appName).toBe('TestApp')
  })
})
