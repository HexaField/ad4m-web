import {
  createSchema,
  AgentStatusType,
  AgentType,
  PerspectiveHandleType,
  LinkExpressionType,
  LinkExpressionUpdatedType,
  PerspectiveExpressionType,
  ExceptionInfoType,
  PerspectiveStateEnum,
  LinkStatusEnum,
  DecoratedPerspectiveDiffType
} from './schema'
import { PubSub, createAsyncIterator } from './subscriptions'
import { GraphQLObjectType, GraphQLString, GraphQLNonNull, GraphQLSchema } from 'graphql'
import type { Executor } from '../bootstrap/executor'
import type { CapabilityService } from './capability-service'

export function createFullSchema(
  executor: Executor,
  pubsub: PubSub,
  capabilityService?: CapabilityService
): GraphQLSchema {
  const baseSchema = createSchema(executor, capabilityService)
  const queryType = baseSchema.getQueryType()!
  const mutationType = baseSchema.getMutationType()!

  const subscriptionType = new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      agentStatusChanged: {
        type: new GraphQLNonNull(AgentStatusType),
        subscribe: () => createAsyncIterator(pubsub, 'agentStatusChanged'),
        resolve: (event: any) => event
      },
      perspectiveAdded: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        subscribe: () => createAsyncIterator(pubsub, 'perspectiveAdded'),
        resolve: (event: any) => event
      },
      perspectiveUpdated: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        subscribe: () => createAsyncIterator(pubsub, 'perspectiveUpdated'),
        resolve: (event: any) => event
      },
      perspectiveRemoved: {
        type: new GraphQLNonNull(GraphQLString),
        subscribe: () => createAsyncIterator(pubsub, 'perspectiveRemoved'),
        resolve: (event: any) => event
      },
      perspectiveLinkAdded: {
        type: new GraphQLNonNull(LinkExpressionType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveLinkAdded', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event.link
      },
      perspectiveLinkRemoved: {
        type: new GraphQLNonNull(LinkExpressionType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveLinkRemoved', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event.link
      },
      perspectiveLinkUpdated: {
        type: new GraphQLNonNull(LinkExpressionUpdatedType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveLinkUpdated', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event
      },
      perspectiveSyncStateChange: {
        type: new GraphQLNonNull(GraphQLString),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { uuid: string }) =>
          createAsyncIterator(pubsub, 'perspectiveSyncStateChange', (e: any) => e.uuid === args.uuid),
        resolve: (event: any) => event.state
      },
      neighbourhoodSignal: {
        type: new GraphQLNonNull(PerspectiveExpressionType),
        args: { perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) } },
        subscribe: (_: any, args: { perspectiveUUID: string }) =>
          createAsyncIterator(pubsub, 'neighbourhoodSignal', (e: any) => e.perspectiveUUID === args.perspectiveUUID),
        resolve: (event: any) => event.signal
      },
      exceptionOccurred: {
        type: new GraphQLNonNull(ExceptionInfoType),
        subscribe: () => createAsyncIterator(pubsub, 'exceptionOccurred'),
        resolve: (event: any) => event
      },
      runtimeMessageReceived: {
        type: new GraphQLNonNull(PerspectiveExpressionType),
        subscribe: () => createAsyncIterator(pubsub, 'runtimeMessageReceived'),
        resolve: (event: any) => event
      },
      agentUpdated: {
        type: new GraphQLNonNull(AgentType),
        subscribe: () => createAsyncIterator(pubsub, 'agentUpdated'),
        resolve: (event: any) => event
      }
    }
  })

  return new GraphQLSchema({
    query: queryType,
    mutation: mutationType,
    subscription: subscriptionType,
    types: [PerspectiveStateEnum, LinkStatusEnum, DecoratedPerspectiveDiffType]
  })
}
