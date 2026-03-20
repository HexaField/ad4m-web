/**
 * Shared type definitions for the Ad4mModel system.
 */

// ---------------------------------------------------------------------------
// Query DSL types
// ---------------------------------------------------------------------------

export type WhereCondition = string | number | boolean | string[] | number[]
export type Where = { [propertyName: string]: WhereCondition }
export type OrderBy = { [propertyName: string]: 'ASC' | 'DESC' }

/**
 * Parent-scoped query. Either raw predicate or model-based resolution.
 */
export type ParentQuery = { id: string; predicate: string } | { model: Function; id: string; field?: string }

export type Query = {
  parent?: ParentQuery
  where?: Where
  order?: OrderBy
  offset?: number
  limit?: number
  count?: boolean
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ResultsWithTotalCount<T> = { results: T[]; totalCount?: number }
export type PaginationResult<T> = { results: T[]; totalCount?: number; pageSize: number; pageNumber: number }

// ---------------------------------------------------------------------------
// Model metadata interfaces
// ---------------------------------------------------------------------------

export interface PropertyMetadata {
  name: string
  predicate: string
  required: boolean
  readOnly: boolean
  initial?: string
  resolveLanguage?: string
  local?: boolean
  transform?: (value: unknown) => unknown
  flag?: boolean
}

export interface RelationMetadata {
  name: string
  predicate: string
  local?: boolean
  direction?: 'forward' | 'reverse'
  target?: () => unknown
  filter?: boolean
  where?: Where
}

export interface ModelMetadata {
  className: string
  properties: Record<string, PropertyMetadata>
  relations: Record<string, RelationMetadata>
}
