import { describe, it, expect, beforeEach } from 'vitest'
import { createExecutor } from '../../bootstrap/factory'
import { InMemoryContentStore } from '../../bootstrap/content-store'
import { NeighbourhoodManager } from '../manager'
import { SharedLinkStore, createSharedLinkLanguage } from '../../language/shared-link-language'
import type { WalletStore } from '../../agent/types'
import type { PerspectiveDiff } from '../../language/types'

class InMemoryWalletStore implements WalletStore {
  private data: string | null = null
  async load(): Promise<string | null> {
    return this.data
  }
  async save(data: string): Promise<void> {
    this.data = data
  }
  async clear(): Promise<void> {
    this.data = null
  }
}

const bootstrapConfig = {
  languages: {
    languageLanguageAddress: 'system-language-language',
    agentLanguageAddress: 'system-agent-language',
    neighbourhoodLanguageAddress: 'system-neighbourhood-language',
    perspectiveLanguageAddress: 'system-perspective-language'
  }
}

async function createAgent(passphrase: string) {
  const result = await createExecutor({
    bootstrapConfig,
    walletStore: new InMemoryWalletStore()
  })
  await result.executor.agentService.generate(passphrase)
  return result.executor
}

function makeSignFn(executor: ReturnType<typeof createAgent> extends Promise<infer T> ? T : never) {
  return async (data: any) => ({
    author: executor.agentService.getStatus().did!,
    data,
    proof: { key: '', signature: '' },
    timestamp: new Date().toISOString()
  })
}

