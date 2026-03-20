export function parseExpressionUrl(url: string): { languageAddress: string; expressionAddress: string } {
  if (url.startsWith('literal://')) {
    return { languageAddress: 'literal', expressionAddress: url.slice('literal://'.length) }
  }
  if (url.startsWith('did:')) {
    return { languageAddress: 'agent', expressionAddress: url }
  }
  const idx = url.indexOf('://')
  if (idx === -1) throw new Error(`Invalid expression URL: ${url}`)
  return { languageAddress: url.slice(0, idx), expressionAddress: url.slice(idx + 3) }
}

export function createExpressionUrl(languageAddress: string, expressionAddress: string): string {
  if (languageAddress === 'literal') return `literal://${expressionAddress}`
  return `${languageAddress}://${expressionAddress}`
}

export async function resolveExpression(
  url: string,
  languageManager: {
    getLanguage(address: string): { language: { expressionAdapter?: { get(addr: string): Promise<any> } } } | undefined
  }
): Promise<any | null> {
  const { languageAddress, expressionAddress } = parseExpressionUrl(url)

  if (languageAddress === 'literal') {
    try {
      return JSON.parse(decodeURIComponent(expressionAddress))
    } catch {
      return {
        author: 'literal',
        timestamp: new Date().toISOString(),
        data: decodeURIComponent(expressionAddress),
        proof: { key: '', signature: '', valid: true }
      }
    }
  }

  const handle = languageManager.getLanguage(languageAddress)
  if (!handle) {
    throw new Error(`Language not found: "${languageAddress}"`)
  }

  const adapter = handle.language.expressionAdapter
  if (!adapter) {
    throw new Error(`Language "${languageAddress}" has no expressionAdapter`)
  }

  return adapter.get(expressionAddress)
}
