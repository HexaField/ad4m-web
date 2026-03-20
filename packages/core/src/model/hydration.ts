/**
 * Hydration — populate Ad4mModel instances from SPARQL query results.
 *
 * Stateless functions that create model instances from SPARQL bindings
 * or raw link arrays.
 */

import { parseLiteral } from '../shacl/literals'
import type { PropertyMetadataEntry, RelationMetadataEntry } from './decorators'
import { getPropertiesMetadata, getRelationsMetadata } from './decorators'
import type { Query, Where } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SPARQLBinding {
  base: string
  pred: string
  target: string
}

export interface HydrationOptions {
  requestedProperties?: string[]
}

export interface LinkLike {
  predicate: string
  target: string
  author?: string
  timestamp?: string | number
}

// ─── Grouping ───────────────────────────────────────────────────────────────

/**
 * Group SPARQL result bindings by the ?base URI.
 */
export function groupBindingsByBase(bindings: SPARQLBinding[]): Map<string, SPARQLBinding[]> {
  const groups = new Map<string, SPARQLBinding[]>()
  for (const b of bindings) {
    let arr = groups.get(b.base)
    if (!arr) {
      arr = []
      groups.set(b.base, arr)
    }
    arr.push(b)
  }
  return groups
}

// ─── Single Instance Hydration ──────────────────────────────────────────────

/**
 * Resolve a property value from a raw target string.
 */
function resolvePropertyValue(target: string, propMeta: PropertyMetadataEntry, _existingType?: string): unknown {
  if (target === undefined || target === null || target === '' || target === 'None') {
    return undefined
  }

  // Literal URI parsing
  if (propMeta.resolveLanguage === 'literal' && typeof target === 'string' && target.startsWith('literal://')) {
    const parsed = parseLiteral(target)
    if (parsed) {
      let value: unknown = parsed.value
      if (propMeta.transform && typeof propMeta.transform === 'function') {
        value = propMeta.transform(value)
      }
      return value
    }
  }

  // Non-literal: return raw string
  let value: unknown = target
  if (propMeta.transform && typeof propMeta.transform === 'function') {
    value = propMeta.transform(value)
  }
  return value
}

/**
 * Hydrate a single model instance from SPARQL bindings for one ?base.
 */
export function hydrateInstance<T>(
  modelClass: { new (...args: unknown[]): T },
  baseUri: string,
  bindings: SPARQLBinding[],
  properties: Record<string, PropertyMetadataEntry>,
  relations: Record<string, RelationMetadataEntry>,
  options?: HydrationOptions
): T {
  const instance = new modelClass() as Record<string, unknown>
  ;(instance as Record<string, unknown>).id = baseUri

  // Build predicate→prop/rel lookup maps
  const propFilter = options?.requestedProperties ? new Set(options.requestedProperties) : null

  const predToProp = new Map<string, [string, PropertyMetadataEntry]>()
  for (const [propName, meta] of Object.entries(properties)) {
    if (!meta.through) continue
    if (propFilter && !propFilter.has(propName)) continue
    predToProp.set(meta.through, [propName, meta])
  }

  const predToRel = new Map<string, [string, RelationMetadataEntry]>()
  for (const [relName, meta] of Object.entries(relations)) {
    if (!meta.predicate) continue
    predToRel.set(meta.predicate, [relName, meta])
  }

  // Accumulate: properties use latest-wins, relations collect all
  const propLatest = new Map<string, string>()
  const relAccum = new Map<string, string[]>()

  let minTimestamp: string | null = null
  let maxTimestamp: string | null = null

  for (const binding of bindings) {
    const { pred, target } = binding
    if (target === 'None' || target === undefined || target === null) continue

    // Property match — latest wins (last binding in order)
    const propEntry = predToProp.get(pred)
    if (propEntry) {
      propLatest.set(propEntry[0], target)
      continue
    }

    // Relation match
    const relEntry = predToRel.get(pred)
    if (relEntry) {
      const [relName] = relEntry
      let arr = relAccum.get(relName)
      if (!arr) {
        arr = []
        relAccum.set(relName, arr)
      }
      if (target !== '' && target !== 'None') {
        arr.push(target)
      }
    }
  }

  // Resolve properties
  for (const [propName, target] of propLatest) {
    const meta = properties[propName]
    if (!meta) continue
    const value = resolvePropertyValue(target, meta)
    if (value !== undefined) {
      instance[propName] = value
    }
  }

  // Resolve relations
  for (const [relName, targets] of relAccum) {
    const meta = relations[relName]
    if (meta?.maxCount === 1) {
      instance[relName] = targets.length > 0 ? targets[targets.length - 1] : null
    } else {
      instance[relName] = targets
    }
  }

  // Assign timestamps
  if (minTimestamp) (instance as Record<string, unknown>).createdAt = minTimestamp
  if (maxTimestamp) (instance as Record<string, unknown>).updatedAt = maxTimestamp

  return instance as T
}

