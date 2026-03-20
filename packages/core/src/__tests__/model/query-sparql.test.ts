import { describe, it, expect } from 'vitest'
import {
  Model,
  Property,
  Flag,
  HasMany,
  BelongsToOne,
  getPropertiesMetadata,
  getRelationsMetadata
} from '../../model/decorators'
import { buildSPARQLQuery, buildSPARQLWhereClause } from '../../model/query-sparql'

// ─── Test Model ─────────────────────────────────────────────────────────────

@Model({ name: 'Message' })
class Message {
  @Property({ through: 'flux://body', required: true, initial: 'literal://string:' })
  body: string = ''

  @Property({ through: 'flux://timestamp', resolveLanguage: 'literal' })
  messageTimestamp: string = ''

  @Flag({ through: 'flux://entry_type', value: 'flux://has_message' })
  type: string = 'flux://has_message'

  @HasMany({ through: 'flux://has_reaction' })
  reactions: string[] = []

  @BelongsToOne({ through: 'flux://has_child' })
  channel: string = ''
}

function getMeta() {
  return {
    properties: getPropertiesMetadata(Message),
    relations: getRelationsMetadata(Message)
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildSPARQLQuery', () => {
  it('generates conformance patterns for required properties', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(properties, relations, {}, Message)

    // Should have conformance for required 'body' and flag 'type'
    expect(sparql).toContain('?base <flux://body> ?_conf0 .')
    expect(sparql).toContain('?base <flux://entry_type> <flux://has_message> .')
    expect(sparql).toContain('?base ?pred ?target .')
  })

  it('generates parent query', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(
      properties,
      relations,
      {
        parent: { id: 'ad4m://channel1', predicate: 'flux://has_child' }
      },
      Message
    )

    expect(sparql).toContain('<ad4m://channel1> <flux://has_child> ?base .')
  })

  it('generates WHERE equality filter for literal property', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(
      properties,
      relations,
      {
        where: { body: 'hello' }
      },
      Message
    )

    expect(sparql).toContain('<literal://string:hello>')
  })

  it('generates WHERE NOT filter', () => {
    const { properties, relations } = getMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      body: { not: 'bad' } as unknown as string
    })

    expect(filters.some((f) => f.includes('FILTER NOT EXISTS'))).toBe(true)
    expect(filters.some((f) => f.includes('literal://string:bad'))).toBe(true)
  })

  it('generates comparison filters (gt, lt, gte, lte)', () => {
    const { properties, relations } = getMeta()
    const { filters, patterns } = buildSPARQLWhereClause(properties, relations, {
      messageTimestamp: { gt: '2024-01-01', lt: '2025-01-01' } as unknown as string
    })

    expect(patterns.length).toBeGreaterThan(0)
    expect(filters.some((f) => f.includes('>'))).toBe(true)
    expect(filters.some((f) => f.includes('<'))).toBe(true)
  })

  it('generates CONTAINS filter', () => {
    const { properties, relations } = getMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      body: { contains: 'search' } as unknown as string
    })

    expect(filters.some((f) => f.includes('CONTAINS'))).toBe(true)
    expect(filters.some((f) => f.includes('search'))).toBe(true)
  })

  it('generates between filter', () => {
    const { properties, relations } = getMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      messageTimestamp: { between: ['2024-01-01', '2025-01-01'] } as unknown as string
    })

    expect(filters.some((f) => f.includes('>=') && f.includes('<='))).toBe(true)
  })

  it('generates belongsTo relation filter', () => {
    const { properties, relations } = getMeta()
    const { patterns } = buildSPARQLWhereClause(properties, relations, {
      channel: 'ad4m://channel1'
    })

    expect(patterns.some((p) => p.includes('<ad4m://channel1>') && p.includes('?base'))).toBe(true)
  })

  it('generates ORDER BY + LIMIT + OFFSET', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(
      properties,
      relations,
      {
        order: { body: 'DESC' },
        limit: 10,
        offset: 5
      },
      Message
    )

    expect(sparql).toContain('ORDER BY DESC(?_ord0)')
    expect(sparql).toContain('LIMIT 10')
    expect(sparql).toContain('OFFSET 5')
  })

  it('combines multiple filters', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(
      properties,
      relations,
      {
        parent: { id: 'ad4m://ch1', predicate: 'flux://has_child' },
        where: { body: 'hello' },
        limit: 5
      },
      Message
    )

    expect(sparql).toContain('<ad4m://ch1> <flux://has_child> ?base .')
    expect(sparql).toContain('<literal://string:hello>')
    expect(sparql).toContain('LIMIT 5')
  })
})
