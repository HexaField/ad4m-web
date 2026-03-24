// Message types for SharedWorker <-> tab communication
export interface WorkerRequest {
  type: 'graphql'
  id: string
  query: string
  variables?: Record<string, unknown>
}

export interface WorkerResponse {
  type: 'graphql-response'
  id: string
  result: unknown
  error?: string
}

export interface WorkerSubscriptionEvent {
  type: 'subscription-event'
  eventType: string
  payload: unknown
}

export type WorkerMessage = WorkerRequest | WorkerResponse | WorkerSubscriptionEvent
