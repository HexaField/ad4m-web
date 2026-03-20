import { createSignal, For, Show } from 'solid-js'
import type { Executor, GraphQLEngine } from '@ad4m-web/core'
import {
  HolochainConnectionState,
  SharedLinkStore,
  createSharedLinkLanguage,
  InMemoryContentStore,
  NeighbourhoodManager,
  createExecutor
} from '@ad4m-web/core'
import { WebSocketHolochainConductor } from '../holochain/ws-conductor'

interface Props {
  executor: Executor
  graphql: GraphQLEngine
}

export default function ExecutorUI(props: Props) {
  return (
    <div class="space-y-8">
      <AgentPanel executor={props.executor} />
      <LanguagesPanel executor={props.executor} />
      <HolochainPanel />
      <PerspectivesPanel executor={props.executor} />
      <NeighbourhoodSyncDemo />
      <GraphQLConsole graphql={props.graphql} />
    </div>
  )
}

const ECHO_LANGUAGE_BUNDLE = `
  module.exports = {
    create: function(context) {
      return {
        name: 'echo-language',
        expressionAdapter: {
          get: async function(address) {
            return { data: 'echo:' + address, author: context.agent.did, timestamp: new Date().toISOString(), proof: { key: '', signature: '' } };
          },
          putAdapter: {
            createPublic: async function(content) {
              return 'echo-' + JSON.stringify(content);
            }
          }
        },
        interactions: function() { return []; }
      };
    }
  };
`

