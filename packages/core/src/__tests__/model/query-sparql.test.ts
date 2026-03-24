import { describe, it, expect } from 'vitest'
import {
  Model,
  Property,
  Optional,
  Flag,
  HasMany,
  BelongsToOne,
  getPropertiesMetadata,
  getRelationsMetadata
} from '../../model/decorators'
import { buildSPARQLQuery, buildSPARQLWhereClause } from '../../model/query-sparql'

// ─── Test Models ────────────────────────────────────────────────────────────

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

@Model({ name: 'Item' })
class Item {
  @Property({ through: 'item://price', required: true, initial: 'literal://string:0', resolveLanguage: 'literal' })
  price: string = ''

  @Property({
    through: 'item://name',
    required: true,
    initial: 'literal://string:uninitialized',
    resolveLanguage: 'literal'
  })
  name: string = ''

  @Optional({ through: 'item://category' })
  category: string = ''
}

function getMeta() {
  return {
    properties: getPropertiesMetadata(Message),
    relations: getRelationsMetadata(Message)
  }
}

function getItemMeta() {
  return {
    properties: getPropertiesMetadata(Item),
    relations: getRelationsMetadata(Item)
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildSPARQLQuery', () => {
  it('generates conformance patterns for required properties', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(properties, relations, {}, Message)

    expect(sparql).toContain('?base <flux://body> ?_conf0 .')
    expect(sparql).toContain('?base <flux://entry_type> <flux://has_message> .')
    expect(sparql).toContain('?base ?pred ?target .')
  })

  it('generates parent query', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(
      properties,
      relations,
      { parent: { id: 'ad4m://channel1', predicate: 'flux://has_child' } },
      Message
    )
    expect(sparql).toContain('<ad4m://channel1> <flux://has_child> ?base .')
  })

  it('generates WHERE equality filter for literal property', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(properties, relations, { where: { body: 'hello' } }, Message)
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
    const sparql = buildSPARQLQuery(properties, relations, { order: { body: 'DESC' }, limit: 10, offset: 5 }, Message)
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

describe('SPARQL comparison filter generation', () => {
  it('generates gt filter for literal property', () => {
    const { properties, relations } = getItemMeta()
    const { filters, patterns } = buildSPARQLWhereClause(properties, relations, {
      price: { gt: 10 } as unknown as string
    })
    expect(patterns.length).toBeGreaterThan(0)
    expect(filters.some((f) => f.includes('>') && f.includes('10'))).toBe(true)
  })

  it('generates gte filter', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      price: { gte: 5 } as unknown as string
    })
    expect(filters.some((f) => f.includes('>='))).toBe(true)
  })

  it('generates lt filter', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      price: { lt: 100 } as unknown as string
    })
    expect(filters.some((f) => f.includes('<') && f.includes('100'))).toBe(true)
  })

  it('generates lte filter', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      price: { lte: 50 } as unknown as string
    })
    expect(filters.some((f) => f.includes('<='))).toBe(true)
  })

  it('generates between filter with both bounds', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      price: { between: [10, 50] } as unknown as string
    })
    expect(filters.some((f) => f.includes('>=') && f.includes('<='))).toBe(true)
  })

  it('generates contains filter', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      name: { contains: 'widget' } as unknown as string
    })
    expect(filters.some((f) => f.includes('CONTAINS') && f.includes('widget'))).toBe(true)
  })

  it('generates not filter', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      name: { not: 'bad' } as unknown as string
    })
    expect(filters.some((f) => f.includes('NOT EXISTS'))).toBe(true)
  })

  it('generates combined gt and lt filters', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      price: { gt: 5, lt: 100 } as unknown as string
    })
    expect(filters.some((f) => f.includes('>'))).toBe(true)
    expect(filters.some((f) => f.includes('<'))).toBe(true)
  })

  it('generates combined gte and lte filters', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      price: { gte: 10, lte: 90 } as unknown as string
    })
    expect(filters.some((f) => f.includes('>='))).toBe(true)
    expect(filters.some((f) => f.includes('<='))).toBe(true)
  })

  it('handles id filter with simple value', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      id: 'ad4m://item1'
    })
    expect(filters.some((f) => f.includes('?base') && f.includes('ad4m://item1'))).toBe(true)
  })

  it('handles id filter with array', () => {
    const { properties, relations } = getItemMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      id: ['ad4m://item1', 'ad4m://item2']
    })
    expect(filters.some((f) => f.includes('IN') && f.includes('ad4m://item1'))).toBe(true)
  })

  it('skips author and timestamp in where clause', () => {
    const { properties, relations } = getItemMeta()
    const { filters, patterns } = buildSPARQLWhereClause(properties, relations, {
      author: 'did:key:alice',
      timestamp: 12345
    } as any)
    expect(filters).toHaveLength(0)
    expect(patterns).toHaveLength(0)
  })

  it('handles IN clause for arrays', () => {
    const { properties, relations } = getItemMeta()
    const { filters, patterns } = buildSPARQLWhereClause(properties, relations, {
      name: ['foo', 'bar']
    })
    expect(patterns.length).toBeGreaterThan(0)
    expect(filters.some((f) => f.includes('IN'))).toBe(true)
  })

  it('handles relation filter for hasMany', () => {
    const { properties, relations } = getMeta()
    const { patterns } = buildSPARQLWhereClause(properties, relations, {
      reactions: 'ad4m://reaction1'
    })
    expect(patterns.some((p) => p.includes('ad4m://reaction1'))).toBe(true)
  })

  it('handles relation filter with array', () => {
    const { properties, relations } = getMeta()
    const { patterns, filters } = buildSPARQLWhereClause(properties, relations, {
      reactions: ['ad4m://r1', 'ad4m://r2']
    })
    expect(patterns.length).toBeGreaterThan(0)
    expect(filters.some((f) => f.includes('IN'))).toBe(true)
  })

  it('handles relation NOT filter', () => {
    const { properties, relations } = getMeta()
    const { filters } = buildSPARQLWhereClause(properties, relations, {
      reactions: { not: 'ad4m://r1' } as unknown as string
    })
    expect(filters.some((f) => f.includes('NOT EXISTS'))).toBe(true)
  })
})

