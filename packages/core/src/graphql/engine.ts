import { graphql, subscribe as graphqlSubscribe, parse } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import type { Executor } from '../bootstrap/executor'
import type { AuthContext } from './auth'
import { PubSub } from './subscriptions'
import { createFullSchema } from './full-schema'
import type { CapabilityService } from './capability-service'

export class GraphQLEngine {
  private schema: GraphQLSchema
  readonly pubsub: PubSub

  constructor(executor: Executor, capabilityService?: CapabilityService) {
    const pubsub = executor.pubsub ?? new PubSub()
    this.pubsub = pubsub
    this.schema = createFullSchema(executor, pubsub, capabilityService)
  }

  async execute(query: string, variables?: Record<string, any>, authContext?: AuthContext): Promise<any> {
    return graphql({
      schema: this.schema,
      source: query,
      variableValues: variables,
      contextValue: authContext ? { auth: authContext } : undefined
    })
  }

  async subscribe(
    query: string,
    variables?: Record<string, any>,
    authContext?: AuthContext
  ): Promise<AsyncIterableIterator<any> | any> {
    const document = parse(query)
    return graphqlSubscribe({
      schema: this.schema,
      document,
      variableValues: variables,
      contextValue: authContext ? { auth: authContext } : undefined
    })
  }
}
