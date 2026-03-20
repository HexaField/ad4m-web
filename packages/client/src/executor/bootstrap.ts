import { createExecutor, GraphQLEngine } from '@ad4m-web/core'
import { BrowserWalletStore } from '../persistence/idb-wallet'
import type { Executor } from '@ad4m-web/core'

export interface ExecutorState {
  executor: Executor
  graphql: GraphQLEngine
}

export async function bootstrapExecutor(): Promise<ExecutorState> {
  const walletStore = new BrowserWalletStore()

  const result = await createExecutor({
    bootstrapConfig: {
      languages: {
        languageLanguageAddress: 'system-language-language',
        agentLanguageAddress: 'system-agent-language',
        neighbourhoodLanguageAddress: 'system-neighbourhood-language',
        perspectiveLanguageAddress: 'system-perspective-language'
      }
    },
    walletStore
  })

  const graphql = new GraphQLEngine(result.executor)

  return { executor: result.executor, graphql }
}
