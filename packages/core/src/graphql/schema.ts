import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLList
} from 'graphql'
import type { Executor } from '../bootstrap/executor'
import type { Link } from '../agent/types'
import type { LinkExpression } from '../linkstore/types'

// === Output Types ===

const AgentStatusType = new GraphQLObjectType({
  name: 'AgentStatus',
  fields: {
    did: { type: GraphQLString },
    didDocument: { type: GraphQLString },
    error: { type: GraphQLString },
    isInitialized: { type: new GraphQLNonNull(GraphQLBoolean) },
    isUnlocked: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
})

const ExpressionProofType = new GraphQLObjectType({
  name: 'ExpressionProof',
  fields: {
    key: { type: new GraphQLNonNull(GraphQLString) },
    signature: { type: new GraphQLNonNull(GraphQLString) },
    valid: { type: GraphQLBoolean },
    invalid: { type: GraphQLBoolean }
  }
})

const LinkType = new GraphQLObjectType({
  name: 'Link',
  fields: {
    source: { type: new GraphQLNonNull(GraphQLString) },
    target: { type: new GraphQLNonNull(GraphQLString) },
    predicate: { type: GraphQLString }
  }
})

const LinkExpressionType = new GraphQLObjectType({
  name: 'LinkExpression',
  fields: {
    author: { type: new GraphQLNonNull(GraphQLString) },
    timestamp: { type: new GraphQLNonNull(GraphQLString) },
    data: { type: new GraphQLNonNull(LinkType) },
    proof: { type: new GraphQLNonNull(ExpressionProofType) },
    status: { type: GraphQLString }
  }
})

const PerspectiveHandleType = new GraphQLObjectType({
  name: 'PerspectiveHandle',
  fields: {
    uuid: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: GraphQLString },
    sharedUrl: { type: GraphQLString },
    state: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const PerspectiveType = new GraphQLObjectType({
  name: 'Perspective',
  fields: {
    links: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))) }
  }
})

