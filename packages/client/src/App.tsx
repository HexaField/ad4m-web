import { createSignal, createEffect, onCleanup, Show, Switch, Match } from 'solid-js'
import { bootstrapExecutor } from './executor/bootstrap'
import { TabCoordinator, ProxyGraphQLEngine, getTabId } from './coordination'
import type { TabRole } from './coordination'
import type { ExecutorState } from './executor/bootstrap'
import ExecutorUI from './components/ExecutorUI'

export default function App() {
  const [role, setRole] = createSignal<TabRole>('electing')
  const [executorState, setExecutorState] = createSignal<ExecutorState | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)

  const coordinator = new TabCoordinator(getTabId())

  const boot = async () => {
    try {
      setLoading(true)
      setError(null)
      const state = await bootstrapExecutor()
      coordinator.setGraphQLEngine(state.graphql)
      setExecutorState(state)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  coordinator.onRoleChange((newRole) => {
    setRole(newRole)
    if (newRole === 'leader' && !executorState()) {
      boot()
    } else if (newRole === 'follower') {
      // Use proxy engine — create a lightweight state
      const proxy = new ProxyGraphQLEngine(coordinator)
      setExecutorState({ executor: null as any, graphql: proxy as any })
      setLoading(false)
    }
  })

  coordinator.start()

  onCleanup(() => coordinator.destroy())

  return (
    <div class="min-h-screen bg-gray-900 p-8 text-white">
      <div class="mb-8 flex items-center gap-4">
        <h1 class="text-3xl font-bold">⬡ ad4m-web</h1>
        <RoleBadge role={role()} />
      </div>

      <Show when={error()}>
        <div class="mb-4 rounded border border-red-500 bg-red-900 p-4">
          <p class="font-bold">Boot Error</p>
          <p class="text-sm">{error()}</p>
        </div>
      </Show>

      <Show
        when={executorState() && !loading()}
        fallback={
          <div class="flex items-center gap-3">
            <div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <p class="text-gray-400">{role() === 'electing' ? 'Electing leader...' : 'Booting executor...'}</p>
          </div>
        }
      >
        {(() => {
          const state = executorState()!
          return <ExecutorUI executor={state.executor} graphql={state.graphql} />
        })()}
      </Show>
    </div>
  )
}

function RoleBadge(props: { role: TabRole }) {
  return (
    <Switch>
      <Match when={props.role === 'leader'}>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-green-900/50 px-3 py-1 text-xs font-medium text-green-300">
          <span class="h-2 w-2 rounded-full bg-green-400" />
          Leader
        </span>
      </Match>
      <Match when={props.role === 'follower'}>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-blue-900/50 px-3 py-1 text-xs font-medium text-blue-300">
          <span class="h-2 w-2 rounded-full bg-blue-400" />
          Follower
        </span>
      </Match>
      <Match when={props.role === 'electing'}>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-yellow-900/50 px-3 py-1 text-xs font-medium text-yellow-300">
          <span class="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
          Electing...
        </span>
      </Match>
    </Switch>
  )
}
