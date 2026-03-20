import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { LanguageMeta } from './types'

const AD4M_TEMPLATE_VARIABLE_PATTERN = /\/\/!@ad4m-template-variable\s*\n\s*(const|let|var)\s+(\w+)\s*=\s*[^;\n]+/g

/**
 * Apply template parameters to a language bundle source.
 *
 * For non-Holochain bundles: replaces variables marked with
 * `//!@ad4m-template-variable` comments, and also `{{key}}` placeholders.
 *
 * For Holochain DNAs: if `templateData.uid` is present and the bundle contains
 * `dna.yaml` references, updates `network_seed` in the yaml content.
 */
export function applyTemplate(sourceBundle: string, templateData: Record<string, unknown>): string {
  let result = sourceBundle

  // Replace {{key}} style placeholders
  for (const [key, value] of Object.entries(templateData)) {
    result = result.replaceAll(`{{${key}}}`, String(value))
  }

  // Replace //!@ad4m-template-variable annotated assignments
  result = result.replace(AD4M_TEMPLATE_VARIABLE_PATTERN, (match, declKind, varName) => {
    if (varName in templateData) {
      const val = JSON.stringify(templateData[varName])
      return `//!@ad4m-template-variable\n${declKind} ${varName} = ${val}`
    }
    return match
  })

  // Handle Holochain network_seed via uid
  if (templateData.uid && result.includes('network_seed')) {
    result = result.replace(/(network_seed:\s*).*/g, `$1${String(templateData.uid)}`)
  }

  return result
}

/**
 * Content-address a bundle (SHA-256 hex hash).
 */
export function hashBundle(bundle: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(bundle)))
}

/**
 * Apply a template to a source language and produce new metadata.
 */
export function createTemplatedLanguageMeta(
  sourceAddress: string,
  sourceMeta: LanguageMeta | undefined,
  templatedBundle: string,
  templateData: Record<string, unknown>
): { address: string; meta: LanguageMeta } {
  const address = hashBundle(templatedBundle)
  const meta: LanguageMeta = {
    address,
    name: sourceMeta?.name ?? 'templated-language',
    author: sourceMeta?.author ?? 'unknown',
    description: sourceMeta?.description,
    templated: true,
    templateSourceLanguageAddress: sourceAddress,
    templateAppliedParams: JSON.stringify(templateData)
  }
  return { address, meta }
}
