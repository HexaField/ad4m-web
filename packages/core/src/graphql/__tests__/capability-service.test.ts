import { describe, it, expect } from 'vitest'
import { CapabilityService } from '../capability-service'
import { NobleCryptoProvider } from '../../agent/crypto'
import { publicKeyToDid } from '../../agent/did'
import { verifyJwt } from '../../agent/jwt'

const crypto = new NobleCryptoProvider()

async function makeService(opts?: { adminCredential?: string }) {
  const { publicKey, privateKey } = await crypto.generateKeyPair()
  const did = publicKeyToDid(publicKey)
  const service = new CapabilityService({
    getAgentDid: () => did,
    getPrivateKey: () => privateKey,
    adminCredential: opts?.adminCredential
  })
  return { service, publicKey, did }
}

describe('CapabilityService', () => {
  it('isSingleUserMode when no admin credential', async () => {
    const { service } = await makeService()
    expect(service.isSingleUserMode).toBe(true)
  })

  it('not single-user mode with admin credential', async () => {
    const { service } = await makeService({ adminCredential: 'secret' })
    expect(service.isSingleUserMode).toBe(false)
  })

  it('full flow: request → get code → generate JWT', async () => {
    const { service, publicKey, did } = await makeService()
    const authInfo = {
      appName: 'MyApp',
      appDesc: 'My Application',
      capabilities: [{ with: { domain: 'agent', pointers: ['*'] }, can: ['READ'] }]
    }

    const requestId = service.requestCapability(authInfo)
    expect(requestId).toBeTruthy()

    const rand = service.getRandomCode(requestId)
    expect(rand).toBeTruthy()
    expect(rand).toMatch(/^\d{6}$/)

    const token = await service.generateJwt(requestId, rand!)
    expect(token).toBeTruthy()

    // Verify the JWT
    const claims = await verifyJwt(token, publicKey, { issuerDid: did })
    expect(claims.capabilities.appName).toBe('MyApp')
    expect(claims.iss).toBe(did)
  })

  it('rejects wrong verification code', async () => {
    const { service } = await makeService()
    const requestId = service.requestCapability({ appName: 'Test', appDesc: 'test' })
    await expect(service.generateJwt(requestId, '000000')).rejects.toThrow('Invalid verification code')
  })

  it('rejects unknown request ID', async () => {
    const { service } = await makeService()
    await expect(service.generateJwt('nonexistent', '123456')).rejects.toThrow('No pending capability request')
  })

  it('request is consumed after JWT generation', async () => {
    const { service } = await makeService()
    const requestId = service.requestCapability({ appName: 'Test', appDesc: 'test' })
    const rand = service.getRandomCode(requestId)!
    await service.generateJwt(requestId, rand)
    // Second attempt should fail
    await expect(service.generateJwt(requestId, rand)).rejects.toThrow('No pending capability request')
  })

  it('getApps returns granted apps', async () => {
    const { service } = await makeService()
    const requestId = service.requestCapability({ appName: 'App1', appDesc: 'desc' })
    const rand = service.getRandomCode(requestId)!
    await service.generateJwt(requestId, rand)

    const apps = service.getApps()
    expect(apps).toHaveLength(1)
    expect(apps[0].appName).toBe('App1')
  })

  it('revokeToken removes app', async () => {
    const { service } = await makeService()
    const requestId = service.requestCapability({ appName: 'App1', appDesc: 'desc' })
    const rand = service.getRandomCode(requestId)!
    await service.generateJwt(requestId, rand)

    expect(service.revokeToken(requestId)).toBe(true)
    expect(service.getApps()).toHaveLength(0)
  })
})
