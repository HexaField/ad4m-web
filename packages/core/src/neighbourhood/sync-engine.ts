import type {
  LinkSyncAdapter,
  PerspectiveDiff,
  PerspectiveDiffObserver,
  SyncStateChangeObserver
} from '../language/types'

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error'

export interface SyncEngineConfig {
  adapter: LinkSyncAdapter
  perspectiveUuid: string
  onDiff: (diff: PerspectiveDiff) => void
  onStateChange: (state: SyncState) => void
}

/**
 * SyncEngine manages the p-diff-sync lifecycle for a single neighbourhood perspective.
 *
 * Responsibilities:
 * - Initial sync on start (fetches current state from network)
 * - Registers callbacks for remote diffs and state changes
 * - Commits local changes to the network
 * - Tracks sync state transitions
 */
export class SyncEngine {
  private adapter: LinkSyncAdapter
  private perspectiveUuid: string
  private running = false
  private currentRevision: string | null = null
  private syncState: SyncState = 'idle'
  private onDiff: (diff: PerspectiveDiff) => void
  private onStateChange: (state: SyncState) => void

  constructor(config: SyncEngineConfig) {
    this.adapter = config.adapter
    this.perspectiveUuid = config.perspectiveUuid
    this.onDiff = config.onDiff
    this.onStateChange = config.onStateChange
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    // Register callback for remote changes
    this.adapter.addCallback((diff: PerspectiveDiff) => {
      if (this.running) {
        this.onDiff(diff)
      }
    })

    // Register sync state change callback
    this.adapter.addSyncStateChangeCallback((state: string) => {
      if (this.running) {
        this.syncState = state as SyncState
        this.onStateChange(state as SyncState)
      }
    })

    // Initial sync
    this.setState('syncing')
    const diff = await this.adapter.sync()
    if (diff.additions.length > 0 || diff.removals.length > 0) {
      this.onDiff(diff)
    }
    this.currentRevision = await this.adapter.currentRevision()
    this.setState('synced')
  }

  async commit(diff: PerspectiveDiff): Promise<string> {
    if (!this.running) throw new Error('SyncEngine not started')
    this.setState('syncing')
    try {
      const revision = await this.adapter.commit(diff)
      this.currentRevision = revision
      this.setState('synced')
      return revision
    } catch (err) {
      this.setState('error')
      throw err
    }
  }

  stop(): void {
    this.running = false
    this.setState('idle')
  }

  getRevision(): string | null {
    return this.currentRevision
  }

  getSyncState(): SyncState {
    return this.syncState
  }

  isRunning(): boolean {
    return this.running
  }

  getPerspectiveUuid(): string {
    return this.perspectiveUuid
  }

  private setState(state: SyncState): void {
    this.syncState = state
    this.onStateChange(state)
  }
}
