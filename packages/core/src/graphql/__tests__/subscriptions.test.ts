import { describe, it, expect } from 'vitest'
import { PubSub, createAsyncIterator } from '../subscriptions'

describe('PubSub', () => {
  it('subscribers receive published events', () => {
    const pubsub = new PubSub()
    const received: any[] = []
    pubsub.subscribe('test', (e) => received.push(e))
    pubsub.publish('test', { data: 1 })
    pubsub.publish('test', { data: 2 })
    expect(received).toEqual([{ data: 1 }, { data: 2 }])
  })

  it('unsubscribe stops delivery', () => {
    const pubsub = new PubSub()
    const received: any[] = []
    const unsub = pubsub.subscribe('test', (e) => received.push(e))
    pubsub.publish('test', 'a')
    unsub()
    pubsub.publish('test', 'b')
    expect(received).toEqual(['a'])
  })

  it('multiple subscribers all receive events', () => {
    const pubsub = new PubSub()
    const r1: any[] = []
    const r2: any[] = []
    pubsub.subscribe('test', (e) => r1.push(e))
    pubsub.subscribe('test', (e) => r2.push(e))
    pubsub.publish('test', 'x')
    expect(r1).toEqual(['x'])
    expect(r2).toEqual(['x'])
  })

  it('different event types are independent', () => {
    const pubsub = new PubSub()
    const received: any[] = []
    pubsub.subscribe('a', (e) => received.push(e))
    pubsub.publish('b', 'nope')
    pubsub.publish('a', 'yes')
    expect(received).toEqual(['yes'])
  })
})

describe('createAsyncIterator', () => {
  it('yields published events', async () => {
    const pubsub = new PubSub()
    const iter = createAsyncIterator(pubsub, 'test')
    pubsub.publish('test', 'hello')
    const result = await iter.next()
    expect(result).toEqual({ value: 'hello', done: false })
  })

  it('filters events', async () => {
    const pubsub = new PubSub()
    const iter = createAsyncIterator<{ id: number }>(pubsub, 'test', (e) => e.id === 2)
    pubsub.publish('test', { id: 1 })
    pubsub.publish('test', { id: 2 })
    const result = await iter.next()
    expect(result.value).toEqual({ id: 2 })
  })

  it('return() stops iteration', async () => {
    const pubsub = new PubSub()
    const iter = createAsyncIterator(pubsub, 'test')
    await iter.return!()
    const result = await iter.next()
    expect(result.done).toBe(true)
  })

  it('queues events when not awaiting', async () => {
    const pubsub = new PubSub()
    const iter = createAsyncIterator(pubsub, 'test')
    pubsub.publish('test', 'a')
    pubsub.publish('test', 'b')
    pubsub.publish('test', 'c')
    expect((await iter.next()).value).toBe('a')
    expect((await iter.next()).value).toBe('b')
    expect((await iter.next()).value).toBe('c')
  })
})
