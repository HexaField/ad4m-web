import { describe, it, expect } from 'vitest'
import { InProcessLanguageHost } from '../host'
import { createMockLanguage, createMockContext } from './mock'

describe('InProcessLanguageHost', () => {
  const context = createMockContext()

  it('load() with a pre-built Language returns LanguageHandle', async () => {
    const host = new InProcessLanguageHost()
    const { language } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)
    expect(handle.address).toBe('addr1')
    expect(handle.name).toBe('test-language')
    expect(handle.language).toBe(language)
  })

  it('call() invokes the correct adapter method', async () => {
    const host = new InProcessLanguageHost()
    const { language, store } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)

    const addr = await host.call<string>(handle, 'expressionAdapter', 'get', ['nonexistent'])
    expect(addr).toBeNull()

    store.set('key1', { hello: 'world' })
    const result = await host.call<any>(handle, 'expressionAdapter', 'get', ['key1'])
    expect(result).toEqual({ hello: 'world' })
  })

  it('call() throws for unknown adapter', async () => {
    const host = new InProcessLanguageHost()
    const { language } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)

    await expect(host.call(handle, 'fakeAdapter', 'get', [])).rejects.toThrow('Adapter "fakeAdapter" not found')
  })

  it('call() throws for unknown method', async () => {
    const host = new InProcessLanguageHost()
    const { language } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)

    await expect(host.call(handle, 'expressionAdapter', 'fakeMethod', [])).rejects.toThrow(
      'Method "fakeMethod" not found'
    )
  })

  it('unload() calls teardown', async () => {
    const host = new InProcessLanguageHost()
    const { language, tornDown } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)

    expect(tornDown.value).toBe(false)
    await host.unload(handle)
    expect(tornDown.value).toBe(true)
  })

  it('unload() removes from loaded', async () => {
    const host = new InProcessLanguageHost()
    const { language } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)

    await host.unload(handle)
    expect(host.getLoaded('addr1')).toBeUndefined()
  })

  it('getLoaded() returns loaded language', async () => {
    const host = new InProcessLanguageHost()
    const { language } = createMockLanguage()
    const handle = await host.load('addr1', language as any, context)

    expect(host.getLoaded('addr1')).toBe(handle)
  })

  it('getLoaded() returns undefined for unknown', () => {
    const host = new InProcessLanguageHost()
    expect(host.getLoaded('unknown')).toBeUndefined()
  })

  it('getAllLoaded() returns all', async () => {
    const host = new InProcessLanguageHost()
    const { language: lang1 } = createMockLanguage()
    const { language: lang2 } = createMockLanguage()

    await host.load('addr1', lang1 as any, context)
    await host.load('addr2', lang2 as any, context)

    expect(host.getAllLoaded()).toHaveLength(2)
  })
})
