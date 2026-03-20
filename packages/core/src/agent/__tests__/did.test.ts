import { describe, expect, it } from 'vitest'
import { publicKeyToDid, didToPublicKey, generateDidDocument } from '../did'
import { NobleCryptoProvider } from '../crypto'

const crypto = new NobleCryptoProvider()

describe('DID utilities', () => {
  it('publicKeyToDid produces did:key:z6Mk format', async () => {
    const { publicKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    expect(did).toMatch(/^did:key:z6Mk/)
  })

  it('round-trips publicKeyToDid/didToPublicKey', async () => {
    const { publicKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const recovered = didToPublicKey(did)
    expect(recovered).toEqual(publicKey)
  })

  it('didToPublicKey rejects invalid DIDs', () => {
    expect(() => didToPublicKey('not-a-did')).toThrow()
    expect(() => didToPublicKey('did:key:abc')).toThrow()
  })

  it('generateDidDocument has required fields', async () => {
    const { publicKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const doc = generateDidDocument(did) as Record<string, unknown>
    expect(doc.id).toBe(did)
    expect(doc['@context']).toBeDefined()
    expect(doc.verificationMethod).toBeDefined()
    expect(doc.authentication).toBeDefined()
    expect(doc.assertionMethod).toBeDefined()
    expect(Array.isArray(doc.verificationMethod)).toBe(true)
  })
})