// ─── Link-based Hydration ───────────────────────────────────────────────────

/**
 * Hydrate a model instance from an array of links (non-SPARQL path).
 */
export function hydrateFromLinks<T>(
  modelClass: { new (...args: unknown[]): T },
  baseUri: string,
  links: LinkLike[],
  properties: Record<string, PropertyMetadataEntry>,
  relations: Record<string, RelationMetadataEntry>,
  options?: HydrationOptions
): T {
  // Convert links to bindings
  const bindings: SPARQLBinding[] = links.map((l) => ({
    base: baseUri,
    pred: l.predicate,
    target: l.target
  }))

  const instance = hydrateInstance(modelClass, baseUri, bindings, properties, relations, options)

  // Handle author/timestamps from links
  let minTimestamp: string | number | null = null
  let maxTimestamp: string | number | null = null
  let originalAuthor: string | null = null

  for (const link of links) {
    if (link.timestamp != null) {
      if (minTimestamp == null || link.timestamp < minTimestamp) {
        minTimestamp = link.timestamp
        originalAuthor = link.author ?? null
      }
      if (maxTimestamp == null || link.timestamp > maxTimestamp) {
        maxTimestamp = link.timestamp
      }
    }
  }

  const inst = instance as Record<string, unknown>
  if (originalAuthor) inst.author = originalAuthor
  if (minTimestamp != null) inst.createdAt = minTimestamp
  if (maxTimestamp != null) inst.updatedAt = maxTimestamp

  return instance
}

// ─── Post-Query Filtering ───────────────────────────────────────────────────

/**
 * Check if a value matches a where condition (for post-query filtering of
 * author/timestamp which can't be filtered in SPARQL).
 */
function matchesCondition(value: unknown, condition: unknown): boolean {
  if (Array.isArray(condition)) {
    return (condition as unknown[]).includes(value)
  }
  if (typeof condition === 'object' && condition !== null) {
    const ops = condition as Record<string, unknown>
    if (ops.not !== undefined) {
      if (Array.isArray(ops.not)) return !(ops.not as unknown[]).includes(value)
      return value !== ops.not
    }
    if (ops.gt !== undefined && !((value as number) > (ops.gt as number))) return false
    if (ops.gte !== undefined && !((value as number) >= (ops.gte as number))) return false
    if (ops.lt !== undefined && !((value as number) < (ops.lt as number))) return false
    if (ops.lte !== undefined && !((value as number) <= (ops.lte as number))) return false
    if (ops.contains !== undefined) {
      if (typeof value === 'string') return value.includes(String(ops.contains))
      return false
    }
    if (ops.between !== undefined) {
      const [lo, hi] = ops.between as [number, number]
      return (value as number) >= lo && (value as number) <= hi
    }
    return true
  }
  return value === condition
}

/**
 * Apply post-query filters (author, timestamp) that can't be expressed in SPARQL.
 */
function applyPostFilters<T>(instances: T[], where?: Where): T[] {
  if (!where) return instances

  return instances.filter((inst) => {
    const obj = inst as Record<string, unknown>
    if (where.author !== undefined && !matchesCondition(obj.author, where.author)) return false
    if (where.timestamp !== undefined && !matchesCondition(obj.createdAt, where.timestamp)) return false
    return true
  })
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

/**
 * Full hydration pipeline: group bindings → hydrate instances → post-filter → paginate.
 */
export function instancesFromSPARQLResult<T>(
  modelClass: { new (...args: unknown[]): T },
  query: Query,
  bindings: SPARQLBinding[]
): T[] {
  const properties = getPropertiesMetadata(modelClass)
  const relations = getRelationsMetadata(modelClass)

  // Group by base URI
  const groups = groupBindingsByBase(bindings)

  // Hydrate each group
  let instances: T[] = []
  for (const [baseUri, group] of groups) {
    instances.push(hydrateInstance(modelClass, baseUri, group, properties, relations))
  }

  // Post-filter (author, timestamp)
  instances = applyPostFilters(instances, query.where)

  return instances
}