describe('buildSPARQLQuery ORDER BY', () => {
  it('generates ASC order', () => {
    const { properties, relations } = getItemMeta()
    const sparql = buildSPARQLQuery(properties, relations, { order: { name: 'ASC' } }, Item)
    expect(sparql).toContain('ORDER BY ASC(')
  })

  it('generates DESC order', () => {
    const { properties, relations } = getItemMeta()
    const sparql = buildSPARQLQuery(properties, relations, { order: { name: 'DESC' } }, Item)
    expect(sparql).toContain('ORDER BY DESC(')
  })

  it('generates multiple order terms', () => {
    const { properties, relations } = getItemMeta()
    const sparql = buildSPARQLQuery(properties, relations, { order: { name: 'ASC', price: 'DESC' } }, Item)
    expect(sparql).toContain('ORDER BY')
    expect(sparql).toContain('ASC(')
    expect(sparql).toContain('DESC(')
  })

  it('generates LIMIT without ORDER BY', () => {
    const { properties, relations } = getItemMeta()
    const sparql = buildSPARQLQuery(properties, relations, { limit: 25 }, Item)
    expect(sparql).toContain('LIMIT 25')
    expect(sparql).not.toContain('ORDER BY')
  })

  it('generates OFFSET without ORDER BY', () => {
    const { properties, relations } = getItemMeta()
    const sparql = buildSPARQLQuery(properties, relations, { offset: 10 }, Item)
    expect(sparql).toContain('OFFSET 10')
  })

  it('generates ORDER BY + LIMIT + OFFSET combined', () => {
    const { properties, relations } = getItemMeta()
    const sparql = buildSPARQLQuery(properties, relations, { order: { price: 'ASC' }, limit: 20, offset: 40 }, Item)
    expect(sparql).toContain('ORDER BY ASC(')
    expect(sparql).toContain('LIMIT 20')
    expect(sparql).toContain('OFFSET 40')
  })
})

describe('buildSPARQLQuery conformance', () => {
  it('uses flag value directly in conformance', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(properties, relations, {}, Message)
    expect(sparql).toContain('?base <flux://entry_type> <flux://has_message> .')
  })

  it('uses variable binding for non-flag required properties', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(properties, relations, {}, Message)
    expect(sparql).toMatch(/\?base <flux:\/\/body> \?_conf\d+ \./)
  })

  it('falls back to initial-value property when no required properties', () => {
    @Model({ name: 'Flexible' })
    class Flexible {
      @Optional({ through: 'flex://data', resolveLanguage: 'literal' })
      data: string = ''
    }
    const props = getPropertiesMetadata(Flexible)
    const rels = getRelationsMetadata(Flexible)
    const sparql = buildSPARQLQuery(props, rels, {}, Flexible)
    // Should still produce a valid SELECT
    expect(sparql).toContain('SELECT ?base ?pred ?target')
  })

  it('generates SELECT with correct variables', () => {
    const { properties, relations } = getMeta()
    const sparql = buildSPARQLQuery(properties, relations, {}, Message)
    expect(sparql).toContain('SELECT ?base ?pred ?target')
  })
})
