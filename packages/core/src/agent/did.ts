import { base58 } from '@scure/base'

const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01])

export function publicKeyToDid(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(2 + publicKey.length)
  prefixed.set(ED25519_MULTICODEC)
  prefixed.set(publicKey, 2)
  return `did:key:z${base58.encode(prefixed)}`
}

export function didToPublicKey(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error(`Invalid did:key format: ${did}`)
  }
  const decoded = base58.decode(did.slice(9))
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Invalid multicodec prefix for Ed25519')
  }
  return decoded.slice(2)
}

export function generateDidDocument(did: string): object {
  const publicKey = didToPublicKey(did)
  const prefixed = new Uint8Array(2 + publicKey.length)
  prefixed.set(ED25519_MULTICODEC)
  prefixed.set(publicKey, 2)
  const multibaseKey = `z${base58.encode(prefixed)}`
  const verificationMethodId = `${did}#${multibaseKey}`

  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
    id: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: multibaseKey
      }
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId]
  }
}
