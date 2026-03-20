import type { LanguageContext, LanguageHandle, LanguageHost, LanguageMeta } from './types'
import type { BundleResolver, BundleExecutor } from './bundle'

export class LanguageManager {
  private host: LanguageHost
  private metadata = new Map<string, LanguageMeta>()
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

  async uninstall(address: string): Promise<void> {
    const handle = this.host.getLoaded(address)
    if (handle) {
      await this.host.unload(handle)
    }
    this.metadata.delete(address)
  }

  getAllInstalled(): LanguageMeta[] {
    return [...this.metadata.values()]
  }
}
