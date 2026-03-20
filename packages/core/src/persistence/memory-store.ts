import type { KVStore, BlobStore } from './types'

export class InMemoryKVStore implements KVStore {
  private data = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async keys(): Promise<string[]> {
    return [...this.data.keys()]
  }

  async clear(): Promise<void> {
    this.data.clear()
  }
}

export class InMemoryBlobStore implements BlobStore {
  private data = new Map<string, Uint8Array>()

  async get(key: string): Promise<Uint8Array | null> {
    return this.data.get(key) ?? null
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key)
  }
}
