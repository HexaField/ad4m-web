import { graphql, subscribe as graphqlSubscribe, parse } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import type { Executor } from '../bootstrap/executor'
import { PubSub } from './subscriptions'
import { createFullSchema } from './full-schema'

/**
 * Extended GraphQL engine with subscription support.
 * Use this instead of GraphQLEngine when you need real-time subscriptions.
 */
export class FullGraphQLEngine {
  private schema: GraphQLSchema
  readonly pubsub: PubSub

  constructor(executor: Executor) {
    this.pubsub = new PubSub()
    this.schema = createFullSchema(executor, this.pubsub)
  }

  async execute(query: string, variables?: Record<string, any>): Promise<any> {
    return graphql({
      schema: this.schema,
      source: query,
      variableValues: variables
    })
  }

  async subscribe(query: string, variables?: Record<string, any>): Promise<AsyncIterableIterator<any> | any> {
    const document = parse(query)
    return graphqlSubscribe({
      schema: this.schema,
      document,
      variableValues: variables
    })
  }
}
