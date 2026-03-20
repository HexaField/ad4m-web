import type { LinkStore, LinkExpression } from '../linkstore/types'
import type { SubjectClass, PerspectiveAction } from './types'
import { parseShapes } from './parser'
import { parseLiteral } from './literals'

function makeLink(source: string, predicate: string, target: string, local?: boolean): LinkExpression {
  return {
    author: '',
    timestamp: new Date().toISOString(),
    data: { source, predicate, target },
    proof: { key: '', signature: '' },
    status: local ? 'local' : undefined
  }
}

export class ShaclEngine {
  private linkStore: LinkStore
  private shapesCache = new Map<string, SubjectClass[]>()

  constructor(linkStore: LinkStore) {
    this.linkStore = linkStore
  }

  /**
   * Directly register a SubjectClass shape without going through link-based SDNA.
   * Used by the Ad4mModel system to register shapes programmatically.
   */
  registerShape(perspectiveUuid: string, shape: SubjectClass): void {
    let shapes = this.shapesCache.get(perspectiveUuid)
    if (!shapes) {
      shapes = []
      this.shapesCache.set(perspectiveUuid, shapes)
    }
    // Replace existing shape with same name
    const idx = shapes.findIndex((s) => s.name === shape.name)
    if (idx >= 0) {
      shapes[idx] = shape
    } else {
      shapes.push(shape)
    }
  }

  async loadShapes(perspectiveUuid: string): Promise<SubjectClass[]> {
    const allLinks = await this.linkStore.allLinks(perspectiveUuid)
    const shapes = parseShapes(allLinks)
    this.shapesCache.set(perspectiveUuid, shapes)
    return shapes
  }

  private async getShapes(perspectiveUuid: string): Promise<SubjectClass[]> {
    return this.shapesCache.get(perspectiveUuid) ?? (await this.loadShapes(perspectiveUuid))
  }

  private async getClass(perspectiveUuid: string, className: string): Promise<SubjectClass> {
    const shapes = await this.getShapes(perspectiveUuid)
    const cls = shapes.find((s) => s.name === className)
    if (!cls) throw new Error(`Subject class '${className}' not found`)
    return cls
  }

  async isInstance(perspectiveUuid: string, address: string, className: string): Promise<boolean> {
    const cls = await this.getClass(perspectiveUuid, className)
    const requiredProps = cls.properties.filter((p) => p.minCount && p.minCount >= 1)

    for (const prop of requiredProps) {
      const links = await this.linkStore.queryLinks(perspectiveUuid, {
        source: address,
        predicate: prop.path
      })
      if (links.length === 0) return false
    }
    return true
  }

  async queryInstances(perspectiveUuid: string, className: string): Promise<string[]> {
    const allLinks = await this.linkStore.allLinks(perspectiveUuid)
    const sources = new Set<string>()
    for (const l of allLinks) {
      sources.add(l.data.source)
    }

    const results: string[] = []
    for (const addr of sources) {
      if (await this.isInstance(perspectiveUuid, addr, className)) {
        results.push(addr)
      }
    }
    return results
  }

  async getInstanceData(perspectiveUuid: string, className: string, address: string): Promise<Record<string, any>> {
    const cls = await this.getClass(perspectiveUuid, className)
    const data: Record<string, any> = {}

    for (const prop of cls.properties) {
      const links = await this.linkStore.queryLinks(perspectiveUuid, {
        source: address,
        predicate: prop.path
      })

      if (prop.maxCount === 1) {
        // Scalar
        if (links.length > 0) {
          const parsed = parseLiteral(links[0].data.target)
          data[prop.name] = parsed ? parsed.value : links[0].data.target
        }
      } else {
        // Collection
        data[prop.name] = links.map((l) => {
          const parsed = parseLiteral(l.data.target)
          return parsed ? parsed.value : l.data.target
        })
      }
    }

    return data
  }

  async executeAction(
    perspectiveUuid: string,
    actions: PerspectiveAction[],
    baseUri: string,
    value?: string
  ): Promise<LinkExpression[]> {
    const created: LinkExpression[] = []

    for (const action of actions) {
      const source = action.source === 'this' ? baseUri : action.source
      const predicate = action.predicate
      const target = action.target === 'value' ? (value ?? '') : action.target

      switch (action.action) {
        case 'addLink': {
          const link = makeLink(source, predicate, target, action.local)
          await this.linkStore.addLink(perspectiveUuid, link)
          created.push(link)
          break
        }
        case 'removeLink': {
          if (target === '*' || action.target === '*') {
            // Remove all matching source+predicate
            const matches = await this.linkStore.queryLinks(perspectiveUuid, { source, predicate })
            for (const m of matches) {
              await this.linkStore.removeLink(perspectiveUuid, m)
            }
          } else {
            const matches = await this.linkStore.queryLinks(perspectiveUuid, { source, predicate, target })
            for (const m of matches) {
              await this.linkStore.removeLink(perspectiveUuid, m)
            }
          }
          break
        }
        case 'setSingleTarget': {
          // Remove existing, add new
          const existing = await this.linkStore.queryLinks(perspectiveUuid, { source, predicate })
          for (const m of existing) {
            await this.linkStore.removeLink(perspectiveUuid, m)
          }
          const link = makeLink(source, predicate, target, action.local)
          await this.linkStore.addLink(perspectiveUuid, link)
          created.push(link)
          break
        }
        case 'collectionSetter': {
          const existing = await this.linkStore.queryLinks(perspectiveUuid, { source, predicate })
          for (const m of existing) {
            await this.linkStore.removeLink(perspectiveUuid, m)
          }
          const link = makeLink(source, predicate, target, action.local)
          await this.linkStore.addLink(perspectiveUuid, link)
          created.push(link)
          break
        }
      }
    }

    return created
  }

  async createInstance(
    perspectiveUuid: string,
    className: string,
    address: string,
    initialValues?: Record<string, string>
  ): Promise<LinkExpression[]> {
    const cls = await this.getClass(perspectiveUuid, className)
    const created: LinkExpression[] = []

    // Run constructor
    if (cls.constructor) {
      const links = await this.executeAction(perspectiveUuid, cls.constructor, address)
      created.push(...links)
    }

    // Apply initial values for properties with defaults not already set
    for (const prop of cls.properties) {
      const val = initialValues?.[prop.name] ?? prop.initial
      if (val === undefined) continue

      // Check if constructor already set this property
      const existing = await this.linkStore.queryLinks(perspectiveUuid, {
        source: address,
        predicate: prop.path
      })
      if (existing.length > 0) continue

      const link = makeLink(address, prop.path, val)
      await this.linkStore.addLink(perspectiveUuid, link)
      created.push(link)
    }

    return created
  }

  async deleteInstance(perspectiveUuid: string, className: string, address: string): Promise<void> {
    const cls = await this.getClass(perspectiveUuid, className)
    if (cls.destructor) {
      await this.executeAction(perspectiveUuid, cls.destructor, address)
    }
  }
}
