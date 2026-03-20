import * as ed from '@noble/ed25519'
import { base64urlnopad } from '@scure/base'
import type { CapabilityClaims } from './capabilities'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const JWT_HEADER = { alg: 'EdDSA', typ: 'JWT' }
const ENCODED_HEADER = base64urlnopad.encode(textEncoder.encode(JSON.stringify(JWT_HEADER)))

export async function signJwt(claims: CapabilityClaims, privateKey: Uint8Array): Promise<string> {
  const payload = base64urlnopad.encode(textEncoder.encode(JSON.stringify(claims)))
  const signingInput = textEncoder.encode(`${ENCODED_HEADER}.${payload}`)
  const signature = await ed.signAsync(signingInput, privateKey)
  return `${ENCODED_HEADER}.${payload}.${base64urlnopad.encode(signature)}`
}

export interface VerifyOptions {
  issuerDid?: string
  now?: number
}

export async function verifyJwt(
  token: string,
  publicKey: Uint8Array,
  options?: VerifyOptions
): Promise<CapabilityClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')

  const [headerStr, payloadStr, signatureStr] = parts
  // Verify header
  const header = JSON.parse(textDecoder.decode(base64urlnopad.decode(headerStr)))
  if (header.alg !== 'EdDSA') throw new Error(`Unsupported algorithm: ${header.alg}`)

  // Verify signature
  const signingInput = textEncoder.encode(`${headerStr}.${payloadStr}`)
  const signature = base64urlnopad.decode(signatureStr)
  const valid = await ed.verifyAsync(signature, signingInput, publicKey)
  if (!valid) throw new Error('Invalid JWT signature')

  // Decode payload
  const claims: CapabilityClaims = JSON.parse(textDecoder.decode(base64urlnopad.decode(payloadStr)))

  // Check expiration
  const now = options?.now ?? Math.floor(Date.now() / 1000)
  if (claims.exp <= now) throw new Error('JWT expired')

  // Check issuer
  if (options?.issuerDid && claims.iss !== options.issuerDid) {
    throw new Error(`JWT issuer mismatch: expected ${options.issuerDid}, got ${claims.iss}`)
  }

  return claims
}

export function decodeJwtUnsafe(token: string): CapabilityClaims {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  return JSON.parse(textDecoder.decode(base64urlnopad.decode(parts[1])))
}
