import { NEIGHBOURHOOD_URL_PREFIX } from './types'

export function parseNeighbourhoodUrl(url: string): string {
  if (!url.startsWith(NEIGHBOURHOOD_URL_PREFIX)) {
    throw new Error(`Invalid neighbourhood URL: must start with ${NEIGHBOURHOOD_URL_PREFIX}`)
  }
  return url.slice(NEIGHBOURHOOD_URL_PREFIX.length)
}

export function createNeighbourhoodUrl(address: string): string {
  return `${NEIGHBOURHOOD_URL_PREFIX}${address}`
}
