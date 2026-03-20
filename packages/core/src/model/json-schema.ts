/**
 * JSON Schema → Ad4mModel class builder.
 *
 * Creates dynamic model classes from JSON Schema definitions,
 * wiring up property and relation metadata via the programmatic registry.
 */

import { registerPropertyMetadata, registerRelationMetadata, Model } from './decorators'
import type { PropertyMetadataEntry } from './decorators'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JSONSchemaProperty {
  type: string | string[]
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  'x-ad4m'?: {
    through?: string
    resolveLanguage?: string
    local?: boolean
    writable?: boolean
    initial?: string
  }
}

export interface JSONSchema {
  $schema?: string
  title?: string
  $id?: string
  type?: string
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  'x-ad4m'?: {
    namespace?: string
    className?: string
  }
}

export interface JSONSchemaToModelOptions {
  name: string
  namespace?: string
  predicateTemplate?: string
  predicateGenerator?: (title: string, property: string) => string
  propertyMapping?: Record<string, string>
  resolveLanguage?: string
  local?: boolean
  propertyOptions?: Record<string, Partial<PropertyMetadataEntry>>
}

// ─── Schema Helpers ─────────────────────────────────────────────────────────

function normalizeNamespaceString(namespace: string): string {
  if (!namespace) return ''
  if (namespace.includes('://')) {
    const idx = namespace.indexOf('://')
    const scheme = namespace.slice(0, idx)
    const rest = namespace.slice(idx + 3).replace(/\/+$/, '')
    return `${scheme}://${rest}`
  }
  return namespace.replace(/\/+$/, '')
}

function normalizeSchemaType(type?: string | string[]): string | undefined {
  if (!type) return undefined
  if (typeof type === 'string') return type
  if (Array.isArray(type) && type.length > 0) {
    const nonNull = type.find((t) => t !== 'null')
    return nonNull || type[0]
  }
  return undefined
}

function isArrayType(schema: JSONSchemaProperty): boolean {
  return normalizeSchemaType(schema.type) === 'array'
}

function getDefaultValueForType(type?: string): unknown {
  switch (type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return ''
  }
}

// ─── Namespace / Predicate Resolution ───────────────────────────────────────

function determineNamespace(schema: JSONSchema, options: JSONSchemaToModelOptions): string {
  if (options.namespace) return options.namespace
  if (schema['x-ad4m']?.namespace) return schema['x-ad4m'].namespace
  if (schema.title) return `${schema.title.toLowerCase()}://`
  if (schema.$id) {
    try {
      const url = new URL(schema.$id)
      const pathParts = url.pathname.split('/').filter((p) => p)
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
        const baseName = lastPart.replace(/\.schema\.json$/, '').replace(/\.json$/, '')
        return `${baseName.toLowerCase()}://`
      }
    } catch {
      // not a valid URL
    }
  }
  throw new Error(
    'Cannot infer namespace for JSON Schema. Provide options.namespace, schema["x-ad4m"].namespace, or schema.title'
  )
}

function determinePredicate(
  schema: JSONSchema,
  propertyName: string,
  propertySchema: JSONSchemaProperty,
  namespace: string,
  options: JSONSchemaToModelOptions
): string {
  if (options.propertyMapping?.[propertyName]) return options.propertyMapping[propertyName]
  if (propertySchema['x-ad4m']?.through) return propertySchema['x-ad4m'].through

  if (options.predicateTemplate) {
    const normalized = normalizeNamespaceString(namespace)
    const idx = normalized.indexOf('://')
    const scheme = idx >= 0 ? normalized.slice(0, idx) : ''
    const nsNoScheme = idx >= 0 ? normalized.slice(idx + 3) : normalized
    return options.predicateTemplate
      .replace('${namespace}', nsNoScheme)
      .replace('${scheme}', scheme)
      .replace('${ns}', nsNoScheme)
      .replace('${title}', schema.title || '')
      .replace('${property}', propertyName)
  }

  if (options.predicateGenerator) {
    return options.predicateGenerator(schema.title || '', propertyName)
  }

  const normalized = normalizeNamespaceString(namespace)
  if (normalized.includes('://')) return `${normalized}${propertyName}`
  return `${normalized}://${propertyName}`
}

// ─── Main Builder ───────────────────────────────────────────────────────────

/**
 * Create a dynamic model class from a JSON Schema definition.
 */
export function fromJSONSchema(schema: JSONSchema, options: JSONSchemaToModelOptions): Function {
  if (schema?.properties && Object.prototype.hasOwnProperty.call(schema.properties, 'author')) {
    throw new Error('JSON Schema must not define a top-level "author" property — Ad4mModel provides it implicitly.')
  }

  if (!options.name || options.name.trim() === '') {
    throw new Error('options.name is required and cannot be empty')
  }

  const namespace = determineNamespace(schema, options)

  // Create dynamic class
  const DynamicClass = class {} as Function & { className?: string }
  DynamicClass.className = options.name
  ;(DynamicClass.prototype as Record<string, unknown>).className = options.name

  // Apply Model decorator
  const ModelDec = Model({ name: options.name })
  ModelDec(DynamicClass, {} as unknown)

  if (!schema.properties) return DynamicClass

  for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
    const predicate = determinePredicate(schema, propertyName, propertySchema, namespace, options)
    const isRequired = schema.required?.includes(propertyName) || false
    const propertyType = normalizeSchemaType(propertySchema.type)
    const isArray = isArrayType(propertySchema)

    if (isArray) {
      // Register as relation
      registerRelationMetadata(DynamicClass, propertyName, {
        predicate,
        kind: 'hasMany',
        local: propertySchema['x-ad4m']?.local ?? options.local
      })

      Object.defineProperty(DynamicClass.prototype, propertyName, {
        configurable: true,
        writable: true,
        value: []
      })
    } else {
      // Register as property
      let resolveLanguage =
        propertySchema['x-ad4m']?.resolveLanguage ??
        options.propertyOptions?.[propertyName]?.resolveLanguage ??
        options.resolveLanguage ??
        'literal'

      const local = propertySchema['x-ad4m']?.local ?? options.local
      const xWritable = propertySchema['x-ad4m']?.writable
      const readOnly = xWritable !== undefined ? !xWritable : false
      let initial = propertySchema['x-ad4m']?.initial ?? options.propertyOptions?.[propertyName]?.initial

      if (isRequired && !initial) {
        initial = 'ad4m://undefined'
      }

      registerPropertyMetadata(DynamicClass, propertyName, {
        through: predicate,
        required: isRequired,
        readOnly,
        writable: !readOnly,
        resolveLanguage,
        ...(local !== undefined && { local }),
        ...(initial && { initial })
      })

      Object.defineProperty(DynamicClass.prototype, propertyName, {
        configurable: true,
        writable: true,
        value: getDefaultValueForType(propertyType)
      })
    }
  }

  return DynamicClass
}
