import { describe, expect, it } from 'vitest'
import { NobleCryptoProvider } from '../crypto'

const crypto = new NobleCryptoProvider()

describe('NobleCryptoProvider', () => {
  it('generates key pair with 32-byte public key', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    expect(publicKey).toBeInstanceOf(Uint8Array)
    expect(publicKey.length).toBe(32)
    expect(privateKey).toBeInstanceOf(Uint8Array)
    expect(privateKey.length).toBe(32)
  })

  it('sign/verify round-trip', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const message = new TextEncoder().encode('hello world')
    const signature = await crypto.sign(privateKey, message)
    const valid = await crypto.verify(publicKey, signature, message)
    expect(valid).toBe(true)
  })

  it('rejects tampered message', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const message = new TextEncoder().encode('hello world')
    const signature = await crypto.sign(privateKey, message)
    const tampered = new TextEncoder().encode('hello world!')
    const valid = await crypto.verify(publicKey, signature, tampered)
    expect(valid).toBe(false)
  })

  it('rejects wrong key', async () => {
    const kp1 = await crypto.generateKeyPair()
    const kp2 = await crypto.generateKeyPair()
    const message = new TextEncoder().encode('hello')
    const signature = await crypto.sign(kp1.privateKey, message)
    const valid = await crypto.verify(kp2.publicKey, signature, message)
    expect(valid).toBe(false)
  })

  it('sha256 produces 32 bytes', async () => {
    const hash = await crypto.sha256(new TextEncoder().encode('test'))
    expect(hash).toBeInstanceOf(Uint8Array)
    expect(hash.length).toBe(32)
  })
})
