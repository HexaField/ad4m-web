import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLList,
  GraphQLEnumType
} from 'graphql'
import type { Executor } from '../bootstrap/executor'
import type { Link } from '../agent/types'
import type { LinkExpression } from '../linkstore/types'
import type { CapabilityService } from './capability-service'

// === Enums ===

const PerspectiveStateEnum = new GraphQLEnumType({
  name: 'PerspectiveState',
  values: {
    Private: { value: 'Private' },
    NeighbourhoodCreationInitiated: { value: 'NeighbourhoodCreationInitiated' },
    NeighbourhoodJoinInitiated: { value: 'NeighbourhoodJoinInitiated' },
    LinkLanguageFailedToInstall: { value: 'LinkLanguageFailedToInstall' },
    LinkLanguageInstalledButNotSynced: { value: 'LinkLanguageInstalledButNotSynced' },
    Synced: { value: 'Synced' }
  }
})

const LinkStatusEnum = new GraphQLEnumType({
  name: 'LinkStatus',
  values: {
    shared: { value: 'shared' },
    local: { value: 'local' }
  }
})

// === Output Types ===

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
    status: { type: LinkStatusEnum }
  }
})

const PerspectiveType = new GraphQLObjectType({
  name: 'Perspective',
  fields: {
    links: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))) }
  }
})

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

const AgentType = new GraphQLObjectType({
  name: 'Agent',
  fields: {
    did: { type: new GraphQLNonNull(GraphQLString) },
    directMessageLanguage: { type: GraphQLString },
    perspective: { type: PerspectiveType }
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

const RuntimeInfoType = new GraphQLObjectType({
  name: 'RuntimeInfo',
  fields: {
    ad4mExecutorVersion: { type: new GraphQLNonNull(GraphQLString) },
    isInitialized: { type: new GraphQLNonNull(GraphQLBoolean) },
    isUnlocked: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
})

const LanguageRefType = new GraphQLObjectType({
  name: 'LanguageRef',
  fields: {
    address: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const EntanglementProofType = new GraphQLObjectType({
  name: 'EntanglementProof',
  fields: {
    did: { type: new GraphQLNonNull(GraphQLString) },
    didSigningKeyId: { type: new GraphQLNonNull(GraphQLString) },
    deviceKey: { type: new GraphQLNonNull(GraphQLString) },
    deviceKeySignedByDid: { type: new GraphQLNonNull(GraphQLString) },
    didSignedByDeviceKey: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const AgentSignatureType = new GraphQLObjectType({
  name: 'AgentSignature',
  fields: {
    signature: { type: new GraphQLNonNull(GraphQLString) },
    publicKey: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const OnlineAgentType = new GraphQLObjectType({
  name: 'OnlineAgent',
  fields: {
    did: { type: new GraphQLNonNull(GraphQLString) },
    status: { type: GraphQLString }
  }
})

const ReadinessStatusType = new GraphQLObjectType({
  name: 'ReadinessStatus',
  fields: {
    graphqlReady: { type: new GraphQLNonNull(GraphQLBoolean) },
    holochainReady: { type: new GraphQLNonNull(GraphQLBoolean) },
    languagesReady: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
})

const HostingUserInfoType = new GraphQLObjectType({
  name: 'HostingUserInfo',
  fields: {
    did: { type: new GraphQLNonNull(GraphQLString) },
    email: { type: new GraphQLNonNull(GraphQLString) },
    credits: { type: new GraphQLNonNull(GraphQLFloat) },
    freeAccess: { type: new GraphQLNonNull(GraphQLBoolean) }
  }
})

const PaymentRequestResultType = new GraphQLObjectType({
  name: 'PaymentRequestResult',
  fields: {
    success: { type: new GraphQLNonNull(GraphQLBoolean) },
    paymentUrl: { type: GraphQLString },
    error: { type: GraphQLString }
  }
})

const PerspectiveExpressionType = new GraphQLObjectType({
  name: 'PerspectiveExpression',
  fields: {
    author: { type: new GraphQLNonNull(GraphQLString) },
    timestamp: { type: new GraphQLNonNull(GraphQLString) },
    data: { type: new GraphQLNonNull(PerspectiveType) },
    proof: { type: new GraphQLNonNull(ExpressionProofType) }
  }
})

const LinkExpressionUpdatedType = new GraphQLObjectType({
  name: 'LinkExpressionUpdated',
  fields: {
    oldLink: { type: new GraphQLNonNull(LinkExpressionType) },
    newLink: { type: new GraphQLNonNull(LinkExpressionType) }
  }
})

const ExceptionInfoType = new GraphQLObjectType({
  name: 'ExceptionInfo',
  fields: {
    title: { type: new GraphQLNonNull(GraphQLString) },
    message: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(GraphQLString) },
    addon: { type: GraphQLString }
  }
})

const DecoratedPerspectiveDiffType = new GraphQLObjectType({
  name: 'DecoratedPerspectiveDiff',
  fields: {
    additions: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))) },
    removals: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))) }
  }
})

const CapabilityResourceType = new GraphQLObjectType({
  name: 'CapabilityResource',
  fields: {
    domain: { type: new GraphQLNonNull(GraphQLString) },
    pointers: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) }
  }
})

const CapabilityType = new GraphQLObjectType({
  name: 'Capability',
  fields: {
    with: { type: new GraphQLNonNull(CapabilityResourceType) },
    can: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) }
  }
})

const AuthInfoType = new GraphQLObjectType({
  name: 'AuthInfo',
  fields: {
    appName: { type: new GraphQLNonNull(GraphQLString) },
    appDesc: { type: new GraphQLNonNull(GraphQLString) },
    appDomain: { type: GraphQLString },
    appUrl: { type: GraphQLString },
    capabilities: { type: new GraphQLList(new GraphQLNonNull(CapabilityType)) }
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

const EntanglementProofInputType = new GraphQLInputObjectType({
  name: 'EntanglementProofInput',
  fields: {
    did: { type: new GraphQLNonNull(GraphQLString) },
    didSigningKeyId: { type: new GraphQLNonNull(GraphQLString) },
    deviceKey: { type: new GraphQLNonNull(GraphQLString) },
    deviceKeySignedByDid: { type: new GraphQLNonNull(GraphQLString) },
    didSignedByDeviceKey: { type: new GraphQLNonNull(GraphQLString) }
  }
})

const PerspectiveInputType = new GraphQLInputObjectType({
  name: 'PerspectiveInput',
  fields: {
    links: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkInputType))) }
  }
})

