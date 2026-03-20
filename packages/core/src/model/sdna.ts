/**
 * SDNA (Social DNA) generation from model metadata.
 *
 * Builds subject-class descriptors from property and relation metadata.
 * Prolog-specific code generation is removed; this produces a structured
 * representation suitable for the ad4m-web SHACL-based engine.
 */

import type { PropertyMetadataEntry, RelationMetadataEntry } from './decorators'

export interface SDNADescriptor {
  name: string
  properties: SDNAProperty[]
  relations: SDNARelation[]
  constructorActions: SDNAAction[]
  destructorActions: SDNAAction[]
}

export interface SDNAProperty {
  name: string
  predicate: string
  required: boolean
  readOnly: boolean
  resolveLanguage?: string
  initial?: string
  flag?: boolean
  local?: boolean
}

export interface SDNARelation {
  name: string
  predicate: string
  kind: string
  local?: boolean
}

export interface SDNAAction {
  action: string
  source: string
  predicate: string
  target: string
  local?: boolean
}

/**
 * Build an SDNA descriptor from model metadata.
 */
export function buildSDNA(
  subjectName: string,
  properties: Record<string, PropertyMetadataEntry>,
  relations: Record<string, RelationMetadataEntry>
): SDNADescriptor {
  const constructorActions: SDNAAction[] = []
  const destructorActions: SDNAAction[] = []
  const sdnaProperties: SDNAProperty[] = []
  const sdnaRelations: SDNARelation[] = []

  for (const [propName, meta] of Object.entries(properties)) {
    if (!meta.through) continue

    sdnaProperties.push({
      name: propName,
      predicate: meta.through,
      required: meta.required ?? false,
      readOnly: meta.readOnly ?? false,
      resolveLanguage: meta.resolveLanguage,
      initial: meta.initial,
      flag: meta.flag,
      local: meta.local
    })

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
  }

  const collectionRelations = Object.entries(relations).filter(
    ([, r]) => r.kind === 'hasMany' || r.kind === 'belongsToMany'
  )

  for (const [relName, meta] of collectionRelations) {
    if (!meta.predicate) continue

    sdnaRelations.push({
      name: relName,
      predicate: meta.predicate,
      kind: meta.kind,
      local: meta.local
    })
  }

  return {
    name: subjectName,
    properties: sdnaProperties,
    relations: sdnaRelations,
    constructorActions,
    destructorActions
  }
}
