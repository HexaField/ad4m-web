import { createExecutor, GraphQLEngine, InMemoryBundleResolver, InProcessBundleExecutor } from '@ad4m-web/core'
import { BrowserWalletStore } from '../persistence/idb-wallet'
import { IndexedDBKVStore, IndexedDBBlobStore } from '../persistence/idb-store'
import { WebWorkerBundleExecutor } from '../language/worker-executor'
import type { Executor, PersistenceCoordinator } from '@ad4m-web/core'

export interface ExecutorState {
  executor: Executor
  graphql: GraphQLEngine
  persistence?: PersistenceCoordinator
}

export async function bootstrapExecutor(): Promise<ExecutorState> {
  const walletStore = new BrowserWalletStore()
  const bundleResolver = new InMemoryBundleResolver()
  const bundleExecutor = new WebWorkerBundleExecutor()

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

  return { executor: result.executor, graphql, persistence: result.persistence }
}
