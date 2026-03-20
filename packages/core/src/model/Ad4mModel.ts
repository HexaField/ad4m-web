/**
 * Ad4mModel — base class for defining data models in AD4M.
 *
 * Each model instance is a subgraph in a perspective. Properties and relations
 * are stored as links. The class provides CRUD operations, querying, dirty
 * tracking, and hydration from links.
 */

import type { ModelPerspectiveHandle } from './perspective-handle'
import type { LinkExpression } from '../linkstore/types'
import type { PropertyMetadataEntry, RelationMetadataEntry } from './decorators'
import { getPropertiesMetadata, getRelationsMetadata, getModelMetadata } from './decorators'
import { generateBaseExpression } from './util'
import { hydrateFromLinks } from './hydration'
import type { Query, Where, OrderBy, PaginationResult } from './types'
import { ModelQueryBuilder } from './ModelQueryBuilder'

// ─── Ad4mModel ──────────────────────────────────────────────────────────────

export class Ad4mModel {
  /** The URI identifying this instance in the perspective */
  _baseExpression = ''

  /** Bound perspective handle */
  _perspective: ModelPerspectiveHandle | null = null

  /** Tracks which fields have been modified since last save */
  _dirtyFields: Set<string> = new Set()

  /** Class name from @Model decorator */
  static className: string

  // ─── Static metadata helpers ────────────────────────────────────────────

  static getPropertiesMetadata(): Record<string, PropertyMetadataEntry> {
    return getPropertiesMetadata(this)
  }

  static getRelationsMetadata(): Record<string, RelationMetadataEntry> {
    return getRelationsMetadata(this)
  }

  static getModelMetadata() {
    return getModelMetadata(this as unknown as Function & { className?: string })
  }

  // ─── Registration ───────────────────────────────────────────────────────

  /**
   * Register this model's SHACL shape in the perspective's SDNA.
   */
  static async register(perspective: ModelPerspectiveHandle): Promise<void> {
    await perspective.ensureSDNASubjectClass(this)
  }

  // ─── Query builder ─────────────────────────────────────────────────────

