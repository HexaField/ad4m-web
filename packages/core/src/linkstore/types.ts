import type { Link, ExpressionProof, DecoratedExpressionProof } from '../agent/types'

export interface LinkExpression {
  author: string
  timestamp: string
  data: Link
  proof: ExpressionProof
  status?: LinkStatus
}

export const LinkStatus = {
  Shared: 'shared',
  Local: 'local'
} as const

export type LinkStatus = (typeof LinkStatus)[keyof typeof LinkStatus]

export interface DecoratedLinkExpression {
  author: string
  timestamp: string
  data: Link
  proof: DecoratedExpressionProof
  status?: LinkStatus
}

export interface LinkQuery {
  source?: string
  target?: string
  predicate?: string
  fromDate?: string
  untilDate?: string
  limit?: number
}

export interface LinkStore {
  addLink(perspectiveUuid: string, link: LinkExpression): Promise<void>
  addLinks(perspectiveUuid: string, links: LinkExpression[]): Promise<void>
  removeLink(perspectiveUuid: string, link: LinkExpression): Promise<boolean>
  queryLinks(perspectiveUuid: string, query: LinkQuery): Promise<LinkExpression[]>
  allLinks(perspectiveUuid: string): Promise<LinkExpression[]>
  removePerspective(perspectiveUuid: string): Promise<void>
  dump(): Promise<string>
  load(data: string): Promise<void>
}
