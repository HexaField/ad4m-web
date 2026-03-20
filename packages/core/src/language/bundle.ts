import type { Language, LanguageContext } from './types'

/**
 * A language bundle is a JavaScript module that exports create().
 * The create function receives a LanguageContext and returns a Language object.
 */
export interface LanguageBundleExports {
  create(context: LanguageContext): Language | Promise<Language>
}

/**
 * Resolves language addresses to their JavaScript bundle source code.
 */
export interface BundleResolver {
  resolve(address: string): Promise<string | null>
  has(address: string): Promise<boolean>
}

/**
 * Executes a language bundle source string and returns the Language object.
 * Core defines the interface; platform-specific implementations (Web Worker, etc.)
 * are provided by the client package.
 */
export interface BundleExecutor {
  execute(source: string, context: LanguageContext): Promise<Language>
  destroy(): void
}