const LinkMutationsInputType = new GraphQLInputObjectType({
  name: 'LinkMutations',
  fields: {
    additions: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkInputType))) },
    removals: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionInputType))) }
  }
})

const CapabilityResourceInputType = new GraphQLInputObjectType({
  name: 'CapabilityResourceInput',
  fields: {
    domain: { type: new GraphQLNonNull(GraphQLString) },
    pointers: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) }
  }
})

const CapabilityInputType = new GraphQLInputObjectType({
  name: 'CapabilityInput',
  fields: {
    with: { type: new GraphQLNonNull(CapabilityResourceInputType) },
    can: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) }
  }
})

const AuthInfoInputType = new GraphQLInputObjectType({
  name: 'AuthInfoInput',
  fields: {
    appName: { type: new GraphQLNonNull(GraphQLString) },
    appDesc: { type: new GraphQLNonNull(GraphQLString) },
    appDomain: { type: GraphQLString },
    appUrl: { type: GraphQLString },
    capabilities: { type: new GraphQLList(new GraphQLNonNull(CapabilityInputType)) }
  }
})

// === Helpers ===

function serializeAgentStatus(status: ReturnType<Executor['agentService']['getStatus']>) {
  return {
    ...status,
    didDocument: status.didDocument ? JSON.stringify(status.didDocument) : null
  }
}

function normalizeLinkData(data: any): Link {
  return { source: data.source, target: data.target, predicate: data.predicate ?? undefined }
}

export {
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
}

