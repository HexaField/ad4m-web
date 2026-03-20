import { describe, it, expect, beforeEach } from 'vitest'
import { NeighbourhoodManager } from '../manager'
import { PerspectiveManager } from '../../perspective/manager'
import { LanguageManager } from '../../language/manager'
import { InMemoryLinkStore } from '../../linkstore/store'
import { InMemoryContentStore } from '../../bootstrap/content-store'
import { PerspectiveState } from '../../perspective/types'
import type { NeighbourhoodExpression } from '../types'
import type { Expression } from '../../agent/types'
import type { ShaclEngine } from '../../shacl/engine'
import type { AgentService } from '../../agent/agent'
import type { LanguageHost, LanguageHandle, LinkSyncAdapter, PerspectiveDiff } from '../../language/types'
import { createNeighbourhoodUrl } from '../url'

function mockShaclEngine(): ShaclEngine {
  return {} as ShaclEngine
}

function mockAgentService(): AgentService {
  return {} as AgentService
}

function createTestNeighbourhoodExpression(linkLanguageAddress: string): NeighbourhoodExpression {
  return {
    author: 'did:key:z6MkTest123',
    data: { linkLanguage: linkLanguageAddress, meta: { links: [] } },
    proof: { key: 'did:key:z6MkTest123', signature: '00'.repeat(64) },
    timestamp: new Date().toISOString()
  }
}

function mockLanguageHost(): LanguageHost {
  const loaded = new Map<string, LanguageHandle>()
  return {
    async load(address: string, _bundle: string, _context: any): Promise<LanguageHandle> {
      const handle: LanguageHandle = { address, name: address, language: { name: address, interactions: () => [] } }
      loaded.set(address, handle)
      return handle
    },
    async call() {
      return undefined as any
    },
    async unload(handle: LanguageHandle) {
      loaded.delete(handle.address)
    },
    getLoaded(address: string) {
      return loaded.get(address)
    },
    getAllLoaded() {
      return [...loaded.values()]
    }
  }
}

function mockSignFn(): (data: any) => Promise<Expression<any>> {
  return async (data: any) => ({
    author: 'did:key:z6MkTestAuthor',
    data,
    proof: { key: 'did:key:z6MkTestAuthor', signature: 'ab'.repeat(64) },
    timestamp: new Date().toISOString()
  })
}

function mockAdapter(otherDids: string[] = []): LinkSyncAdapter {
  return {
    writable: () => true,
    public: () => true,
    others: async () => otherDids,
    currentRevision: async () => 'rev1',
    sync: async () => ({ additions: [], removals: [] }),
    render: async () => ({ links: [] }),
    commit: async (_diff: PerspectiveDiff) => 'rev2',
    addCallback: () => 0,
    addSyncStateChangeCallback: () => 0
  }
}

