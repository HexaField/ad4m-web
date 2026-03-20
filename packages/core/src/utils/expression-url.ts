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
