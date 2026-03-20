/**
 * Shared query helpers.
 */

import type { ParentQuery } from './types'
import { getRelationsMetadata } from './decorators'

/**
 * Resolves the predicate for a parent query.
 */
export function resolveParentPredicate(parent: ParentQuery, childCtor: Function): string {
  if ('predicate' in parent) return parent.predicate

  const { model } = parent
  const relMeta = getRelationsMetadata(model)

  if (parent.field) {
    const entry = relMeta[parent.field]
    if (!entry) {
      throw new Error(
        `parent(): field "${parent.field}" is not a registered relation on ${(model as { name?: string }).name}`
      )
    }
    return entry.predicate
  }

  for (const entry of Object.values(relMeta)) {
    if (entry.target && entry.target() === childCtor) {
      return entry.predicate
    }
  }
  throw new Error(
    `parent(): could not resolve predicate — no relation on ${(model as { name?: string }).name} targets ${(childCtor as { name?: string }).name || 'the queried class'}`
  )
}
