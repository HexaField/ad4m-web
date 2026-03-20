import type { Link } from '../agent/types'

const URI_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+\-._]*:/

export function isValidUri(s: string): boolean {
  return URI_SCHEME_REGEX.test(s)
}

export function validateLink(link: Link): void {
  if (!isValidUri(link.source)) {
    throw new Error(`Invalid source URI: ${link.source}`)
  }
  if (!isValidUri(link.target)) {
    throw new Error(`Invalid target URI: ${link.target}`)
  }
  if (link.predicate === '') {
    link.predicate = undefined
  }
}
