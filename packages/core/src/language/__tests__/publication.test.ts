import { describe, it, expect } from 'vitest'
import { LanguagePublisher } from '../publication'

describe('LanguagePublisher', () => {
  it('publishes a bundle with content-addressed hash', () => {
    const pub = new LanguagePublisher()
    const meta = pub.publishLanguage('console.log("hello")', { name: 'test-lang' }, 'did:test:author')
    expect(meta.address).toBeTruthy()
    expect(meta.address.length).toBe(64) // SHA-256 hex
    expect(meta.name).toBe('test-lang')
    expect(meta.author).toBe('did:test:author')
  })

  it('same content produces same address', () => {
    const pub = new LanguagePublisher()
    const m1 = pub.publishLanguage('same', { name: 'a' }, 'x')
    const m2 = pub.publishLanguage('same', { name: 'b' }, 'y')
    expect(m1.address).toBe(m2.address)
  })

  it('different content produces different address', () => {
    const pub = new LanguagePublisher()
    const m1 = pub.publishLanguage('aaa', { name: 'a' }, 'x')
    const m2 = pub.publishLanguage('bbb', { name: 'a' }, 'x')
    expect(m1.address).not.toBe(m2.address)
  })

  it('getBundle() retrieves stored bundle', () => {
    const pub = new LanguagePublisher()
    const meta = pub.publishLanguage('the-code', { name: 'test' }, 'a')
    expect(pub.getBundle(meta.address)).toBe('the-code')
  })

  it('getMeta() retrieves stored metadata', () => {
    const pub = new LanguagePublisher()
    const meta = pub.publishLanguage('code', { name: 'my-lang', description: 'desc' }, 'did:a')
    const retrieved = pub.getMeta(meta.address)
    expect(retrieved).toEqual(meta)
    expect(retrieved!.description).toBe('desc')
  })

  it('has() checks existence', () => {
    const pub = new LanguagePublisher()
    const meta = pub.publishLanguage('code', { name: 'test' }, 'a')
    expect(pub.has(meta.address)).toBe(true)
    expect(pub.has('nonexistent')).toBe(false)
  })

  it('remove() deletes bundle and metadata', () => {
    const pub = new LanguagePublisher()
    const meta = pub.publishLanguage('code', { name: 'test' }, 'a')
    expect(pub.remove(meta.address)).toBe(true)
    expect(pub.has(meta.address)).toBe(false)
    expect(pub.getBundle(meta.address)).toBeUndefined()
    expect(pub.getMeta(meta.address)).toBeUndefined()
  })

  it('remove() returns false for nonexistent', () => {
    const pub = new LanguagePublisher()
    expect(pub.remove('nope')).toBe(false)
  })

  it('preserves possibleTemplateParams', () => {
    const pub = new LanguagePublisher()
    const meta = pub.publishLanguage('code', { name: 'tpl', possibleTemplateParams: ['uid', 'name'] }, 'a')
    expect(meta.possibleTemplateParams).toEqual(['uid', 'name'])
  })
})