  static query<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    initialQuery?: Query
  ): ModelQueryBuilder<T> {
    return new ModelQueryBuilder<T>(perspective, this, initialQuery)
  }

  // ─── Create ─────────────────────────────────────────────────────────────

  /**
   * Create a new instance with optional initial data.
   */
  static async create<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    data?: Record<string, unknown>
  ): Promise<T> {
    const ctor = this as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    const meta = getModelMetadata(ctor as unknown as Function & { className?: string })
    const properties = getPropertiesMetadata(ctor)

    // Ensure registered
    await perspective.ensureSDNASubjectClass(ctor)

    const baseUri = generateBaseExpression()

    // Build initial values from data
    const initialValues: Record<string, string> = {}
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        const propMeta = properties[key]
        if (propMeta && propMeta.through) {
          initialValues[key] = valueToLiteral(value, propMeta)
        }
      }
    }

    // Create via SHACL engine (runs constructor actions + initial values)
    await perspective.createInstance(meta.className, baseUri, initialValues)

    // Now set any data values that aren't handled by constructor
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        const propMeta = properties[key]
        if (propMeta && propMeta.through && propMeta.writable) {
          // Use setSingleTarget to set the value
          const existing = await perspective.queryLinks({
            source: baseUri,
            predicate: propMeta.through
          })
          if (existing.length > 0) {
            // Check if value matches
            const currentTarget = existing[0].data.target
            const desiredTarget = valueToLiteral(value, propMeta)
            if (currentTarget !== desiredTarget) {
              // Remove old and add new
              for (const link of existing) {
                await perspective.removeLink(link)
              }
              await perspective.addLink({
                source: baseUri,
                target: desiredTarget,
                predicate: propMeta.through
              })
            }
          } else {
            await perspective.addLink({
              source: baseUri,
              target: valueToLiteral(value, propMeta),
              predicate: propMeta.through
            })
          }
        }
      }
    }

    // Hydrate and return
    const instance = (await Ad4mModel.findById.call(ctor, perspective, baseUri)) as T | null
    if (!instance) {
      throw new Error(`Failed to create instance of ${(ctor as unknown as typeof Ad4mModel).className}`)
    }
    return instance as T
  }

  // ─── Find ───────────────────────────────────────────────────────────────

  /**
   * Find all instances matching a query, using link-based querying.
   */
  static async findAll<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    query?: Query
  ): Promise<T[]> {
    const ctor = this as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    const properties = getPropertiesMetadata(ctor)
    const relations = getRelationsMetadata(ctor)

    await perspective.ensureSDNASubjectClass(ctor)

    // Find all candidate base URIs by looking for links with known predicates
    const allLinks = await perspective.allLinks()

    // Group links by source to find potential instances
    const linksBySource = new Map<string, LinkExpression[]>()
    for (const link of allLinks) {
      const src = link.data.source
      let arr = linksBySource.get(src)
      if (!arr) {
        arr = []
        linksBySource.set(src, arr)
      }
      arr.push(link)
    }

    // Build set of predicates that identify this model
    const requiredPredicates = new Set<string>()
    for (const [, propMeta] of Object.entries(properties)) {
      if (propMeta.required && propMeta.through) {
        requiredPredicates.add(propMeta.through)
      }
    }

    // Filter to sources that have all required predicates (i.e. are instances of this model)
    const candidateSources: string[] = []
    for (const [source, links] of linksBySource) {
      if (source === 'ad4m://self') continue // skip SDNA links
      const preds = new Set(links.map((l) => l.data.predicate).filter((p): p is string => p !== undefined))
      let isInstance = true
      for (const req of requiredPredicates) {
        if (!preds.has(req)) {
          isInstance = false
          break
        }
      }
      if (isInstance && requiredPredicates.size > 0) {
        candidateSources.push(source)
      }
    }

    // Handle parent query filter
    if (query?.parent) {
      const parentQuery = query.parent
      const parentId = parentQuery.id
      const predicate = 'predicate' in parentQuery ? parentQuery.predicate : 'ad4m://has_child'

      // Find children of parent
      const childLinks = await perspective.queryLinks({
        source: parentId,
        predicate
      })
      const childIds = new Set(childLinks.map((l) => l.data.target))

      // Filter candidates
      const filtered = candidateSources.filter((s) => childIds.has(s))
      candidateSources.length = 0
      candidateSources.push(...filtered)
    }

    // Hydrate instances
    let instances: T[] = []
    for (const baseUri of candidateSources) {
      const links = linksBySource.get(baseUri) ?? []
      const linkLikes = links.map((l) => ({
        predicate: l.data.predicate ?? '',
        target: l.data.target,
        author: l.author,
        timestamp: l.timestamp
      }))
      const instance = hydrateFromLinks(ctor, baseUri, linkLikes, properties, relations)
      const inst = instance as unknown as Ad4mModel
      inst._baseExpression = baseUri
      inst._perspective = perspective
      inst._dirtyFields = new Set()
      instances.push(instance)
    }

    // Apply where filters
    if (query?.where) {
      instances = applyWhereFilter(instances, query.where, properties)
    }

    // Apply ordering
    if (query?.order) {
      instances = applyOrder(instances, query.order)
    }

    // Apply offset and limit
    if (query?.offset !== undefined) {
      instances = instances.slice(query.offset)
    }
    if (query?.limit !== undefined) {
      instances = instances.slice(0, query.limit)
    }

    return instances
  }

  /**
   * Find the first instance matching a query.
   */
  static async findOne<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    query?: Query
  ): Promise<T | null> {
    const limitedQuery = { ...query, limit: 1 }
    const results = await (this as unknown as typeof Ad4mModel).findAll.call(this, perspective, limitedQuery)
    return (results as T[])[0] ?? null
  }

  /**
   * Find an instance by its base expression URI.
   */
  static async findById<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    id: string
  ): Promise<T | null> {
    const ctor = this as unknown as typeof Ad4mModel & (new (...args: unknown[]) => T)
    const properties = getPropertiesMetadata(ctor)
    const relations = getRelationsMetadata(ctor)

    await perspective.ensureSDNASubjectClass(ctor)

    const links = await perspective.queryLinks({ source: id })
    if (links.length === 0) return null

    const linkLikes = links.map((l) => ({
      predicate: l.data.predicate ?? '',
      target: l.data.target,
      author: l.author,
      timestamp: l.timestamp
    }))

    const instance = hydrateFromLinks(ctor, id, linkLikes, properties, relations)
    const inst = instance as unknown as Ad4mModel
    inst._baseExpression = id
    inst._perspective = perspective
    inst._dirtyFields = new Set()
    return instance
  }

  /**
   * Count instances matching a query.
   */
  static async count<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    query?: Query
  ): Promise<number> {
    const results = await (this as unknown as typeof Ad4mModel).findAll.call(this, perspective, query)
    return (results as T[]).length
  }

  /**
   * Paginated query.
   */
  static async paginate<T extends Ad4mModel>(
    this: new (...args: unknown[]) => T,
    perspective: ModelPerspectiveHandle,
    pageSize: number,
    page: number,
    query?: Query
  ): Promise<PaginationResult<T>> {
    // Get total count first (without offset/limit)
    const countQuery = { ...query }
    delete countQuery.offset
    delete countQuery.limit
    const allResults = (await (this as unknown as typeof Ad4mModel).findAll.call(this, perspective, countQuery)) as T[]
    const totalCount = allResults.length

    // Apply pagination
    const offset = (page - 1) * pageSize
    const results = allResults.slice(offset, offset + pageSize)

    return {
      results,
      totalCount,
      pageSize,
      pageNumber: page
    }
  }

  // ─── Instance methods ──────────────────────────────────────────────────

  /**
   * Save dirty fields back to the perspective.
   */
  async save(): Promise<void> {
    if (!this._perspective) throw new Error('Instance not bound to a perspective')
    if (this._dirtyFields.size === 0) return

    const properties = getPropertiesMetadata(this.constructor)

    for (const fieldName of this._dirtyFields) {
      const propMeta = properties[fieldName]
      if (!propMeta || !propMeta.through) continue
      if (propMeta.readOnly) continue

      const value = (this as unknown as Record<string, unknown>)[fieldName]
      const literalValue = valueToLiteral(value, propMeta)

      // Remove existing links for this predicate
      const existing = await this._perspective.queryLinks({
        source: this._baseExpression,
        predicate: propMeta.through
      })
      for (const link of existing) {
        await this._perspective.removeLink(link)
      }

      // Add new link
      await this._perspective.addLink({
        source: this._baseExpression,
        target: literalValue,
        predicate: propMeta.through
      })
    }

    this._dirtyFields.clear()
  }

  /**
   * Delete this instance from the perspective.
   */
  async delete(): Promise<void> {
    if (!this._perspective) throw new Error('Instance not bound to a perspective')

    const meta = getModelMetadata(this.constructor as Function & { className?: string })
    await this._perspective.deleteInstance(meta.className, this._baseExpression)
  }

  /**
   * Bulk update fields and save.
   */
  async update(data: Record<string, unknown>): Promise<void> {
    const properties = getPropertiesMetadata(this.constructor)

    for (const [key, value] of Object.entries(data)) {
      if (properties[key]) {
        ;(this as unknown as Record<string, unknown>)[key] = value
        this._dirtyFields.add(key)
      }
    }

    await this.save()
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function valueToLiteral(value: unknown, propMeta: PropertyMetadataEntry): string {
  if (propMeta.resolveLanguage === 'literal') {
    if (typeof value === 'string') return `literal://string:${encodeURIComponent(value)}`
    if (typeof value === 'number') return `literal://number:${value}`
    if (typeof value === 'boolean') return `literal://json:${JSON.stringify(value)}`
    return `literal://string:${encodeURIComponent(String(value ?? ''))}`
  }
  return String(value ?? '')
}

function applyWhereFilter<T>(instances: T[], where: Where, properties: Record<string, PropertyMetadataEntry>): T[] {
  return instances.filter((inst) => {
    const obj = inst as Record<string, unknown>
    for (const [key, condition] of Object.entries(where)) {
      const value = obj[key]

      if (Array.isArray(condition)) {
        if (!(condition as unknown[]).includes(value)) return false
      } else if (typeof condition === 'object' && condition !== null) {
        const ops = condition as Record<string, unknown>
        if (ops.not !== undefined) {
          if (Array.isArray(ops.not)) {
            if ((ops.not as unknown[]).includes(value)) return false
          } else if (value === ops.not) return false
        }
        if (ops.gt !== undefined && !((value as number) > (ops.gt as number))) return false
        if (ops.gte !== undefined && !((value as number) >= (ops.gte as number))) return false
        if (ops.lt !== undefined && !((value as number) < (ops.lt as number))) return false
        if (ops.lte !== undefined && !((value as number) <= (ops.lte as number))) return false
        if (ops.contains !== undefined) {
          if (typeof value === 'string' && !value.includes(String(ops.contains))) return false
        }
      } else {
        // Check against literal-resolved value
        const propMeta = properties[key]
        if (propMeta?.resolveLanguage === 'literal') {
          if (value !== condition) return false
        } else {
          if (value !== condition) return false
        }
      }
    }
    return true
  })
}

function applyOrder<T>(instances: T[], order: OrderBy): T[] {
  const entries = Object.entries(order)
  return [...instances].sort((a, b) => {
    const objA = a as Record<string, unknown>
    const objB = b as Record<string, unknown>
    for (const [key, dir] of entries) {
      const va = objA[key]
      const vb = objB[key]
      if (va === vb) continue
      if (va == null) return dir === 'ASC' ? -1 : 1
      if (vb == null) return dir === 'ASC' ? 1 : -1
      const cmp = va < vb ? -1 : 1
      return dir === 'ASC' ? cmp : -cmp
    }
    return 0
  })
}
