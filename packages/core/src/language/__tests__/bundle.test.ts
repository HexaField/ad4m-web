import { describe, it, expect } from 'vitest'
import { InMemoryBundleResolver, ContentStoreBundleResolver } from '../bundle-resolver'
import { InProcessBundleExecutor } from '../bundle-executor'
import { LanguageManager } from '../manager'
import { InProcessLanguageHost } from '../host'
import type { ContentStore } from '../../bootstrap/types'
import type { LanguageContext, LanguageMeta } from '../types'

const ECHO_LANGUAGE_BUNDLE = `
  module.exports = {
    create: function(context) {
      return {
        name: 'echo-language',
        expressionAdapter: {
          get: async function(address) {
            return { data: 'echo:' + address, author: context.agent.did, timestamp: new Date().toISOString(), proof: { key: '', signature: '' } };
          },
          putAdapter: {
            createPublic: async function(content) {
              return 'echo-' + JSON.stringify(content);
            }
          }
        },
        interactions: function() { return []; }
      };
    }
  };
`

const LINK_SYNC_LANGUAGE_BUNDLE = `
  module.exports = {
    create: function(context) {
      var links = [];
      return {
        name: 'link-sync-language',
        linksAdapter: {
          writable: function() { return true; },
          public: function() { return true; },
          others: async function() { return []; },
          currentRevision: async function() { return 'rev-1'; },
          sync: async function() { return { additions: [], removals: [] }; },
          render: async function() { return { links: links }; },
          commit: async function(diff) {
            links = links.concat(diff.additions);
            return 'rev-' + links.length;
          },
          addCallback: function() { return 0; },
          addSyncStateChangeCallback: function() { return 0; }
        },
        interactions: function() { return []; }
      };
    }
  };
`

function makeContext(did = 'did:test:agent1'): LanguageContext {
  return {
    agent: {
      did,
      createSignedExpression: async (data: any) => ({
        data,
        author: did,
        timestamp: new Date().toISOString(),
        proof: { key: '', signature: '' }
      })
    },
    signatures: { verify: async () => true },
    storageDirectory: '/tmp/test',
    customSettings: {},
    ad4mSignal: () => {}
  }
}

function makeMeta(address: string, name: string): LanguageMeta {
  return { address, name, author: 'did:test:author' }
}

describe('InMemoryBundleResolver', () => {
  it('register and resolve', async () => {
    const resolver = new InMemoryBundleResolver()
    resolver.register('addr1', 'source-code')
    expect(await resolver.resolve('addr1')).toBe('source-code')
    expect(await resolver.has('addr1')).toBe(true)
  })

  it('returns null for unknown', async () => {
    const resolver = new InMemoryBundleResolver()
    expect(await resolver.resolve('unknown')).toBeNull()
    expect(await resolver.has('unknown')).toBe(false)
  })
})

describe('ContentStoreBundleResolver', () => {
  it('resolves from content store', async () => {
    const store: ContentStore = {
      get: async (addr) => (addr === 'lang1' ? 'bundle-source' : null),
      put: async () => 'addr'
    }
    const resolver = new ContentStoreBundleResolver(store)
    expect(await resolver.resolve('lang1')).toBe('bundle-source')
    expect(await resolver.has('lang1')).toBe(true)
    expect(await resolver.resolve('missing')).toBeNull()
    expect(await resolver.has('missing')).toBe(false)
  })
})

describe('InProcessBundleExecutor', () => {
  const executor = new InProcessBundleExecutor()
  const ctx = makeContext()

  it('executes echo language bundle', async () => {
    const lang = await executor.execute(ECHO_LANGUAGE_BUNDLE, ctx)
    expect(lang).toBeDefined()
    expect(lang.name).toBe('echo-language')
  })

  it('executed language has correct name', async () => {
    const lang = await executor.execute(ECHO_LANGUAGE_BUNDLE, ctx)
    expect(lang.name).toBe('echo-language')
  })

  it('expression adapter works (get + put)', async () => {
    const lang = await executor.execute(ECHO_LANGUAGE_BUNDLE, ctx)
    const expr = await lang.expressionAdapter!.get('test-addr')
    expect(expr.data).toBe('echo:test-addr')
    expect(expr.author).toBe('did:test:agent1')

    const addr = await (lang.expressionAdapter!.putAdapter as any).createPublic({ hello: 'world' })
    expect(addr).toBe('echo-{"hello":"world"}')
  })

  it('executes link sync language bundle', async () => {
    const lang = await executor.execute(LINK_SYNC_LANGUAGE_BUNDLE, ctx)
    expect(lang.name).toBe('link-sync-language')
    expect(lang.linksAdapter).toBeDefined()
  })

  it('link sync adapter commit + render works', async () => {
    const lang = await executor.execute(LINK_SYNC_LANGUAGE_BUNDLE, ctx)
    const adapter = lang.linksAdapter!

    expect(adapter.writable()).toBe(true)
    const rendered = await adapter.render()
    expect(rendered.links).toEqual([])

    const link = { source: 's', predicate: 'p', target: 't' } as any
    await adapter.commit({ additions: [link], removals: [] })

    const after = await adapter.render()
    expect(after.links).toHaveLength(1)
  })

  it('throws on bundle without create()', async () => {
    await expect(executor.execute('module.exports = {}', ctx)).rejects.toThrow(
      'Language bundle must export a create() function'
    )
  })
})

describe('LanguageManager with bundles', () => {
  it('install resolves and loads bundle', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const resolver = new InMemoryBundleResolver()
    resolver.register('echo-addr', ECHO_LANGUAGE_BUNDLE)
    manager.setBundleResolver(resolver)
    manager.setBundleExecutor(new InProcessBundleExecutor())
    manager.setLanguageContext(makeContext())

    const handle = await manager.install('echo-addr', makeMeta('echo-addr', 'Echo'))
    expect(handle).toBeDefined()
    expect(handle.name).toBe('echo-language')
  })

  it('loaded language is accessible via getLanguage', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const resolver = new InMemoryBundleResolver()
    resolver.register('echo-addr', ECHO_LANGUAGE_BUNDLE)
    manager.setBundleResolver(resolver)
    manager.setBundleExecutor(new InProcessBundleExecutor())
    manager.setLanguageContext(makeContext())

    await manager.install('echo-addr', makeMeta('echo-addr', 'Echo'))
    const handle = manager.getLanguage('echo-addr')
    expect(handle).toBeDefined()
    expect(handle!.name).toBe('echo-language')
  })

  it('expression adapter works through manager', async () => {
    const host = new InProcessLanguageHost()
    const manager = new LanguageManager(host)
    const resolver = new InMemoryBundleResolver()
    resolver.register('echo-addr', ECHO_LANGUAGE_BUNDLE)
    manager.setBundleResolver(resolver)
    manager.setBundleExecutor(new InProcessBundleExecutor())
    manager.setLanguageContext(makeContext())

    await manager.install('echo-addr', makeMeta('echo-addr', 'Echo'))
    const handle = manager.getLanguage('echo-addr')!
    const expr = await handle.language.expressionAdapter!.get('hello')
    expect(expr.data).toBe('echo:hello')
  })
})
