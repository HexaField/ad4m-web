/// <reference lib="webworker" />
import { bootstrapExecutor } from './bootstrap'
import type { WorkerRequest, WorkerResponse, WorkerSubscriptionEvent } from './protocol'
import type { GraphQLEngine } from '@ad4m-web/core'

declare const self: SharedWorkerGlobalScope

let enginePromise: Promise<GraphQLEngine> | null = null
const ports = new Set<MessagePort>()

// Subscription event types to forward
const SUBSCRIPTION_EVENTS = [
  'agentStatusChanged',
  'perspectiveAdded',
  'perspectiveUpdated',
  'perspectiveRemoved',
  'perspectiveLinkAdded',
  'perspectiveLinkRemoved',
  'perspectiveLinkUpdated',
  'perspectiveSyncStateChange',
  'neighbourhoodSignal',
  'exceptionOccurred',
  'runtimeMessageReceived',
  'agentUpdated'
]

function getEngine(): Promise<GraphQLEngine> {
  if (!enginePromise) {
    enginePromise = bootstrapExecutor().then((state) => {
      // Wire up pubsub to forward events to all connected ports
      for (const eventType of SUBSCRIPTION_EVENTS) {
        state.graphql.pubsub.subscribe(eventType, (payload: unknown) => {
          const msg: WorkerSubscriptionEvent = { type: 'subscription-event', eventType, payload }
          for (const port of ports) {
            port.postMessage(msg)
          }
        })
      }
      return state.graphql
    })
  }
  return enginePromise
}

self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0]
  ports.add(port)

  port.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const msg = event.data
    if (msg.type === 'graphql') {
      try {
        const engine = await getEngine()
        const result = await engine.execute(msg.query, msg.variables as Record<string, unknown> | undefined)
        const response: WorkerResponse = { type: 'graphql-response', id: msg.id, result }
        port.postMessage(response)
      } catch (err) {
        const response: WorkerResponse = {
          type: 'graphql-response',
          id: msg.id,
          result: null,
          error: String(err)
        }
        port.postMessage(response)
      }
    }
  }

  port.start()
}
