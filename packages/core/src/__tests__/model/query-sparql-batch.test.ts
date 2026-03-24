import { describe, it, expect } from 'vitest'
import {
  Model,
  Property,
  Optional,
  Flag,
  HasMany,
  HasOne,
  BelongsToOne,
  getPropertiesMetadata,
  getRelationsMetadata
} from '../../model/decorators'
import { buildBatchSPARQLQuery } from '../../model/query-sparql-batch'

// ─── Test Models ────────────────────────────────────────────────────────────

@Model({ name: 'Author' })
class Author {
  @Property({ through: 'author://name', required: true, initial: 'literal://string:uninitialized' })
  name: string = ''

  @Optional({ through: 'author://bio' })
  bio: string = ''
}

@Model({ name: 'Publisher' })
class Publisher {
  @Property({ through: 'publisher://name', required: true, initial: 'literal://string:uninitialized' })
  name: string = ''
}

@Model({ name: 'Book' })
class Book {
  @Property({ through: 'book://title', required: true, initial: 'literal://string:uninitialized' })
  title: string = ''

  @Optional({ through: 'book://rating' })
  rating: number = 0

  @HasMany(() => Author, { through: 'book://author' })
  authors: unknown[] = []

  @HasOne(() => Publisher, { through: 'book://publisher' })
  publisher: unknown = null
}

@Model({ name: 'Library' })
class Library {
  @Property({ through: 'library://name', required: true, initial: 'literal://string:uninitialized' })
  name: string = ''

  @HasMany(() => Book, { through: 'library://book' })
  books: unknown[] = []
}

@Model({ name: 'Comment' })
class Comment {
  @Property({ through: 'comment://text', required: true, initial: 'literal://string:uninitialized' })
  text: string = ''

  @BelongsToOne(() => Book, { through: 'book://comment' })
  book: unknown = null
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildBatchSPARQLQuery', () => {
  describe('flat (1-level) includes', () => {
    it('generates UNION branches for depth 0 and depth 1', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toContain('?depth')
      expect(sparql).toContain('?parentBase')
      expect(sparql).toContain('?relationName')
      expect(sparql).toContain('UNION')
      expect(sparql).toContain('BIND("0" AS ?depth)')
      expect(sparql).toContain('BIND("1" AS ?depth)')
    })

    it('includes the relation predicate for forward relations', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toContain('book://author')
    })

    it('includes conformance joins for root model', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toContain('book://title')
    })

    it('includes conformance joins for included model', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toContain('author://name')
    })

    it('sets correct relationName binding', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toContain('BIND("authors" AS ?relationName)')
    })

    it('generates multiple UNION branches for multiple includes', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true, publisher: true } }, Book)

      expect(sparql).toContain('BIND("1" AS ?depth)')
      expect(sparql).toContain('BIND("2" AS ?depth)')
      expect(sparql).toContain('BIND("authors" AS ?relationName)')
      expect(sparql).toContain('BIND("publisher" AS ?relationName)')
    })
  })

  describe('2-level includes', () => {
    it('generates 3 UNION branches for library→books→authors', () => {
      const props = getPropertiesMetadata(Library)
      const rels = getRelationsMetadata(Library)
      const sparql = buildBatchSPARQLQuery(
        props,
        rels,
        {
          include: {
            books: {
              include: { authors: true }
            }
          }
        },
        Library
      )

      expect(sparql).toContain('BIND("0" AS ?depth)')
      expect(sparql).toContain('BIND("1" AS ?depth)')
      expect(sparql).toContain('BIND("2" AS ?depth)')
      expect(sparql).toContain('library://book')
      expect(sparql).toContain('book://author')
    })
  })

  describe('3-level includes', () => {
    it('generates depth levels 0-3', () => {
      const props = getPropertiesMetadata(Library)
      const rels = getRelationsMetadata(Library)
      const sparql = buildBatchSPARQLQuery(
        props,
        rels,
        {
          include: {
            books: {
              include: {
                authors: true,
                publisher: true
              }
            }
          }
        },
        Library
      )

      expect(sparql).toContain('BIND("0" AS ?depth)')
      expect(sparql).toContain('BIND("1" AS ?depth)')
      expect(sparql).toContain('BIND("2" AS ?depth)')
      expect(sparql).toContain('BIND("3" AS ?depth)')
    })
  })

  describe('reverse (belongsTo) relations', () => {
    it('generates reverse direction pattern for belongsTo', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)

      // Comment belongsTo Book - but we include from Book's perspective
      // Let's use a model that has belongsTo includes
      @Model({ name: 'BookWithComments' })
      class BookWithComments {
        @Property({ through: 'book://title', required: true, initial: 'literal://string:uninitialized' })
        title: string = ''

        @HasMany(() => Comment, { through: 'book://comment' })
        comments: unknown[] = []
      }

      const bwcProps = getPropertiesMetadata(BookWithComments)
      const bwcRels = getRelationsMetadata(BookWithComments)
      const sparql = buildBatchSPARQLQuery(bwcProps, bwcRels, { include: { comments: true } }, BookWithComments)

      // Forward: parentBase --predicate--> source
      expect(sparql).toContain('?parentBase <book://comment> ?source')
    })
  })

  describe('parent filter', () => {
    it('includes parent constraint in root branch', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(
        props,
        rels,
        {
          parent: { id: 'flux://library1', predicate: 'library://books' },
          include: { authors: true }
        },
        Book
      )

      expect(sparql).toContain('flux://library1')
      expect(sparql).toContain('library://books')
    })
  })

  describe('where filter', () => {
    it('includes simple equality where filter', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(
        props,
        rels,
        {
          where: { title: 'My Book' },
          include: { authors: true }
        },
        Book
      )

      expect(sparql).toContain('My Book')
      expect(sparql).toContain('book://title')
    })

    it('includes id filter', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(
        props,
        rels,
        {
          where: { id: 'ad4m://book1' },
          include: { authors: true }
        },
        Book
      )

      expect(sparql).toContain('?source = <ad4m://book1>')
    })

    it('includes id array filter', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(
        props,
        rels,
        {
          where: { id: ['ad4m://book1', 'ad4m://book2'] },
          include: { authors: true }
        },
        Book
      )

      expect(sparql).toContain('?source IN')
      expect(sparql).toContain('ad4m://book1')
      expect(sparql).toContain('ad4m://book2')
    })
  })

  describe('error handling', () => {
    it('throws when include is missing', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      expect(() => buildBatchSPARQLQuery(props, rels, {}, Book)).toThrow('requires query.include')
    })

    it('throws when include is empty', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      expect(() => buildBatchSPARQLQuery(props, rels, { include: {} }, Book)).toThrow('requires query.include')
    })
  })

  describe('query structure', () => {
    it('produces a valid SELECT with required variables', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toMatch(/SELECT\s+\?depth\s+\?parentBase\s+\?relationName\s+\?source\s+\?predicate\s+\?target/)
    })

    it('root branch has empty parentBase and relationName', () => {
      const props = getPropertiesMetadata(Book)
      const rels = getRelationsMetadata(Book)
      const sparql = buildBatchSPARQLQuery(props, rels, { include: { authors: true } }, Book)

      expect(sparql).toContain('BIND("" AS ?parentBase)')
      expect(sparql).toContain('BIND("" AS ?relationName)')
    })
  })
})
