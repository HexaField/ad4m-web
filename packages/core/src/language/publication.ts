import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { LanguageMeta } from './types'
import type { LanguageMetaInput } from './registry-types'

/**
 * In-memory content-addressed language bundle store.
 * In production, this would use a "Language Language" to publish to the network.
 */
export class LanguagePublisher {
  private bundles = new Map<string, string>()
  private metadata = new Map<string, LanguageMeta>()

  /**
   * Publish a language bundle. The address is the SHA-256 hash of the bundle content.
   */
  publishLanguage(bundleContent: string, metaInput: LanguageMetaInput, author: string): LanguageMeta {
    const address = bytesToHex(sha256(new TextEncoder().encode(bundleContent)))

    const meta: LanguageMeta = {
      address,
      name: metaInput.name,
      author,
      description: metaInput.description,
      possibleTemplateParams: metaInput.possibleTemplateParams,
      sourceCodeLink: address
    }

    this.bundles.set(address, bundleContent)
    this.metadata.set(address, meta)
    return meta
  }

  /**
   * Retrieve a published bundle by address.
   */
  getBundle(address: string): string | undefined {
    return this.bundles.get(address)
  }

  /**
   * Retrieve published metadata by address.
   */
  getMeta(address: string): LanguageMeta | undefined {
    return this.metadata.get(address)
  }

  /**
   * Check if a bundle exists.
   */
  has(address: string): boolean {
    return this.bundles.has(address)
  }

  /**
   * Remove a published language.
   */
  remove(address: string): boolean {
    this.metadata.delete(address)
    return this.bundles.delete(address)
  }
}