describe('NeighbourhoodManager', () => {
  let perspectiveManager: PerspectiveManager
  let languageManager: LanguageManager
  let contentStore: InMemoryContentStore
  let neighbourhoodManager: NeighbourhoodManager
  const linkLanguageAddress = 'QmLinkLang123'

  beforeEach(() => {
    const linkStore = new InMemoryLinkStore()
    perspectiveManager = new PerspectiveManager(linkStore, mockShaclEngine(), mockAgentService())
    languageManager = new LanguageManager(mockLanguageHost())
    contentStore = new InMemoryContentStore()
    neighbourhoodManager = new NeighbourhoodManager(perspectiveManager, languageManager, contentStore, mockSignFn())
  })

  async function seedNeighbourhood(addr: string = linkLanguageAddress): Promise<string> {
    const expr = createTestNeighbourhoodExpression(addr)
    const content = JSON.stringify(expr)
    return contentStore.put(content)
  }

  // === Join flow ===

  describe('joinFromUrl', () => {
    it('fetches expression and creates perspective', async () => {
      const hash = await seedNeighbourhood()
      const url = createNeighbourhoodUrl(hash)
      const handle = await neighbourhoodManager.joinFromUrl(url)
      expect(handle.uuid).toBeTruthy()
      expect(handle.neighbourhood).toBeTruthy()
      expect(handle.neighbourhood!.data.linkLanguage).toBe(linkLanguageAddress)
    })

    it('sets sharedUrl on perspective', async () => {
      const hash = await seedNeighbourhood()
      const url = createNeighbourhoodUrl(hash)
      const handle = await neighbourhoodManager.joinFromUrl(url)
      expect(handle.sharedUrl).toBe(url)
    })

    it('sets state to Synced', async () => {
      const hash = await seedNeighbourhood()
      const url = createNeighbourhoodUrl(hash)
      const handle = await neighbourhoodManager.joinFromUrl(url)
      expect(handle.state).toBe(PerspectiveState.Synced)
    })

    it('throws on invalid URL', async () => {
      await expect(neighbourhoodManager.joinFromUrl('http://bad')).rejects.toThrow('Invalid neighbourhood URL')
    })

    it('throws if neighbourhood expression not found', async () => {
      const url = createNeighbourhoodUrl('nonexistent')
      await expect(neighbourhoodManager.joinFromUrl(url)).rejects.toThrow('not found')
    })
  })

  // === Publish flow ===

  describe('publishFromPerspective', () => {
    it('creates and stores neighbourhood expression', async () => {
      const handle = perspectiveManager.add('test')
      const url = await neighbourhoodManager.publishFromPerspective(handle.uuid, linkLanguageAddress, { links: [] })
      expect(url.startsWith('neighbourhood://')).toBe(true)

      // Verify stored
      const address = url.slice('neighbourhood://'.length)
      const stored = await contentStore.get(address)
      expect(stored).toBeTruthy()
      const parsed: NeighbourhoodExpression = JSON.parse(stored!)
      expect(parsed.data.linkLanguage).toBe(linkLanguageAddress)
    })

    it('returns neighbourhood:// URL', async () => {
      const handle = perspectiveManager.add('test')
      const url = await neighbourhoodManager.publishFromPerspective(handle.uuid, linkLanguageAddress, { links: [] })
      expect(url).toMatch(/^neighbourhood:\/\//)
    })

    it('updates perspective state and sharedUrl', async () => {
      const handle = perspectiveManager.add('test')
      const url = await neighbourhoodManager.publishFromPerspective(handle.uuid, linkLanguageAddress, { links: [] })
      expect(handle.state).toBe(PerspectiveState.Synced)
      expect(handle.sharedUrl).toBe(url)
      expect(handle.neighbourhood).toBeTruthy()
    })

    it('throws for non-existent perspective', async () => {
      await expect(
        neighbourhoodManager.publishFromPerspective('nonexistent', linkLanguageAddress, { links: [] })
      ).rejects.toThrow('Perspective not found')
    })
  })

  // === Queries ===

  describe('getOtherAgents', () => {
    it('returns DIDs from adapter', async () => {
      const handle = perspectiveManager.add('shared')
      const adapter = mockAdapter(['did:key:z6MkAlice', 'did:key:z6MkBob'])
      perspectiveManager.setLinkLanguage(handle.uuid, adapter)

      const agents = await neighbourhoodManager.getOtherAgents(handle.uuid)
      expect(agents).toEqual(['did:key:z6MkAlice', 'did:key:z6MkBob'])
    })

    it('returns empty for non-shared perspective', async () => {
      const handle = perspectiveManager.add('private')
      const agents = await neighbourhoodManager.getOtherAgents(handle.uuid)
      expect(agents).toEqual([])
    })
  })

  describe('hasTelepresenceAdapter', () => {
    it('returns false when no neighbourhood', () => {
      const handle = perspectiveManager.add('test')
      expect(neighbourhoodManager.hasTelepresenceAdapter(handle.uuid)).toBe(false)
    })

    it('returns false when language not loaded', async () => {
      const handle = perspectiveManager.add('test')
      // Publish to get neighbourhood set
      await neighbourhoodManager.publishFromPerspective(handle.uuid, linkLanguageAddress, { links: [] })
      expect(neighbourhoodManager.hasTelepresenceAdapter(handle.uuid)).toBe(false)
    })
  })

  // === Full lifecycle ===

  describe('full lifecycle', () => {
    it('publish then join from another perspective manager', async () => {
      // Publisher side
      const pubHandle = perspectiveManager.add('my-space')
      const url = await neighbourhoodManager.publishFromPerspective(pubHandle.uuid, linkLanguageAddress, { links: [] })
      expect(pubHandle.state).toBe(PerspectiveState.Synced)
      expect(pubHandle.sharedUrl).toBe(url)

      // Joiner side (separate manager)
      const joinLinkStore = new InMemoryLinkStore()
      const joinPM = new PerspectiveManager(joinLinkStore, mockShaclEngine(), mockAgentService())
      const joinLM = new LanguageManager(mockLanguageHost())
      const joinNM = new NeighbourhoodManager(joinPM, joinLM, contentStore, mockSignFn())

      const joinHandle = await joinNM.joinFromUrl(url)
      expect(joinHandle.state).toBe(PerspectiveState.Synced)
      expect(joinHandle.sharedUrl).toBe(url)
      expect(joinHandle.neighbourhood!.data.linkLanguage).toBe(linkLanguageAddress)
    })
  })
})
