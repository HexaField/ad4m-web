import type { Language, LanguageContext, Interaction } from '../types'

export function createMockLanguage(): { language: Language; store: Map<string, any>; tornDown: { value: boolean } } {
  const store = new Map<string, any>()
  const tornDown = { value: false }

  const language: Language = {
    name: 'test-language',
    expressionAdapter: {
      get: async (address: string) => store.get(address) ?? null,
      putAdapter: {
        createPublic: async (content: object) => {
          const addr = `expr-${store.size}`
          store.set(addr, content)
          return addr
        }
      }
    },
    teardown: () => {
      tornDown.value = true
    },
    interactions: (_address: string): Interaction[] => []
  }

  return { language, store, tornDown }
}

export function createMockContext(overrides?: Partial<LanguageContext>): LanguageContext {
  return {
    agent: {
      did: 'did:test:agent',
      createSignedExpression: async (data: any) => ({
        author: 'did:test:agent',
        timestamp: new Date().toISOString(),
        data,
        proof: { signature: 'mock', key: 'mock', valid: true }
      })
    },
    signatures: {
      verify: async () => true
    },
    storageDirectory: '/tmp/test-lang',
    customSettings: {},
    ad4mSignal: () => {},
    ...overrides
  }
}
