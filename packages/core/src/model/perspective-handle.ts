/**
 * PerspectiveHandle — lightweight abstraction over PerspectiveManager
 * that Ad4mModel uses for all perspective operations.
 *
 * This decouples models from the full manager, making them testable
 * and usable in different contexts (server, client, test).
 */

import type { Link } from '../agent/types'
import type { LinkExpression, LinkQuery } from '../linkstore/types'
import type { PerspectiveAction } from '../shacl/types'
import type { SPARQLBinding } from './hydration'
import type { PerspectiveManager } from '../perspective/manager'
import type { ShaclEngine } from '../shacl/engine'
import { buildSHACLShape } from './shacl-gen'
import { getPropertiesMetadata, getRelationsMetadata, getModelMetadata } from './decorators'

export interface ModelPerspectiveHandle {
  uuid: string

  // Link operations
  addLink(link: Link): Promise<LinkExpression>
  addLinks(links: Link[]): Promise<LinkExpression[]>
  removeLink(link: LinkExpression): Promise<boolean>
  queryLinks(query: LinkQuery): Promise<LinkExpression[]>
  allLinks(): Promise<LinkExpression[]>

  // SPARQL query (optional — not all backends support it)
  querySPARQL?(query: string): Promise<SPARQLBinding[]>

  // Subject class / SDNA
  ensureSDNASubjectClass(modelClass: Function): Promise<void>

  // Execute SHACL actions
  executeAction(actions: PerspectiveAction[], baseUri: string, value?: string): Promise<LinkExpression[]>

  // Create instance via SHACL engine
  createInstance(className: string, baseUri: string, initialValues?: Record<string, string>): Promise<LinkExpression[]>

  // Delete instance via SHACL engine
  deleteInstance(className: string, baseUri: string): Promise<void>
}

/**
 * Create a ModelPerspectiveHandle from a PerspectiveManager + ShaclEngine.
 */
export function createPerspectiveHandle(
  manager: PerspectiveManager,
  shaclEngine: ShaclEngine,
  uuid: string
): ModelPerspectiveHandle {
  const registeredClasses = new Set<string>()

  return {
    uuid,

    addLink(link: Link): Promise<LinkExpression> {
      return manager.addLink(uuid, link)
    },

    addLinks(links: Link[]): Promise<LinkExpression[]> {
      return manager.addLinks(uuid, links)
    },

    removeLink(link: LinkExpression): Promise<boolean> {
      return manager.removeLink(uuid, link)
    },

    queryLinks(query: LinkQuery): Promise<LinkExpression[]> {
      return manager.queryLinks(uuid, query)
    },

    async allLinks(): Promise<LinkExpression[]> {
      const snapshot = await manager.snapshot(uuid)
      return snapshot.links
    },

    async ensureSDNASubjectClass(modelClass: Function): Promise<void> {
      const meta = getModelMetadata(modelClass as Function & { className?: string })
      if (registeredClasses.has(meta.className)) return
      registeredClasses.add(meta.className)

      // Build the SHACL shape and register directly with the engine
      const properties = getPropertiesMetadata(modelClass)
      const relations = getRelationsMetadata(modelClass)
      const shape = buildSHACLShape(meta.className, properties, relations)
      shaclEngine.registerShape(uuid, shape)
    },

    executeAction(actions: PerspectiveAction[], baseUri: string, value?: string): Promise<LinkExpression[]> {
      return shaclEngine.executeAction(uuid, actions, baseUri, value)
    },

    createInstance(
      className: string,
      baseUri: string,
      initialValues?: Record<string, string>
    ): Promise<LinkExpression[]> {
      return shaclEngine.createInstance(uuid, className, baseUri, initialValues)
    },

    deleteInstance(className: string, baseUri: string): Promise<void> {
      return shaclEngine.deleteInstance(uuid, className, baseUri)
    }
  }
}
