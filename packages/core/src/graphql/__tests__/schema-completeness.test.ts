import { describe, it, expect } from 'vitest'
import { GraphQLSchema } from 'graphql'
import { createFullSchema, PubSub } from '../index'
import { AgentService } from '../../agent/agent'
import { InMemoryLinkStore } from '../../linkstore/store'
import { ShaclEngine } from '../../shacl/engine'
import { PerspectiveManager } from '../../perspective/manager'
import { Executor } from '../../bootstrap/executor'
import { EntanglementService } from '../../agent/entanglement'
import { FriendService } from '../../agent/friends'
import { RuntimeService } from '../../runtime/service'

function createTestSchema(): GraphQLSchema {
  const crypto = {
    generateKeyPair: async () => ({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(64) }),
    sign: async (_k: Uint8Array, _m: Uint8Array) => new Uint8Array(64),
    verify: async () => true,
    sha256: async (d: Uint8Array) => d
  }
  const walletStore = {
    exists: async () => false,
    load: async () => ({ mainKey: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(64) } }),
    save: async () => {},
    destroy: async () => {}
  }
  const agentService = new AgentService(crypto, walletStore)
  const linkStore = new InMemoryLinkStore()
  const shaclEngine = new ShaclEngine()
  const perspectiveManager = new PerspectiveManager(linkStore, shaclEngine, agentService)
  const languageManager = {
    applyTemplateAndPublish: async () => ({ address: '', meta: { name: '' } }),
    getLanguage: () => null,
    getAllInstalled: () => [],
    install: async () => {},
    uninstall: async () => {}
  } as any
  const pubsub = new PubSub()

  const executor = new Executor({
    agentService,
    perspectiveManager,
    languageManager,
    shaclEngine,
    linkStore,
    bootstrapConfig: { languages: {} },
    pubsub,
    entanglementService: new EntanglementService(),
    friendService: new FriendService(),
    runtimeService: new RuntimeService()
  })

  return createFullSchema(executor, pubsub)
}

describe('Schema completeness', () => {
  const schema = createTestSchema()

  const expectedQueries = [
    'agent',
    'agentByDID',
    'agentStatus',
    'agentIsLocked',
    'agentGetEntanglementProofs',
    'agentGetApps',
    'perspectives',
    'perspective',
    'perspectiveQueryLinks',
    'perspectiveSnapshot',
    'perspectiveQuerySurreal',
    'neighbourhoodOtherAgents',
    'neighbourhoodOnlineAgents',
    'neighbourhoodHasTelepresenceAdapter',
    'runtimeInfo',
    'runtimeFriends',
    'runtimeFriendStatus',
    'runtimeKnownLinkLanguageTemplates',
    'runtimeHcAgentInfos',
    'runtimeGetNetworkMetrics',
    'runtimeReadiness',
    'runtimeTlsDomain',
    'runtimeHostingUserInfo',
    'getTrustedAgents'
  ]

  const expectedMutations = [
    'agentGenerate',
    'agentLock',
    'agentUnlock',
    'agentUpdatePublicPerspective',
    'agentUpdateDirectMessageLanguage',
    'agentAddEntanglementProofs',
    'agentDeleteEntanglementProofs',
    'agentEntanglementProofPreFlight',
    'agentSignMessage',
    'agentPermitCapability',
    'agentRequestCapability',
    'agentGenerateJwt',
    'agentRevokeToken',
    'perspectiveAdd',
    'perspectiveUpdate',
    'perspectiveRemove',
    'perspectiveAddLink',
    'perspectiveAddLinks',
    'perspectiveRemoveLink',
    'perspectiveUpdateLink',
    'perspectiveLinkMutations',
    'perspectiveAddSdna',
    'neighbourhoodJoinFromUrl',
    'neighbourhoodPublishFromPerspective',
    'neighbourhoodSetOnlineStatus',
    'neighbourhoodSendSignal',
    'neighbourhoodSendBroadcast',
    'languageApplyTemplateAndPublish',
    'addTrustedAgents',
    'removeTrustedAgents',
    'runtimeAddFriend',
    'runtimeRemoveFriend',
    'runtimeAddKnownLinkLanguageTemplate',
    'runtimeRemoveKnownLinkLanguageTemplate',
    'runtimeSetHotWalletAddress',
    'runtimeRequestPayment',
    'runtimeSetUserCredits',
    'runtimeSetUserFreeAccess'
  ]

  const expectedSubscriptions = [
    'agentStatusChanged',
    'perspectiveAdded',
    'perspectiveUpdated',
    'perspectiveRemoved',
    'perspectiveLinkAdded',
    'perspectiveLinkRemoved',
    'perspectiveLinkUpdated',
    'perspectiveSyncStateChange',
    'neighbourhoodSignal',
    'exceptionOccurred',
    'runtimeMessageReceived'
  ]

  it('has all required queries', () => {
    const queryFields = Object.keys(schema.getQueryType()!.getFields())
    for (const q of expectedQueries) {
      expect(queryFields, `Missing query: ${q}`).toContain(q)
    }
  })

  it('has all required mutations', () => {
    const mutationFields = Object.keys(schema.getMutationType()!.getFields())
    for (const m of expectedMutations) {
      expect(mutationFields, `Missing mutation: ${m}`).toContain(m)
    }
  })

  it('has all required subscriptions', () => {
    const subscriptionFields = Object.keys(schema.getSubscriptionType()!.getFields())
    for (const s of expectedSubscriptions) {
      expect(subscriptionFields, `Missing subscription: ${s}`).toContain(s)
    }
  })

  it('has all required types', () => {
    const expectedTypes = [
      'EntanglementProof',
      'AgentSignature',
      'OnlineAgent',
      'ReadinessStatus',
      'HostingUserInfo',
      'PaymentRequestResult',
      'LinkExpressionUpdated',
      'ExceptionInfo',
      'PerspectiveExpression',
      'DecoratedPerspectiveDiff',
      'Agent',
      'PerspectiveState',
      'LinkStatus'
    ]
    for (const t of expectedTypes) {
      expect(schema.getType(t), `Missing type: ${t}`).toBeDefined()
    }
  })
})