function LanguagesPanel(props: { executor: Executor }) {
  const lm = () => props.executor.languageManager
  const [languages, setLanguages] = createSignal(lm().getAllInstalled())
  const [installAddr, setInstallAddr] = createSignal('')
  const [error, setError] = createSignal('')

  const refresh = () => setLanguages(lm().getAllInstalled())

  const loadDemo = async () => {
    try {
      setError('')
      const status = props.executor.agentService.getStatus()
      const ctx = {
        agent: { did: status.did || 'did:unknown', createSignedExpression: async (d: any) => d },
        signatures: { verify: async () => true },
        storageDirectory: '',
        customSettings: {},
        ad4mSignal: () => {}
      }
      lm().setLanguageContext(ctx as any)
      await lm().install(
        'demo-echo',
        { address: 'demo-echo', name: 'Echo Language (Demo)', author: 'system' },
        ECHO_LANGUAGE_BUNDLE
      )
      refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const capabilities = (address: string) => {
    const handle = lm().getLanguage(address)
    if (!handle) return []
    const caps: string[] = []
    if (handle.language.expressionAdapter) caps.push('expression')
    if (handle.language.linksAdapter) caps.push('linkSync')
    if (handle.language.telepresenceAdapter) caps.push('telepresence')
    if (handle.language.languageAdapter) caps.push('languageAdapter')
    if (handle.language.directMessageAdapter) caps.push('directMessage')
    return caps
  }

  return (
    <section class="rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold">Languages</h2>

      <Show when={error()}>
        <p class="mb-2 text-sm text-red-400">{error()}</p>
      </Show>

      <div class="mb-4 flex gap-2">
        <button onClick={loadDemo} class="rounded bg-purple-600 px-4 py-1.5 text-sm font-medium hover:bg-purple-500">
          Load Demo Language
        </button>
      </div>

      <Show when={languages().length === 0}>
        <p class="text-sm text-gray-500">No languages installed.</p>
      </Show>

      <div class="space-y-2">
        <For each={languages()}>
          {(meta) => (
            <div class="rounded border border-gray-700 px-3 py-2">
              <p class="text-sm font-medium">{meta.name}</p>
              <p class="font-mono text-xs text-gray-500">{meta.address}</p>
              <Show when={capabilities(meta.address).length > 0}>
                <div class="mt-1 flex gap-1">
                  <For each={capabilities(meta.address)}>
                    {(cap) => <span class="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">{cap}</span>}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </section>
  )
}

function HolochainPanel() {
  const [adminUrl, setAdminUrl] = createSignal('ws://localhost:4444')
  const [appUrl, setAppUrl] = createSignal('ws://localhost:8888')
  const [connState, setConnState] = createSignal<HolochainConnectionState>(HolochainConnectionState.Disconnected)
  const [error, setError] = createSignal('')
  const [conductor, setConductor] = createSignal<WebSocketHolochainConductor | null>(null)

  const stateColor = () => {
    switch (connState()) {
      case HolochainConnectionState.Connected:
        return 'text-green-400'
      case HolochainConnectionState.Connecting:
        return 'text-yellow-400'
      case HolochainConnectionState.Error:
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const connect = async () => {
    try {
      setError('')
      const c = new WebSocketHolochainConductor()
      c.onStateChange((s) => setConnState(s))
      await c.connect({ conductorAdminUrl: adminUrl(), conductorAppUrl: appUrl() })
      setConductor(c)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const disconnect = async () => {
    try {
      setError('')
      await conductor()?.disconnect()
      setConductor(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <section class="rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold">Holochain</h2>
      <p class="mb-2">
        Status: <span class={`font-mono font-bold ${stateColor()}`}>{connState()}</span>
      </p>

      <Show when={connState() === HolochainConnectionState.Connected}>
        <p class="mb-2 text-sm text-gray-400">Connected to {appUrl()}</p>
      </Show>

      <Show when={error()}>
        <p class="mb-2 text-sm text-red-400">{error()}</p>
      </Show>

      <div class="mt-3 space-y-2">
        <input
          placeholder="Admin URL"
          value={adminUrl()}
          onInput={(e) => setAdminUrl(e.currentTarget.value)}
          disabled={connState() === HolochainConnectionState.Connected}
          class="w-full rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="App URL"
          value={appUrl()}
          onInput={(e) => setAppUrl(e.currentTarget.value)}
          disabled={connState() === HolochainConnectionState.Connected}
          class="w-full rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm"
        />
        <div class="flex gap-2">
          <Show when={connState() !== HolochainConnectionState.Connected}>
            <button
              onClick={connect}
              disabled={connState() === HolochainConnectionState.Connecting}
              class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              Connect
            </button>
          </Show>
          <Show when={connState() === HolochainConnectionState.Connected}>
            <button
              onClick={disconnect}
              class="rounded bg-orange-600 px-4 py-1.5 text-sm font-medium hover:bg-orange-500"
            >
              Disconnect
            </button>
          </Show>
        </div>
      </div>
    </section>
  )
}

function AgentPanel(props: { executor: Executor }) {
  const agent = () => props.executor.agentService
  const [status, setStatus] = createSignal(agent().getStatus())
  const [passphrase, setPassphrase] = createSignal('')
  const [error, setError] = createSignal('')

  const refresh = () => setStatus(agent().getStatus())

  const generate = async () => {
    try {
      setError('')
      await agent().generate(passphrase())
      refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const lock = () => {
    try {
      setError('')
      agent().lock()
      refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const unlock = async () => {
    try {
      setError('')
      await agent().unlock(passphrase())
      refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const stateLabel = () => {
    const s = status()
    if (!s.isInitialized) return 'Uninitialized'
    return s.isUnlocked ? 'Unlocked' : 'Locked'
  }

  const stateColor = () => {
    const s = status()
    if (!s.isInitialized) return 'text-yellow-400'
    return s.isUnlocked ? 'text-green-400' : 'text-orange-400'
  }

  return (
    <section class="rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold">Agent</h2>
      <p class="mb-2">
        Status: <span class={`font-mono font-bold ${stateColor()}`}>{stateLabel()}</span>
      </p>

      <Show when={status().did}>
        <p class="mb-2 text-sm break-all text-gray-400">DID: {status().did}</p>
      </Show>

      <Show when={error()}>
        <p class="mb-2 text-sm text-red-400">{error()}</p>
      </Show>

      <div class="mt-3 flex gap-2">
        <input
          type="password"
          placeholder="Passphrase"
          value={passphrase()}
          onInput={(e) => setPassphrase(e.currentTarget.value)}
          class="flex-1 rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm"
        />
        <Show when={!status().isInitialized}>
          <button onClick={generate} class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500">
            Generate
          </button>
        </Show>
        <Show when={status().isInitialized && !status().isUnlocked}>
          <button onClick={unlock} class="rounded bg-green-600 px-4 py-1.5 text-sm font-medium hover:bg-green-500">
            Unlock
          </button>
        </Show>
        <Show when={status().isUnlocked}>
          <button onClick={lock} class="rounded bg-orange-600 px-4 py-1.5 text-sm font-medium hover:bg-orange-500">
            Lock
          </button>
        </Show>
      </div>
    </section>
  )
}

function PerspectivesPanel(props: { executor: Executor }) {
  const pm = () => props.executor.perspectiveManager
  const [perspectives, setPerspectives] = createSignal(pm().getAll())
  const [newName, setNewName] = createSignal('')

  const refresh = () => setPerspectives(pm().getAll())

  const addPerspective = () => {
    if (!newName().trim()) return
    pm().add(newName().trim())
    setNewName('')
    refresh()
  }

  const removePerspective = (uuid: string) => {
    pm().remove(uuid)
    refresh()
  }

  return (
    <section class="rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold">Perspectives</h2>

      <div class="mb-4 flex gap-2">
        <input
          placeholder="New perspective name"
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPerspective()}
          class="flex-1 rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm"
        />
        <button onClick={addPerspective} class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500">
          Add
        </button>
      </div>

      <Show when={perspectives().length === 0}>
        <p class="text-sm text-gray-500">No perspectives yet.</p>
      </Show>

      <div class="space-y-4">
        <For each={perspectives()}>
          {(p) => <PerspectiveCard executor={props.executor} handle={p} onRemove={() => removePerspective(p.uuid)} />}
        </For>
      </div>
    </section>
  )
}

function PerspectiveCard(props: { executor: Executor; handle: any; onRemove: () => void }) {
  const pm = () => props.executor.perspectiveManager
  const [source, setSource] = createSignal('')
  const [predicate, setPredicate] = createSignal('')
  const [target, setTarget] = createSignal('')
  const [links, setLinks] = createSignal<any[]>([])
  const [error, setError] = createSignal('')

  const uuid = () => props.handle.uuid

  const queryLinks = async () => {
    try {
      const result = await pm().queryLinks(uuid(), {})
      setLinks(result)
      setError('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  const addLink = async () => {
    if (!source().trim() || !target().trim()) return
    try {
      await pm().addLink(uuid(), {
        source: source(),
        target: target(),
        predicate: predicate() || undefined
      })
      setSource('')
      setPredicate('')
      setTarget('')
      await queryLinks()
      setError('')
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div class="rounded-lg border border-gray-700 p-4">
      <div class="mb-3 flex items-start justify-between">
        <div>
          <p class="font-medium">{props.handle.name || 'Unnamed'}</p>
          <p class="font-mono text-xs text-gray-500">{uuid()}</p>
          <p class="text-xs text-gray-500">State: {props.handle.state}</p>
        </div>
        <button onClick={props.onRemove} class="text-sm text-red-400 hover:text-red-300">
          Remove
        </button>
      </div>

      <Show when={error()}>
        <p class="mb-2 text-xs text-red-400">{error()}</p>
      </Show>

      <div class="mb-2 flex gap-1">
        <input
          placeholder="source"
          value={source()}
          onInput={(e) => setSource(e.currentTarget.value)}
          class="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs"
        />
        <input
          placeholder="predicate"
          value={predicate()}
          onInput={(e) => setPredicate(e.currentTarget.value)}
          class="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs"
        />
        <input
          placeholder="target"
          value={target()}
          onInput={(e) => setTarget(e.currentTarget.value)}
          class="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs"
        />
        <button onClick={addLink} class="rounded bg-green-700 px-3 py-1 text-xs hover:bg-green-600">
          Add
        </button>
      </div>

      <button onClick={queryLinks} class="mb-2 text-xs text-blue-400 hover:text-blue-300">
        Query Links
      </button>

      <Show when={links().length > 0}>
        <div class="mt-2 space-y-1">
          <For each={links()}>
            {(link) => (
              <div class="rounded bg-gray-900 px-2 py-1 font-mono text-xs">
                <span class="text-blue-300">{link.data.source}</span>
                {' → '}
                <span class="text-yellow-300">{link.data.predicate || '*'}</span>
                {' → '}
                <span class="text-green-300">{link.data.target}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

class InMemoryWalletStore {
  private data: string | null = null
  async load(): Promise<string | null> {
    return this.data
  }
  async save(data: string): Promise<void> {
    this.data = data
  }
  async clear(): Promise<void> {
    this.data = null
  }
}

function NeighbourhoodSyncDemo() {
  const [log, setLog] = createSignal<string[]>([])
  const [running, setRunning] = createSignal(false)
  const [agentALinks, setAgentALinks] = createSignal<any[]>([])
  const [agentBLinks, setAgentBLinks] = createSignal<any[]>([])

  const addLog = (msg: string) => setLog((prev) => [...prev, msg])

  const bootstrapConfig = {
    languages: {
      languageLanguageAddress: 'system-language-language',
      agentLanguageAddress: 'system-agent-language',
      neighbourhoodLanguageAddress: 'system-neighbourhood-language',
      perspectiveLanguageAddress: 'system-perspective-language'
    }
  }

  const runDemo = async () => {
    setRunning(true)
    setLog([])
    setAgentALinks([])
    setAgentBLinks([])

    try {
      const sharedStore = new SharedLinkStore()
      const contentStore = new InMemoryContentStore()

      // Create Agent A
      addLog('Creating Agent A...')
      const resultA = await createExecutor({ bootstrapConfig, walletStore: new InMemoryWalletStore() })
      const agentA = resultA.executor
      await agentA.agentService.generate('passA')
      const didA = agentA.agentService.getStatus().did!
      addLog(`Agent A DID: ${didA.slice(0, 24)}...`)

      // Install shared link language on A
      const linkLangA = createSharedLinkLanguage('demo-sync', sharedStore, didA)
      const ctxA = {
        agent: { did: didA, createSignedExpression: async (d: any) => d },
        signatures: { verify: async () => true },
        storageDirectory: '',
        customSettings: {},
        ad4mSignal: () => {}
      }
      const hostA = (agentA.languageManager as any).host
      await hostA.load('shared-link-lang', linkLangA, ctxA)
      ;(agentA.languageManager as any).metadata.set('shared-link-lang', {
        address: 'shared-link-lang',
        name: 'shared-link-language',
        author: 'demo'
      })

      // Agent A publishes neighbourhood
      addLog('Agent A publishing neighbourhood...')
      const perspA = agentA.perspectiveManager.add('Demo Shared Space')
      const nhManagerA = new NeighbourhoodManager(
        agentA.perspectiveManager,
        agentA.languageManager,
        contentStore,
        async (data) => ({ author: didA, data, proof: { key: '', signature: '' }, timestamp: new Date().toISOString() })
      )
      const nhUrl = await nhManagerA.publishFromPerspective(perspA.uuid, 'shared-link-lang', { links: [] })
      addLog(`Neighbourhood URL: ${nhUrl}`)

      // Agent A adds a link
      addLog('Agent A adding link...')
      await agentA.perspectiveManager.addLink(perspA.uuid, {
        source: 'ad4m://agentA',
        target: 'literal://string:Hello from A!',
        predicate: 'ad4m://message'
      })
      const aLinks1 = await agentA.perspectiveManager.queryLinks(perspA.uuid, {})
      setAgentALinks([...aLinks1])
      addLog(`Agent A has ${aLinks1.length} link(s)`)

      // Create Agent B
      addLog('Creating Agent B...')
      const resultB = await createExecutor({ bootstrapConfig, walletStore: new InMemoryWalletStore() })
      const agentB = resultB.executor
      await agentB.agentService.generate('passB')
      const didB = agentB.agentService.getStatus().did!
      addLog(`Agent B DID: ${didB.slice(0, 24)}...`)

      // Install shared link language on B (same store)
      const linkLangB = createSharedLinkLanguage('demo-sync', sharedStore, didB)
      const ctxB = {
        agent: { did: didB, createSignedExpression: async (d: any) => d },
        signatures: { verify: async () => true },
        storageDirectory: '',
        customSettings: {},
        ad4mSignal: () => {}
      }
      const hostB = (agentB.languageManager as any).host
      await hostB.load('shared-link-lang', linkLangB, ctxB)
      ;(agentB.languageManager as any).metadata.set('shared-link-lang', {
        address: 'shared-link-lang',
        name: 'shared-link-language',
        author: 'demo'
      })

      // Agent B joins
      addLog('Agent B joining neighbourhood...')
      const nhManagerB = new NeighbourhoodManager(
        agentB.perspectiveManager,
        agentB.languageManager,
        contentStore,
        async (data) => ({ author: didB, data, proof: { key: '', signature: '' }, timestamp: new Date().toISOString() })
      )
      const perspBHandle = await nhManagerB.joinFromUrl(nhUrl)
      addLog(`Agent B joined! Perspective: ${perspBHandle.uuid.slice(0, 8)}...`)

      // Agent B syncs
      addLog('Agent B syncing...')
      await agentB.perspectiveManager.syncPerspective(perspBHandle.uuid)
      const bLinks1 = await agentB.perspectiveManager.queryLinks(perspBHandle.uuid, {})
      setAgentBLinks([...bLinks1])
      addLog(`Agent B sees ${bLinks1.length} link(s) after sync`)

      // Agent B adds a link
      addLog('Agent B adding link...')
      await agentB.perspectiveManager.addLink(perspBHandle.uuid, {
        source: 'ad4m://agentB',
        target: 'literal://string:Hello from B!',
        predicate: 'ad4m://message'
      })
      const bLinks2 = await agentB.perspectiveManager.queryLinks(perspBHandle.uuid, {})
      setAgentBLinks([...bLinks2])

      // Agent A syncs
      addLog('Agent A syncing...')
      await agentA.perspectiveManager.syncPerspective(perspA.uuid)
      const aLinks2 = await agentA.perspectiveManager.queryLinks(perspA.uuid, {})
      setAgentALinks([...aLinks2])
      addLog(`Agent A sees ${aLinks2.length} link(s) after sync`)

      addLog('✅ Demo complete! Both agents share links.')
    } catch (e: any) {
      addLog(`❌ Error: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section class="rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold">🔗 Two-Agent Neighbourhood Sync Demo</h2>
      <p class="mb-4 text-sm text-gray-400">
        Creates two in-memory executors, publishes a neighbourhood from Agent A, Agent B joins, and both exchange links
        via a shared link language.
      </p>

      <button
        onClick={runDemo}
        disabled={running()}
        class="mb-4 rounded bg-teal-600 px-4 py-2 text-sm font-medium hover:bg-teal-500 disabled:opacity-50"
      >
        {running() ? 'Running...' : 'Run Two-Agent Sync Demo'}
      </button>

      <Show when={agentALinks().length > 0 || agentBLinks().length > 0}>
        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <h3 class="mb-2 text-sm font-semibold text-blue-400">Agent A Links ({agentALinks().length})</h3>
            <div class="space-y-1">
              <For each={agentALinks()}>
                {(link) => (
                  <div class="rounded bg-gray-900 px-2 py-1 font-mono text-xs">
                    <span class="text-blue-300">{link.data.source}</span>
                    {' → '}
                    <span class="text-green-300">{link.data.target}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-semibold text-purple-400">Agent B Links ({agentBLinks().length})</h3>
            <div class="space-y-1">
              <For each={agentBLinks()}>
                {(link) => (
                  <div class="rounded bg-gray-900 px-2 py-1 font-mono text-xs">
                    <span class="text-blue-300">{link.data.source}</span>
                    {' → '}
                    <span class="text-green-300">{link.data.target}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <Show when={log().length > 0}>
        <div class="rounded border border-gray-700 bg-gray-900 p-3">
          <h3 class="mb-2 text-xs font-semibold text-gray-400">Log</h3>
          <div class="space-y-0.5">
            <For each={log()}>{(line) => <p class="font-mono text-xs text-gray-300">{line}</p>}</For>
          </div>
        </div>
      </Show>
    </section>
  )
}

function GraphQLConsole(props: { graphql: GraphQLEngine }) {
  const [query, setQuery] = createSignal(`{
  agentStatus {
    isInitialized
    isUnlocked
    did
  }
}`)
  const [result, setResult] = createSignal('')

  const execute = async () => {
    try {
      const res = await props.graphql.execute(query())
      setResult(JSON.stringify(res, null, 2))
    } catch (e: any) {
      setResult(`Error: ${e.message}`)
    }
  }

  return (
    <section class="rounded-lg bg-gray-800 p-6">
      <h2 class="mb-4 text-xl font-semibold">GraphQL Console</h2>
      <textarea
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        class="mb-3 h-32 w-full rounded border border-gray-600 bg-gray-900 p-3 font-mono text-sm"
        spellcheck={false}
      />
      <button onClick={execute} class="mb-3 rounded bg-purple-600 px-4 py-1.5 text-sm font-medium hover:bg-purple-500">
        Execute
      </button>
      <Show when={result()}>
        <pre class="max-h-64 overflow-auto rounded border border-gray-700 bg-gray-900 p-3 font-mono text-xs">
          {result()}
        </pre>
      </Show>
    </section>
  )
}
