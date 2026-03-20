import { describe, it, expect } from 'vitest'
import { parseLiteral, toLiteral } from '../literals'

describe('parseLiteral', () => {
  it('parses string literal', () => {
    expect(parseLiteral('literal://string:hello world')).toEqual({ type: 'string', value: 'hello world' })
  })

  it('parses number literal', () => {
    expect(parseLiteral('literal://number:42')).toEqual({ type: 'number', value: 42 })
  })

  it('parses boolean literal', () => {
    expect(parseLiteral('literal://boolean:true')).toEqual({ type: 'boolean', value: true })
    expect(parseLiteral('literal://boolean:false')).toEqual({ type: 'boolean', value: false })
  })

  it('parses json literal', () => {
    expect(parseLiteral('literal://json({"a":1})')).toEqual({ type: 'json', value: { a: 1 } })
  })

  it('returns null for non-literal URIs', () => {
    expect(parseLiteral('did:key:z6Mk')).toBeNull()
    expect(parseLiteral('https://example.com')).toBeNull()
    expect(parseLiteral('ad4m://test')).toBeNull()
  })
})

describe('toLiteral', () => {
  it('round-trips string', () => {
    const uri = toLiteral('hello')
    expect(parseLiteral(uri)).toEqual({ type: 'string', value: 'hello' })
  })

  it('round-trips number', () => {
    const uri = toLiteral(42)
    expect(parseLiteral(uri)).toEqual({ type: 'number', value: 42 })
  })

  it('round-trips boolean', () => {
    const uri = toLiteral(true)
    expect(parseLiteral(uri)).toEqual({ type: 'boolean', value: true })
  })
})
