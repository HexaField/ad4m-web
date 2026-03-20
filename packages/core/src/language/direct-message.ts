import type { Expression } from '../agent/types'
import type { DirectMessageAdapter, MessageCallback, Perspective } from './types'

export type PerspectiveExpression = Expression<Perspective>

/**
 * In-memory DirectMessageAdapter for development/testing.
 * Will be replaced with a Language-backed adapter later.
 */
export class InMemoryDirectMessageAdapter implements DirectMessageAdapter {
  private recipientDid: string
  private messages: PerspectiveExpression[] = []
  private callbacks: MessageCallback[] = []
  private onlineStatus: PerspectiveExpression | undefined

  constructor(recipientDid: string) {
    this.recipientDid = recipientDid
  }

  recipient(): string {
    return this.recipientDid
  }

  status(): Promise<PerspectiveExpression | void> {
    return Promise.resolve(this.onlineStatus)
  }

  sendP2P(message: PerspectiveExpression): Promise<PerspectiveExpression | void> {
    this.messages.push(message)
    for (const cb of this.callbacks) {
      cb(message)
    }
    return Promise.resolve(message)
  }

  sendInbox(message: PerspectiveExpression): Promise<PerspectiveExpression | void> {
    this.messages.push(message)
    return Promise.resolve(message)
  }

  setStatus(status: PerspectiveExpression): void {
    this.onlineStatus = status
  }

  inbox(filter?: string): Promise<PerspectiveExpression[]> {
    if (!filter) return Promise.resolve([...this.messages])
    return Promise.resolve(this.messages.filter((m) => JSON.stringify(m).includes(filter)))
  }

  addMessageCallback(callback: MessageCallback): void {
    this.callbacks.push(callback)
  }

  /** Visible for testing */
  getMessageCount(): number {
    return this.messages.length
  }
}
