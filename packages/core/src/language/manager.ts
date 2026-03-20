import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { ContentStore } from '../bootstrap/types'
import type { LanguageContext, LanguageHandle, LanguageHost, LanguageMeta } from './types'
import type { BundleResolver, BundleExecutor } from './bundle'
import type { LanguageHandleInfo } from './registry-types'

export class LanguageManager {
  private host: LanguageHost
  private metadata = new Map<string, LanguageMeta>()
  private settings = new Map<string, string>()
  private sources = new Map<string, string>()
  private bundleResolver?: BundleResolver
  private bundleExecutor?: BundleExecutor
  private languageContext?: LanguageContext

  constructor(host: LanguageHost) {
    this.host = host
  }

  setBundleResolver(resolver: BundleResolver): void {
    this.bundleResolver = resolver
  }

  setBundleExecutor(executor: BundleExecutor): void {
    this.bundleExecutor = executor
  }

  setLanguageContext(context: LanguageContext): void {
    this.languageContext = context
  }

  async install(
    address: string,
    meta: LanguageMeta,
    bundle?: string,
    context?: LanguageContext
  ): Promise<LanguageHandle> {
    let source = bundle

    // If no bundle provided, try resolving from the bundle resolver
    if (!source && this.bundleResolver) {
      source = (await this.bundleResolver.resolve(address)) ?? undefined
    }

    const ctx = context ?? this.languageContext
    if (!ctx) {
      throw new Error('No LanguageContext provided and none set on manager')
    }

    if (!source) {
      throw new Error(`No bundle source available for language "${address}"`)
    }

    // Store the source for later retrieval
    this.sources.set(address, source)

    // If we have a bundle executor, use it to create the Language, then load via host
    if (this.bundleExecutor) {
      const language = await this.bundleExecutor.execute(source, ctx)
      const handle = await this.host.load(address, language as any, ctx)
      this.metadata.set(address, meta)
      return handle
    }

    // Fallback: pass raw source to host (InProcessLanguageHost handles string bundles)
    const handle = await this.host.load(address, source, ctx)
    this.metadata.set(address, meta)
    return handle
  }

  getLanguage(address: string): LanguageHandle | undefined {
    return this.host.getLoaded(address)
  }

  getMeta(address: string): LanguageMeta | undefined {
    return this.metadata.get(address)
  }

  getLanguageSource(address: string): string {
    const source = this.sources.get(address)
    if (!source) {
      throw new Error(`Source not found for language "${address}"`)
    }
    return source
  }

  listLanguages(filter?: string): LanguageHandleInfo[] {
    const allHandles = this.host.getAllLoaded()
    return allHandles
      .filter((h) => !filter || h.name.toLowerCase().includes(filter.toLowerCase()))
      .map((h) => this.toHandleInfo(h))
  }

  removeLanguage(address: string): boolean {
    const handle = this.host.getLoaded(address)
    if (!handle) return false
    void this.host.unload(handle)
    this.metadata.delete(address)
    this.sources.delete(address)
    this.settings.delete(address)
    return true
  }

  writeSettings(address: string, settingsJson: string): boolean {
    const handle = this.host.getLoaded(address)
    if (!handle) return false
    this.settings.set(address, settingsJson)
    return true
  }

  getSettings(address: string): string {
    return this.settings.get(address) ?? '{}'
  }

  async uninstall(address: string): Promise<void> {
    const handle = this.host.getLoaded(address)
    if (handle) {
      await this.host.unload(handle)
    }
    this.metadata.delete(address)
    this.sources.delete(address)
    this.settings.delete(address)
  }

  getAllInstalled(): LanguageMeta[] {
    return [...this.metadata.values()]
  }

  async applyTemplateAndPublish(
    sourceAddress: string,
    templateData: string,
    contentStore?: ContentStore
  ): Promise<{ address: string; meta: LanguageMeta }> {
    if (!this.bundleResolver) {
      throw new Error('No bundle resolver configured')
    }

    const sourceBundle = await this.bundleResolver.resolve(sourceAddress)
    if (!sourceBundle) {
      throw new Error(`Source language not found: "${sourceAddress}"`)
    }

    const params: Record<string, string> = JSON.parse(templateData)
    let result = sourceBundle
    for (const [key, value] of Object.entries(params)) {
      result = result.replaceAll(`{{${key}}}`, value)
    }

    const hash = bytesToHex(sha256(new TextEncoder().encode(result)))

    if (contentStore) {
      await contentStore.put(result)
    }

    const sourceMeta = this.metadata.get(sourceAddress)
    const meta: LanguageMeta = {
      address: hash,
      name: sourceMeta?.name ?? 'templated-language',
      author: sourceMeta?.author ?? 'unknown',
      description: sourceMeta?.description,
      templated: true,
      templateSourceLanguageAddress: sourceAddress,
      templateAppliedParams: templateData
    }

    this.metadata.set(hash, meta)
    this.sources.set(hash, result)
    return { address: hash, meta }
  }

  private toHandleInfo(handle: LanguageHandle): LanguageHandleInfo {
    const lang = handle.language
    return {
      address: handle.address,
      name: handle.name,
      settings: this.settings.get(handle.address),
      icon: lang.expressionUI ? { code: lang.expressionUI.icon() } : undefined,
      constructorIcon: lang.expressionUI ? { code: lang.expressionUI.constructorIcon() } : undefined,
      settingsIcon: lang.settingsUI ? { code: lang.settingsUI.settingsIcon() } : undefined
    }
  }
}
