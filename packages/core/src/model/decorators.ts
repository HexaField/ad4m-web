/**
 * Decorator-based metadata registry for Ad4mModel classes.
 *
 * Uses TC39 (2024) decorators with context.metadata for storing
 * property and relation metadata per class.
 */

import { capitalize } from './util'
import type { Where } from './types'

// ============================================================================
// Interfaces
// ============================================================================

export interface PropertyOptions {
  through?: string
  initial?: string
  required?: boolean
  readOnly?: boolean
  resolveLanguage?: string
  local?: boolean
  transform?: (value: unknown) => unknown
}

export interface PropertyMetadataEntry extends PropertyOptions {
  writable?: boolean
  flag?: boolean
}

export interface RelationMetadataEntry {
  predicate: string
  target?: () => Ad4mModelLike
  kind: 'hasMany' | 'hasOne' | 'belongsToOne' | 'belongsToMany'
  maxCount?: number
  local?: boolean
  getter?: string
  filter?: boolean
  where?: Where
}

export interface Ad4mModelLike {
  new (...args: unknown[]): unknown
  className?: string
}

export interface FlagOptions {
  through: string
  value: string
}

export interface ModelConfig {
  name: string
}

export interface RelationOptions {
  through?: string
  target?: () => Ad4mModelLike
  getter?: string
  local?: boolean
  filter?: boolean
  where?: Where
}

// ============================================================================
// Metadata keys stored on context.metadata
// ============================================================================

const PROP_KEY = '__ad4m_props__'
const REL_KEY = '__ad4m_rels__'

interface MetadataObj {
  [PROP_KEY]?: Record<string, PropertyMetadataEntry>
  [REL_KEY]?: Record<string, RelationMetadataEntry>
}

function getOrCreateProps(meta: MetadataObj): Record<string, PropertyMetadataEntry> {
  if (!meta[PROP_KEY]) meta[PROP_KEY] = {}
  return meta[PROP_KEY]
}

function getOrCreateRels(meta: MetadataObj): Record<string, RelationMetadataEntry> {
  if (!meta[REL_KEY]) meta[REL_KEY] = {}
  return meta[REL_KEY]
}

// ============================================================================
// Helpers to find decorator metadata on a class
// ============================================================================

/**
 * Find the decorator metadata object attached to a class by the TC39 polyfill.
 * The polyfill stores it as `Class[Symbol("Symbol.metadata")]`.
 */
function findMetadata(ctor: Function): MetadataObj | undefined {
  // Try native Symbol.metadata first
  const metaSym = (Symbol as { metadata?: symbol }).metadata
  if (metaSym) {
    const m = (ctor as unknown as Record<symbol, unknown>)[metaSym]
    if (m) return m as MetadataObj
  }
  // Polyfill: find symbol with description "Symbol.metadata"
  const syms = Object.getOwnPropertySymbols(ctor)
  for (const s of syms) {
    if (s.description === 'Symbol.metadata') {
      return (ctor as unknown as Record<symbol, unknown>)[s] as MetadataObj
    }
  }
  return undefined
}

// ============================================================================
// Metadata accessors
// ============================================================================

/**
 * Retrieve property metadata for a class, walking the prototype chain.
 */
export function getPropertiesMetadata(ctor: Function): Record<string, PropertyMetadataEntry> {
  const result: Record<string, PropertyMetadataEntry> = {}
  const chain: Function[] = []
  let current: Function | null = ctor
  while (current && current !== Object && current !== Function.prototype) {
    chain.unshift(current)
    current = Object.getPrototypeOf(current)
  }
  for (const c of chain) {
    const meta = findMetadata(c)
    if (meta?.[PROP_KEY]) Object.assign(result, meta[PROP_KEY])
  }
  return result
}

/**
 * Retrieve relation metadata for a class, walking the prototype chain.
 */
