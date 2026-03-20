import type { ContentStore } from '../bootstrap/types'
import type { BundleResolver } from './bundle'

/**
 * Resolves bundles from a ContentStore (which could be HTTP, in-memory, etc.)
 */
export class ContentStoreBundleResolver implements BundleResolver {
  constructor(private contentStore: ContentStore) {}

  async resolve(address: string): Promise<string | null> {
    return this.contentStore.get(address)
  }

  async has(address: string): Promise<boolean> {
    return (await this.contentStore.get(address)) !== null
  }
}

/**
 * Resolves from an in-memory map. Useful for testing and demo bundles.
 */
export class InMemoryBundleResolver implements BundleResolver {
  private bundles = new Map<string, string>()

  register(address: string, source: string): void {
    this.bundles.set(address, source)
  }

  async resolve(address: string): Promise<string | null> {
    return this.bundles.get(address) ?? null
  }

  async has(address: string): Promise<boolean> {
    return this.bundles.has(address)
  }
}
