import { createExecutor, GraphQLEngine, InMemoryBundleResolver, InProcessBundleExecutor } from '@ad4m-web/core'
import { BrowserWalletStore } from './persistence/idb-wallet'
import { IndexedDBKVStore, IndexedDBBlobStore } from './persistence/idb-store'
import { WebWorkerBundleExecutor } from './language/worker-executor'
import { OxigraphLinkStore } from './linkstore/oxigraph-store'
import type { Executor, PersistenceCoordinator, HolochainConductor } from '@ad4m-web/core'

export type HolochainMode = 'auto' | 'hwc' | 'websocket'

export interface BootstrapOptions {
  /**
   * Which Holochain conductor to use:
   * - 'auto' (default): use HWC extension if detected, otherwise WebSocket
   * - 'hwc': force HWC extension (throws if not available)
   * - 'websocket': force WebSocket conductor
   */
  holochainMode?: HolochainMode
}

export interface ExecutorState {
  executor: Executor
  graphql: GraphQLEngine
  persistence?: PersistenceCoordinator
  holochainConductor?: HolochainConductor
}

/**
 * Detect and create the appropriate HolochainConductor based on mode.
 * Returns undefined if no conductor is configured (current default behavior).
 */
async function createHolochainConductor(mode: HolochainMode): Promise<HolochainConductor | undefined> {
  const hwcAvailable =
    typeof window !== 'undefined' &&
    (window as { holochain?: { isWebConductor?: boolean } }).holochain?.isWebConductor === true

  if (mode === 'hwc' || (mode === 'auto' && hwcAvailable)) {
    const { HWCConductor } = await import('@ad4m-web/client/src/holochain/hwc-conductor')
    return new HWCConductor()
  }

  if (mode === 'websocket') {
    const { WebSocketHolochainConductor } = await import('@ad4m-web/client/src/holochain/ws-conductor')
    return new WebSocketHolochainConductor()
  }

  // 'auto' with no HWC detected — return undefined (no conductor configured)
  return undefined
}

export async function bootstrapExecutor(options?: BootstrapOptions): Promise<ExecutorState> {
  const walletStore = new BrowserWalletStore()
  const bundleResolver = new InMemoryBundleResolver()
  const bundleExecutor = new WebWorkerBundleExecutor()
  const linkStore = await OxigraphLinkStore.create()

  const result = await createExecutor({
    bootstrapConfig: {
      languages: {
        languageLanguageAddress: 'system-language-language',
        agentLanguageAddress: 'system-agent-language',
        neighbourhoodLanguageAddress: 'system-neighbourhood-language',
        perspectiveLanguageAddress: 'system-perspective-language'
      }
    },
    walletStore,
    bundleResolver,
    bundleExecutor,
    linkStore,
    persistenceConfig: {
      agentStore: new IndexedDBKVStore('ad4m-agent'),
      walletStore,
      perspectiveStore: new IndexedDBKVStore('ad4m-perspectives'),
      linkStoreData: new IndexedDBKVStore('ad4m-links'),
      languageCache: new IndexedDBBlobStore('ad4m-language-cache')
    }
  })

  // Load persisted state and start auto-save
  if (result.persistence) {
    await result.persistence.loadState()
    result.persistence.startAutoSave()
  }

  const graphql = new GraphQLEngine(result.executor)

  const holochainConductor = await createHolochainConductor(options?.holochainMode ?? 'auto')

  return { executor: result.executor, graphql, persistence: result.persistence, holochainConductor }
}