export function getRelationsMetadata(ctor: Function): Record<string, RelationMetadataEntry> {
  const result: Record<string, RelationMetadataEntry> = {}
  const chain: Function[] = []
  let current: Function | null = ctor
  while (current && current !== Object && current !== Function.prototype) {
    chain.unshift(current)
    current = Object.getPrototypeOf(current)
  }
  for (const c of chain) {
    const meta = findMetadata(c)
    if (meta?.[REL_KEY]) Object.assign(result, meta[REL_KEY])
  }
  return result
}

/**
 * Get combined model metadata.
 */
export function getModelMetadata(ctor: Function & { className?: string }): {
  className: string
  properties: Record<string, PropertyMetadataEntry>
  relations: Record<string, RelationMetadataEntry>
} {
  return {
    className: ctor.className ?? ctor.name,
    properties: getPropertiesMetadata(ctor),
    relations: getRelationsMetadata(ctor)
  }
}

/**
 * Programmatically register property metadata (for dynamic model builders).
 */
export function registerPropertyMetadata(ctor: Function, propName: string, meta: PropertyMetadataEntry): void {
  let m = findMetadata(ctor)
  if (!m) {
    m = {}
    const sym = (Symbol as { metadata?: symbol }).metadata ?? Symbol.for('Symbol.metadata')
    Object.defineProperty(ctor, sym, { value: m, configurable: true })
  }
  getOrCreateProps(m)[propName] = meta
}

/**
 * Programmatically register relation metadata (for dynamic model builders).
 */
export function registerRelationMetadata(ctor: Function, relName: string, meta: RelationMetadataEntry): void {
  let m = findMetadata(ctor)
  if (!m) {
    m = {}
    const sym = (Symbol as { metadata?: symbol }).metadata ?? Symbol.for('Symbol.metadata')
    Object.defineProperty(ctor, sym, { value: m, configurable: true })
  }
  getOrCreateRels(m)[relName] = meta
}

// ============================================================================
// TC39 decorator types
// ============================================================================

// We use `any` for decorator context to avoid TS1238/TS1240 errors
// when TypeScript's lib doesn't include decorator metadata types.
// The runtime (esbuild/vite) correctly provides the context object.

// ============================================================================
// Property decorators
// ============================================================================

function applyPropertyMetadata(opts: PropertyOptions) {
  return function (_value: undefined, context: any) {
    const writable = opts.readOnly ? false : opts.through ? true : false

    if (opts.required && !opts.initial) {
      throw new Error("Property requires an 'initial' option if 'required' is true")
    }
    if (!opts.through) {
      throw new Error("Property requires a 'through' option")
    }

    getOrCreateProps(context.metadata)[context.name as string] = { ...opts, writable }
  }
}

export function Property(opts: PropertyOptions) {
  const required = opts.required ?? false
  return applyPropertyMetadata({
    ...opts,
    required,
    readOnly: opts.readOnly ?? false,
    resolveLanguage: opts.resolveLanguage ?? 'literal',
    initial: opts.initial ?? (required ? 'literal://string:uninitialized' : undefined)
  })
}

export function Optional(opts: PropertyOptions) {
  return applyPropertyMetadata({
    ...opts,
    required: opts.required ?? false,
    readOnly: opts.readOnly ?? false
  })
}

export function ReadOnly(opts: PropertyOptions) {
  return Property({ ...opts, readOnly: true })
}

export function Flag(opts: FlagOptions) {
  return function (_value: undefined, context: any) {
    if (!opts.through || !opts.value) {
      throw new Error("Flag requires both 'through' and 'value' options")
    }
    getOrCreateProps(context.metadata)[context.name as string] = {
      through: opts.through,
      required: true,
      initial: opts.value,
      flag: true,
      readOnly: true,
      writable: false
    }
    return () => opts.value
  }
}

// ============================================================================
// Relation helpers
// ============================================================================

