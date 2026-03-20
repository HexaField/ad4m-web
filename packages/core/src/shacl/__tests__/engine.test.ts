import { describe, it, expect } from 'vitest'
import { InMemoryLinkStore } from '../../linkstore/store'
import { ShaclEngine } from '../engine'
import { buildMessageShapeLinks } from './helpers'

const PERSPECTIVE = 'test-perspective'

async function setupEngine(): Promise<{ engine: ShaclEngine; store: InMemoryLinkStore }> {
  const store = new InMemoryLinkStore()
  const engine = new ShaclEngine(store)

  // Add SHACL shape links
  const shapeLinks = buildMessageShapeLinks()
  await store.addLinks(PERSPECTIVE, shapeLinks)

  return { engine, store }
}

describe('ShaclEngine', () => {
  describe('isInstance', () => {
    it('returns true when all required properties exist', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg1'

      // Add required properties
      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://body', target: 'literal://string:hello' },
        proof: { key: '', signature: '' }
      })
      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://author', target: 'did:test' },
        proof: { key: '', signature: '' }
      })
      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://timestamp', target: 'literal://string:now' },
        proof: { key: '', signature: '' }
      })

      expect(await engine.isInstance(PERSPECTIVE, addr, 'Message')).toBe(true)
    })

    it('returns false when required property missing', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg2'

      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://body', target: 'literal://string:hello' },
        proof: { key: '', signature: '' }
      })
      // Missing author and timestamp

      expect(await engine.isInstance(PERSPECTIVE, addr, 'Message')).toBe(false)
    })
  })

  describe('queryInstances', () => {
    it('finds matching instances', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg3'

      for (const pred of ['ad4m://body', 'ad4m://author', 'ad4m://timestamp']) {
        await store.addLink(PERSPECTIVE, {
          author: 'did:test',
          timestamp: '2026-01-01T00:00:00.000Z',
          data: { source: addr, predicate: pred, target: 'literal://string:val' },
          proof: { key: '', signature: '' }
        })
      }

      const instances = await engine.queryInstances(PERSPECTIVE, 'Message')
      expect(instances).toContain(addr)
    })
  })

  describe('getInstanceData', () => {
    it('returns scalar property values', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg4'

      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://body', target: 'literal://string:Hello!' },
        proof: { key: '', signature: '' }
      })
      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://author', target: 'did:key:abc' },
        proof: { key: '', signature: '' }
      })
      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://timestamp', target: 'literal://string:2026-01-01' },
        proof: { key: '', signature: '' }
      })

      const data = await engine.getInstanceData(PERSPECTIVE, 'Message', addr)
      expect(data.body).toBe('Hello!')
      expect(data.author).toBe('did:key:abc')
      expect(data.timestamp).toBe('2026-01-01')
    })

    it('returns collection values as array', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg5'

      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:00.000Z',
        data: { source: addr, predicate: 'ad4m://reactions', target: 'literal://string:👍' },
        proof: { key: '', signature: '' }
      })
      await store.addLink(PERSPECTIVE, {
        author: 'did:test',
        timestamp: '2026-01-01T00:00:01.000Z',
        data: { source: addr, predicate: 'ad4m://reactions', target: 'literal://string:❤️' },
        proof: { key: '', signature: '' }
      })

      const data = await engine.getInstanceData(PERSPECTIVE, 'Message', addr)
      expect(data.reactions).toEqual(['👍', '❤️'])
    })
  })

  describe('createInstance', () => {
    it('executes constructor and applies initial values', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg6'

      await engine.createInstance(PERSPECTIVE, 'Message', addr, {
        body: 'literal://string:Hi',
        author: 'did:key:abc'
      })

      // Constructor should have added type link
      const typeLinks = await store.queryLinks(PERSPECTIVE, {
        source: addr,
        predicate: 'rdf://type',
        target: 'ad4m://Message'
      })
      expect(typeLinks.length).toBe(1)

      // Initial values should be applied
      const bodyLinks = await store.queryLinks(PERSPECTIVE, { source: addr, predicate: 'ad4m://body' })
      expect(bodyLinks.length).toBe(1)

      // timestamp has ad4m://initial = 'auto', should be applied
      const tsLinks = await store.queryLinks(PERSPECTIVE, { source: addr, predicate: 'ad4m://timestamp' })
      expect(tsLinks.length).toBe(1)
    })
  })

  describe('deleteInstance', () => {
    it('executes destructor', async () => {
      const { engine, store } = await setupEngine()
      const addr = 'literal://string:msg7'

      await engine.createInstance(PERSPECTIVE, 'Message', addr, {
        body: 'literal://string:bye',
        author: 'did:test'
      })

      await engine.deleteInstance(PERSPECTIVE, 'Message', addr)

      const remaining = await store.queryLinks(PERSPECTIVE, { source: addr })
      // Shape links still exist but instance links should be gone
      expect(remaining.length).toBe(0)
    })
  })

  describe('executeAction', () => {
    it('addLink creates a link', async () => {
      const { engine, store } = await setupEngine()
      const created = await engine.executeAction(
        PERSPECTIVE,
        [{ action: 'addLink', source: 'this', predicate: 'ad4m://test', target: 'value' }],
        'literal://string:x',
        'literal://string:y'
      )

      expect(created.length).toBe(1)
      const links = await store.queryLinks(PERSPECTIVE, { source: 'literal://string:x', predicate: 'ad4m://test' })
      expect(links.length).toBe(1)
    })

    it('removeLink removes a link', async () => {
      const { engine, store } = await setupEngine()
      // First add
      await engine.executeAction(
        PERSPECTIVE,
        [{ action: 'addLink', source: 'this', predicate: 'ad4m://test', target: 'literal://string:val' }],
        'literal://string:x'
      )

      // Then remove
      await engine.executeAction(
        PERSPECTIVE,
        [{ action: 'removeLink', source: 'this', predicate: 'ad4m://test', target: '*' }],
        'literal://string:x'
      )

      const links = await store.queryLinks(PERSPECTIVE, { source: 'literal://string:x', predicate: 'ad4m://test' })
      expect(links.length).toBe(0)
    })

    it('setSingleTarget replaces existing link', async () => {
      const { engine, store } = await setupEngine()
      await engine.executeAction(
        PERSPECTIVE,
        [{ action: 'addLink', source: 'this', predicate: 'ad4m://val', target: 'literal://string:old' }],
        'literal://string:x'
      )

      await engine.executeAction(
        PERSPECTIVE,
        [{ action: 'setSingleTarget', source: 'this', predicate: 'ad4m://val', target: 'value' }],
        'literal://string:x',
        'literal://string:new'
      )

      const links = await store.queryLinks(PERSPECTIVE, { source: 'literal://string:x', predicate: 'ad4m://val' })
      expect(links.length).toBe(1)
      expect(links[0].data.target).toBe('literal://string:new')
    })
  })

  describe('full lifecycle', () => {
    it('register shapes → create → get → update → delete', async () => {
      const { engine } = await setupEngine()
      const addr = 'literal://string:lifecycle'

      // Create
      await engine.createInstance(PERSPECTIVE, 'Message', addr, {
        body: 'literal://string:initial',
        author: 'did:key:me'
      })

      // Get
      let data = await engine.getInstanceData(PERSPECTIVE, 'Message', addr)
      expect(data.body).toBe('initial')
      expect(data.author).toBe('did:key:me')

      // Update via setter action
      const cls = (await engine.loadShapes(PERSPECTIVE)).find((c) => c.name === 'Message')!
      const bodyProp = cls.properties.find((p) => p.name === 'body')!
      await engine.executeAction(PERSPECTIVE, bodyProp.setter!, addr, 'literal://string:updated')

      data = await engine.getInstanceData(PERSPECTIVE, 'Message', addr)
      expect(data.body).toBe('updated')

      // Delete
      await engine.deleteInstance(PERSPECTIVE, 'Message', addr)
      expect(await engine.isInstance(PERSPECTIVE, addr, 'Message')).toBe(false)
    })
  })
})