export function createSchema(executor: Executor, capabilityService?: CapabilityService): GraphQLSchema {
  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      agent: {
        type: new GraphQLNonNull(AgentType),
        resolve: () => {
          const s = executor.agentService.getStatus()
          return { did: s.did ?? '', directMessageLanguage: null, perspective: null }
        }
      },
      agentByDID: {
        type: AgentType,
        args: { did: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, _a: { did: string }) => null
      },
      agentStatus: {
        type: new GraphQLNonNull(AgentStatusType),
        resolve: () => serializeAgentStatus(executor.agentService.getStatus())
      },
      agentIsLocked: {
        type: new GraphQLNonNull(GraphQLBoolean),
        resolve: () => !executor.agentService.getStatus().isUnlocked
      },
      agentGetEntanglementProofs: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EntanglementProofType))),
        resolve: () => executor.entanglementService?.getProofs() ?? []
      },
      agentGetApps: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(AuthInfoType))),
        resolve: () => {
          if (!capabilityService) throw new Error('CapabilityService not available')
          return capabilityService.getApps()
        }
      },
      perspectives: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PerspectiveHandleType))),
        resolve: () => executor.perspectiveManager.getAll()
      },
      perspective: {
        type: PerspectiveHandleType,
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { uuid: string }) => executor.perspectiveManager.get(a.uuid) ?? null
      },
      perspectiveQueryLinks: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          query: { type: new GraphQLNonNull(LinkQueryInputType) }
        },
        resolve: (_: unknown, a: { uuid: string; query: any }) =>
          executor.perspectiveManager.queryLinks(a.uuid, a.query)
      },
      perspectiveSnapshot: {
        type: new GraphQLNonNull(PerspectiveType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { uuid: string }) => executor.perspectiveManager.snapshot(a.uuid)
      },
      perspectiveQuerySurreal: {
        type: new GraphQLNonNull(GraphQLString),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) }, query: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: () => JSON.stringify({ results: [] })
      },
      neighbourhoodOtherAgents: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, a: { perspectiveUUID: string }) =>
          executor.neighbourhoodManager?.getOtherAgents(a.perspectiveUUID) ?? []
      },
      neighbourhoodOnlineAgents: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(OnlineAgentType))),
        args: { perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, a: { perspectiveUUID: string }) =>
          executor.neighbourhoodManager?.getOnlineAgents(a.perspectiveUUID) ?? []
      },
      neighbourhoodHasTelepresenceAdapter: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: { perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { perspectiveUUID: string }) =>
          executor.neighbourhoodManager?.hasTelepresenceAdapter(a.perspectiveUUID) ?? false
      },
      runtimeInfo: {
        type: new GraphQLNonNull(RuntimeInfoType),
        resolve: () => {
          const s = executor.agentService.getStatus()
          return { ad4mExecutorVersion: '0.1.0', isInitialized: s.isInitialized, isUnlocked: s.isUnlocked }
        }
      },
      runtimeFriends: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        resolve: () => executor.friendService?.getFriends() ?? []
      },
      runtimeFriendStatus: {
        type: PerspectiveExpressionType,
        args: { did: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: () => null
      },
      runtimeKnownLinkLanguageTemplates: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        resolve: () => executor.runtimeService?.getKnownLinkLanguageTemplates() ?? []
      },
      runtimeHcAgentInfos: {
        type: new GraphQLNonNull(GraphQLString),
        resolve: () => executor.runtimeService?.getHcAgentInfos() ?? '[]'
      },
      runtimeGetNetworkMetrics: {
        type: new GraphQLNonNull(GraphQLString),
        resolve: () => executor.runtimeService?.getNetworkMetrics() ?? '{}'
      },
      runtimeReadiness: {
        type: new GraphQLNonNull(ReadinessStatusType),
        resolve: () =>
          executor.runtimeService?.getReadiness() ?? {
            graphqlReady: true,
            holochainReady: false,
            languagesReady: false
          }
      },
      runtimeTlsDomain: {
        type: GraphQLString,
        resolve: () => executor.runtimeService?.getTlsDomain() ?? null
      },
      runtimeHostingUserInfo: {
        type: new GraphQLNonNull(HostingUserInfoType),
        resolve: () =>
          executor.runtimeService?.getHostingUserInfo() ?? { did: '', email: '', credits: 0, freeAccess: false }
      },
      getTrustedAgents: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        resolve: () => executor.runtimeService?.getTrustedAgents() ?? []
      }
    }
  })

  const mutationType = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      agentGenerate: {
        type: new GraphQLNonNull(AgentStatusType),
        args: { passphrase: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, a: { passphrase: string }) => {
          await (executor.agentService as any).generate(a.passphrase)
          return serializeAgentStatus(executor.agentService.getStatus())
        }
      },
      agentLock: {
        type: new GraphQLNonNull(AgentStatusType),
        args: { passphrase: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, _a: { passphrase: string }) => {
          ;(executor.agentService as any).lock()
          return serializeAgentStatus(executor.agentService.getStatus())
        }
      },
      agentUnlock: {
        type: new GraphQLNonNull(AgentStatusType),
        args: { passphrase: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, a: { passphrase: string }) => {
          await (executor.agentService as any).unlock(a.passphrase)
          return serializeAgentStatus(executor.agentService.getStatus())
        }
      },
      agentUpdatePublicPerspective: {
        type: new GraphQLNonNull(AgentType),
        args: { perspective: { type: new GraphQLNonNull(PerspectiveInputType) } },
        resolve: (_: unknown, _a: { perspective: any }) => {
          const s = executor.agentService.getStatus()
          return { did: s.did ?? '', directMessageLanguage: null, perspective: null }
        }
      },
      agentUpdateDirectMessageLanguage: {
        type: new GraphQLNonNull(AgentType),
        args: { directMessageLanguage: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { directMessageLanguage: string }) => {
          const s = executor.agentService.getStatus()
          return { did: s.did ?? '', directMessageLanguage: a.directMessageLanguage, perspective: null }
        }
      },
      agentAddEntanglementProofs: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EntanglementProofType))),
        args: { proofs: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EntanglementProofInputType))) } },
        resolve: (_: unknown, a: { proofs: any[] }) => {
          if (!executor.entanglementService) throw new Error('EntanglementService not available')
          return executor.entanglementService.addProofs(a.proofs)
        }
      },
      agentDeleteEntanglementProofs: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EntanglementProofType))),
        args: { proofs: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(EntanglementProofInputType))) } },
        resolve: (_: unknown, a: { proofs: any[] }) => {
          if (!executor.entanglementService) throw new Error('EntanglementService not available')
          return executor.entanglementService.deleteProofs(a.proofs)
        }
      },
      agentEntanglementProofPreFlight: {
        type: new GraphQLNonNull(EntanglementProofType),
        args: {
          deviceKey: { type: new GraphQLNonNull(GraphQLString) },
          deviceKeyType: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: (_: unknown, a: { deviceKey: string; deviceKeyType: string }) => {
          if (!executor.entanglementService) throw new Error('EntanglementService not available')
          return executor.entanglementService.preFlight(a.deviceKey, a.deviceKeyType)
        }
      },
      agentSignMessage: {
        type: new GraphQLNonNull(AgentSignatureType),
        args: { message: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, _a: { message: string }) => ({ signature: '', publicKey: '' })
      },
      agentPermitCapability: {
        type: new GraphQLNonNull(GraphQLString),
        args: { auth: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, _a: { auth: string }) => ''
      },
      agentRequestCapability: {
        type: new GraphQLNonNull(GraphQLString),
        args: { authInfo: { type: new GraphQLNonNull(AuthInfoInputType) } },
        resolve: (_: unknown, a: { authInfo: any }) => {
          if (!capabilityService) throw new Error('CapabilityService not available')
          return capabilityService.requestCapability(a.authInfo)
        }
      },
      agentGenerateJwt: {
        type: new GraphQLNonNull(GraphQLString),
        args: {
          requestId: { type: new GraphQLNonNull(GraphQLString) },
          rand: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, a: { requestId: string; rand: string }) => {
          if (!capabilityService) throw new Error('CapabilityService not available')
          return capabilityService.generateJwt(a.requestId, a.rand)
        }
      },
      agentRevokeToken: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: { requestId: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { requestId: string }) => {
          if (!capabilityService) throw new Error('CapabilityService not available')
          return capabilityService.revokeToken(a.requestId)
        }
      },
      perspectiveAdd: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        args: { name: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { name: string }) => executor.perspectiveManager.add(a.name)
      },
      perspectiveUpdate: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) }, name: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { uuid: string; name: string }) => executor.perspectiveManager.update(a.uuid, a.name)
      },
      perspectiveRemove: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { uuid: string }) => executor.perspectiveManager.remove(a.uuid)
      },
      perspectiveAddLink: {
        type: new GraphQLNonNull(LinkExpressionType),
        args: { uuid: { type: new GraphQLNonNull(GraphQLString) }, link: { type: new GraphQLNonNull(LinkInputType) } },
        resolve: (_: unknown, a: { uuid: string; link: Link }) =>
          executor.perspectiveManager.addLink(a.uuid, normalizeLinkData(a.link))
      },
      perspectiveAddLinks: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkExpressionType))),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          links: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(LinkInputType))) }
        },
        resolve: (_: unknown, a: { uuid: string; links: Link[] }) =>
          executor.perspectiveManager.addLinks(a.uuid, a.links.map(normalizeLinkData))
      },
      perspectiveRemoveLink: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          link: { type: new GraphQLNonNull(LinkExpressionInputType) }
        },
        resolve: (_: unknown, a: { uuid: string; link: any }) => {
          const le: LinkExpression = {
            author: a.link.author,
            timestamp: a.link.timestamp,
            data: normalizeLinkData(a.link.data),
            proof: a.link.proof
          }
          return executor.perspectiveManager.removeLink(a.uuid, le)
        }
      },
      perspectiveUpdateLink: {
        type: new GraphQLNonNull(LinkExpressionType),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          oldLink: { type: new GraphQLNonNull(LinkExpressionInputType) },
          newLink: { type: new GraphQLNonNull(LinkInputType) }
        },
        resolve: (_: unknown, a: { uuid: string; oldLink: any; newLink: Link }) => {
          const old: LinkExpression = {
            author: a.oldLink.author,
            timestamp: a.oldLink.timestamp,
            data: normalizeLinkData(a.oldLink.data),
            proof: a.oldLink.proof
          }
          return executor.perspectiveManager.updateLink(a.uuid, old, normalizeLinkData(a.newLink))
        }
      },
      perspectiveLinkMutations: {
        type: new GraphQLNonNull(DecoratedPerspectiveDiffType),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          mutations: { type: new GraphQLNonNull(LinkMutationsInputType) }
        },
        resolve: async (_: unknown, a: { uuid: string; mutations: any }) =>
          executor.perspectiveManager.linkMutations(a.uuid, {
            additions: a.mutations.additions.map(normalizeLinkData),
            removals: a.mutations.removals.map((r: any) => ({
              author: r.author,
              timestamp: r.timestamp,
              data: normalizeLinkData(r.data),
              proof: r.proof
            }))
          })
      },
      perspectiveAddSdna: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          name: { type: new GraphQLNonNull(GraphQLString) },
          sdnaCode: { type: new GraphQLNonNull(GraphQLString) },
          sdnaType: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, a: { uuid: string; name: string; sdnaCode: string; sdnaType: string }) =>
          executor.perspectiveManager.addSdna(a.uuid, a.name, a.sdnaCode, a.sdnaType)
      },
      neighbourhoodJoinFromUrl: {
        type: new GraphQLNonNull(PerspectiveHandleType),
        args: { url: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_: unknown, a: { url: string }) => {
          if (!executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
          return executor.neighbourhoodManager.joinFromUrl(a.url)
        }
      },
      neighbourhoodPublishFromPerspective: {
        type: new GraphQLNonNull(GraphQLString),
        args: {
          uuid: { type: new GraphQLNonNull(GraphQLString) },
          linkLanguage: { type: new GraphQLNonNull(GraphQLString) },
          meta: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, a: { uuid: string; linkLanguage: string; meta: string }) => {
          if (!executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
          return executor.neighbourhoodManager.publishFromPerspective(a.uuid, a.linkLanguage, JSON.parse(a.meta))
        }
      },
      neighbourhoodSetOnlineStatus: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) },
          status: { type: new GraphQLNonNull(PerspectiveInputType) }
        },
        resolve: async (_: unknown, a: { perspectiveUUID: string; status: any }) => {
          if (!executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
          await executor.neighbourhoodManager.setOnlineStatus(a.perspectiveUUID, a.status)
          return true
        }
      },
      neighbourhoodSendSignal: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) },
          remoteAgentDid: { type: new GraphQLNonNull(GraphQLString) },
          payload: { type: new GraphQLNonNull(PerspectiveInputType) }
        },
        resolve: async (_: unknown, a: { perspectiveUUID: string; remoteAgentDid: string; payload: any }) => {
          if (!executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
          await executor.neighbourhoodManager.sendSignal(a.perspectiveUUID, a.remoteAgentDid, a.payload)
          return true
        }
      },
      neighbourhoodSendBroadcast: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          perspectiveUUID: { type: new GraphQLNonNull(GraphQLString) },
          payload: { type: new GraphQLNonNull(PerspectiveInputType) }
        },
        resolve: async (_: unknown, a: { perspectiveUUID: string; payload: any }) => {
          if (!executor.neighbourhoodManager) throw new Error('NeighbourhoodManager not available')
          await executor.neighbourhoodManager.sendBroadcast(a.perspectiveUUID, a.payload)
          return true
        }
      },
      languageApplyTemplateAndPublish: {
        type: new GraphQLNonNull(LanguageRefType),
        args: {
          sourceLanguageHash: { type: new GraphQLNonNull(GraphQLString) },
          templateData: { type: new GraphQLNonNull(GraphQLString) }
        },
        resolve: async (_: unknown, a: { sourceLanguageHash: string; templateData: string }) => {
          const r = await executor.languageManager.applyTemplateAndPublish(a.sourceLanguageHash, a.templateData)
          return { address: r.address, name: r.meta.name }
        }
      },
      addTrustedAgents: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { agents: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) } },
        resolve: (_: unknown, a: { agents: string[] }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.addTrustedAgents(a.agents)
        }
      },
      removeTrustedAgents: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { agents: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) } },
        resolve: (_: unknown, a: { agents: string[] }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.removeTrustedAgents(a.agents)
        }
      },
      runtimeAddFriend: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { did: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { did: string }) => {
          if (!executor.friendService) throw new Error('FriendService not available')
          return executor.friendService.addFriend(a.did)
        }
      },
      runtimeRemoveFriend: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { did: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { did: string }) => {
          if (!executor.friendService) throw new Error('FriendService not available')
          return executor.friendService.removeFriend(a.did)
        }
      },
      runtimeAddKnownLinkLanguageTemplate: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { address: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { address: string }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.addKnownLinkLanguageTemplate(a.address)
        }
      },
      runtimeRemoveKnownLinkLanguageTemplate: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        args: { address: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { address: string }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.removeKnownLinkLanguageTemplate(a.address)
        }
      },
      runtimeSetHotWalletAddress: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: { address: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { address: string }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.setHotWalletAddress(a.address)
        }
      },
      runtimeRequestPayment: {
        type: new GraphQLNonNull(PaymentRequestResultType),
        args: { amount: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_: unknown, a: { amount: string }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.requestPayment(a.amount)
        }
      },
      runtimeSetUserCredits: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          userDid: { type: new GraphQLNonNull(GraphQLString) },
          credits: { type: new GraphQLNonNull(GraphQLFloat) }
        },
        resolve: (_: unknown, a: { userDid: string; credits: number }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.setUserCredits(a.userDid, a.credits)
        }
      },
      runtimeSetUserFreeAccess: {
        type: new GraphQLNonNull(GraphQLBoolean),
        args: {
          userDid: { type: new GraphQLNonNull(GraphQLString) },
          freeAccess: { type: new GraphQLNonNull(GraphQLBoolean) }
        },
        resolve: (_: unknown, a: { userDid: string; freeAccess: boolean }) => {
          if (!executor.runtimeService) throw new Error('RuntimeService not available')
          return executor.runtimeService.setUserFreeAccess(a.userDid, a.freeAccess)
        }
      }
    }
  })

  return new GraphQLSchema({
    query: queryType,
    mutation: mutationType,
    types: [
      PerspectiveStateEnum,
      LinkStatusEnum,
      DecoratedPerspectiveDiffType,
      LinkExpressionUpdatedType,
      ExceptionInfoType,
      PerspectiveExpressionType
    ]
  })
}
