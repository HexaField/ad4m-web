import { graphql } from 'graphql'
import type { GraphQLSchema } from 'graphql'
import type { Executor } from '../bootstrap/executor'
import { createSchema } from './schema'

export class GraphQLEngine {
  private schema: GraphQLSchema

  constructor(executor: Executor) {
    this.schema = createSchema(executor)
  }

  async execute(query: string, variables?: Record<string, any>): Promise<any> {
    return graphql({
      schema: this.schema,
      source: query,
      variableValues: variables
    })
  }
}
