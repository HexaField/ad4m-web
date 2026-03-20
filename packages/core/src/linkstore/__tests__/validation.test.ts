import { describe, it, expect } from 'vitest'
import { isValidUri, validateLink } from '../validation'
import type { Link } from '../../agent/types'

describe('isValidUri', () => {
  it.each(['did:key:z6Mk...', 'literal://string:hello', 'https://example.com', 'ad4m://has_child'])(
    'accepts %s',
    (uri) => {
      expect(isValidUri(uri)).toBe(true)
    }
  )

  it.each(['', 'no-scheme', '123:bad', ':empty'])('rejects %s', (uri) => {
    expect(isValidUri(uri)).toBe(false)
  })
})

describe('validateLink', () => {
  it('throws on invalid source URI', () => {
    const link: Link = { source: 'bad', target: 'did:key:z6Mk' }
    expect(() => validateLink(link)).toThrow('Invalid source URI')
  })

  it('throws on invalid target URI', () => {
    const link: Link = { source: 'did:key:z6Mk', target: 'bad' }
    expect(() => validateLink(link)).toThrow('Invalid target URI')
  })

  it('normalizes empty predicate to undefined', () => {
    const link: Link = { source: 'did:key:z6Mk', target: 'did:key:z6Mn', predicate: '' }
    validateLink(link)
    expect(link.predicate).toBeUndefined()
  })
})
