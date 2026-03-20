import { describe, it, expect, beforeEach } from 'vitest'
import { createExecutor } from '../../bootstrap/factory'
import { GraphQLEngine } from '../engine'
import type { WalletStore, WalletData } from '../../agent/types'
import type { BootstrapConfig } from '../../bootstrap/types'

class InMemoryWalletStore implements WalletStore {
  private store = new Map<string, { passphrase: string; data: WalletData }>()
  async exists(key: string) {
    return this.store.has(key)
  }
  async load(key: string, passphrase: string) {
    const e = this.store.get(key)
    if (!e || e.passphrase !== passphrase) throw new Error('Invalid')
    return e.data
  }
  async save(key: string, passphrase: string, data: WalletData) {
    this.store.set(key, { passphrase, data })
  }
  async destroy(key: string) {
    this.store.delete(key)
  }
}

const bootstrapConfig: BootstrapConfig = {
  languages: {
    languageLanguageAddress: 'lang-lang',
    agentLanguageAddress: 'agent-lang',
    neighbourhoodLanguageAddress: 'nh-lang',
    perspectiveLanguageAddress: 'persp-lang'
  }
}

describe('GraphQLEngine', () => {
  let engine: GraphQLEngine

  beforeEach(async () => {
    const { executor } = await createExecutor({
      bootstrapConfig,
      walletStore: new InMemoryWalletStore()
    })
    engine = new GraphQLEngine(executor)
  })

  // === Agent ===

  it('agentStatus returns uninitialized', async () => {
    const result = await engine.execute('{ agentStatus { isInitialized isUnlocked did } }')
    expect(result.errors).toBeUndefined()
    expect(result.data.agentStatus.isInitialized).toBe(false)
    expect(result.data.agentStatus.isUnlocked).toBe(false)
    expect(result.data.agentStatus.did).toBeNull()
  })

  it('agentGenerate creates agent', async () => {
    const result = await engine.execute(
      'mutation($p: String!) { agentGenerate(passphrase: $p) { isInitialized isUnlocked did } }',
      { p: 'secret' }
    )
    expect(result.errors).toBeUndefined()
    expect(result.data.agentGenerate.isInitialized).toBe(true)
    expect(result.data.agentGenerate.isUnlocked).toBe(true)
    expect(result.data.agentGenerate.did).toBeTruthy()
  })

  it('agentLock/agentUnlock cycle', async () => {
    await engine.execute('mutation { agentGenerate(passphrase: "pw") { isInitialized } }')

    const lockResult = await engine.execute('mutation { agentLock(passphrase: "pw") { isUnlocked } }')
    expect(lockResult.data.agentLock.isUnlocked).toBe(false)

    const unlockResult = await engine.execute('mutation { agentUnlock(passphrase: "pw") { isUnlocked } }')
    expect(unlockResult.data.agentUnlock.isUnlocked).toBe(true)
  })

  // === Perspectives ===

  it('perspectiveAdd creates and returns handle', async () => {
    const result = await engine.execute('mutation { perspectiveAdd(name: "test") { uuid name state } }')
    expect(result.errors).toBeUndefined()
    expect(result.data.perspectiveAdd.name).toBe('test')
    expect(result.data.perspectiveAdd.uuid).toBeTruthy()
    expect(result.data.perspectiveAdd.state).toBe('Private')
  })

  it('perspectives lists all', async () => {
    await engine.execute('mutation { perspectiveAdd(name: "a") { uuid } }')
    await engine.execute('mutation { perspectiveAdd(name: "b") { uuid } }')
    const result = await engine.execute('{ perspectives { uuid name } }')
    expect(result.data.perspectives).toHaveLength(2)
  })

  it('perspective returns single', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "x") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const result = await engine.execute(`{ perspective(uuid: "${uuid}") { uuid name } }`)
    expect(result.data.perspective.name).toBe('x')
  })

  it('perspectiveUpdate changes name', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "old") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const result = await engine.execute(`mutation { perspectiveUpdate(uuid: "${uuid}", name: "new") { name } }`)
    expect(result.data.perspectiveUpdate.name).toBe('new')
  })

  it('perspectiveRemove deletes', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "del") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const result = await engine.execute(`mutation { perspectiveRemove(uuid: "${uuid}") }`)
    expect(result.data.perspectiveRemove).toBe(true)
    const check = await engine.execute('{ perspectives { uuid } }')
    expect(check.data.perspectives).toHaveLength(0)
  })

  // === Links ===

  it('perspectiveAddLink adds and returns link', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "p") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const result = await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://a", target: "ad4m://b", predicate: "ad4m://c" }) { data { source target predicate } } }`
    )
    expect(result.errors).toBeUndefined()
    expect(result.data.perspectiveAddLink.data).toEqual({
      source: 'ad4m://a',
      target: 'ad4m://b',
      predicate: 'ad4m://c'
    })
  })

  it('perspectiveQueryLinks filters correctly', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "p") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://a", target: "ad4m://b" }) { data { source } } }`
    )
    await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://x", target: "ad4m://y" }) { data { source } } }`
    )

    const result = await engine.execute(
      `{ perspectiveQueryLinks(uuid: "${uuid}", query: { source: "ad4m://a" }) { data { source target } } }`
    )
    expect(result.data.perspectiveQueryLinks).toHaveLength(1)
    expect(result.data.perspectiveQueryLinks[0].data.source).toBe('ad4m://a')
  })

  it('perspectiveSnapshot returns all links', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "p") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://a", target: "ad4m://b" }) { data { source } } }`
    )
    await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://c", target: "ad4m://d" }) { data { source } } }`
    )

    const result = await engine.execute(`{ perspectiveSnapshot(uuid: "${uuid}") { links { data { source target } } } }`)
    expect(result.data.perspectiveSnapshot.links).toHaveLength(2)
  })

  it('perspectiveAddLinks batch works', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "p") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const result = await engine.execute(
      `mutation { perspectiveAddLinks(uuid: "${uuid}", links: [{ source: "ad4m://a", target: "ad4m://b" }, { source: "ad4m://c", target: "ad4m://d" }]) { data { source target } } }`
    )
    expect(result.data.perspectiveAddLinks).toHaveLength(2)
  })

  it('perspectiveRemoveLink removes', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "p") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const addLink = await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://a", target: "ad4m://b" }) { author timestamp data { source target predicate } proof { key signature } } }`
    )
    const le = addLink.data.perspectiveAddLink
    const result = await engine.execute(
      `mutation($uuid: String!, $link: LinkExpressionInput!) { perspectiveRemoveLink(uuid: $uuid, link: $link) }`,
      {
        uuid,
        link: {
          author: le.author,
          timestamp: le.timestamp,
          data: { source: le.data.source, target: le.data.target, predicate: le.data.predicate },
          proof: { key: le.proof.key, signature: le.proof.signature }
        }
      }
    )
    expect(result.errors).toBeUndefined()
    expect(result.data.perspectiveRemoveLink).toBe(true)

    const snap = await engine.execute(`{ perspectiveSnapshot(uuid: "${uuid}") { links { data { source } } } }`)
    expect(snap.data.perspectiveSnapshot.links).toHaveLength(0)
  })

  it('perspectiveUpdateLink replaces', async () => {
    const add = await engine.execute('mutation { perspectiveAdd(name: "p") { uuid } }')
    const uuid = add.data.perspectiveAdd.uuid
    const addLink = await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://a", target: "ad4m://b" }) { author timestamp data { source target predicate } proof { key signature } } }`
    )
    const le = addLink.data.perspectiveAddLink
    const result = await engine.execute(
      `mutation($uuid: String!, $old: LinkExpressionInput!, $new: LinkInput!) { perspectiveUpdateLink(uuid: $uuid, oldLink: $old, newLink: $new) { data { source target } } }`,
      {
        uuid,
        old: {
          author: le.author,
          timestamp: le.timestamp,
          data: { source: le.data.source, target: le.data.target, predicate: le.data.predicate },
          proof: { key: le.proof.key, signature: le.proof.signature }
        },
        new: { source: 'ad4m://x', target: 'ad4m://y' }
      }
    )
    expect(result.errors).toBeUndefined()
    expect(result.data.perspectiveUpdateLink.data.source).toBe('ad4m://x')
    expect(result.data.perspectiveUpdateLink.data.target).toBe('ad4m://y')
  })

  // === Runtime ===

  it('runtimeInfo returns version and status', async () => {
    const result = await engine.execute('{ runtimeInfo { ad4mExecutorVersion isInitialized isUnlocked } }')
    expect(result.errors).toBeUndefined()
    expect(result.data.runtimeInfo.ad4mExecutorVersion).toBe('0.1.0')
    expect(result.data.runtimeInfo.isInitialized).toBe(false)
  })

  // === Full flow ===

  it('full flow: generate → perspective → links → query → snapshot', async () => {
    // Generate agent
    await engine.execute('mutation { agentGenerate(passphrase: "test") { isInitialized } }')

    // Add perspective
    const pAdd = await engine.execute('mutation { perspectiveAdd(name: "flow") { uuid } }')
    const uuid = pAdd.data.perspectiveAdd.uuid

    // Add links
    await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://s1", target: "ad4m://t1", predicate: "ad4m://p1" }) { data { source } } }`
    )
    await engine.execute(
      `mutation { perspectiveAddLink(uuid: "${uuid}", link: { source: "ad4m://s2", target: "ad4m://t2", predicate: "ad4m://p2" }) { data { source } } }`
    )

    // Query
    const q = await engine.execute(
      `{ perspectiveQueryLinks(uuid: "${uuid}", query: { predicate: "ad4m://p1" }) { data { source target } } }`
    )
    expect(q.data.perspectiveQueryLinks).toHaveLength(1)
    expect(q.data.perspectiveQueryLinks[0].data.source).toBe('ad4m://s1')

    // Snapshot
    const snap = await engine.execute(`{ perspectiveSnapshot(uuid: "${uuid}") { links { data { source } } } }`)
    expect(snap.data.perspectiveSnapshot.links).toHaveLength(2)
  })
})
