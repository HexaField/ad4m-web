import type { ExpressionAdapter, PublicSharing, Language, LanguageHandle } from './types'
import type { LanguageManager } from './manager'
import type { Expression } from '../agent/types'

export type { ExpressionAdapter, PublicSharing }

/**
 * Resolve an expression from a language handle by address.
 */
export async function getExpression(handle: LanguageHandle, address: string): Promise<Expression<unknown> | null> {
  const adapter = handle.language.expressionAdapter
  if (!adapter) {
    throw new Error(`Language "${handle.name}" does not have an expressionAdapter`)
  }
  return adapter.get(address)
}

/**
 * Create a new expression via a language's public sharing adapter.
 */
export async function createExpression(handle: LanguageHandle, content: object): Promise<string> {
  const adapter = handle.language.expressionAdapter
  if (!adapter) {
    throw new Error(`Language "${handle.name}" does not have an expressionAdapter`)
  }
  const putAdapter = adapter.putAdapter as PublicSharing
  if (!putAdapter.createPublic) {
    throw new Error(`Language "${handle.name}" does not support public sharing`)
  }
  return putAdapter.createPublic(content)
}

/**
 * Resolve an expression URL to its expression, using the language manager.
 * Supports `literal://`, `did:`, and `lang://addr` schemes.
 */
export async function resolveExpressionFromUrl(
  url: string,
  languageManager: LanguageManager
): Promise<Expression<unknown> | null> {
  const { parseExpressionUrl } = await import('../utils/expression-url.js')
  const { languageAddress, expressionAddress } = parseExpressionUrl(url)

  if (languageAddress === 'literal') {
    return parseLiteralExpression(expressionAddress)
  }

  const handle = languageManager.getLanguage(languageAddress)
  if (!handle) {
    throw new Error(`Language not found: "${languageAddress}"`)
  }

  return getExpression(handle, expressionAddress)
}

function parseLiteralExpression(encoded: string): Expression<unknown> {
  try {
    const decoded = decodeURIComponent(encoded)
    const parsed = JSON.parse(decoded)
    return parsed
  } catch {
    return {
      author: 'literal',
      timestamp: new Date().toISOString(),
      data: decodeURIComponent(encoded),
      proof: { key: '', signature: '', valid: true }
    } as unknown as Expression<unknown>
  }
}
