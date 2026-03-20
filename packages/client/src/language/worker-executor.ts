import type { BundleExecutor, LanguageBundleExports } from '@ad4m-web/core'
import type { Language, LanguageContext } from '@ad4m-web/core'

/**
 * Executes language bundles in the browser.
 *
 * MVP: in-process execution via Function constructor (same as InProcessBundleExecutor).
 *
 * TODO: Full Web Worker isolation — each language runs in its own Worker with
 * a message-passing proxy for every adapter call. This provides proper sandboxing
 * but requires serializing all adapter calls across the Worker boundary, which is
 * significant complexity. For MVP, in-process is sufficient.
 */
export class WebWorkerBundleExecutor implements BundleExecutor {
  private worker: Worker | null = null

  async execute(source: string, context: LanguageContext): Promise<Language> {
    const moduleObj = { exports: {} as any }
    const fn = new Function('module', 'exports', 'require', source)
    fn(moduleObj, moduleObj.exports, () => {
      throw new Error('require not supported')
    })

    const exports = moduleObj.exports as LanguageBundleExports
    if (typeof exports.create !== 'function') {
      throw new Error('Language bundle must export a create() function')
    }

    return await exports.create(context)
  }

  destroy(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