function resolveRelationArgs(
  first: (() => Ad4mModelLike) | RelationOptions,
  second?: Omit<RelationOptions, 'target'>
): RelationOptions {
  const opts = typeof first === 'function' ? { ...second, target: first } : first

  if (opts.getter) {
    if (opts.through) throw new Error('Relation: `getter` and `through` are mutually exclusive.')
    if (opts.target) throw new Error('Relation: `getter` and `target` are mutually exclusive.')
    return opts
  }
  if (!opts.through) opts.through = 'ad4m://has_child'
  return opts
}

// ============================================================================
// Relation decorators
// ============================================================================

type FieldDec = (_value: undefined, context: any) => void

export function HasMany(opts: RelationOptions): FieldDec
export function HasMany(target: () => Ad4mModelLike, opts?: Omit<RelationOptions, 'target'>): FieldDec
export function HasMany(
  first: (() => Ad4mModelLike) | RelationOptions,
  second?: Omit<RelationOptions, 'target'>
): FieldDec {
  const opts = resolveRelationArgs(first, second)
  return function (_value: undefined, context: any) {
    getOrCreateRels(context.metadata)[context.name as string] = {
      predicate: opts.through!,
      target: opts.target,
      kind: 'hasMany',
      local: opts.local,
      ...(opts.getter && { getter: opts.getter }),
      ...(opts.filter !== undefined && { filter: opts.filter }),
      ...(opts.where && { where: opts.where })
    }
  }
}

export function HasOne(opts: RelationOptions): FieldDec
export function HasOne(target: () => Ad4mModelLike, opts?: Omit<RelationOptions, 'target'>): FieldDec
export function HasOne(
  first: (() => Ad4mModelLike) | RelationOptions,
  second?: Omit<RelationOptions, 'target'>
): FieldDec {
  const opts = resolveRelationArgs(first, second)
  return function (_value: undefined, context: any) {
    getOrCreateRels(context.metadata)[context.name as string] = {
      predicate: opts.through!,
      target: opts.target,
      kind: 'hasOne',
      maxCount: 1,
      local: opts.local,
      ...(opts.filter !== undefined && { filter: opts.filter }),
      ...(opts.where && { where: opts.where })
    }
  }
}

export function BelongsToOne(opts: RelationOptions): FieldDec
export function BelongsToOne(target: () => Ad4mModelLike, opts?: Omit<RelationOptions, 'target'>): FieldDec
export function BelongsToOne(
  first: (() => Ad4mModelLike) | RelationOptions,
  second?: Omit<RelationOptions, 'target'>
): FieldDec {
  const opts = resolveRelationArgs(first, second)
  return function (_value: undefined, context: any) {
    getOrCreateRels(context.metadata)[context.name as string] = {
      predicate: opts.through!,
      target: opts.target,
      kind: 'belongsToOne',
      maxCount: 1,
      local: opts.local,
      ...(opts.filter !== undefined && { filter: opts.filter }),
      ...(opts.where && { where: opts.where })
    }
  }
}

export function BelongsToMany(opts: RelationOptions): FieldDec
export function BelongsToMany(target: () => Ad4mModelLike, opts?: Omit<RelationOptions, 'target'>): FieldDec
export function BelongsToMany(
  first: (() => Ad4mModelLike) | RelationOptions,
  second?: Omit<RelationOptions, 'target'>
): FieldDec {
  const opts = resolveRelationArgs(first, second)
  return function (_value: undefined, context: any) {
    getOrCreateRels(context.metadata)[context.name as string] = {
      predicate: opts.through!,
      target: opts.target,
      kind: 'belongsToMany',
      local: opts.local,
      ...(opts.getter && { getter: opts.getter }),
      ...(opts.filter !== undefined && { filter: opts.filter }),
      ...(opts.where && { where: opts.where })
    }
  }
}

// ============================================================================
// Model decorator (TC39 class decorator)
// ============================================================================

export function Model(opts: ModelConfig) {
  return function (target: Function, _context: any) {
    ;(target.prototype as Record<string, unknown>).className = opts.name
    ;(target as unknown as Record<string, unknown>).className = opts.name
  }
}

// Suppress unused import warning
void capitalize
