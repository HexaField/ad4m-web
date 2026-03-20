import type { LinkExpression, LinkQuery, LinkStore } from './types'
import { validateLink } from './validation'

function linksMatch(a: LinkExpression, b: LinkExpression): boolean {
  return (
    a.data.source === b.data.source &&
    a.data.target === b.data.target &&
    a.data.predicate === b.data.predicate &&
    a.author === b.author &&
    a.timestamp === b.timestamp
  )
}

export class InMemoryLinkStore implements LinkStore {
  private store = new Map<string, LinkExpression[]>()

  private getLinks(perspectiveUuid: string): LinkExpression[] {
    let links = this.store.get(perspectiveUuid)
    if (!links) {
      links = []
      this.store.set(perspectiveUuid, links)
    }
    return links
  }

  async addLink(perspectiveUuid: string, link: LinkExpression): Promise<void> {
    validateLink(link.data)
    const links = this.getLinks(perspectiveUuid)
    if (!links.some((l) => linksMatch(l, link))) {
      links.push(link)
    }
  }

  async addLinks(perspectiveUuid: string, links: LinkExpression[]): Promise<void> {
    for (const link of links) {
      await this.addLink(perspectiveUuid, link)
    }
  }

  async removeLink(perspectiveUuid: string, link: LinkExpression): Promise<boolean> {
    const links = this.store.get(perspectiveUuid)
    if (!links) return false
    const idx = links.findIndex((l) => linksMatch(l, link))
    if (idx === -1) return false
    links.splice(idx, 1)
    return true
  }

  async queryLinks(perspectiveUuid: string, query: LinkQuery): Promise<LinkExpression[]> {
    const links = this.store.get(perspectiveUuid) ?? []
    let result = links.filter((l) => {
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
    return [...(this.store.get(perspectiveUuid) ?? [])]
  }

  async removePerspective(perspectiveUuid: string): Promise<void> {
    this.store.delete(perspectiveUuid)
  }

  async querySparql(_perspectiveUuid: string, _sparql: string): Promise<any> {
    throw new Error(
      'SPARQL queries require Oxigraph. Use queryLinks() for basic queries or install @ad4m-web/client with Oxigraph WASM.'
    )
  }

  async dump(): Promise<string> {
    const obj: Record<string, LinkExpression[]> = {}
    for (const [k, v] of this.store) {
      obj[k] = v
    }
    return JSON.stringify(obj)
  }

  async load(data: string): Promise<void> {
    const obj = JSON.parse(data) as Record<string, LinkExpression[]>
    this.store.clear()
    for (const [k, v] of Object.entries(obj)) {
      this.store.set(k, v)
    }
  }
}
