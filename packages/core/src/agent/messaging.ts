import type { Expression } from './types'
import type { Perspective } from '../language/types'
import type { PubSub } from '../graphql/subscriptions'

export type PerspectiveExpression = Expression<Perspective>

/**
 * Manages direct message language preference and routing.
 * DMs are sent through a Language's DirectMessageAdapter, selected by address.
 */
export class AgentMessagingService {
  private _directMessageLanguage: string | null = null
  private pubsub: PubSub | undefined

  constructor(pubsub?: PubSub) {
    this.pubsub = pubsub
  }

  get directMessageLanguage(): string | null {
    return this._directMessageLanguage
  }

  updateDirectMessageLanguage(address: string): void {
    this._directMessageLanguage = address
  }

  /**
   * Called when an incoming DM is received. Publishes to the
   * `runtimeMessageReceived` PubSub topic for GraphQL subscriptions.
   */
  notifyMessageReceived(message: PerspectiveExpression): void {
    this.pubsub?.publish('runtimeMessageReceived', message)
  }
}
