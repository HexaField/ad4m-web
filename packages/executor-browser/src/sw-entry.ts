/// <reference lib="webworker" />
import { bootstrapExecutor } from './bootstrap'
import type { GraphQLEngine } from '@ad4m-web/core'

declare const self: ServiceWorkerGlobalScope

const API_PATH = '/_ad4m/api'
let enginePromise: Promise<GraphQLEngine> | null = null

function getEngine(): Promise<GraphQLEngine> {
  if (!enginePromise) {
    enginePromise = bootstrapExecutor().then((state) => state.graphql)
  }
  return enginePromise
}

self.addEventListener('install', (event) => {
  // Pre-cache the executor bootstrap
  event.waitUntil(getEngine().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.pathname === API_PATH && event.request.method === 'POST') {
    event.respondWith(handleGraphQL(event.request))
  }
})

async function handleGraphQL(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { query: string; variables?: Record<string, unknown> }
    const engine = await getEngine()
    const result = await engine.execute(body.query, body.variables)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ errors: [{ message: String(err) }] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
