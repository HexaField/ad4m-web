/**
 * Batch hydration for SPARQL batch query results.
 *
 * Takes the flat rows returned by `buildBatchSPARQLQuery()` (each tagged
 * with ?depth, ?parentBase, ?relationName) and reconstructs a tree of
 * model instances.
 *
 * @module
 */

import { hydrateInstance } from './hydration'
import type { SPARQLBinding } from './hydration'
import { getPropertiesMetadata, getRelationsMetadata } from './decorators'
import type { IncludeMap } from './types'

/**
 * A row returned by the batch SPARQL query.
 */
export interface BatchRow {
  depth: string
  parentBase: string
  relationName: string
  source: string
  predicate: string
  target: string
  author?: string
  timestamp?: string
}

/**
 * Grouped link data for one instance.
 */
interface GroupedInstance {
  sourceUri: string
  parentBase: string
  relationName: string
  bindings: SPARQLBinding[]
}

/**
 * Group batch rows by (depth, source) → array of bindings, preserving parentBase/relationName.
 */
function groupBatchRows(rows: BatchRow[]): Map<number, GroupedInstance[]> {
  const byDepth = new Map<number, Map<string, GroupedInstance>>()

  for (const row of rows) {
    const depth = parseInt(row.depth, 10)
    if (!byDepth.has(depth)) byDepth.set(depth, new Map())
    const depthMap = byDepth.get(depth)!

    const key = row.source
    if (!depthMap.has(key)) {
      depthMap.set(key, {
        sourceUri: key,
        parentBase: row.parentBase,
        relationName: row.relationName,
        bindings: []
      })
    }
    depthMap.get(key)!.bindings.push({
      base: row.source,
      pred: row.predicate,
      target: row.target
    })
  }

  const result = new Map<number, GroupedInstance[]>()
  for (const [depth, map] of byDepth) {
    result.set(depth, Array.from(map.values()))
  }
  return result
}

/**
 * Build a mapping from depth number to target class info.
 */
function buildDepthClassMap(
  parentClass: Function,
  includeMap: IncludeMap,
  nextDepth: { value: number },
  result: Map<number, { targetClass: Function; includeMap?: IncludeMap }>
): void {
  const relMeta = getRelationsMetadata(parentClass)

  for (const [relName, includeValue] of Object.entries(includeMap)) {
    const meta = relMeta[relName]
    if (!meta || !meta.target) continue

    const TargetClass = meta.target() as Function
    const depth = nextDepth.value++

    const nestedInclude =
      typeof includeValue === 'object' && includeValue !== null
        ? (includeValue as { include: IncludeMap }).include
        : undefined

    result.set(depth, { targetClass: TargetClass, includeMap: nestedInclude })

    if (nestedInclude) {
      buildDepthClassMap(TargetClass, nestedInclude, nextDepth, result)
    }
  }
}

/**
 * Hydrate batch SPARQL results into a tree of model instances.
 */
export function hydrateBatchResult<T>(
  rows: BatchRow[],
  rootClass: { new (...args: unknown[]): T },
  includeMap: IncludeMap
): T[] {
  if (!rows || rows.length === 0) return []

  const grouped = groupBatchRows(rows)

  // Hydrate root instances (depth 0)
  const rootGroups = grouped.get(0) || []
  const rootProperties = getPropertiesMetadata(rootClass)
  const rootRelations = getRelationsMetadata(rootClass)
  const instances: T[] = []
  const instanceMap = new Map<string, T>()

  for (const group of rootGroups) {
    const instance = hydrateInstance(rootClass, group.sourceUri, group.bindings, rootProperties, rootRelations)
    instances.push(instance)
    instanceMap.set(group.sourceUri, instance)
  }

  // Build depth→class mapping from include tree
  const depthClassMap = new Map<number, { targetClass: Function; includeMap?: IncludeMap }>()
  buildDepthClassMap(rootClass, includeMap, { value: 1 }, depthClassMap)

  const maxDepth = Math.max(...Array.from(grouped.keys()), 0)
  const depthInstanceMaps = new Map<number, Map<string, unknown>>()
  depthInstanceMaps.set(0, instanceMap as Map<string, unknown>)

  // Hydrate each depth level and wire to parents
  for (let depth = 1; depth <= maxDepth; depth++) {
    const depthGroups = grouped.get(depth) || []
    if (depthGroups.length === 0) continue

    const depthInfo = depthClassMap.get(depth)
    if (!depthInfo) continue

    const TargetClass = depthInfo.targetClass as { new (...args: unknown[]): unknown }
    const targetProperties = getPropertiesMetadata(TargetClass)
    const targetRelations = getRelationsMetadata(TargetClass)

    const currentDepthInstances = new Map<string, unknown>()

    for (const group of depthGroups) {
      const instance = hydrateInstance(TargetClass, group.sourceUri, group.bindings, targetProperties, targetRelations)
      currentDepthInstances.set(group.sourceUri, instance)

      // Wire to parent
      for (let pd = depth - 1; pd >= 0; pd--) {
        const parentMap = depthInstanceMaps.get(pd)
        if (parentMap && parentMap.has(group.parentBase)) {
          const parent = parentMap.get(group.parentBase) as Record<string, unknown>
          const relName = group.relationName
          const parentClass = pd === 0 ? rootClass : depthClassMap.get(pd)?.targetClass || rootClass
          const parentRelMeta = getRelationsMetadata(parentClass)
          const rel = parentRelMeta[relName]

          if (rel) {
            if (rel.kind === 'hasMany' || rel.kind === 'belongsToMany') {
              if (!Array.isArray(parent[relName])) {
                parent[relName] = []
              }
              ;(parent[relName] as unknown[]).push(instance)
            } else {
              parent[relName] = instance
            }
          }
          break
        }
      }
    }

    depthInstanceMaps.set(depth, currentDepthInstances)
  }

  return instances
}
