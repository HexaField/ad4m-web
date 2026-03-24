import { createSignal, onCleanup, Show } from 'solid-js'
import { bootstrapExecutor } from '@ad4m-web/executor-browser'
import type { ExecutorState } from '@ad4m-web/executor-browser'
import ExecutorUI from './components/ExecutorUI'

export default function App() {
  const [executorState, setExecutorState] = createSignal<ExecutorState | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)

  const boot = async () => {
    try {
      setLoading(true)
      setError(null)
      const state = await bootstrapExecutor()
      setExecutorState(state)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  boot()

  return (
    <div class="min-h-screen bg-gray-900 p-8 text-white">
      <div class="mb-8 flex items-center gap-4">
        <h1 class="text-3xl font-bold">⬡ ad4m-web</h1>
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
            <p class="text-gray-400">Booting executor...</p>
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
