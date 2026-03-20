import type { LanguageContext, LanguageHandle, LanguageHost, LanguageMeta } from './types'

export class LanguageManager {
  private host: LanguageHost
  private metadata = new Map<string, LanguageMeta>()

  constructor(host: LanguageHost) {
    this.host = host
  }

  async install(
    address: string,
    meta: LanguageMeta,
    bundle: string,
    context: LanguageContext
  ): Promise<LanguageHandle> {
    const handle = await this.host.load(address, bundle, context)
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
