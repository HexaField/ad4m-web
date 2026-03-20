import { graphql, subscribe as graphqlSubscribe, parse } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import type { Executor } from '../bootstrap/executor'
import { PubSub } from './subscriptions'
import { createFullSchema } from './full-schema'

export class GraphQLEngine {
  private schema: GraphQLSchema
  readonly pubsub: PubSub

  constructor(executor: Executor) {
    const pubsub = executor.pubsub ?? new PubSub()
    this.pubsub = pubsub
    this.schema = createFullSchema(executor, pubsub)
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
