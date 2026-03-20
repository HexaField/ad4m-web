/**
 * SPARQL query builder from Query objects.
 *
 * Translates the Ad4mModel Query DSL into SPARQL SELECT queries
 * that can be executed against an RDF triple store (e.g. Oxigraph).
 *
 * The generated query:
 * 1. Finds conforming instances (required property existence via BGP)
 * 2. Applies WHERE filters
 * 3. Returns ?base + all outgoing triples for hydration
 */

import type { PropertyMetadataEntry, RelationMetadataEntry } from './decorators'
import type { Query, Where, OrderBy } from './types'
import { resolveParentPredicate } from './query-common'
import { escapeSparqlString } from './util'
import { formatSparqlValue, toLiteralURI } from './sparql-utils'

// ─── Where Clause Builder ────────────────────────────────────────────────────

interface WhereClauseResult {
  patterns: string[]
  filters: string[]
}

/**
 * Translate Where conditions to SPARQL BGP patterns and FILTER clauses.
 */
export function buildSPARQLWhereClause(
  properties: Record<string, PropertyMetadataEntry>,
  relations: Record<string, RelationMetadataEntry>,
  where?: Where
): WhereClauseResult {
  const patterns: string[] = []
  const filters: string[] = []

  if (!where) return { patterns, filters }

  let varIdx = 0
  const nextVar = () => `?_w${varIdx++}`

  for (const [propertyName, condition] of Object.entries(where)) {
    // Skip post-query fields
    if (propertyName === 'author' || propertyName === 'timestamp') continue

    // ID filter
    if (propertyName === 'id') {
      if (Array.isArray(condition)) {
        const vals = (condition as string[]).map((v) => formatSparqlValue(v)).join(' ')
        filters.push(`FILTER(?base IN (${vals}))`)
      } else {
        filters.push(`FILTER(?base = ${formatSparqlValue(condition)})`)
      }
      continue
    }

    // Check relations first
    const relMeta = relations[propertyName]
    if (relMeta) {
      const isBelongs = relMeta.kind === 'belongsToOne' || relMeta.kind === 'belongsToMany'
      const pred = `<${relMeta.predicate}>`

      if (Array.isArray(condition)) {
        const v = nextVar()
        if (isBelongs) {
          patterns.push(`${v} ${pred} ?base .`)
          const vals = (condition as string[]).map((c) => formatSparqlValue(c)).join(' ')
          filters.push(`FILTER(${v} IN (${vals}))`)
        } else {
          patterns.push(`?base ${pred} ${v} .`)
          const vals = (condition as string[]).map((c) => formatSparqlValue(c)).join(' ')
          filters.push(`FILTER(${v} IN (${vals}))`)
        }
      } else if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        const ops = condition as Record<string, unknown>
        if (ops.not !== undefined) {
          if (isBelongs) {
            filters.push(`FILTER NOT EXISTS { ${formatSparqlValue(ops.not as string)} ${pred} ?base . }`)
          } else {
            filters.push(`FILTER NOT EXISTS { ?base ${pred} ${formatSparqlValue(ops.not as string)} . }`)
          }
        }
      } else {
        // Simple equality
        if (isBelongs) {
          patterns.push(`${formatSparqlValue(condition as string)} ${pred} ?base .`)
        } else {
          patterns.push(`?base ${pred} ${formatSparqlValue(condition as string)} .`)
        }
      }
      continue
    }

    // Property filter
    const propMeta = properties[propertyName]
    if (!propMeta) continue
    const pred = `<${propMeta.through}>`
    const isLiteral = propMeta.resolveLanguage === 'literal'

    if (Array.isArray(condition)) {
      // IN filter
      if (isLiteral) {
        const vals = (condition as Array<string | number>).map((v) => `<${toLiteralURI(v)}>`).join(' ')
        const v = nextVar()
        patterns.push(`?base ${pred} ${v} .`)
        filters.push(`FILTER(${v} IN (${vals}))`)
      } else {
        const vals = (condition as Array<string | number>).map((v) => formatSparqlValue(v)).join(' ')
        const v = nextVar()
        patterns.push(`?base ${pred} ${v} .`)
        filters.push(`FILTER(${v} IN (${vals}))`)
      }
    } else if (typeof condition === 'object' && condition !== null) {
      const ops = condition as Record<string, unknown>

      // NOT
      if (ops.not !== undefined) {
        if (isLiteral) {
          filters.push(`FILTER NOT EXISTS { ?base ${pred} <${toLiteralURI(ops.not)}> . }`)
        } else {
          filters.push(`FILTER NOT EXISTS { ?base ${pred} ${formatSparqlValue(ops.not)} . }`)
        }
      }

      // Comparison operators — need a variable binding
      const hasComparison =
        ops.gt !== undefined ||
        ops.gte !== undefined ||
        ops.lt !== undefined ||
        ops.lte !== undefined ||
        ops.between !== undefined ||
        ops.contains !== undefined

      if (hasComparison) {
        const v = nextVar()
        patterns.push(`?base ${pred} ${v} .`)

        if (isLiteral) {
          // For literal URIs, extract the value part for comparison
          // literal://string:X or literal://number:X
          const strV = `STR(${v})`

          if (ops.gt !== undefined) filters.push(`FILTER(${strV} > "${escapeSparqlString(String(ops.gt))}")`)
          if (ops.gte !== undefined) filters.push(`FILTER(${strV} >= "${escapeSparqlString(String(ops.gte))}")`)
          if (ops.lt !== undefined) filters.push(`FILTER(${strV} < "${escapeSparqlString(String(ops.lt))}")`)
          if (ops.lte !== undefined) filters.push(`FILTER(${strV} <= "${escapeSparqlString(String(ops.lte))}")`)
          if (ops.contains !== undefined)
            filters.push(`FILTER(CONTAINS(${strV}, "${escapeSparqlString(String(ops.contains))}"))`)
          if (ops.between !== undefined) {
            const [lo, hi] = ops.between as [unknown, unknown]
            filters.push(
              `FILTER(${strV} >= "${escapeSparqlString(String(lo))}" && ${strV} <= "${escapeSparqlString(String(hi))}")`
            )
          }
        } else {
          if (ops.gt !== undefined) filters.push(`FILTER(${v} > ${formatSparqlValue(ops.gt)})`)
          if (ops.gte !== undefined) filters.push(`FILTER(${v} >= ${formatSparqlValue(ops.gte)})`)
          if (ops.lt !== undefined) filters.push(`FILTER(${v} < ${formatSparqlValue(ops.lt)})`)
          if (ops.lte !== undefined) filters.push(`FILTER(${v} <= ${formatSparqlValue(ops.lte)})`)
          if (ops.contains !== undefined)
            filters.push(`FILTER(CONTAINS(STR(${v}), ${formatSparqlValue(ops.contains)}))`)
          if (ops.between !== undefined) {
            const [lo, hi] = ops.between as [unknown, unknown]
            filters.push(`FILTER(${v} >= ${formatSparqlValue(lo)} && ${v} <= ${formatSparqlValue(hi)})`)
          }
        }
      }
    } else {
      // Simple equality
      if (isLiteral) {
        patterns.push(`?base ${pred} <${toLiteralURI(condition)}> .`)
      } else {
        patterns.push(`?base ${pred} ${formatSparqlValue(condition)} .`)
      }
    }
  }

  return { patterns, filters }
}

