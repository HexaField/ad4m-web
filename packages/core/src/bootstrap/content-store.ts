import type { ContentStore } from './types'

export class HttpContentStore implements ContentStore {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async get(address: string): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/${address}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`ContentStore GET failed: ${response.status}`)
    return response.text()
  }

  async put(content: string): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      body: content
    })
    if (!response.ok) throw new Error(`ContentStore PUT failed: ${response.status}`)
    return response.text()
  }
}

export class InMemoryContentStore implements ContentStore {
  private store = new Map<string, string>()

  async get(address: string): Promise<string | null> {
    return this.store.get(address) ?? null
  }

  async put(content: string): Promise<string> {
    const hash = await sha256hex(content)
    this.store.set(hash, content)
    return hash
  }
}

async function sha256hex(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
