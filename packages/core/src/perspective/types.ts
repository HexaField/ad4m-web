import type { LinkExpression } from '../linkstore/types'
import type { Link, ExpressionProof } from '../agent/types'

export const PerspectiveState = {
  Private: 'Private',
  NeighbourhoodCreationInitiated: 'NeighbourhoodCreationInitiated',
  NeighbourhoodJoinInitiated: 'NeighbourhoodJoinInitiated',
  LinkLanguageFailedToInstall: 'LinkLanguageFailedToInstall',
  LinkLanguageInstalledButNotSynced: 'LinkLanguageInstalledButNotSynced',
  Synced: 'Synced'
} as const

export type PerspectiveState = (typeof PerspectiveState)[keyof typeof PerspectiveState]

export interface PerspectiveHandle {
  uuid: string
  name?: string
  neighbourhood?: NeighbourhoodExpression
  sharedUrl?: string
  state: PerspectiveState
}

export interface NeighbourhoodExpression {
  author: string
  data: { linkLanguage: string; meta: { links: LinkExpression[] } }
  proof: ExpressionProof
  timestamp: string
}

export type PerspectiveEvent =
  | { type: 'perspectiveAdded'; handle: PerspectiveHandle }
  | { type: 'perspectiveUpdated'; handle: PerspectiveHandle }
  | { type: 'perspectiveRemoved'; uuid: string }
  | { type: 'linkAdded'; uuid: string; link: LinkExpression }
  | { type: 'linkRemoved'; uuid: string; link: LinkExpression }
  | { type: 'linkUpdated'; uuid: string; oldLink: LinkExpression; newLink: LinkExpression }
  | { type: 'syncStateChange'; uuid: string; state: PerspectiveState }

export type PerspectiveEventListener = (event: PerspectiveEvent) => void

export interface LinkMutations {
  additions: Link[]
  removals: LinkExpression[]
}
