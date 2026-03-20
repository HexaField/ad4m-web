import type { Language, LanguageContext } from './types'
import type { BundleExecutor, LanguageBundleExports } from './bundle'

/**
 * Simple in-process executor that uses the Function constructor.
 * Suitable for testing and environments where isolation is not critical.
 */
export class InProcessBundleExecutor implements BundleExecutor {
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
    // No-op for in-process
  }
}
