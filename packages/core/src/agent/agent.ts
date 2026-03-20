import { publicKeyToDid, generateDidDocument } from './did'
import { signExpression, verifyExpression } from './signing'
import type { AgentStatus, CryptoProvider, DecoratedExpressionProof, Expression, WalletStore } from './types'
import type { PubSub } from '../graphql/subscriptions'

type AgentState = 'Uninitialized' | 'Locked' | 'Unlocked'

const WALLET_KEY = 'main-agent'

export class AgentService {
  private state: AgentState = 'Uninitialized'
  private did?: string
  private didDocument?: object
  private privateKey?: Uint8Array

  private crypto: CryptoProvider
  private walletStore: WalletStore
  private pubsub?: PubSub

  constructor(crypto: CryptoProvider, walletStore: WalletStore, pubsub?: PubSub) {
    this.crypto = crypto
    this.walletStore = walletStore
    this.pubsub = pubsub
  }

  getStatus(): AgentStatus {
    return {
      did: this.did,
      didDocument: this.didDocument,
      isInitialized: this.state !== 'Uninitialized',
      isUnlocked: this.state === 'Unlocked'
    }
  }

  async generate(passphrase: string): Promise<void> {
    const keyPair = await this.crypto.generateKeyPair()
    this.did = publicKeyToDid(keyPair.publicKey)
    this.didDocument = generateDidDocument(this.did)
    this.privateKey = keyPair.privateKey

    await this.walletStore.save(WALLET_KEY, passphrase, {
      mainKey: keyPair
    })

    this.state = 'Unlocked'
    this.pubsub?.publish('agentStatusChanged', this.getStatus())
  }

  lock(): void {
    if (this.state !== 'Unlocked') {
      throw new Error('Agent must be unlocked to lock')
    }
    this.privateKey = undefined
    this.state = 'Locked'
    this.pubsub?.publish('agentStatusChanged', this.getStatus())
  }

  async unlock(passphrase: string): Promise<void> {
    if (this.state === 'Uninitialized') {
      throw new Error('Agent must be initialized to unlock')
    }
    const wallet = await this.walletStore.load(WALLET_KEY, passphrase)
    this.privateKey = wallet.mainKey.privateKey
    this.did = publicKeyToDid(wallet.mainKey.publicKey)
    this.didDocument = generateDidDocument(this.did)
    this.state = 'Unlocked'
    this.pubsub?.publish('agentStatusChanged', this.getStatus())
  }

  async createSignedExpression(data: unknown): Promise<Expression<unknown>> {
    if (this.state !== 'Unlocked' || !this.privateKey || !this.did) {
      throw new Error('Agent must be unlocked to sign expressions')
    }
    return signExpression(data, this.crypto, this.privateKey, this.did)
  }

  async verifyExpression(expr: Expression<unknown>): Promise<DecoratedExpressionProof> {
    const result = await verifyExpression(expr, this.crypto)
    return {
      ...expr.proof,
      valid: result.valid,
      invalid: !result.valid
    }
  }
}
