import { createSignal, For, Show } from 'solid-js'
import type { Executor, GraphQLEngine } from '@ad4m-web/core'

interface Props {
  executor: Executor
  graphql: GraphQLEngine
}

export default function ExecutorUI(props: Props) {
  return (
    <div class="space-y-8">
      <AgentPanel executor={props.executor} />
      <PerspectivesPanel executor={props.executor} />
      <GraphQLConsole graphql={props.graphql} />
    </div>
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
