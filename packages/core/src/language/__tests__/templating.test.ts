import { describe, it, expect, beforeEach } from 'vitest'
import { LanguageManager } from '../manager'
import type { LanguageHost, LanguageMeta } from '../types'
import type { BundleResolver } from '../bundle'

function createMockHost(): LanguageHost {
  return {
    load: async (address, bundle, ctx) => ({ address, name: 'test', language: {} as any }),
    call: async () => null as any,
    unload: async () => {},
    getLoaded: () => undefined,
    getAllLoaded: () => []
  }
}

function createMockResolver(bundles: Record<string, string>): BundleResolver {
  return {
    resolve: async (addr) => bundles[addr] ?? null,
    has: async (addr) => addr in bundles
  }
}

describe('Language Templating', () => {
  let manager: LanguageManager

  beforeEach(() => {
    manager = new LanguageManager(createMockHost())
  })

  it('replaces {{key}} placeholders with template values', async () => {
    const source = 'Hello {{name}}, welcome to {{place}}!'
    manager.setBundleResolver(createMockResolver({ src123: source }))
    manager['metadata'].set('src123', { address: 'src123', name: 'test-lang', author: 'alice' })

    const result = await manager.applyTemplateAndPublish('src123', JSON.stringify({ name: 'Bob', place: 'World' }))
    expect(result.meta.templateAppliedParams).toBe(JSON.stringify({ name: 'Bob', place: 'World' }))
    expect(result.meta.templateSourceLanguageAddress).toBe('src123')
  })

  it('produces unique address from content hash', async () => {
    manager.setBundleResolver(createMockResolver({ s1: '{{x}}' }))
    manager['metadata'].set('s1', { address: 's1', name: 'tpl', author: 'a' })

    const r1 = await manager.applyTemplateAndPublish('s1', JSON.stringify({ x: 'aaa' }))
    const r2 = await manager.applyTemplateAndPublish('s1', JSON.stringify({ x: 'bbb' }))
    expect(r1.address).not.toBe(r2.address)
    // Same input = same hash
    const r3 = await manager.applyTemplateAndPublish('s1', JSON.stringify({ x: 'aaa' }))
    expect(r1.address).toBe(r3.address)
  })

  it('marks metadata as templated', async () => {
    manager.setBundleResolver(createMockResolver({ src: 'code' }))
    manager['metadata'].set('src', { address: 'src', name: 'n', author: 'a' })

    const result = await manager.applyTemplateAndPublish('src', '{}')
    expect(result.meta.templated).toBe(true)
    expect(result.meta.templateSourceLanguageAddress).toBe('src')
  })

  it('throws if source language not found', async () => {
    manager.setBundleResolver(createMockResolver({}))
    await expect(manager.applyTemplateAndPublish('missing', '{}')).rejects.toThrow('Source language not found')
  })

  it('throws if no bundle resolver configured', async () => {
    await expect(manager.applyTemplateAndPublish('any', '{}')).rejects.toThrow('No bundle resolver')
  })

  it('stores via ContentStore when provided', async () => {
    manager.setBundleResolver(createMockResolver({ s: 'data-{{v}}' }))
    manager['metadata'].set('s', { address: 's', name: 'n', author: 'a' })

    const stored: string[] = []
    const store = {
      get: async () => null,
      put: async (c: string) => {
        stored.push(c)
        return 'addr'
      }
    }
    await manager.applyTemplateAndPublish('s', JSON.stringify({ v: 'X' }), store)
    expect(stored).toEqual(['data-X'])
  })
})
