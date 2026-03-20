import { describe, it, expect } from 'vitest'
import { EntanglementService } from '../entanglement'

describe('EntanglementService', () => {
  it('starts with empty proofs', () => {
    const svc = new EntanglementService()
    expect(svc.getProofs()).toEqual([])
  })

  it('adds and retrieves proofs', () => {
    const svc = new EntanglementService()
    const proof = {
      did: 'did:test:1',
      didSigningKeyId: 'k1',
      deviceKey: 'dk1',
      deviceKeySignedByDid: 'sig1',
      didSignedByDeviceKey: 'sig2'
    }
    const result = svc.addProofs([proof])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(proof)
  })

  it('deletes proofs', () => {
    const svc = new EntanglementService()
    const proof = {
      did: 'did:test:1',
      didSigningKeyId: 'k1',
      deviceKey: 'dk1',
      deviceKeySignedByDid: 'sig1',
      didSignedByDeviceKey: 'sig2'
    }
    svc.addProofs([proof])
    const result = svc.deleteProofs([proof])
    expect(result).toEqual([])
  })

  it('generates pre-flight proof', () => {
    const svc = new EntanglementService()
    const result = svc.preFlight('mykey', 'ed25519')
    expect(result.deviceKey).toBe('mykey')
    expect(result.deviceKeySignedByDid).toContain('ed25519')
  })
})
