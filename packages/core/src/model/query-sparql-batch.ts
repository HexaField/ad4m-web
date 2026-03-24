/**
 * Batch SPARQL query builder for Ad4mModel eager-loading (includes).
 *
 * Generates a single SPARQL query with UNION branches to fetch
 * root instances plus all included relations in one round-trip.
 *
 * @module
 */

import { resolveParentPredicate } from './query-common'
import { getRelationsMetadata, getPropertiesMetadata, getModelMetadata } from './decorators'
import type { RelationMetadataEntry, PropertyMetadataEntry } from './decorators'
import { formatSparqlValue } from './sparql-utils'
import type { Query, IncludeMap } from './types'

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────

function iri(value: string): string {
  return `<${value}>`
}

interface ModelMeta {
  className: string
  properties: Record<string, PropertyMetadataEntry>
  relations: Record<string, RelationMetadataEntry>
}

interface DepthBranch {
  depth: number
  relationName: string
  parentDepth: number
  parentPredicate: string
  targetClass: Function
  targetMeta: ModelMeta
  includeMap?: IncludeMap
  direction: 'forward' | 'reverse'
}

function getModelMeta(cls: Function): ModelMeta {
  const meta = getModelMetadata(cls as Function & { className?: string })
  return {
    className: meta.className,
    properties: getPropertiesMetadata(cls),
    relations: getRelationsMetadata(cls)
  }
}

function buildConformanceJoins(
  properties: Record<string, PropertyMetadataEntry>,
  sourceVar: string,
  prefix: string
): { joins: string[]; filters: string[] } {
  const joins: string[] = []
  const filters: string[] = []
  let hasConformance = false

  for (const [propName, propMeta] of Object.entries(properties)) {
    if (propMeta.required) {
      hasConformance = true
      if (propMeta.flag && propMeta.initial) {
        joins.push(`${sourceVar} ${iri(propMeta.through!)} ${iri(propMeta.initial)} .`)
      } else if (propMeta.through) {
        joins.push(`${sourceVar} ${iri(propMeta.through)} ?${prefix}_cfTarget_${propName} .`)
      }
    }
  }

  if (!hasConformance) {
    for (const [propName, propMeta] of Object.entries(properties)) {
      if (propMeta.initial && propMeta.through) {
        if (propMeta.flag) {
          joins.push(`${sourceVar} ${iri(propMeta.through)} ${iri(propMeta.initial)} .`)
        } else {
          joins.push(`${sourceVar} ${iri(propMeta.through)} ?${prefix}_cfInitAny_${propName} .`)
        }
        break
      }
    }
  }

  return { joins, filters }
}

function flattenIncludeTree(
  parentDepth: number,
  parentClass: Function,
  includeMap: IncludeMap,
  nextDepth: { value: number }
): DepthBranch[] {
  const branches: DepthBranch[] = []
  const relMeta = getRelationsMetadata(parentClass)

  for (const [relName, includeValue] of Object.entries(includeMap)) {
    const meta: RelationMetadataEntry | undefined = relMeta[relName]
    if (!meta || !meta.target) continue

    const TargetClass = meta.target()
    const targetMeta = getModelMeta(TargetClass as Function)

    const depth = nextDepth.value++
    const direction = meta.kind === 'belongsToOne' || meta.kind === 'belongsToMany' ? 'reverse' : 'forward'

    const nestedInclude =
      typeof includeValue === 'object' && includeValue !== null
        ? (includeValue as { include: IncludeMap }).include
        : undefined

    branches.push({
      depth,
      relationName: relName,
      parentDepth,
      parentPredicate: meta.predicate,
      targetClass: TargetClass as Function,
      targetMeta,
      includeMap: nestedInclude,
      direction
    })

    if (nestedInclude) {
      branches.push(...flattenIncludeTree(depth, TargetClass as Function, nestedInclude, nextDepth))
    }
  }

  return branches
}

// ──────────────────────────────────────────────────────────
//  Main entry point
// ──────────────────────────────────────────────────────────

/**
 * Build a single SPARQL query that fetches root instances plus all
 * included relations in one query using UNION branches.
 */
