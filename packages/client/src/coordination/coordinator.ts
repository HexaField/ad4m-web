import type { TabRole, TabMessage, GraphQLRequest, GraphQLResponse } from './types'
import type { GraphQLEngine } from '@ad4m-web/core'

const CHANNEL_NAME = 'ad4m-web'
const ELECTION_TIMEOUT = 500
const HEARTBEAT_INTERVAL = 2000
const HEARTBEAT_TIMEOUT = 6000
const GRAPHQL_TIMEOUT = 30000

export class TabCoordinator {
  private channel: BroadcastChannel
  private tabId: string
  private _role: TabRole = 'electing'
  private leaderId: string | null = null
  private myTimestamp: number = 0
  private tabs = new Map<string, number>()
  private pendingRequests = new Map<
    string,
    { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }
  >()
  private graphqlEngine: GraphQLEngine | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatWatchdog: ReturnType<typeof setTimeout> | null = null
  private electionTimer: ReturnType<typeof setTimeout> | null = null
  private roleCallbacks: ((role: TabRole) => void)[] = []
  private unloadHandler: (() => void) | null = null

  constructor(tabId: string, channelFactory?: (name: string) => BroadcastChannel) {
    this.tabId = tabId
    const factory = channelFactory ?? ((name: string) => new BroadcastChannel(name))
    this.channel = factory(CHANNEL_NAME)
    this.channel.onmessage = (ev: MessageEvent<TabMessage>) => this.handleMessage(ev.data)
  }

  start(): void {
    this.myTimestamp = Date.now()
    this.tabs.set(this.tabId, this.myTimestamp)
    this.broadcast({ type: 'announce', tabId: this.tabId, timestamp: this.myTimestamp })

    this.electionTimer = setTimeout(() => {
      this.electionTimer = null
      this.resolveElection()
    }, ELECTION_TIMEOUT)

    if (typeof window !== 'undefined') {
      this.unloadHandler = () => {
        if (this._role === 'leader') {
          this.broadcast({ type: 'leader-leaving', tabId: this.tabId, timestamp: Date.now() })
        }
        this.destroy()
      }
      window.addEventListener('beforeunload', this.unloadHandler)
    }
  }

  getRole(): TabRole {
    return this._role
  }

  getTabId(): string {
    return this.tabId
  }

  getLeaderId(): string | null {
    return this.leaderId
  }

  setGraphQLEngine(engine: GraphQLEngine): void {
    this.graphqlEngine = engine
  }

