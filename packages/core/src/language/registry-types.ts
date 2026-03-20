/**
 * Extended types for the language registry system.
 * These complement the base types in ./types.ts with additional metadata fields
 * used by the GraphQL API and language management operations.
 */

export interface LanguageHandleInfo {
  address: string
  name: string
  settings?: string
  icon?: { code: string }
  constructorIcon?: { code: string }
  settingsIcon?: { code: string }
}

export interface LanguageMetaExtended {
  name: string
  address: string
  description?: string
  author?: string
  templated?: boolean
  templateSourceLanguageAddress?: string
  templateAppliedParams?: string
  possibleTemplateParams?: string[]
  sourceCodeHash?: string
}

export interface LanguageMetaInput {
  name: string
  description?: string
  possibleTemplateParams?: string[]
}