export function buildBatchSPARQLQuery(
  rootProperties: Record<string, PropertyMetadataEntry>,
  rootRelations: Record<string, RelationMetadataEntry>,
  query: Query,
  rootModelClass: Function
): string {
  const includeMap = query.include
  if (!includeMap || Object.keys(includeMap).length === 0) {
    throw new Error('buildBatchSPARQLQuery requires query.include to be non-empty')
  }

  const nextDepth = { value: 1 }
  const branches = flattenIncludeTree(0, rootModelClass, includeMap, nextDepth)

  // Root conformance
  const rootConformance = buildConformanceJoins(rootProperties, '?source', 'root')
  const rootJoins = [...rootConformance.joins]
  const rootFilters = [...rootConformance.filters]

  if (query.parent) {
    const parentPredicate = resolveParentPredicate(query.parent, rootModelClass)
    rootJoins.push(`${iri(query.parent.id)} ${iri(parentPredicate)} ?source .`)
  }

  if (query.where) {
    for (const [propertyName, condition] of Object.entries(query.where)) {
      if (propertyName === 'base' || propertyName === 'id') {
        if (Array.isArray(condition)) {
          const formatted = (condition as string[]).map((v) => iri(v)).join(', ')
          rootFilters.push(`?source IN (${formatted})`)
        } else if (typeof condition === 'string') {
          rootFilters.push(`?source = ${iri(condition)}`)
        }
        continue
      }
      if (propertyName === 'author' || propertyName === 'timestamp') continue

      const propMeta = rootProperties[propertyName]
      if (!propMeta || !propMeta.through) continue

      if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
        if (propMeta.resolveLanguage === 'literal') {
          rootJoins.push(`?source ${iri(propMeta.through)} ?root_wTarget_${propertyName} .`)
          rootFilters.push(`STR(?root_wTarget_${propertyName}) = ${formatSparqlValue(String(condition))}`)
        } else {
          rootJoins.push(`?source ${iri(propMeta.through)} ${iri(String(condition))} .`)
        }
      } else if (Array.isArray(condition)) {
        const formatted = (condition as unknown[]).map((v) => formatSparqlValue(v)).join(', ')
        rootJoins.push(`?source ${iri(propMeta.through)} ?root_wTarget_${propertyName} .`)
        rootFilters.push(`?root_wTarget_${propertyName} IN (${formatted})`)
      }
    }
  }

  const rootJoinClause = rootJoins.map((j) => `        ${j}`).join('\n')
  const rootFilterClause =
    rootFilters.length > 0 ? `FILTER(\n          ${rootFilters.join(' &&\n          ')}\n        )` : ''

  const unionBranches: string[] = []

  // Depth 0: root
  unionBranches.push(`{
${rootJoinClause}
        ?source ?predicate ?target .
        ${rootFilterClause}
        BIND("0" AS ?depth)
        BIND("" AS ?parentBase)
        BIND("" AS ?relationName)
      }`)

  // Depth N: include branches
  for (const branch of branches) {
    const childConformance = buildConformanceJoins(branch.targetMeta.properties, '?source', `d${branch.depth}`)
    const childJoinClause = childConformance.joins.map((j) => `        ${j}`).join('\n')
    const childFilterClause =
      childConformance.filters.length > 0
        ? `FILTER(\n            ${childConformance.filters.join(' &&\n            ')}\n          )`
        : ''

    const parentJoinClause = branch.parentDepth === 0 ? rootJoinClause.replace(/\?source/g, '?parentBase') : ''
    const parentFilterClause = branch.parentDepth === 0 ? rootFilterClause.replace(/\?source/g, '?parentBase') : ''

    const directionPattern =
      branch.direction === 'forward'
        ? `?parentBase ${iri(branch.parentPredicate)} ?source .`
        : `?source ${iri(branch.parentPredicate)} ?parentBase .`

    unionBranches.push(`{
        ${directionPattern}
${childJoinClause}
        ?source ?predicate ?target .
        ${childFilterClause}
        ${parentJoinClause}
        ${parentFilterClause}
        BIND("${branch.depth}" AS ?depth)
        BIND("${branch.relationName}" AS ?relationName)
      }`)
  }

  return `SELECT ?depth ?parentBase ?relationName ?source ?predicate ?target WHERE {
      ${unionBranches.join('\n      UNION\n      ')}
    }`
}