  async executeGraphQL(query: string, variables?: Record<string, any>): Promise<any> {
    if (this._role === 'leader' && this.graphqlEngine) {
      return this.graphqlEngine.execute(query, variables)
    }

    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('GraphQL proxy timeout'))
      }, GRAPHQL_TIMEOUT)

      this.pendingRequests.set(requestId, { resolve, reject, timer })

      const payload: GraphQLRequest = { requestId, query, variables }
      this.broadcast({ type: 'graphql-request', tabId: this.tabId, timestamp: Date.now(), payload })
    })
  }

  onRoleChange(callback: (role: TabRole) => void): () => void {
    this.roleCallbacks.push(callback)
    return () => {
      const idx = this.roleCallbacks.indexOf(callback)
      if (idx >= 0) this.roleCallbacks.splice(idx, 1)
    }
  }

  destroy(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    if (this.heartbeatWatchdog) clearTimeout(this.heartbeatWatchdog)
    if (this.electionTimer) clearTimeout(this.electionTimer)
    for (const { reject, timer } of this.pendingRequests.values()) {
      clearTimeout(timer)
      reject(new Error('TabCoordinator destroyed'))
    }
    this.pendingRequests.clear()
    if (this.unloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.unloadHandler)
    }
    this.channel.close()
  }

  private setRole(role: TabRole): void {
    if (this._role === role) return
    this._role = role
    for (const cb of this.roleCallbacks) cb(role)
  }

  private broadcast(msg: TabMessage): void {
    this.channel.postMessage(msg)
  }

  private handleMessage(msg: TabMessage): void {
    switch (msg.type) {
      case 'announce':
        this.tabs.set(msg.tabId, msg.timestamp)
        // Reply with our own announce so the new tab knows about us
        if (this._role !== 'electing') {
          // Already resolved — if we're leader, re-assert
          if (this._role === 'leader') {
            this.broadcast({ type: 'leader-claim', tabId: this.tabId, timestamp: this.myTimestamp })
          }
        }
        break

      case 'leader-claim':
        this.leaderId = msg.tabId
        if (msg.tabId === this.tabId) {
          this.becomeLeader()
        } else {
          this.becomeFollower()
          this.broadcast({ type: 'leader-ack', tabId: this.tabId, timestamp: Date.now() })
        }
        break

      case 'leader-ack':
        // Nothing to do — leader already knows
        break

      case 'heartbeat':
        if (this._role === 'follower') {
          this.resetHeartbeatWatchdog()
        }
        break

      case 'leader-leaving':
        if (msg.tabId === this.leaderId) {
          this.tabs.delete(msg.tabId)
          this.startReelection()
        }
        break

      case 'graphql-request':
        if (this._role === 'leader' && this.graphqlEngine) {
          const req = msg.payload as GraphQLRequest
          this.graphqlEngine.execute(req.query, req.variables).then(
            (result) => {
              const resp: GraphQLResponse = { requestId: req.requestId, result }
              this.broadcast({ type: 'graphql-response', tabId: this.tabId, timestamp: Date.now(), payload: resp })
            },
            (error) => {
              const resp: GraphQLResponse = { requestId: req.requestId, result: null, error: String(error) }
              this.broadcast({ type: 'graphql-response', tabId: this.tabId, timestamp: Date.now(), payload: resp })
            }
          )
        }
        break

      case 'graphql-response': {
        const resp = msg.payload as GraphQLResponse
        const pending = this.pendingRequests.get(resp.requestId)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingRequests.delete(resp.requestId)
          if (resp.error) {
            pending.reject(new Error(resp.error))
          } else {
            pending.resolve(resp.result)
          }
        }
        break
      }
    }
  }

  private resolveElection(): void {
    // Find tab with lowest timestamp
    let lowestId = this.tabId
    let lowestTs = this.myTimestamp
    for (const [id, ts] of this.tabs) {
      if (ts < lowestTs || (ts === lowestTs && id < lowestId)) {
        lowestId = id
        lowestTs = ts
      }
    }

    if (lowestId === this.tabId) {
      this.leaderId = this.tabId
      this.broadcast({ type: 'leader-claim', tabId: this.tabId, timestamp: this.myTimestamp })
      this.becomeLeader()
    }
    // If someone else should be leader, wait for their leader-claim
  }

  private becomeLeader(): void {
    this.setRole('leader')
    if (this.heartbeatWatchdog) {
      clearTimeout(this.heartbeatWatchdog)
      this.heartbeatWatchdog = null
    }
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({ type: 'heartbeat', tabId: this.tabId, timestamp: Date.now() })
    }, HEARTBEAT_INTERVAL)
  }

  private becomeFollower(): void {
    this.setRole('follower')
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.resetHeartbeatWatchdog()
  }

  private resetHeartbeatWatchdog(): void {
    if (this.heartbeatWatchdog) clearTimeout(this.heartbeatWatchdog)
    this.heartbeatWatchdog = setTimeout(() => {
      // Leader seems dead, re-elect
      this.startReelection()
    }, HEARTBEAT_TIMEOUT)
  }

  private startReelection(): void {
    if (this.heartbeatWatchdog) {
      clearTimeout(this.heartbeatWatchdog)
      this.heartbeatWatchdog = null
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    this.leaderId = null
    this.setRole('electing')
    this.myTimestamp = Date.now()
    this.tabs.clear()
    this.tabs.set(this.tabId, this.myTimestamp)
    this.broadcast({ type: 'announce', tabId: this.tabId, timestamp: this.myTimestamp })
    this.electionTimer = setTimeout(() => {
      this.electionTimer = null
      this.resolveElection()
    }, ELECTION_TIMEOUT)
  }
}
