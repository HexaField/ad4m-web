import type { WalletStore } from '../agent/types'

/** Generic key-value store interface */
export interface KVStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
}

/** Binary store (for Oxigraph dumps, language bundles, etc.) */
export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>
  set(key: string, value: Uint8Array): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
}

/** Persistence config — what stores to use */
export interface PersistenceConfig {
  agentStore: KVStore
  walletStore: WalletStore
  perspectiveStore: KVStore
  linkStoreData: KVStore
  languageCache: BlobStore
}

/** Debounced writer interface */
export interface DebouncedWriter {
  markDirty(): void
  flush(): Promise<void>
  stop(): void
}