// ─── ORDER BY Builder ────────────────────────────────────────────────────────

function buildOrderByClause(
  order: OrderBy,
  properties: Record<string, PropertyMetadataEntry>
): { patterns: string[]; clause: string } {
  const patterns: string[] = []
  const terms: string[] = []

  let idx = 0
  for (const [propName, direction] of Object.entries(order)) {
    const propMeta = properties[propName]
    if (!propMeta?.through) continue
    const v = `?_ord${idx++}`
    patterns.push(`OPTIONAL { ?base <${propMeta.through}> ${v} . }`)
    terms.push(direction === 'DESC' ? `DESC(${v})` : `ASC(${v})`)
  }

  return { patterns, clause: terms.length > 0 ? `ORDER BY ${terms.join(' ')}` : '' }
}

// ─── Main Query Builder ─────────────────────────────────────────────────────

/**
 * Build a complete SPARQL SELECT query from a Query object and model metadata.
 */
export function buildSPARQLQuery(
  properties: Record<string, PropertyMetadataEntry>,
  relations: Record<string, RelationMetadataEntry>,
  query: Query,
  modelClass: Function
): string {
  const bodyParts: string[] = []

  // 1. Parent constraint
  if (query.parent) {
    const parentPredicate = resolveParentPredicate(query.parent, modelClass)
    bodyParts.push(`<${query.parent.id}> <${parentPredicate}> ?base .`)
  }

  // 2. Conformance: required properties → existence BGP
  const conformancePatterns: string[] = []
  let confIdx = 0
  for (const [, propMeta] of Object.entries(properties)) {
    if (!propMeta.required || !propMeta.through) continue
    if (propMeta.flag && propMeta.initial) {
      conformancePatterns.push(`?base <${propMeta.through}> <${propMeta.initial}> .`)
    } else {
      conformancePatterns.push(`?base <${propMeta.through}> ?_conf${confIdx++} .`)
    }
  }

  // Fallback: if no required properties, use initial-value properties
  if (conformancePatterns.length === 0) {
    for (const [, propMeta] of Object.entries(properties)) {
      if (propMeta.initial && propMeta.through) {
        if (propMeta.flag) {
          conformancePatterns.push(`?base <${propMeta.through}> <${propMeta.initial}> .`)
        } else {
          conformancePatterns.push(`?base <${propMeta.through}> ?_conf${confIdx++} .`)
        }
        break
      }
    }
  }

  bodyParts.push(...conformancePatterns)

  // 3. User WHERE clause
  const { patterns: wherePatterns, filters: whereFilters } = buildSPARQLWhereClause(properties, relations, query.where)
  bodyParts.push(...wherePatterns)
  bodyParts.push(...whereFilters)

  // 4. Hydration: fetch all outgoing triples
  bodyParts.push('?base ?pred ?target .')

  // 5. ORDER BY
  let orderClause = ''
  const orderPatterns: string[] = []
  if (query.order) {
    const orderResult = buildOrderByClause(query.order, properties)
    orderPatterns.push(...orderResult.patterns)
    orderClause = orderResult.clause
  }

  // Build the full query
  const body = [...bodyParts, ...orderPatterns].map((l) => `  ${l}`).join('\n')

  let sparql = `SELECT ?base ?pred ?target WHERE {\n${body}\n}`

  if (orderClause) sparql += `\n${orderClause}`
  if (query.limit != null) sparql += `\nLIMIT ${query.limit}`
  if (query.offset != null) sparql += `\nOFFSET ${query.offset}`

  return sparql
}
