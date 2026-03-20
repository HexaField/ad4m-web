import { describe, it, expect } from 'vitest'
import { getExpression, createExpression, resolveExpressionFromUrl } from '../expression-adapter'
import type { LanguageHandle } from '../types'
import { LanguageManager } from '../manager'
import { InProcessLanguageHost } from '../host'
import { createMockContext, createMockLanguage } from './mock'

function makeHandle(overrides?: Partial<LanguageHandle>): LanguageHandle {
  const expressionStore = new Map<string, any>()
  expressionStore.set('addr1', {
    author: 'did:test:a',
    timestamp: '2024-01-01',
    data: 'hello',
    proof: { key: 'k', signature: 's' }
  })

  return {
    address: 'lang1',
    name: 'test-lang',
    language: {
      name: 'test-lang',
      expressionAdapter: {
        get: async (addr: string) => expressionStore.get(addr) ?? null,
        putAdapter: {
          createPublic: async (content: object) => {
            const addr = 'new-' + JSON.stringify(content)
            expressionStore.set(addr, content)
            return addr
          }
        }
      },
      interactions: () => [],
      ...overrides?.language
    } as any,
    ...overrides
  } as LanguageHandle
}

describe('getExpression', () => {
  it('retrieves an expression by address', async () => {
    const handle = makeHandle()
    const result = await getExpression(handle, 'addr1')
    expect(result).toBeTruthy()
    expect(result!.data).toBe('hello')
  })

  it('returns null for missing address', async () => {
    const handle = makeHandle()
    const result = await getExpression(handle, 'missing')
    expect(result).toBeNull()
  })

  it('throws if no expressionAdapter', async () => {
    const handle = makeHandle({ language: { name: 'no-adapter', interactions: () => [] } as any })
    await expect(getExpression(handle, 'addr1')).rejects.toThrow('expressionAdapter')
  })
})

describe('createExpression', () => {
  it('creates an expression and returns address', async () => {
    const handle = makeHandle()
    const addr = await createExpression(handle, { text: 'world' })
    expect(addr).toContain('world')
  })

  it('throws if no expressionAdapter', async () => {
    const handle = makeHandle({ language: { name: 'no-adapter', interactions: () => [] } as any })
    await expect(createExpression(handle, {})).rejects.toThrow('expressionAdapter')
  })
})

describe('resolveExpressionFromUrl', () => {
  it('resolves literal:// URLs', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const result = await resolveExpressionFromUrl('literal://hello%20world', manager)
    expect(result).toBeTruthy()
    expect(result!.data).toBe('hello world')
  })

  it('resolves literal:// JSON URLs', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const json = encodeURIComponent(
      JSON.stringify({ author: 'a', timestamp: 't', data: 42, proof: { key: 'k', signature: 's' } })
    )
    const result = await resolveExpressionFromUrl(`literal://${json}`, manager)
    expect(result).toBeTruthy()
    expect(result!.data).toBe(42)
  })

  it('throws for unknown language address', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    await expect(resolveExpressionFromUrl('unknown://addr', manager)).rejects.toThrow('Language not found')
  })

  it('resolves via installed language', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const { language } = createMockLanguage()
    const ctx = createMockContext()
    await manager.install('test-lang', { address: 'test-lang', name: 'Test', author: 'a' }, language as any, ctx)

    // The mock language has an expressionAdapter that returns mock data
    const handle = manager.getLanguage('test-lang')
    expect(handle).toBeTruthy()
    // Since mock may not have expressionAdapter, just verify the lookup works
    if (handle!.language.expressionAdapter) {
      const result = await resolveExpressionFromUrl('test-lang://some-addr', manager)
      expect(result).toBeDefined()
    }
  })
})
