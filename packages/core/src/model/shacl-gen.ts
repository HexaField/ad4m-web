/**
 * SHACL shape generation from Ad4mModel decorator metadata.
 *
 * Produces SubjectClass descriptors compatible with the existing
 * packages/core/src/shacl/types.ts format.
 */

import type { SubjectClass, PropertyShape, PerspectiveAction } from '../shacl/types'
import type { PropertyMetadataEntry, RelationMetadataEntry } from './decorators'

/**
 * Build a SubjectClass (SHACL shape) from model metadata.
 */
export function buildSHACLShape(
  subjectName: string,
  properties: Record<string, PropertyMetadataEntry>,
  relations: Record<string, RelationMetadataEntry>
): SubjectClass {
  // Determine namespace from first property or relation
  let namespace = 'ad4m://'

  const firstPropKey = Object.keys(properties)[0]
  if (firstPropKey && properties[firstPropKey].through) {
    const match = properties[firstPropKey].through!.match(/^([^:]+:\/\/)/)
    if (match) namespace = match[1]
  } else {
    const collectionRels = Object.entries(relations).filter(
      ([, r]) => r.kind === 'hasMany' || r.kind === 'belongsToMany'
    )
    if (collectionRels.length > 0 && collectionRels[0][1].predicate) {
      const match = collectionRels[0][1].predicate.match(/^([^:]+:\/\/)/)
      if (match) namespace = match[1]
    }
  }

  const constructorActions: PerspectiveAction[] = []
  const destructorActions: PerspectiveAction[] = []
  const propertyShapes: PropertyShape[] = []

  // Convert properties
  for (const [propName, meta] of Object.entries(properties)) {
    if (!meta.through) continue

    const shape: PropertyShape = {
      name: propName,
      path: meta.through
    }

    if (meta.resolveLanguage === 'literal') {
      shape.datatype = 'xsd://string'
    }

    if (meta.required) {
      shape.minCount = 1
    }
    shape.maxCount = 1

    if (meta.flag && meta.initial) {
      shape.initial = meta.initial
    }

    if (meta.local !== undefined) {
      // local is not in PropertyShape but we track it via actions
    }

    if (meta.writable !== undefined) {
      shape.writable = meta.writable
    }

    if (meta.resolveLanguage) {
      shape.resolveLanguage = meta.resolveLanguage
    }

    // Setter actions
    if (meta.writable && meta.through) {
      shape.setter = [
        {
          action: 'setSingleTarget' as const,
          source: 'this',
          predicate: meta.through,
          target: 'value',
          ...(meta.local && { local: true })
        }
      ]
    }

    // Constructor / Destructor
    const effectiveInitial =
      meta.initial ?? (meta.required && meta.writable && !meta.flag && meta.through ? 'literal://string:' : undefined)

    if (effectiveInitial) {
      constructorActions.push({
        action: 'addLink',
        source: 'this',
        predicate: meta.through,
        target: effectiveInitial,
        ...(meta.local && { local: true })
      })

      destructorActions.push({
        action: 'removeLink',
        source: 'this',
        predicate: meta.through,
        target: '*'
      })
    }

    propertyShapes.push(shape)
  }

  // Convert collection relations
  const collectionRelations = Object.entries(relations).filter(
    ([, r]) => r.kind === 'hasMany' || r.kind === 'belongsToMany'
  )

  for (const [relName, meta] of collectionRelations) {
    if (!meta.predicate) continue

    const relShape: PropertyShape = {
      name: relName,
      path: meta.predicate
    }

    relShape.adder = [
      {
        action: 'addLink',
        source: 'this',
        predicate: meta.predicate,
        target: 'value',
        ...(meta.local && { local: true })
      }
    ]

    relShape.remover = [
      {
        action: 'removeLink',
        source: 'this',
        predicate: meta.predicate,
        target: 'value',
        ...(meta.local && { local: true })
      }
    ]

    propertyShapes.push(relShape)
  }

  return {
    name: subjectName,
    namespace,
    properties: propertyShapes,
    constructor: constructorActions.length > 0 ? constructorActions : undefined,
    destructor: destructorActions.length > 0 ? destructorActions : undefined
  }
}
