import type { PersistenceConfig, DebouncedWriter } from './types'
import type { Executor } from '../bootstrap/executor'
import type { InMemoryLinkStore } from '../linkstore/store'
import type { PerspectiveHandle } from '../perspective/types'
import { createDebouncedWriter } from './debounce'

const AGENT_KEY = 'agent-status'
const PERSPECTIVES_KEY = 'perspective-handles'
const LINKS_KEY = 'link-store-dump'

export class PersistenceCoordinator {
  private executor: Executor
  private config: PersistenceConfig
  private writer: DebouncedWriter | null = null
  private removeListener: (() => void) | null = null

  constructor(executor: Executor, config: PersistenceConfig) {
    this.executor = executor
    this.config = config
  }

  async saveState(): Promise<void> {
    // Agent data
    const status = this.executor.agentService.getStatus()
    await this.config.agentStore.set(
      AGENT_KEY,
      JSON.stringify({
        did: status.did,
        didDocument: status.didDocument,
        isInitialized: status.isInitialized
      })
    )

    // Perspective handles
    const handles = this.executor.perspectiveManager.getAll()
    await this.config.perspectiveStore.set(PERSPECTIVES_KEY, JSON.stringify(handles))

    // Link store
    const linkStore = this.executor.linkStore as InMemoryLinkStore
    const dump = await linkStore.dump()
    await this.config.linkStoreData.set(LINKS_KEY, dump)
  }

  async loadState(): Promise<void> {
    // Restore perspective handles
    const handlesJson = await this.config.perspectiveStore.get(PERSPECTIVES_KEY)
    if (handlesJson) {
      const handles = JSON.parse(handlesJson) as PerspectiveHandle[]
      for (const handle of handles) {
        this.executor.perspectiveManager.restore(handle)
      }
    }

    // Restore link store
    const linkDump = await this.config.linkStoreData.get(LINKS_KEY)
    if (linkDump) {
      const linkStore = this.executor.linkStore as InMemoryLinkStore
      await linkStore.load(linkDump)
    }
  }

  startAutoSave(intervalMs?: number): void {
    if (this.writer) return

    this.writer = createDebouncedWriter(() => this.saveState(), intervalMs)

    this.removeListener = this.executor.perspectiveManager.addEventListener(() => {
      this.writer!.markDirty()
    })
  }

  stopAutoSave(): void {
    if (this.writer) {
      this.writer.stop()
      this.writer = null
    }
    if (this.removeListener) {
      this.removeListener()
      this.removeListener = null
    }
  }
}
