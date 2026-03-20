export type TabRole = 'leader' | 'follower' | 'electing'

export interface TabMessage {
  type:
    | 'announce'
    | 'elect'
    | 'leader-claim'
    | 'leader-ack'
    | 'graphql-request'
    | 'graphql-response'
    | 'heartbeat'
    | 'leader-leaving'
  tabId: string
  timestamp: number
  payload?: any
}

export interface GraphQLRequest {
  requestId: string
  query: string
  variables?: Record<string, any>
}

export interface GraphQLResponse {
  requestId: string
  result: any
  error?: string
}
