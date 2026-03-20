import type { LinkExpression } from '../linkstore/types'

export interface Neighbourhood {
  linkLanguage: string
  meta: { links: LinkExpression[] }
}

// NeighbourhoodExpression is defined in perspective/types.ts
// Re-export it here for convenience
export type { NeighbourhoodExpression } from '../perspective/types'

export const NEIGHBOURHOOD_URL_PREFIX = 'neighbourhood://'
