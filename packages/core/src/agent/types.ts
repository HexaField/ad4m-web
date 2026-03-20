export interface CryptoProvider {
  generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }>
  sign(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array>
  verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Promise<boolean>
  sha256(data: Uint8Array): Uint8Array
}

export interface WalletStore {
  exists(key: string): Promise<boolean>
  load(key: string, passphrase: string): Promise<WalletData>
  save(key: string, passphrase: string, data: WalletData): Promise<void>
  destroy(key: string): Promise<void>
}

export interface WalletData {
  mainKey: { publicKey: Uint8Array; privateKey: Uint8Array }
  additionalKeys?: Array<{ publicKey: Uint8Array; privateKey: Uint8Array }>
}

export interface AgentStatus {
  did?: string
  didDocument?: object
  error?: string
  isInitialized: boolean
  isUnlocked: boolean
}

export interface AgentData {
  did: string
  didDocument: object
  signingKeyId: string
  walletKeyName: string
}

export interface ExpressionProof {
  key: string
  signature: string
}

export interface DecoratedExpressionProof extends ExpressionProof {
  valid?: boolean
  invalid?: boolean
}

export interface Expression<T> {
  author: string
  timestamp: string
  data: T
  proof: ExpressionProof
}

export interface Link {
  source: string
  target: string
  predicate?: string
}
