import type {
  Language,
  LinkSyncAdapter,
  TelepresenceAdapter,
  PerspectiveDiff,
  PerspectiveDiffObserver,
  SyncStateChangeObserver,
  Perspective,
  HolochainLanguageDelegate,
  LanguageContext,
  OnlineAgent
} from './types'
import type { LinkExpression } from '../linkstore/types'
import type { HolochainSignal } from '../holochain/types'

const DNA_ROLE = 'perspective-diff-sync'
const ZOME_NAME = 'perspective_diff_sync'

interface PeerInfo {
  currentRevision: Uint8Array
  lastSeen: Date
}

function normaliseLinkExpression(link: LinkExpression): object {
  const data = { ...link, data: { ...link.data } }
  if (!data.data.source) data.data.source = null as unknown as string
  if (!data.data.target) data.data.target = null as unknown as string
  if (!data.data.predicate) data.data.predicate = null as unknown as string
  return data
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * LinkSyncAdapter that communicates with the p-diff-sync Holochain zome.
 * Clean-room implementation based on the AD4M protocol spec.
 */
class PDiffSyncLinkAdapter implements LinkSyncAdapter {
  private hcDelegate: HolochainLanguageDelegate
  private agentDid: string
  private peers: Map<string, PeerInfo> = new Map()
  private myCurrentRevision: Uint8Array | null = null
  private diffCallback: PerspectiveDiffObserver | null = null
  private syncStateCallback: SyncStateChangeObserver | null = null
  private didLinkCreated = false
  private gossipCount = 0

  constructor(hcDelegate: HolochainLanguageDelegate, agentDid: string) {
    this.hcDelegate = hcDelegate
    this.agentDid = agentDid
  }

  writable(): boolean {
    return true
  }

  public(): boolean {
    return false
  }

  async others(): Promise<string[]> {
    const dids = await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'get_others', null)
    return dids as string[]
  }

  async currentRevision(): Promise<string> {
    const res = await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'current_revision', null)
    return res as string
  }

  async sync(): Promise<PerspectiveDiff> {
    // Register our DID on first sync
    if (!this.didLinkCreated) {
      try {
        await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'create_did_pub_key_link', this.agentDid)
        this.didLinkCreated = true
      } catch (e) {
        console.error('[p-diff-sync] Failed to create DID link:', e)
      }
    }

    try {
      const revision = await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'sync', this.agentDid)
      if (revision && revision instanceof Uint8Array) {
        this.myCurrentRevision = revision
      }
    } catch (e) {
      console.error('[p-diff-sync] sync error:', e)
    }

    await this.runGossip()
    return { additions: [], removals: [] }
  }

  async render(): Promise<Perspective> {
    const res = (await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'render', null)) as { links: LinkExpression[] }
    return { links: res.links }
  }

  async commit(diff: PerspectiveDiff): Promise<string> {
    const prepDiff = {
      additions: diff.additions.map(normaliseLinkExpression),
      removals: diff.removals.map(normaliseLinkExpression)
    }

    const maxAttempts = 5
    let lastError: unknown
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'commit', {
          diff: prepDiff,
          my_did: this.agentDid
        })
        if (!res) throw new Error('Got undefined from commit')
        if (!(res instanceof Uint8Array)) throw new Error('Commit did not return a buffer')
        if (!res.length) throw new Error('Got empty buffer from commit')
        this.myCurrentRevision = res
        return uint8ArrayToBase64(res)
      } catch (e) {
        lastError = e
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)))
        }
      }
    }
    throw lastError
  }

  addCallback(callback: PerspectiveDiffObserver): number {
    this.diffCallback = callback
    return 1
  }

  addSyncStateChangeCallback(callback: SyncStateChangeObserver): number {
    this.syncStateCallback = callback
    return 1
  }

  /**
   * Called when a Holochain signal arrives for this cell.
   */
  async handleSignal(signal: HolochainSignal): Promise<void> {
    const payload = signal.payload as Record<string, unknown>
    const { reference_hash, reference, broadcast_author } = payload

    if (reference && reference_hash && broadcast_author) {
      // HashBroadcast from a peer — record their revision
      this.peers.set(broadcast_author as string, {
        currentRevision: reference_hash as Uint8Array,
        lastSeen: new Date()
      })
    } else {
      // Fast-forward signal containing link diffs from a pull
      if (this.diffCallback) {
        await this.diffCallback(payload as unknown as PerspectiveDiff)
      }
    }
  }

  private async runGossip(): Promise<void> {
    this.gossipCount++

    try {
      // Prune stale peers (>10s since last seen)
      const now = Date.now()
      for (const [did, info] of this.peers) {
        if (info.lastSeen.getTime() + 10000 < now) {
          this.peers.delete(did)
        }
      }

      // Determine scribe: lexically first DID
      const allPeers = [...this.peers.keys(), this.agentDid].sort()
      const isScribe = allPeers[0] === this.agentDid

      // Collect unique peer revisions
      const revisions = new Set<Uint8Array>()
      for (const peerInfo of this.peers.values()) {
        if (peerInfo.currentRevision) revisions.add(peerInfo.currentRevision)
      }

      // Check sync state
      if (this.syncStateCallback && revisions.size > 0) {
        let sameCount = 0
        let diffCount = 0
        const myB64 = this.myCurrentRevision ? uint8ArrayToBase64(this.myCurrentRevision) : null
        for (const rev of revisions) {
          if (myB64 && uint8ArrayToBase64(rev) === myB64) sameCount++
          else diffCount++
        }
        if (myB64) sameCount++ // count ourselves
        if (sameCount <= diffCount) {
          this.syncStateCallback('LinkLanguageInstalledButNotSynced')
        } else {
          this.syncStateCallback('Synced')
        }
      }

      // Pull from any peer revision that differs from ours
      for (const hash of revisions) {
        if (!hash) continue
        if (this.myCurrentRevision && uint8ArrayToBase64(hash) === uint8ArrayToBase64(this.myCurrentRevision)) continue

        const pullResult = (await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'pull', {
          hash,
          is_scribe: isScribe
        })) as { current_revision?: Uint8Array } | null

        if (pullResult?.current_revision && pullResult.current_revision instanceof Uint8Array) {
          this.myCurrentRevision = pullResult.current_revision
        }
      }

      if (this.gossipCount >= 10) {
        console.log(`[p-diff-sync gossip] me: ${this.agentDid}, scribe: ${isScribe}, peers: ${this.peers.size}`)
        this.gossipCount = 0
      }
    } catch (e) {
      console.error('[p-diff-sync] gossip error:', e)
    }
  }
}

