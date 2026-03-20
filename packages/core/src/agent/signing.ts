import { didToPublicKey } from './did'
import type { CryptoProvider, Expression, ExpressionProof } from './types'

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function computeHash(crypto: CryptoProvider, json: string, timestamp: string): Uint8Array {
  const encoder = new TextEncoder()
  const jsonBytes = encoder.encode(json)
  const tsBytes = encoder.encode(timestamp)
  const combined = new Uint8Array(jsonBytes.length + tsBytes.length)
  combined.set(jsonBytes)
  combined.set(tsBytes, jsonBytes.length)
  return crypto.sha256(combined)
}

export async function signExpression(
  data: unknown,
  crypto: CryptoProvider,
  privateKey: Uint8Array,
  did: string
): Promise<Expression<unknown>> {
  const json = JSON.stringify(data)
  const timestamp = new Date().toISOString()
  const hash = computeHash(crypto, json, timestamp)
  const signature = await crypto.sign(privateKey, hash)

  const proof: ExpressionProof = {
    key: did,
    signature: hexEncode(signature)
  }

  return { author: did, timestamp, data, proof }
}

export async function verifyExpression(expr: Expression<unknown>, crypto: CryptoProvider): Promise<{ valid: boolean }> {
  try {
    const publicKey = didToPublicKey(expr.proof.key)
    const json = JSON.stringify(expr.data)
    const hash = computeHash(crypto, json, expr.timestamp)
    const signature = hexDecode(expr.proof.signature)
    const valid = await crypto.verify(publicKey, signature, hash)
    return { valid }
  } catch {
    return { valid: false }
  }
}
