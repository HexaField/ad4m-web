import { createSchema } from './schema'
import { PubSub, createAsyncIterator } from './subscriptions'
import { GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLSchema } from 'graphql'
import type { Executor } from '../bootstrap/executor'

/**
 * Creates a full GraphQL schema with Query, Mutation, and Subscription types.
 * Wraps the base schema from schema.ts and adds subscription support.
 */
export function createFullSchema(executor: Executor, pubsub: PubSub): GraphQLSchema {
  const baseSchema = createSchema(executor)

  const queryType = baseSchema.getQueryType()!
  const mutationType = baseSchema.getMutationType()!

  // Retrieve named types from the base schema for subscription field types
  const AgentStatusType = baseSchema.getType('AgentStatus')!
  const PerspectiveHandleType = baseSchema.getType('PerspectiveHandle')!
  const LinkExpressionType = baseSchema.getType('LinkExpression')!

  const subscriptionType = new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      agentStatusChanged: {
        type: new GraphQLNonNull(AgentStatusType as any),
        subscribe: () => createAsyncIterator(pubsub, 'agentStatusChanged'),
        resolve: (event: any) => event
      },
      perspectiveAdded: {
        type: new GraphQLNonNull(PerspectiveHandleType as any),
        subscribe: () => createAsyncIterator(pubsub, 'perspectiveAdded'),
        resolve: (event: any) => event
      },
      perspectiveUpdated: {
        type: new GraphQLNonNull(PerspectiveHandleType as any),
        subscribe: () => createAsyncIterator(pubsub, 'perspectiveUpdated'),
        resolve: (event: any) => event
      },
      perspectiveRemoved: {
        type: new GraphQLNonNull(GraphQLString),
        subscribe: () => createAsyncIterator(pubsub, 'perspectiveRemoved'),
        resolve: (event: any) => event
      },
      perspectiveLinkAdded: {
        type: new GraphQLNonNull(LinkExpressionType as any),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveLinkAdded', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event.link
      },
      perspectiveLinkRemoved: {
        type: new GraphQLNonNull(LinkExpressionType as any),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveLinkRemoved', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event.link
      },
      perspectiveSyncStateChange: {
        type: new GraphQLNonNull(GraphQLString),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveSyncStateChange', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event.state
      }
    }
  })

  return new GraphQLSchema({
    query: queryType,
    mutation: mutationType,
    subscription: subscriptionType
  })
}
