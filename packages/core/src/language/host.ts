import type { Language, LanguageContext, LanguageHandle, LanguageHost } from './types'

export class InProcessLanguageHost implements LanguageHost {
  private loaded = new Map<string, LanguageHandle>()

  async load(address: string, bundle: string | Language, context: LanguageContext): Promise<LanguageHandle> {
    let language: Language
    if (typeof bundle === 'string') {
      const createFn = new Function('return ' + bundle)()
      language = await createFn(context)
    } else {
      language = bundle
    }

    const handle: LanguageHandle = { address, name: language.name, language }
    this.loaded.set(address, handle)
    return handle
  }

  async call<T>(handle: LanguageHandle, adapter: string, method: string, args: any[]): Promise<T> {
    const adapterObj = (handle.language as any)[adapter]
    if (!adapterObj) {
      throw new Error(`Adapter "${adapter}" not found on language "${handle.name}"`)
    }
    const fn = adapterObj[method]
    if (typeof fn !== 'function') {
      throw new Error(`Method "${method}" not found on adapter "${adapter}" of language "${handle.name}"`)
    }
    return fn.apply(adapterObj, args)
  }

  async unload(handle: LanguageHandle): Promise<void> {
    handle.language.teardown?.()
    this.loaded.delete(handle.address)
  }

  getLoaded(address: string): LanguageHandle | undefined {
    return this.loaded.get(address)
  }

  getAllLoaded(): LanguageHandle[] {
    return [...this.loaded.values()]
  }
}
