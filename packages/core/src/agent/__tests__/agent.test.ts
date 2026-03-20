import { describe, expect, it } from 'vitest'
import { AgentService } from '../agent'
import { NobleCryptoProvider } from '../crypto'
import type { WalletData, WalletStore } from '../types'

class InMemoryWalletStore implements WalletStore {
  private store = new Map<string, { passphrase: string; data: WalletData }>()

  async exists(key: string): Promise<boolean> {
    return this.store.has(key)
  }

  async load(key: string, passphrase: string): Promise<WalletData> {
    const entry = this.store.get(key)
    if (!entry || entry.passphrase !== passphrase) {
      throw new Error('Invalid passphrase or wallet not found')
    }
    return entry.data
  }

  async save(key: string, passphrase: string, data: WalletData): Promise<void> {
    this.store.set(key, { passphrase, data })
  }

  async destroy(key: string): Promise<void> {
    this.store.delete(key)
  }
}

const crypto = new NobleCryptoProvider()

describe('AgentService', () => {
  it('starts in Uninitialized state', () => {
    const agent = new AgentService(crypto, new InMemoryWalletStore())
    const status = agent.getStatus()
    expect(status.isInitialized).toBe(false)
    expect(status.isUnlocked).toBe(false)
  })

  it('generate() transitions to Unlocked', async () => {
    const agent = new AgentService(crypto, new InMemoryWalletStore())
    await agent.generate('password')
    const status = agent.getStatus()
    expect(status.isInitialized).toBe(true)
    expect(status.isUnlocked).toBe(true)
    expect(status.did).toMatch(/^did:key:z/)
    expect(status.didDocument).toBeDefined()
  })

  it('lock() transitions to Locked', async () => {
    const agent = new AgentService(crypto, new InMemoryWalletStore())
    await agent.generate('password')
    agent.lock()
    const status = agent.getStatus()
    expect(status.isInitialized).toBe(true)
    expect(status.isUnlocked).toBe(false)
  })

  it('unlock() transitions to Unlocked', async () => {
    const store = new InMemoryWalletStore()
    const agent = new AgentService(crypto, store)
    await agent.generate('password')
    agent.lock()
    await agent.unlock('password')
    const status = agent.getStatus()
    expect(status.isInitialized).toBe(true)
    expect(status.isUnlocked).toBe(true)
  })

  it('createSignedExpression() fails when locked', async () => {
    const agent = new AgentService(crypto, new InMemoryWalletStore())
    await agent.generate('password')
    agent.lock()
    await expect(agent.createSignedExpression('test')).rejects.toThrow()
  })

  it('createSignedExpression() produces verifiable expression', async () => {
    const agent = new AgentService(crypto, new InMemoryWalletStore())
    await agent.generate('password')
    const expr = await agent.createSignedExpression({ msg: 'hello' })
    const proof = await agent.verifyExpression(expr)
    expect(proof.valid).toBe(true)
    expect(proof.invalid).toBe(false)
  })

  it('full lifecycle: generate → sign → lock → unlock → sign again', async () => {
    const store = new InMemoryWalletStore()
    const agent = new AgentService(crypto, store)

    await agent.generate('pass123')
    const expr1 = await agent.createSignedExpression('first')
    expect((await agent.verifyExpression(expr1)).valid).toBe(true)

    agent.lock()
    await expect(agent.createSignedExpression('fail')).rejects.toThrow()

    await agent.unlock('pass123')
    const expr2 = await agent.createSignedExpression('second')
    expect((await agent.verifyExpression(expr2)).valid).toBe(true)
  })
})