const RuntimeInfoType = new GraphQLObjectType({
  name: 'RuntimeInfo',
  fields: {
    ad4mExecutorVersion: { type: new GraphQLNonNull(GraphQLString) },
    isInitialized: { type: new GraphQLNonNull(GraphQLBoolean) },
    isUnlocked: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
})

// === Input Types ===

const LinkInputType = new GraphQLInputObjectType({
  name: 'LinkInput',
  fields: {
    source: { type: new GraphQLNonNull(GraphQLString) },
    target: { type: new GraphQLNonNull(GraphQLString) },
    predicate: { type: GraphQLString }
  }
})

const ExpressionProofInputType = new GraphQLInputObjectType({
  name: 'ExpressionProofInput',
  fields: {
    key: { type: new GraphQLNonNull(GraphQLString) },
    signature: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const LinkExpressionInputType = new GraphQLInputObjectType({
  name: 'LinkExpressionInput',
  fields: {
    author: { type: new GraphQLNonNull(GraphQLString) },
    timestamp: { type: new GraphQLNonNull(GraphQLString) },
    data: { type: new GraphQLNonNull(LinkInputType) },
    proof: { type: new GraphQLNonNull(ExpressionProofInputType) }
  }
})

const LinkQueryInputType = new GraphQLInputObjectType({
  name: 'LinkQuery',
  fields: {
    source: { type: GraphQLString },
    target: { type: GraphQLString },
    predicate: { type: GraphQLString },
    fromDate: { type: GraphQLString },
    untilDate: { type: GraphQLString },
    limit: { type: GraphQLInt }
  }
})

const LanguageRefType = new GraphQLObjectType({
  name: 'LanguageRef',
  fields: {
    address: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) }
  }
})

function serializeAgentStatus(status: ReturnType<Executor['agentService']['getStatus']>) {
  return {
    ...status,
    didDocument: status.didDocument ? JSON.stringify(status.didDocument) : null
  }
}

function normalizeLinkData(data: any): Link {
  return {
    source: data.source,
    target: data.target,
    predicate: data.predicate ?? undefined
  }
}

export function createSchema(executor: Executor): GraphQLSchema {
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      agentStatus: {
        type: new GraphQLNonNull(AgentStatusType),
        resolve: () => serializeAgentStatus(executor.agentService.getStatus())
      },
      perspectives: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PerspectiveHandleType))),
        resolve: () => executor.perspectiveManager.getAll()
      },
      perspective: {
        type: PerspectiveHandleType,
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, args: { uuid: string }) => executor.perspectiveManager.get(args.uuid) ?? null
      },
      perspectiveQueryLinks: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          query: { type: new GraphQLNonNull(LinkQueryInputType) }
        },
        resolve: (_: unknown, args: { uuid: string; query: any }) =>
          executor.perspectiveManager.queryLinks(args.uuid, args.query)
      },
      perspectiveSnapshot: {
        type: new GraphQLNonNull(PerspectiveType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, args: { uuid: string }) => executor.perspectiveManager.snapshot(args.uuid)
      },
      runtimeInfo: {
        type: new GraphQLNonNull(RuntimeInfoType),
        resolve: () => {
          const status = executor.agentService.getStatus()
          return {
            ad4mExecutorVersion: '0.1.0',
            isInitialized: status.isInitialized,
            isUnlocked: status.isUnlocked
          }
        }
      }
    }
  })

  const mutationType = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      agentGenerate: {
        type: new GraphQLNonNull(AgentStatusType),
        args: { passphrase: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, args: { passphrase: string }) => {
          const agent = executor.agentService as any
          await agent.generate(args.passphrase)
          return serializeAgentStatus(executor.agentService.getStatus())
        }
      },
      agentLock: {
        type: new GraphQLNonNull(AgentStatusType),
        args: { passphrase: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, _args: { passphrase: string }) => {
          const agent = executor.agentService as any
          agent.lock()
          return serializeAgentStatus(executor.agentService.getStatus())
        }
      },
      agentUnlock: {
        type: new GraphQLNonNull(AgentStatusType),
        args: { passphrase: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, args: { passphrase: string }) => {
          const agent = executor.agentService as any
          await agent.unlock(args.passphrase)
          return serializeAgentStatus(executor.agentService.getStatus())
        }
      },
      perspectiveAdd: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        args: { name: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, args: { name: string }) => executor.perspectiveManager.add(args.name)
      },
      perspectiveUpdate: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          name: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: (_: unknown, args: { uuid: string; name: string }) =>
          executor.perspectiveManager.update(args.uuid, args.name)
      },
      perspectiveRemove: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, args: { uuid: string }) => executor.perspectiveManager.remove(args.uuid)
      },
      perspectiveAddLink: {
        type: new GraphQLNonNull(LinkExpressionType),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          link: { type: new GraphQLNonNull(LinkInputType) }
        },
        resolve: (_: unknown, args: { uuid: string; link: Link }) =>
          executor.perspectiveManager.addLink(args.uuid, normalizeLinkData(args.link))
      },
      perspectiveAddLinks: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          links: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkInputType))) }
        },
        resolve: (_: unknown, args: { uuid: string; links: Link[] }) =>
          executor.perspectiveManager.addLinks(args.uuid, args.links.map(normalizeLinkData))
      },
      perspectiveRemoveLink: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          link: { type: new GraphQLNonNull(LinkExpressionInputType) }
        },
        resolve: (_: unknown, args: { uuid: string; link: any }) => {
          const le: LinkExpression = {
            author: args.link.author,
            timestamp: args.link.timestamp,
            data: normalizeLinkData(args.link.data),
            proof: args.link.proof
          }
          return executor.perspectiveManager.removeLink(args.uuid, le)
        }
      },
      perspectiveUpdateLink: {
        type: new GraphQLNonNull(LinkExpressionType),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          oldLink: { type: new GraphQLNonNull(LinkExpressionInputType) },
          newLink: { type: new GraphQLNonNull(LinkInputType) }
        },
        resolve: (_: unknown, args: { uuid: string; oldLink: any; newLink: Link }) => {
          const old: LinkExpression = {
            author: args.oldLink.author,
            timestamp: args.oldLink.timestamp,
            data: normalizeLinkData(args.oldLink.data),
            proof: args.oldLink.proof
          }
          return executor.perspectiveManager.updateLink(args.uuid, old, normalizeLinkData(args.newLink))
        }
      },
      neighbourhoodJoinFromUrl: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        args: { url: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, args: { url: string }) => {
          if (!executor.neighbourhoodManager) {
            throw new Error('NeighbourhoodManager not available')
          }
          return executor.neighbourhoodManager.joinFromUrl(args.url)
        }
      },
      neighbourhoodPublishFromPerspective: {
        type: new GraphQLNonNull(GraphQLString),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          linkLanguage: { type: new GraphQLNonNull(GraphQLString) },
          meta: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, args: { uuid: string; linkLanguage: string; meta: string }) => {
          if (!executor.neighbourhoodManager) {
            throw new Error('NeighbourhoodManager not available')
          }
          const meta = JSON.parse(args.meta)
          return executor.neighbourhoodManager.publishFromPerspective(args.uuid, args.linkLanguage, meta)
        }
      },
      languageApplyTemplateAndPublish: {
        type: new GraphQLNonNull(LanguageRefType),
        args: {
          sourceLanguageHash: { type: new GraphQLNonNull(GraphQLString) },
          templateData: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, args: { sourceLanguageHash: string; templateData: string }) => {
          const result = await executor.languageManager.applyTemplateAndPublish(
            args.sourceLanguageHash,
            args.templateData
          )
          return { address: result.address, name: result.meta.name }
        }
      }
    }
  })

  return new GraphQLSchema({ query: queryType, mutation: mutationType })
}