describe('Neighbourhood Sync Integration', () => {
  let sharedStore: SharedLinkStore
  let contentStore: InMemoryContentStore

  beforeEach(() => {
    sharedStore = new SharedLinkStore()
    contentStore = new InMemoryContentStore()
  })

  it('two agents can share links through a neighbourhood', async () => {
    // Agent A
    const agentA = await createAgent('passA')
    const didA = agentA.agentService.getStatus().did!
    const linkLangA = createSharedLinkLanguage('test-sync', sharedStore, didA)

    // Install the shared link language on Agent A's language host
    const ctxA = {
      agent: { did: didA, createSignedExpression: async (d: any) => d },
      signatures: { verify: async () => true },
      storageDirectory: '',
      customSettings: {},
      ad4mSignal: () => {}
    }
    agentA.languageManager.setLanguageContext(ctxA as any)
    await agentA.languageManager
      .install(
        'shared-link-lang-addr',
        { address: 'shared-link-lang-addr', name: 'shared-link-language', author: 'test' },
        undefined,
        // Pass the Language object directly through the host
        undefined
      )
      .catch(() => {
        // Install directly via host since we have a Language object
      })

    // Direct install via the host (InProcessLanguageHost accepts Language objects)
    const hostA = (agentA.languageManager as any).host
    await hostA.load('shared-link-lang-addr', linkLangA, ctxA)
    ;(agentA.languageManager as any).metadata.set('shared-link-lang-addr', {
      address: 'shared-link-lang-addr',
      name: 'shared-link-language',
      author: 'test'
    })

    // Agent A creates perspective and publishes as neighbourhood
    const perspA = agentA.perspectiveManager.add('Shared Space')
    const nhManagerA = new NeighbourhoodManager(
      agentA.perspectiveManager,
      agentA.languageManager,
      contentStore,
      makeSignFn(agentA)
    )
    const nhUrl = await nhManagerA.publishFromPerspective(perspA.uuid, 'shared-link-lang-addr', { links: [] })

    // Agent A adds a link — this should go through the sync adapter
    await agentA.perspectiveManager.addLink(perspA.uuid, {
      source: 'ad4m://agentA',
      target: 'literal://string:Hello from A',
      predicate: 'ad4m://message'
    })

    // Verify link is in shared store
    expect(sharedStore.getLinks().length).toBe(1)
    expect(sharedStore.getLinks()[0].data.source).toBe('ad4m://agentA')

    // Agent B
    const agentB = await createAgent('passB')
    const didB = agentB.agentService.getStatus().did!
    const linkLangB = createSharedLinkLanguage('test-sync', sharedStore, didB)

    const ctxB = {
      agent: { did: didB, createSignedExpression: async (d: any) => d },
      signatures: { verify: async () => true },
      storageDirectory: '',
      customSettings: {},
      ad4mSignal: () => {}
    }
    const hostB = (agentB.languageManager as any).host
    await hostB.load('shared-link-lang-addr', linkLangB, ctxB)
    ;(agentB.languageManager as any).metadata.set('shared-link-lang-addr', {
      address: 'shared-link-lang-addr',
      name: 'shared-link-language',
      author: 'test'
    })

    // Agent B joins the neighbourhood
    const nhManagerB = new NeighbourhoodManager(
      agentB.perspectiveManager,
      agentB.languageManager,
      contentStore,
      makeSignFn(agentB)
    )
    const perspBHandle = await nhManagerB.joinFromUrl(nhUrl)

    // Agent B syncs — should see Agent A's link
    await agentB.perspectiveManager.syncPerspective(perspBHandle.uuid)
    const bLinks = await agentB.perspectiveManager.queryLinks(perspBHandle.uuid, {})
    expect(bLinks.length).toBeGreaterThanOrEqual(1)
    expect(bLinks.some((l) => l.data.source === 'ad4m://agentA')).toBe(true)

    // Agent B adds a link
    await agentB.perspectiveManager.addLink(perspBHandle.uuid, {
      source: 'ad4m://agentB',
      target: 'literal://string:Hello from B',
      predicate: 'ad4m://message'
    })

    // Shared store should have both
    expect(sharedStore.getLinks().length).toBe(2)

    // Agent A syncs — should see Agent B's link
    await agentA.perspectiveManager.syncPerspective(perspA.uuid)
    const aLinks = await agentA.perspectiveManager.queryLinks(perspA.uuid, {})
    expect(aLinks.some((l) => l.data.source === 'ad4m://agentB')).toBe(true)
  })

  it('link changes propagate via observers', async () => {
    const agentA = await createAgent('passA')
    const didA = agentA.agentService.getStatus().did!
    const linkLangA = createSharedLinkLanguage('test-sync', sharedStore, didA)

    const ctxA = {
      agent: { did: didA, createSignedExpression: async (d: any) => d },
      signatures: { verify: async () => true },
      storageDirectory: '',
      customSettings: {},
      ad4mSignal: () => {}
    }
    const hostA = (agentA.languageManager as any).host
    await hostA.load('shared-link-lang-addr', linkLangA, ctxA)
    ;(agentA.languageManager as any).metadata.set('shared-link-lang-addr', {
      address: 'shared-link-lang-addr',
      name: 'shared-link-language',
      author: 'test'
    })

    const perspA = agentA.perspectiveManager.add('Shared')
    const nhManagerA = new NeighbourhoodManager(
      agentA.perspectiveManager,
      agentA.languageManager,
      contentStore,
      makeSignFn(agentA)
    )
    await nhManagerA.publishFromPerspective(perspA.uuid, 'shared-link-lang-addr', { links: [] })

    // Set up observer on Agent A's adapter
    const observed: PerspectiveDiff[] = []
    const adapter = agentA.perspectiveManager.getLinkLanguage(perspA.uuid)!
    adapter.addCallback((diff: PerspectiveDiff) => {
      observed.push(diff)
    })

    // Directly add to shared store (simulating Agent B)
    sharedStore.addLinks([
      {
        author: 'did:key:agentB',
        timestamp: new Date().toISOString(),
        data: { source: 'ad4m://agentB', target: 'literal://string:hi', predicate: 'ad4m://msg' },
        proof: { key: '', signature: '' }
      }
    ])

    // Observer should have fired
    expect(observed.length).toBeGreaterThanOrEqual(1)
    expect(observed.some((d) => d.additions.some((l) => l.data.source === 'ad4m://agentB'))).toBe(true)
  })

  it('publish then join preserves neighbourhood metadata', async () => {
    const agentA = await createAgent('passA')
    const didA = agentA.agentService.getStatus().did!
    const linkLangA = createSharedLinkLanguage('test-sync', sharedStore, didA)

    const ctxA = {
      agent: { did: didA, createSignedExpression: async (d: any) => d },
      signatures: { verify: async () => true },
      storageDirectory: '',
      customSettings: {},
      ad4mSignal: () => {}
    }
    const hostA = (agentA.languageManager as any).host
    await hostA.load('shared-link-lang-addr', linkLangA, ctxA)
    ;(agentA.languageManager as any).metadata.set('shared-link-lang-addr', {
      address: 'shared-link-lang-addr',
      name: 'shared-link-language',
      author: 'test'
    })

    const perspA = agentA.perspectiveManager.add('My Space')
    const nhManagerA = new NeighbourhoodManager(
      agentA.perspectiveManager,
      agentA.languageManager,
      contentStore,
      makeSignFn(agentA)
    )
    const nhUrl = await nhManagerA.publishFromPerspective(perspA.uuid, 'shared-link-lang-addr', { links: [] })

    // Verify publisher state
    expect(perspA.sharedUrl).toBe(nhUrl)
    expect(perspA.neighbourhood).toBeTruthy()
    expect(perspA.neighbourhood!.data.linkLanguage).toBe('shared-link-lang-addr')
    expect(perspA.state).toBe('Synced')

    // Joiner
    const agentB = await createAgent('passB')
    const didB = agentB.agentService.getStatus().did!
    const linkLangB = createSharedLinkLanguage('test-sync', sharedStore, didB)
    const ctxB = {
      agent: { did: didB, createSignedExpression: async (d: any) => d },
      signatures: { verify: async () => true },
      storageDirectory: '',
      customSettings: {},
      ad4mSignal: () => {}
    }
    const hostB = (agentB.languageManager as any).host
    await hostB.load('shared-link-lang-addr', linkLangB, ctxB)
    ;(agentB.languageManager as any).metadata.set('shared-link-lang-addr', {
      address: 'shared-link-lang-addr',
      name: 'shared-link-language',
      author: 'test'
    })

    const nhManagerB = new NeighbourhoodManager(
      agentB.perspectiveManager,
      agentB.languageManager,
      contentStore,
      makeSignFn(agentB)
    )
    const perspB = await nhManagerB.joinFromUrl(nhUrl)

    expect(perspB.sharedUrl).toBe(nhUrl)
    expect(perspB.neighbourhood!.data.linkLanguage).toBe('shared-link-lang-addr')
    expect(perspB.state).toBe('Synced')
    // Link language adapter should be wired
    expect(agentB.perspectiveManager.getLinkLanguage(perspB.uuid)).toBeTruthy()
  })
})
