import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha2.js'
import type { CryptoProvider } from './types'

export class NobleCryptoProvider implements CryptoProvider {
  async generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const privateKey = ed.utils.randomSecretKey()
    const publicKey = await ed.getPublicKeyAsync(privateKey)
    return { publicKey, privateKey }
  }

  async sign(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
    return ed.signAsync(message, privateKey)
  }

  async verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
    return ed.verifyAsync(signature, message, publicKey)
  }

  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return sha256(data)
  }
}
