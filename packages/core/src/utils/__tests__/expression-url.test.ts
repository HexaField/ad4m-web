import { describe, it, expect } from 'vitest'
import { parseExpressionUrl, createExpressionUrl } from '../expression-url'

describe('parseExpressionUrl', () => {
  it('parses literal:// URLs', () => {
    const result = parseExpressionUrl('literal://string:hello')
    expect(result).toEqual({ languageAddress: 'literal', expressionAddress: 'string:hello' })
  })

  it('parses did: URLs as agent language', () => {
    const result = parseExpressionUrl('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')
    expect(result).toEqual({
      languageAddress: 'agent',
      expressionAddress: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    })
  })

  it('parses normal lang://addr URLs', () => {
    const result = parseExpressionUrl('QmHash123://exprAddr456')
    expect(result).toEqual({ languageAddress: 'QmHash123', expressionAddress: 'exprAddr456' })
  })

  it('throws on invalid URL without ://', () => {
    expect(() => parseExpressionUrl('invalid-no-scheme')).toThrow('Invalid expression URL')
  })
})

describe('createExpressionUrl', () => {
  it('creates literal:// URLs', () => {
    expect(createExpressionUrl('literal', 'string:hello')).toBe('literal://string:hello')
  })

  it('creates normal URLs', () => {
    expect(createExpressionUrl('QmHash', 'addr')).toBe('QmHash://addr')
  })

  it('roundtrips with parseExpressionUrl', () => {
    const url = 'QmHash123://exprAddr456'
    const parsed = parseExpressionUrl(url)
    expect(createExpressionUrl(parsed.languageAddress, parsed.expressionAddress)).toBe(url)

    const literalUrl = 'literal://string:test'
    const parsedLiteral = parseExpressionUrl(literalUrl)
    expect(createExpressionUrl(parsedLiteral.languageAddress, parsedLiteral.expressionAddress)).toBe(literalUrl)
  })
})
