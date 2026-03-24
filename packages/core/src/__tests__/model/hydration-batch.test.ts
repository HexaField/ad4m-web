import { describe, it, expect } from 'vitest'
import {
  Model,
  Property,
  Optional,
  HasMany,
  HasOne,
  getPropertiesMetadata,
  getRelationsMetadata
} from '../../model/decorators'
import { hydrateBatchResult } from '../../model/hydration-batch'
import type { BatchRow } from '../../model/hydration-batch'

// ─── Test Models ────────────────────────────────────────────────────────────

@Model({ name: 'Author' })
class Author {
  @Property({
    through: 'author://name',
    required: true,
    initial: 'literal://string:uninitialized',
    resolveLanguage: 'literal'
  })
  name: string = ''

  @Optional({ through: 'author://bio', resolveLanguage: 'literal' })
  bio: string = ''
}

@Model({ name: 'Book' })
class Book {
  @Property({
    through: 'book://title',
    required: true,
    initial: 'literal://string:uninitialized',
    resolveLanguage: 'literal'
  })
  title: string = ''

  @HasMany(() => Author, { through: 'book://author' })
  authors: Author[] = []

  @HasOne(() => Author, { through: 'book://editor' })
  editor: Author | null = null
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('hydrateBatchResult', () => {
  it('returns empty array for empty rows', () => {
    const result = hydrateBatchResult([], Book as any, { authors: true })
    expect(result).toEqual([])
  })

  it('hydrates root instances from depth 0 rows', () => {
    const rows: BatchRow[] = [
      {
        depth: '0',
        parentBase: '',
        relationName: '',
        source: 'ad4m://book1',
        predicate: 'book://title',
        target: 'literal://string:MyBook'
      }
    ]
    const result = hydrateBatchResult(rows, Book as any, { authors: true })
    expect(result).toHaveLength(1)
    expect((result[0] as any).id).toBe('ad4m://book1')
    expect((result[0] as any).title).toBe('MyBook')
  })

  it('hydrates and wires hasMany children to parents', () => {
    const rows: BatchRow[] = [
      {
        depth: '0',
        parentBase: '',
        relationName: '',
        source: 'ad4m://book1',
        predicate: 'book://title',
        target: 'literal://string:MyBook'
      },
      {
        depth: '1',
        parentBase: 'ad4m://book1',
        relationName: 'authors',
        source: 'ad4m://author1',
        predicate: 'author://name',
        target: 'literal://string:Alice'
      },
      {
        depth: '1',
        parentBase: 'ad4m://book1',
        relationName: 'authors',
        source: 'ad4m://author2',
        predicate: 'author://name',
        target: 'literal://string:Bob'
      }
    ]
    const result = hydrateBatchResult(rows, Book as any, { authors: true })
    expect(result).toHaveLength(1)
    const book = result[0] as any
    expect(book.authors).toHaveLength(2)
    expect(book.authors[0].name).toBe('Alice')
    expect(book.authors[1].name).toBe('Bob')
  })

  it('hydrates and wires hasOne children to parents', () => {
    const rows: BatchRow[] = [
      {
        depth: '0',
        parentBase: '',
        relationName: '',
        source: 'ad4m://book1',
        predicate: 'book://title',
        target: 'literal://string:MyBook'
      },
      {
        depth: '1',
        parentBase: 'ad4m://book1',
        relationName: 'editor',
        source: 'ad4m://editor1',
        predicate: 'author://name',
        target: 'literal://string:Eve'
      }
    ]
    const result = hydrateBatchResult(rows, Book as any, { editor: true })
    const book = result[0] as any
    expect(book.editor).toBeDefined()
    expect(book.editor.name).toBe('Eve')
  })

  it('handles multiple root instances', () => {
    const rows: BatchRow[] = [
      {
        depth: '0',
        parentBase: '',
        relationName: '',
        source: 'ad4m://book1',
        predicate: 'book://title',
        target: 'literal://string:Book1'
      },
      {
        depth: '0',
        parentBase: '',
        relationName: '',
        source: 'ad4m://book2',
        predicate: 'book://title',
        target: 'literal://string:Book2'
      },
      {
        depth: '1',
        parentBase: 'ad4m://book1',
        relationName: 'authors',
        source: 'ad4m://a1',
        predicate: 'author://name',
        target: 'literal://string:Alice'
      },
      {
        depth: '1',
        parentBase: 'ad4m://book2',
        relationName: 'authors',
        source: 'ad4m://a2',
        predicate: 'author://name',
        target: 'literal://string:Bob'
      }
    ]
    const result = hydrateBatchResult(rows, Book as any, { authors: true })
    expect(result).toHaveLength(2)
    expect((result[0] as any).authors).toHaveLength(1)
    expect((result[1] as any).authors).toHaveLength(1)
  })

  it('handles null/undefined rows gracefully', () => {
    expect(hydrateBatchResult(null as any, Book as any, { authors: true })).toEqual([])
    expect(hydrateBatchResult(undefined as any, Book as any, { authors: true })).toEqual([])
  })
})
