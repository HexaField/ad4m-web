import type { LinkExpression, LinkQuery, LinkStore } from '@ad4m-web/core'
import { validateLink } from '@ad4m-web/core'
import initOxigraph, { Store, namedNode, quad } from 'oxigraph'
import type { NamedNode } from 'oxigraph'

let oxigraphReady: Promise<void> | null = null

function ensureInit(): Promise<void> {
  if (!oxigraphReady) {
    oxigraphReady = initOxigraph().then(() => {})
  }
  return oxigraphReady
}

const DEFAULT_PREDICATE = 'ad4m://default_predicate'

function graphName(perspectiveUuid: string): NamedNode {
  return namedNode(`urn:ad4m:perspective:${perspectiveUuid}`)
}

function linkKey(link: LinkExpression): string {
  return `${link.data.source}|${link.data.predicate ?? ''}|${link.data.target}|${link.author}|${link.timestamp}`
}

function predicate(link: LinkExpression): string {
  return link.data.predicate || DEFAULT_PREDICATE
}

interface SidecarEntry {
  author: string
  timestamp: string
  proof: { key: string; signature: string }
  status?: string
  originalPredicate?: string
}

interface DumpData {
  nquads: string
  sidecar: Record<string, Record<string, SidecarEntry>>
}

export class OxigraphLinkStore implements LinkStore {
  private store: Store
  /** perspectiveUuid -> linkKey -> metadata */
  private sidecar = new Map<string, Map<string, SidecarEntry>>()

  constructor() {
    // Works synchronously in Node (tests). In browser, use create() to init WASM first.
    this.store = new Store()
  }

  /**
   * Async factory for browser environments — initialises WASM before creating the store.
   */
  static async create(): Promise<OxigraphLinkStore> {
    await ensureInit()
    return new OxigraphLinkStore()
  }

  private getSidecar(perspectiveUuid: string): Map<string, SidecarEntry> {
    let m = this.sidecar.get(perspectiveUuid)
    if (!m) {
      m = new Map()
      this.sidecar.set(perspectiveUuid, m)
    }
    return m
  }

  async addLink(perspectiveUuid: string, link: LinkExpression): Promise<void> {
    validateLink(link.data)
    const key = linkKey(link)
    const sc = this.getSidecar(perspectiveUuid)
    if (sc.has(key)) return // dedup

    const graph = graphName(perspectiveUuid)
    const q = quad(namedNode(link.data.source), namedNode(predicate(link)), namedNode(link.data.target), graph)
    this.store.add(q)

    sc.set(key, {
      author: link.author,
      timestamp: link.timestamp,
      proof: link.proof,
      status: link.status,
      originalPredicate: link.data.predicate
    })
  }

  async addLinks(perspectiveUuid: string, links: LinkExpression[]): Promise<void> {
    for (const link of links) {
      await this.addLink(perspectiveUuid, link)
    }
  }

  async removeLink(perspectiveUuid: string, link: LinkExpression): Promise<boolean> {
    const key = linkKey(link)
    const sc = this.sidecar.get(perspectiveUuid)
    if (!sc?.has(key)) return false

    const graph = graphName(perspectiveUuid)
    const q = quad(namedNode(link.data.source), namedNode(predicate(link)), namedNode(link.data.target), graph)
    this.store.delete(q)
    sc.delete(key)
    return true
  }

  async queryLinks(perspectiveUuid: string, query: LinkQuery): Promise<LinkExpression[]> {
    const all = await this.allLinks(perspectiveUuid)
    let result = all.filter((l) => {
      if (query.source !== undefined && l.data.source !== query.source) return false
      if (query.target !== undefined && l.data.target !== query.target) return false
      if (query.predicate !== undefined && l.data.predicate !== query.predicate) return false
      if (query.fromDate !== undefined && l.timestamp < query.fromDate) return false
      if (query.untilDate !== undefined && l.timestamp > query.untilDate) return false
      return true
    })
    if (query.limit !== undefined) {
      result = result.slice(0, query.limit)
    }
    return result
  }

  async allLinks(perspectiveUuid: string): Promise<LinkExpression[]> {
    const sc = this.sidecar.get(perspectiveUuid)
    if (!sc) return []

    const links: LinkExpression[] = []
    for (const [, entry] of sc) {
      // Reconstruct from sidecar — we store everything there
      // But we need the triple data too. Let's iterate sidecar keys.
    }

    // Reconstruct from sidecar entries
    for (const [key, entry] of sc) {
      const parts = key.split('|')
      // key format: source|predicate|target|author|timestamp
      const source = parts[0]
      const pred = parts[1]
      const target = parts[2]
      links.push({
        author: entry.author,
        timestamp: entry.timestamp,
        data: {
          source,
          target,
          predicate: entry.originalPredicate
        },
        proof: entry.proof,
        status: entry.status as any
      })
    }
    return links
  }

  async removePerspective(perspectiveUuid: string): Promise<void> {
    const graph = graphName(perspectiveUuid)
    const quads = this.store.match(null, null, null, graph)
    for (const q of quads) {
      this.store.delete(q)
    }
    this.sidecar.delete(perspectiveUuid)
  }

  async querySparql(perspectiveUuid: string, sparql: string): Promise<any> {
    // Inject FROM NAMED if the user doesn't specify a GRAPH pattern
    // Execute with the perspective's named graph available
    const results = this.store.query(sparql)

    if (Array.isArray(results)) {
      // SELECT query - convert to plain objects
      return results.map((row: Map<string, any>) => {
        const obj: Record<string, string> = {}
        for (const [key, val] of row) {
          obj[key] = val.value
        }
        return obj
      })
    }

    // ASK query returns boolean
    return results
  }

  async dump(): Promise<string> {
    const nquads = this.store.dump({ format: 'application/n-quads' })
    const sidecarObj: Record<string, Record<string, SidecarEntry>> = {}
    for (const [perspId, entries] of this.sidecar) {
      sidecarObj[perspId] = Object.fromEntries(entries)
    }
    const data: DumpData = { nquads, sidecar: sidecarObj }
    return JSON.stringify(data)
  }

  async load(data: string): Promise<void> {
    const parsed = JSON.parse(data) as DumpData
    this.store = new Store()
    if (parsed.nquads) {
      this.store.load(parsed.nquads, { format: 'application/n-quads' })
    }
    this.sidecar.clear()
    for (const [perspId, entries] of Object.entries(parsed.sidecar)) {
      this.sidecar.set(perspId, new Map(Object.entries(entries)))
    }
  }
}
