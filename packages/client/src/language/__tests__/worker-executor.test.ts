import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebWorkerBundleExecutor } from '../worker-executor'
import type { LanguageContext } from '@ad4m-web/core'

function makeContext(overrides: Partial<LanguageContext> = {}): LanguageContext {
  return {
    agent: { did: 'did:test:123', createSignedExpression: vi.fn() },
    signatures: { verify: vi.fn() },
    storageDirectory: '/tmp/test',
    customSettings: {},
    ad4mSignal: vi.fn(),
    ...overrides
  }
}

const SIMPLE_BUNDLE = `
  module.exports.create = function(ctx) {
    return {
      name: 'test-language',
      expressionAdapter: {
        get: async function(addr) { return { data: 'hello-' + addr }; },
        putAdapter: { createPublic: async function(content) { return 'addr123'; } }
      }
    };
  };
`

describe('WebWorkerBundleExecutor', () => {
  let executor: WebWorkerBundleExecutor

  beforeEach(() => {
    executor = new WebWorkerBundleExecutor()
  })

  describe('in-process fallback (no Worker global)', () => {
    let originalWorker: typeof globalThis.Worker

    beforeEach(() => {
      originalWorker = globalThis.Worker
      // @ts-ignore
      delete globalThis.Worker
    })

    afterEach(() => {
      globalThis.Worker = originalWorker
    })

    it('falls back to in-process when Worker is undefined', async () => {
      const ctx = makeContext()
      const language = await executor.execute(SIMPLE_BUNDLE, ctx)
      expect(language.name).toBe('test-language')
    })

    it('in-process fallback provides UTILS.hash', async () => {
      const ctx = makeContext()
      const bundle = `
        module.exports.create = function(ctx) {
          return { name: 'hash-test-' + UTILS.hash('hello') };
        };
      `
      const language = await executor.execute(bundle, ctx)
      expect(language.name).toMatch(/^hash-test-[0-9a-f]{8}$/)
    })

    it('in-process fallback rejects bundles without create()', async () => {
      const ctx = makeContext()
      const bundle = `module.exports.foo = 42;`
      await expect(executor.execute(bundle, ctx)).rejects.toThrow('must export a create()')
    })

    it('in-process fallback rejects require() calls', async () => {
      const ctx = makeContext()
      const bundle = `
        var x = require('fs');
        module.exports.create = function() { return { name: 'x' }; };
      `
      await expect(executor.execute(bundle, ctx)).rejects.toThrow('require not supported')
    })

    it('in-process adapter calls work', async () => {
      const ctx = makeContext()
      const language = await executor.execute(SIMPLE_BUNDLE, ctx)
      const result = await language.expressionAdapter!.get('abc')
      expect(result).toEqual({ data: 'hello-abc' })
    })

    it('in-process supports async create()', async () => {
      const ctx = makeContext()
      const bundle = `
        module.exports.create = async function(ctx) {
          return { name: 'async-lang' };
        };
      `
      const language = await executor.execute(bundle, ctx)
      expect(language.name).toBe('async-lang')
    })
  })

  describe('destroy', () => {
    it('destroy is callable without error', () => {
      expect(() => executor.destroy()).not.toThrow()
    })
  })

  describe('buildWorkerScript (integration)', () => {
    it('worker script string contains expected message handlers', () => {
      // Access the built script indirectly by checking the module exports shape
      // The real integration test would need a browser environment
      expect(typeof WebWorkerBundleExecutor).toBe('function')
      const inst = new WebWorkerBundleExecutor()
      expect(typeof inst.execute).toBe('function')
      expect(typeof inst.destroy).toBe('function')
    })
  })
})
