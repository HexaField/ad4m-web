export type SubscriptionEvent =
  | { type: 'agentStatusChanged'; payload: any }
  | { type: 'perspectiveAdded'; payload: any }
  | { type: 'perspectiveUpdated'; payload: any }
  | { type: 'perspectiveRemoved'; payload: string }
  | { type: 'perspectiveLinkAdded'; uuid: string; payload: any }
  | { type: 'perspectiveLinkRemoved'; uuid: string; payload: any }
  | { type: 'perspectiveSyncStateChange'; uuid: string; payload: string }

export class PubSub {
  private subscribers = new Map<string, Set<(event: any) => void>>()

  subscribe(eventType: string, callback: (event: any) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set())
    }
    this.subscribers.get(eventType)!.add(callback)
    return () => {
      this.subscribers.get(eventType)?.delete(callback)
    }
  }

  publish(eventType: string, payload: any): void {
    const subs = this.subscribers.get(eventType)
    if (subs) {
      for (const cb of subs) cb(payload)
    }
  }
}

/**
 * Create an AsyncIterableIterator for GraphQL subscriptions.
 * Events are queued if no consumer is awaiting, and filtered optionally.
 */
export function createAsyncIterator<T>(
  pubsub: PubSub,
  eventType: string,
  filter?: (event: T) => boolean
): AsyncIterableIterator<T> {
  const queue: T[] = []
  let resolve: ((value: IteratorResult<T>) => void) | null = null
  let done = false

  const unsubscribe = pubsub.subscribe(eventType, (event: T) => {
    if (filter && !filter(event)) return
    if (resolve) {
      resolve({ value: event, done: false })
      resolve = null
    } else {
      queue.push(event)
    }
  })

  return {
    next(): Promise<IteratorResult<T>> {
      if (done) return Promise.resolve({ value: undefined as any, done: true })
      if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false })
      return new Promise((r) => {
        resolve = r
      })
    },
    return(): Promise<IteratorResult<T>> {
      done = true
      unsubscribe()
      return Promise.resolve({ value: undefined as any, done: true })
    },
    throw(error: any): Promise<IteratorResult<T>> {
      done = true
      unsubscribe()
      return Promise.reject(error)
    },
    [Symbol.asyncIterator]() {
      return this
    }
  }
}
