import { createExecutor, GraphQLEngine, InMemoryBundleResolver, InProcessBundleExecutor } from '@ad4m-web/core'
import { BrowserWalletStore } from '../persistence/idb-wallet'
import { WebWorkerBundleExecutor } from '../language/worker-executor'
import type { Executor } from '@ad4m-web/core'

export interface ExecutorState {
  executor: Executor
  graphql: GraphQLEngine
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
    bundleExecutor
  })

  const graphql = new GraphQLEngine(result.executor)

  return { executor: result.executor, graphql }
}
