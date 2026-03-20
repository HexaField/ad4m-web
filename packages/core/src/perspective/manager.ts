import type { LinkStore, LinkExpression, LinkQuery } from '../linkstore/types'
import type { Link } from '../agent/types'
import type { ShaclEngine } from '../shacl/engine'
import type { AgentService } from '../agent/agent'
import type { LinkSyncAdapter } from '../language/types'
import { SyncEngine } from '../neighbourhood/sync-engine'
import {
  PerspectiveState,
  type PerspectiveHandle,
  type PerspectiveEvent,
  type PerspectiveEventListener,
  type LinkMutations
} from './types'
import type { PubSub } from '../graphql/subscriptions'

export type SignLinkFn = (link: Link) => Promise<LinkExpression>

function defaultSign(link: Link): Promise<LinkExpression> {
  return Promise.resolve({
    author: '',
    timestamp: new Date().toISOString(),
    data: link,
    proof: { key: '', signature: '' }
  })
}

export class PerspectiveManager {
  private perspectives = new Map<string, PerspectiveHandle>()
  private listeners = new Set<PerspectiveEventListener>()
  private adapters = new Map<string, LinkSyncAdapter>()
  private syncEngines = new Map<string, SyncEngine>()
  private linkStore: LinkStore
  private signLink: SignLinkFn
  private pubsub?: PubSub

  constructor(
    linkStore: LinkStore,
    _shaclEngine: ShaclEngine,
    _agentService: AgentService,
    signLink?: SignLinkFn,
    pubsub?: PubSub
  ) {
    this.linkStore = linkStore
    this.signLink = signLink ?? defaultSign
    this.pubsub = pubsub
  }

  private emit(event: PerspectiveEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
    // Publish to PubSub for GraphQL subscriptions
    if (this.pubsub) {
      switch (event.type) {
        case 'perspectiveAdded':
          this.pubsub.publish('perspectiveAdded', event.handle)
          break
        case 'perspectiveUpdated':
          this.pubsub.publish('perspectiveUpdated', event.handle)
          break
        case 'perspectiveRemoved':
          this.pubsub.publish('perspectiveRemoved', event.uuid)
          break
        case 'linkAdded':
          this.pubsub.publish('perspectiveLinkAdded', { uuid: event.uuid, link: event.link })
          break
        case 'linkRemoved':
          this.pubsub.publish('perspectiveLinkRemoved', { uuid: event.uuid, link: event.link })
          break
      }
    }
  }

  private ensurePerspective(uuid: string): PerspectiveHandle {
    const handle = this.perspectives.get(uuid)
    if (!handle) throw new Error(`Perspective not found: ${uuid}`)
    return handle
  }

  private isShared(uuid: string): boolean {
    return this.adapters.has(uuid)
  }

  // === Event system ===

