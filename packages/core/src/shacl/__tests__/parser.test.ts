import { describe, it, expect } from 'vitest'
import { parseShapes } from '../parser'
import type { LinkExpression } from '../../linkstore/types'
import { buildMessageShapeLinks } from './helpers'

function link(source: string, predicate: string, target: string): LinkExpression {
  return {
    author: 'did:test',
    timestamp: '2026-01-01T00:00:00.000Z',
    data: { source, predicate, target },
    proof: { key: '', signature: '' }
  }
}

describe('parseShapes', () => {
  it('parses a complete SHACL shape from links', () => {
    const links = buildMessageShapeLinks()
    const classes = parseShapes(links)
    expect(classes.length).toBe(1)
    expect(classes[0].name).toBe('Message')
  })

  it('parses class name from targetClass', () => {
    const links = [
      link('shape://Test', 'rdf://type', 'sh://NodeShape'),
      link('shape://Test', 'sh://targetClass', 'ad4m://Message')
    ]
    const classes = parseShapes(links)
    expect(classes[0].name).toBe('Message')
  })

  it('parses property with all attributes', () => {
    const links = buildMessageShapeLinks()
    const cls = parseShapes(links)[0]
    const body = cls.properties.find((p) => p.name === 'body')!
    expect(body.path).toBe('ad4m://body')
    expect(body.datatype).toBe('xsd://string')
    expect(body.maxCount).toBe(1)
    expect(body.minCount).toBe(1)
    expect(body.writable).toBe(true)
  })

  it('parses constructor/destructor actions', () => {
    const links = buildMessageShapeLinks()
    const cls = parseShapes(links)[0]
    expect(cls.constructor).toBeDefined()
    expect(cls.constructor!.length).toBeGreaterThan(0)
    expect(cls.destructor).toBeDefined()
  })

  it('parses setter actions', () => {
    const links = buildMessageShapeLinks()
    const cls = parseShapes(links)[0]
    const body = cls.properties.find((p) => p.name === 'body')!
    expect(body.setter).toBeDefined()
    expect(body.setter![0].action).toBe('setSingleTarget')
  })

  it('parses adder/remover actions on collection', () => {
    const links = buildMessageShapeLinks()
    const cls = parseShapes(links)[0]
    const reactions = cls.properties.find((p) => p.name === 'reactions')!
    expect(reactions.adder).toBeDefined()
    expect(reactions.remover).toBeDefined()
    expect(reactions.maxCount).toBeUndefined()
  })

  it('parses multiple classes', () => {
    const links = [
      link('shape://A', 'rdf://type', 'sh://NodeShape'),
      link('shape://A', 'sh://targetClass', 'ad4m://ClassA'),
      link('shape://B', 'rdf://type', 'sh://NodeShape'),
      link('shape://B', 'sh://targetClass', 'ad4m://ClassB')
    ]
    const classes = parseShapes(links)
    expect(classes.length).toBe(2)
    const names = classes.map((c) => c.name).sort()
    expect(names).toEqual(['ClassA', 'ClassB'])
  })
})
