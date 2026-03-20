import { describe, expect, it } from 'vitest'
import { signExpression, verifyExpression } from '../signing'
import { NobleCryptoProvider } from '../crypto'
import { publicKeyToDid } from '../did'

const crypto = new NobleCryptoProvider()

describe('Expression signing', () => {
  it('produces valid Expression with 128-char hex signature', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const expr = await signExpression({ hello: 'world' }, crypto, privateKey, did)
    expect(expr.author).toBe(did)
    expect(expr.proof.key).toBe(did)
    expect(expr.proof.signature).toMatch(/^[0-9a-f]{128}$/)
    expect(expr.data).toEqual({ hello: 'world' })
  })

  it('verifyExpression returns valid=true for correct signature', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const expr = await signExpression('test data', crypto, privateKey, did)
    const result = await verifyExpression(expr, crypto)
    expect(result.valid).toBe(true)
  })

  it('verifyExpression returns valid=false for tampered data', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const expr = await signExpression('test data', crypto, privateKey, did)
    expr.data = 'tampered'
    const result = await verifyExpression(expr, crypto)
    expect(result.valid).toBe(false)
  })

  it('verifyExpression returns valid=false for tampered timestamp', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const expr = await signExpression('test', crypto, privateKey, did)
    expr.timestamp = '2020-01-01T00:00:00.000Z'
    const result = await verifyExpression(expr, crypto)
    expect(result.valid).toBe(false)
  })

  it('timestamp is RFC 3339 with milliseconds and Z', async () => {
    const { publicKey, privateKey } = await crypto.generateKeyPair()
    const did = publicKeyToDid(publicKey)
    const expr = await signExpression('test', crypto, privateKey, did)
    expect(expr.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
