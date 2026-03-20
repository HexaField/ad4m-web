import { describe, it, expect, beforeEach } from 'vitest'
import { Model, Property, Optional, Flag, HasMany } from '../../model/decorators'
import { Ad4mModel } from '../../model/Ad4mModel'
import { createPerspectiveHandle, type ModelPerspectiveHandle } from '../../model/perspective-handle'
import { InMemoryLinkStore } from '../../linkstore/store'
import { ShaclEngine } from '../../shacl/engine'
import { PerspectiveManager } from '../../perspective/manager'
import type { AgentService } from '../../agent/agent'

// ─── Test Model ─────────────────────────────────────────────────────────────

@Model({ name: 'Recipe' })
class Recipe extends Ad4mModel {
  @Property({ through: 'recipe://name', resolveLanguage: 'literal', required: true })
  name: string = ''

  @Optional({ through: 'recipe://description', resolveLanguage: 'literal' })
  description: string = ''

  @Flag({ through: 'recipe://type', value: 'recipe://Recipe' })
  type: string = ''

  @HasMany({ through: 'recipe://tag' })
  tags: string[] = []
}

// ─── Test helpers ───────────────────────────────────────────────────────────

function createTestPerspective(): { handle: ModelPerspectiveHandle; uuid: string } {
  const linkStore = new InMemoryLinkStore()
  const shaclEngine = new ShaclEngine(linkStore)
  const agentService = {} as AgentService
  const manager = new PerspectiveManager(linkStore, shaclEngine, agentService)
  const perspective = manager.add('test')
  const uuid = perspective.uuid
  const handle = createPerspectiveHandle(manager, shaclEngine, uuid)
  return { handle, uuid }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Ad4mModel', () => {
  let perspective: ModelPerspectiveHandle

  beforeEach(() => {
    const ctx = createTestPerspective()
    perspective = ctx.handle
  })

  describe('create', () => {
    it('creates an instance with links for properties', async () => {
      const recipe = await Recipe.create(perspective, { name: 'Pasta Carbonara' })

      expect(recipe).toBeInstanceOf(Recipe)
      expect(recipe._baseExpression).toBeTruthy()
      expect(recipe._baseExpression).toMatch(/^ad4m:\/\/self\//)
      expect(recipe.name).toBe('Pasta Carbonara')
    })

    it('creates with default values when no data provided', async () => {
      const recipe = await Recipe.create(perspective)

      expect(recipe).toBeInstanceOf(Recipe)
      expect(recipe._baseExpression).toBeTruthy()
    })
  })

  describe('findAll', () => {
    it('returns all instances', async () => {
      await Recipe.create(perspective, { name: 'Pasta' })
      await Recipe.create(perspective, { name: 'Pizza' })
      await Recipe.create(perspective, { name: 'Salad' })

      const all = await Recipe.findAll(perspective)
      expect(all).toHaveLength(3)
      const names = all.map((r) => r.name).sort()
      expect(names).toEqual(['Pasta', 'Pizza', 'Salad'])
    })

    it('filters with where clause', async () => {
      await Recipe.create(perspective, { name: 'Pasta' })
      await Recipe.create(perspective, { name: 'Pizza' })

      const results = await Recipe.findAll(perspective, {
        where: { name: 'Pasta' }
      })
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Pasta')
    })

    it('applies limit', async () => {
      await Recipe.create(perspective, { name: 'A' })
      await Recipe.create(perspective, { name: 'B' })
      await Recipe.create(perspective, { name: 'C' })

      const results = await Recipe.findAll(perspective, { limit: 2 })
      expect(results).toHaveLength(2)
    })

    it('applies offset', async () => {
      await Recipe.create(perspective, { name: 'A' })
      await Recipe.create(perspective, { name: 'B' })
      await Recipe.create(perspective, { name: 'C' })

      const results = await Recipe.findAll(perspective, { offset: 1 })
      expect(results).toHaveLength(2)
    })
  })

  describe('findOne', () => {
    it('returns first matching instance', async () => {
      await Recipe.create(perspective, { name: 'Pasta' })
      await Recipe.create(perspective, { name: 'Pizza' })

      const result = await Recipe.findOne(perspective, { where: { name: 'Pizza' } })
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Pizza')
    })

    it('returns null when no match', async () => {
      await Recipe.create(perspective, { name: 'Pasta' })

      const result = await Recipe.findOne(perspective, { where: { name: 'Nonexistent' } })
      expect(result).toBeNull()
    })
  })

  describe('findById', () => {
    it('finds by base expression', async () => {
      const created = await Recipe.create(perspective, { name: 'Pasta' })
      const found = await Recipe.findById(perspective, created._baseExpression)

      expect(found).not.toBeNull()
      expect(found!.name).toBe('Pasta')
      expect(found!._baseExpression).toBe(created._baseExpression)
    })

    it('returns null for unknown id', async () => {
      const found = await Recipe.findById(perspective, 'ad4m://self/nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('count', () => {
    it('counts all instances', async () => {
      await Recipe.create(perspective, { name: 'A' })
      await Recipe.create(perspective, { name: 'B' })

      const c = await Recipe.count(perspective)
      expect(c).toBe(2)
    })

    it('counts with where filter', async () => {
      await Recipe.create(perspective, { name: 'Pasta' })
      await Recipe.create(perspective, { name: 'Pizza' })

      const c = await Recipe.count(perspective, { where: { name: 'Pasta' } })
      expect(c).toBe(1)
    })
  })

  describe('paginate', () => {
    it('returns correct page', async () => {
      await Recipe.create(perspective, { name: 'A' })
      await Recipe.create(perspective, { name: 'B' })
      await Recipe.create(perspective, { name: 'C' })
      await Recipe.create(perspective, { name: 'D' })
      await Recipe.create(perspective, { name: 'E' })

      const page1 = await Recipe.paginate(perspective, 2, 1)
      expect(page1.results).toHaveLength(2)
      expect(page1.pageSize).toBe(2)
      expect(page1.pageNumber).toBe(1)
      expect(page1.totalCount).toBe(5)

      const page3 = await Recipe.paginate(perspective, 2, 3)
      expect(page3.results).toHaveLength(1)
      expect(page3.pageNumber).toBe(3)
    })
  })

  describe('instance.save()', () => {
    it('saves dirty fields', async () => {
      const recipe = await Recipe.create(perspective, { name: 'Pasta' })
      recipe.name = 'Updated Pasta'
      recipe._dirtyFields.add('name')

      await recipe.save()
      expect(recipe._dirtyFields.size).toBe(0)

      // Verify persisted
      const found = await Recipe.findById(perspective, recipe._baseExpression)
      expect(found!.name).toBe('Updated Pasta')
    })

    it('no-ops when no dirty fields', async () => {
      const recipe = await Recipe.create(perspective, { name: 'Pasta' })
      // Should not throw
      await recipe.save()
    })
  })

  describe('instance.delete()', () => {
    it('removes links from perspective', async () => {
      const recipe = await Recipe.create(perspective, { name: 'Pasta' })
      const id = recipe._baseExpression

      await recipe.delete()

      const found = await Recipe.findById(perspective, id)
      // After deletion, the required property links should be gone
      // findById returns null if no links found
      expect(found).toBeNull()
    })
  })

  describe('instance.update()', () => {
    it('bulk updates and saves', async () => {
      const recipe = await Recipe.create(perspective, { name: 'Pasta' })
      await recipe.update({ name: 'Super Pasta' })

      const found = await Recipe.findById(perspective, recipe._baseExpression)
      expect(found!.name).toBe('Super Pasta')
    })
  })

  describe('dirty tracking', () => {
    it('tracks dirty fields', async () => {
      const recipe = await Recipe.create(perspective, { name: 'Test' })
      expect(recipe._dirtyFields.size).toBe(0)

      recipe._dirtyFields.add('name')
      expect(recipe._dirtyFields.has('name')).toBe(true)

      await recipe.save()
      expect(recipe._dirtyFields.size).toBe(0)
    })
  })
})

describe('ModelQueryBuilder', () => {
  let perspective: ModelPerspectiveHandle

  beforeEach(() => {
    const ctx = createTestPerspective()
    perspective = ctx.handle
  })

  it('fluent interface runs query', async () => {
    await Recipe.create(perspective, { name: 'Pasta' })
    await Recipe.create(perspective, { name: 'Pizza' })

    const results = await Recipe.query(perspective).where({ name: 'Pasta' }).run()

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Pasta')
  })

  it('first() returns single result', async () => {
    await Recipe.create(perspective, { name: 'Pasta' })

    const result = await Recipe.query(perspective).first()
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Pasta')
  })

  it('count() returns count', async () => {
    await Recipe.create(perspective, { name: 'A' })
    await Recipe.create(perspective, { name: 'B' })

    const c = await Recipe.query(perspective).count()
    expect(c).toBe(2)
  })

  it('paginate() returns paginated results', async () => {
    await Recipe.create(perspective, { name: 'A' })
    await Recipe.create(perspective, { name: 'B' })
    await Recipe.create(perspective, { name: 'C' })

    const page = await Recipe.query(perspective).paginate(2, 1)
    expect(page.results).toHaveLength(2)
    expect(page.totalCount).toBe(3)
  })

  it('limit() and offset() work', async () => {
    await Recipe.create(perspective, { name: 'A' })
    await Recipe.create(perspective, { name: 'B' })
    await Recipe.create(perspective, { name: 'C' })

    const results = await Recipe.query(perspective).limit(1).offset(1).run()

    expect(results).toHaveLength(1)
  })

  it('subscribe() calls callback with initial results', async () => {
    await Recipe.create(perspective, { name: 'Test' })

    const received: Recipe[][] = []
    const unsub = Recipe.query(perspective).subscribe((results) => {
      received.push(results)
    })

    // Wait for async callback
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(received).toHaveLength(1)
    expect(received[0]).toHaveLength(1)

    unsub()
  })
})
