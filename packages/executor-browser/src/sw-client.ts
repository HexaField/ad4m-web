const API_PATH = '/_ad4m/api'

/**
 * Client that communicates with the executor via Service Worker fetch interception.
 * Falls back to a provided fallback client if the Service Worker isn't available.
 */
export class ServiceWorkerClient {
  private swReady: Promise<ServiceWorkerRegistration> | null = null
  private fallback: { execute: (query: string, variables?: Record<string, unknown>) => Promise<unknown> } | null

  constructor(
    swUrl: string,
    fallback?: { execute: (query: string, variables?: Record<string, unknown>) => Promise<unknown> }
  ) {
    this.fallback = fallback ?? null
    if ('serviceWorker' in navigator) {
      this.swReady = navigator.serviceWorker.register(swUrl, { type: 'module' }).catch(() => {
        this.swReady = null
        return null as unknown as ServiceWorkerRegistration
      })
    }
  }

  async execute(query: string, variables?: Record<string, unknown>): Promise<unknown> {
    if (this.swReady) {
      const reg = await this.swReady
      if (reg?.active) {
        const response = await fetch(API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables })
        })
        return response.json()
      }
    }

    if (this.fallback) {
      return this.fallback.execute(query, variables)
    }

    throw new Error('No executor available: Service Worker not active and no fallback provided')
  }
}
