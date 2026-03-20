import { createSignal, createResource, Show } from 'solid-js'
import { bootstrapExecutor } from './executor/bootstrap'
import ExecutorUI from './components/ExecutorUI'

export default function App() {
  const [executorState] = createResource(bootstrapExecutor)

  return (
    <div class="min-h-screen bg-gray-900 p-8 text-white">
      <h1 class="mb-8 text-3xl font-bold">⬡ ad4m-web</h1>

      <Show when={executorState.error}>
        <div class="mb-4 rounded border border-red-500 bg-red-900 p-4">
          <p class="font-bold">Boot Error</p>
          <p class="text-sm">{String(executorState.error)}</p>
        </div>
      </Show>

      <Show
        when={executorState()}
        fallback={
          <div class="flex items-center gap-3">
            <div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <p class="text-gray-400">Booting executor...</p>
          </div>
        }
      >
        {(state) => <ExecutorUI executor={state().executor} graphql={state().graphql} />}
      </Show>
    </div>
  )
}