  addEventListener(listener: PerspectiveEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // === Perspective CRUD ===

  add(name: string): PerspectiveHandle {
    const handle: PerspectiveHandle = {
      uuid: crypto.randomUUID(),
      name,
      state: PerspectiveState.Private
    }
    this.perspectives.set(handle.uuid, handle)
    this.emit({ type: 'perspectiveAdded', handle })
    return handle
  }

  restore(handle: PerspectiveHandle): void {
    this.perspectives.set(handle.uuid, { ...handle })
  }

  update(uuid: string, name: string): PerspectiveHandle {
    const handle = this.ensurePerspective(uuid)
    handle.name = name
    this.emit({ type: 'perspectiveUpdated', handle })
    return handle
  }

  remove(uuid: string): boolean {
    const existed = this.perspectives.delete(uuid)
    if (existed) {
      this.adapters.delete(uuid)
      this.linkStore.removePerspective(uuid)
      this.emit({ type: 'perspectiveRemoved', uuid })
    }
    return existed
  }

  get(uuid: string): PerspectiveHandle | undefined {
    return this.perspectives.get(uuid)
  }

  getAll(): PerspectiveHandle[] {
    return [...this.perspectives.values()]
  }

  // === Link operations ===

  async addLink(uuid: string, link: Link): Promise<LinkExpression> {
    this.ensurePerspective(uuid)
    const signed = await this.signLink(link)
    await this.linkStore.addLink(uuid, signed)
    if (this.isShared(uuid)) {
      await this.adapters.get(uuid)!.commit({ additions: [signed], removals: [] })
    }
    this.emit({ type: 'linkAdded', uuid, link: signed })
    return signed
  }

  async addLinks(uuid: string, links: Link[]): Promise<LinkExpression[]> {
    this.ensurePerspective(uuid)
    const signed = await Promise.all(links.map((l) => this.signLink(l)))
    await this.linkStore.addLinks(uuid, signed)
    if (this.isShared(uuid)) {
      await this.adapters.get(uuid)!.commit({ additions: signed, removals: [] })
    }
    for (const s of signed) {
      this.emit({ type: 'linkAdded', uuid, link: s })
    }
    return signed
  }

  async removeLink(uuid: string, link: LinkExpression): Promise<boolean> {
    this.ensurePerspective(uuid)
    const removed = await this.linkStore.removeLink(uuid, link)
    if (removed && this.isShared(uuid)) {
      await this.adapters.get(uuid)!.commit({ additions: [], removals: [link] })
    }
    if (removed) {
      this.emit({ type: 'linkRemoved', uuid, link })
    }
    return removed
  }

  async updateLink(uuid: string, oldLink: LinkExpression, newLink: Link): Promise<LinkExpression> {
    this.ensurePerspective(uuid)
    await this.linkStore.removeLink(uuid, oldLink)
    const signed = await this.signLink(newLink)
    await this.linkStore.addLink(uuid, signed)
    if (this.isShared(uuid)) {
      await this.adapters.get(uuid)!.commit({ additions: [signed], removals: [oldLink] })
    }
    this.emit({ type: 'linkUpdated', uuid, oldLink, newLink: signed })
    return signed
  }

  async linkMutations(
    uuid: string,
    mutations: LinkMutations
  ): Promise<{ additions: LinkExpression[]; removals: LinkExpression[] }> {
    this.ensurePerspective(uuid)
    const signedAdditions = await Promise.all(mutations.additions.map((l) => this.signLink(l)))
    const removals: LinkExpression[] = []

    await this.linkStore.addLinks(uuid, signedAdditions)
    for (const r of mutations.removals) {
      const ok = await this.linkStore.removeLink(uuid, r)
      if (ok) removals.push(r)
    }

    if (this.isShared(uuid)) {
      await this.adapters.get(uuid)!.commit({ additions: signedAdditions, removals })
    }

    for (const a of signedAdditions) this.emit({ type: 'linkAdded', uuid, link: a })
    for (const r of removals) this.emit({ type: 'linkRemoved', uuid, link: r })

    return { additions: signedAdditions, removals }
  }

  // === Query ===

  async queryLinks(uuid: string, query: LinkQuery): Promise<LinkExpression[]> {
    this.ensurePerspective(uuid)
    return this.linkStore.queryLinks(uuid, query)
  }

  async snapshot(uuid: string): Promise<{ links: LinkExpression[] }> {
    this.ensurePerspective(uuid)
    const links = await this.linkStore.allLinks(uuid)
    return { links }
  }

  // === SDNA ===

  async addSdna(uuid: string, _name: string, sdnaCode: string, sdnaType: string): Promise<boolean> {
    this.ensurePerspective(uuid)
    const sdnaLink: LinkExpression = {
      author: '',
      timestamp: new Date().toISOString(),
      data: {
        source: 'ad4m://self',
        target: `literal://string:${encodeURIComponent(sdnaCode)}`,
        predicate: 'ad4m://has_sdna'
      },
      proof: { key: '', signature: '' }
    }
    await this.linkStore.addLink(uuid, sdnaLink)

    const typeLink: LinkExpression = {
      author: '',
      timestamp: new Date().toISOString(),
      data: {
        source: sdnaLink.data.target,
        target: `literal://string:${sdnaType}`,
        predicate: 'ad4m://sdna_type'
      },
      proof: { key: '', signature: '' }
    }
    await this.linkStore.addLink(uuid, typeLink)

    return true
  }

  // === Sync ===

  setLinkLanguage(uuid: string, adapter: LinkSyncAdapter): void {
    this.ensurePerspective(uuid)
    this.adapters.set(uuid, adapter)
  }

  getLinkLanguage(uuid: string): LinkSyncAdapter | undefined {
    return this.adapters.get(uuid)
  }

  async syncPerspective(uuid: string): Promise<void> {
    this.ensurePerspective(uuid)
    const adapter = this.adapters.get(uuid)
    if (!adapter) throw new Error(`No sync adapter for perspective: ${uuid}`)

    const diff = await adapter.sync()

    if (diff.additions.length > 0) {
      await this.linkStore.addLinks(uuid, diff.additions)
      for (const link of diff.additions) {
        this.emit({ type: 'linkAdded', uuid, link })
      }
    }

    if (diff.removals.length > 0) {
      for (const link of diff.removals) {
        await this.linkStore.removeLink(uuid, link)
        this.emit({ type: 'linkRemoved', uuid, link })
      }
    }
  }

  // === SyncEngine lifecycle ===

  /**
   * Start a SyncEngine for a neighbourhood perspective.
   * Handles initial sync, remote diff callbacks, and state tracking.
   */
  async startSync(uuid: string, adapter: LinkSyncAdapter): Promise<void> {
    this.ensurePerspective(uuid)
    if (this.syncEngines.has(uuid)) return

    this.setLinkLanguage(uuid, adapter)

    const engine = new SyncEngine({
      adapter,
      perspectiveUuid: uuid,
      onDiff: async (diff) => {
        if (diff.additions.length > 0) {
          await this.linkStore.addLinks(uuid, diff.additions)
          for (const link of diff.additions) {
            this.emit({ type: 'linkAdded', uuid, link })
          }
        }
        if (diff.removals.length > 0) {
          for (const link of diff.removals) {
            await this.linkStore.removeLink(uuid, link)
            this.emit({ type: 'linkRemoved', uuid, link })
          }
        }
      },
      onStateChange: (state) => {
        const handle = this.perspectives.get(uuid)
        if (handle && state === 'synced') {
          handle.state = PerspectiveState.Synced
          this.emit({ type: 'syncStateChange', uuid, state: PerspectiveState.Synced })
        }
      }
    })

    this.syncEngines.set(uuid, engine)
    await engine.start()
  }

  async stopSync(uuid: string): Promise<void> {
    const engine = this.syncEngines.get(uuid)
    if (engine) {
      engine.stop()
      this.syncEngines.delete(uuid)
    }
  }

  getSyncEngine(uuid: string): SyncEngine | undefined {
    return this.syncEngines.get(uuid)
  }
}