/**
 * TelepresenceAdapter for p-diff-sync.
 */
class PDiffSyncTelepresenceAdapter implements TelepresenceAdapter {
  private hcDelegate: HolochainLanguageDelegate
  private signalCallbacks: Array<(signal: unknown, recipientDid?: string) => void> = []

  constructor(hcDelegate: HolochainLanguageDelegate) {
    this.hcDelegate = hcDelegate
  }

  async setOnlineStatus(status: unknown): Promise<void> {
    await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'set_online_status', status)
  }

  async getOnlineAgents(): Promise<OnlineAgent[]> {
    const activeAgents = (await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'get_active_agents', null)) as Uint8Array[]
    const results: OnlineAgent[] = []
    for (const agent of activeAgents) {
      try {
        const status = await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'get_agents_status', agent)
        results.push(status as OnlineAgent)
      } catch {
        // skip agents whose status can't be fetched
      }
    }
    return results
  }

  async sendSignal(remoteAgentDid: string, payload: unknown): Promise<object> {
    return (await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'send_signal', {
      remote_agent_did: remoteAgentDid,
      payload
    })) as object
  }

  async sendBroadcast(payload: unknown): Promise<object> {
    return (await this.hcDelegate.call(DNA_ROLE, ZOME_NAME, 'send_broadcast', payload)) as object
  }

  async registerSignalCallback(callback: (signal: unknown) => void): Promise<void> {
    this.signalCallbacks.push(callback)
  }

  /** Route an incoming signal to registered callbacks */
  async handleTelepresenceSignal(payload: Record<string, unknown>): Promise<void> {
    if (payload.recipient_did) {
      // Routed signal — reconstruct PerspectiveExpression
      const perspectiveExpression = {
        author: payload.author,
        data: payload.data,
        timestamp: payload.timestamp,
        proof: payload.proof
      }
      for (const cb of this.signalCallbacks) {
        await cb(perspectiveExpression, payload.recipient_did as string)
      }
    } else {
      for (const cb of this.signalCallbacks) {
        await cb(payload)
      }
    }
  }
}

/**
 * Creates a p-diff-sync backed Language suitable for use as a neighbourhood link language.
 * The DNA bytes must be provided externally (e.g. read from hApp file).
 */
export async function createPDiffSyncLanguage(
  name: string,
  context: LanguageContext,
  dnaBytes: Uint8Array
): Promise<Language> {
  const hcDelegate = context.Holochain
  if (!hcDelegate) throw new Error('HolochainLanguageDelegate required for p-diff-sync')

  const agentDid = context.agent.did
  const linksAdapter = new PDiffSyncLinkAdapter(hcDelegate, agentDid)
  const telepresenceAdapter = new PDiffSyncTelepresenceAdapter(hcDelegate)

  // Register the DNA and wire signal routing
  await hcDelegate.registerDNAs(
    [
      {
        file: dnaBytes,
        nick: DNA_ROLE,
        zomeCalls: [
          [ZOME_NAME, 'current_revision'],
          [ZOME_NAME, 'sync'],
          [ZOME_NAME, 'render'],
          [ZOME_NAME, 'commit'],
          [ZOME_NAME, 'pull'],
          [ZOME_NAME, 'fast_forward_signal'],
          [ZOME_NAME, 'get_others'],
          [ZOME_NAME, 'add_active_agent_link'],
          [ZOME_NAME, 'create_did_pub_key_link']
        ]
      }
    ],
    async (signal: HolochainSignal) => {
      const payload = signal.payload as Record<string, unknown>

      // Link updates (has reference or additions/removals)
      if (payload.reference || (payload.additions && payload.removals)) {
        await linksAdapter.handleSignal(signal)
        return
      }

      // Telepresence signals
      await telepresenceAdapter.handleTelepresenceSignal(payload)
    }
  )

  return {
    name,
    linksAdapter,
    telepresenceAdapter,
    interactions() {
      return []
    }
  }
}

export { PDiffSyncLinkAdapter, PDiffSyncTelepresenceAdapter, DNA_ROLE, ZOME_NAME }
