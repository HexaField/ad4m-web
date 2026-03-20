import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TabCoordinator } from '../coordinator'

// Mock BroadcastChannel
class MockBroadcastChannel {
  static channels = new Map<string, MockBroadcastChannel[]>()
  name: string
  onmessage: ((ev: MessageEvent) => void) | null = null

  constructor(name: string) {
    this.name = name
    const list = MockBroadcastChannel.channels.get(name) ?? []
    list.push(this)
    MockBroadcastChannel.channels.set(name, list)
  }

  postMessage(data: any) {
    const others = MockBroadcastChannel.channels.get(this.name) ?? []
    for (const ch of others) {
      if (ch !== this && ch.onmessage) {
        ch.onmessage(new MessageEvent('message', { data }))
      }
    }
  }

  close() {
    const list = MockBroadcastChannel.channels.get(this.name) ?? []
    const idx = list.indexOf(this)
    if (idx >= 0) list.splice(idx, 1)
  }
}

function channelFactory(name: string): BroadcastChannel {
  return new MockBroadcastChannel(name) as unknown as BroadcastChannel
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('TabCoordinator', () => {
  beforeEach(() => {
    MockBroadcastChannel.channels.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('single tab becomes leader', async () => {
    const coord = new TabCoordinator('tab-1', channelFactory)
    const roles: string[] = []
    coord.onRoleChange((r) => roles.push(r))

    coord.start()
    expect(coord.getRole()).toBe('electing')

    vi.advanceTimersByTime(600)
    expect(coord.getRole()).toBe('leader')
    expect(roles).toContain('leader')

    coord.destroy()
  })

  it('two tabs: first becomes leader, second becomes follower', () => {
    const coord1 = new TabCoordinator('tab-1', channelFactory)
    const coord2 = new TabCoordinator('tab-2', channelFactory)

    coord1.start()
    // Small delay then second tab starts
    vi.advanceTimersByTime(100)
    coord2.start()

    // Wait for election
    vi.advanceTimersByTime(600)

    // tab-1 started first (lower timestamp) → leader
    expect(coord1.getRole()).toBe('leader')
    expect(coord2.getRole()).toBe('follower')

    coord1.destroy()
    coord2.destroy()
  })

  it('leader leaving triggers re-election', () => {
    const coord1 = new TabCoordinator('tab-1', channelFactory)
    const coord2 = new TabCoordinator('tab-2', channelFactory)

    coord1.start()
    vi.advanceTimersByTime(100)
    coord2.start()
    vi.advanceTimersByTime(600)

    expect(coord1.getRole()).toBe('leader')
    expect(coord2.getRole()).toBe('follower')

    // Leader leaves
    coord1.destroy()
    // Simulate the leader-leaving message (normally sent in beforeunload)
    // Since destroy closes the channel, we manually trigger re-election via heartbeat timeout
    vi.advanceTimersByTime(7000)

    expect(coord2.getRole()).toBe('leader')

    coord2.destroy()
  })

  it('GraphQL proxy: follower sends query, leader responds', async () => {
    vi.useRealTimers()

    const coord1 = new TabCoordinator('tab-1', channelFactory)
    const coord2 = new TabCoordinator('tab-2', channelFactory)

    coord1.start()
    await wait(50)
    coord2.start()
    await wait(600)

    expect(coord1.getRole()).toBe('leader')
    expect(coord2.getRole()).toBe('follower')

    // Set up a mock GraphQL engine on the leader
    const mockEngine = {
      execute: async (query: string, variables?: Record<string, any>) => {
        return { data: { echo: query } }
      }
    }
    coord1.setGraphQLEngine(mockEngine as any)

    // Follower sends a query
    const result = await coord2.executeGraphQL('{ hello }')
    expect(result).toEqual({ data: { echo: '{ hello }' } })

    coord1.destroy()
    coord2.destroy()
  })

  it('heartbeat timeout triggers re-election', () => {
    const coord1 = new TabCoordinator('tab-1', channelFactory)
    const coord2 = new TabCoordinator('tab-2', channelFactory)

    coord1.start()
    vi.advanceTimersByTime(100)
    coord2.start()
    vi.advanceTimersByTime(600)

    expect(coord1.getRole()).toBe('leader')
    expect(coord2.getRole()).toBe('follower')

    // Stop leader's heartbeat without sending leader-leaving
    coord1.destroy()

    // Follower should detect missing heartbeat after 6s
    vi.advanceTimersByTime(7000)
    expect(coord2.getRole()).toBe('leader')

    coord2.destroy()
  })
})
