/**
 * SPARQL value formatting utilities for the Ad4mModel system.
 */

import { escapeSparqlString } from './util'

/**
 * Check if a value looks like an IRI (has a scheme://).
 */
export function isSparqlIRI(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(value)
}

/**
 * Format a JavaScript value for embedding in a SPARQL query.
 *
 * - Strings that look like IRIs → `<uri>`
 * - Other strings → `"escaped"` literal
 * - Numbers → numeric literal
 * - Booleans → `"true"` / `"false"`
 */
export function formatSparqlValue(value: unknown): string {
  if (typeof value === 'string') {
    if (isSparqlIRI(value)) {
      return `<${value}>`
    }
    return `"${escapeSparqlString(value)}"`
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return `"${value}"`
  }
  return `"${escapeSparqlString(String(value))}"`
}

/**
 * Build a literal:// URI for a primitive value, as stored in the link graph.
 */
export function toLiteralURI(value: unknown): string {
  if (typeof value === 'string') return `literal://string:${value}`
  if (typeof value === 'number') return `literal://number:${value}`
  if (typeof value === 'boolean') return `literal://boolean:${value}`
  return `literal://string:${String(value)}`
}

/**
 * Generate a FILTER clause for comparing against literal:// URIs.
 *
 * Since values are stored as `literal://type:value` IRIs, comparisons
 * need to extract the value portion using STR() and string functions.
 */
export function sparqlLiteralFilter(varName: string, op: string, value: unknown): string {
  const litUri = toLiteralURI(value)
  switch (op) {
    case '=':
      return `FILTER(${varName} = <${litUri}>)`
    case '!=':
      return `FILTER(${varName} != <${litUri}>)`
    case '>':
    case '<':
    case '>=':
    case '<=': {
      // Extract the value portion after the type prefix for comparison
      // We compare the string representations
      const strVal = formatSparqlValue(String(value))
      return `FILTER(STR(${varName}) ${op} ${strVal})`
    }
    case 'contains': {
      const strVal = formatSparqlValue(String(value))
      return `FILTER(CONTAINS(STR(${varName}), ${strVal}))`
    }
    default:
      return ''
  }
}
