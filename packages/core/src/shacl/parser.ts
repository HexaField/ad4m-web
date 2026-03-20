import type { LinkExpression } from '../linkstore/types'
import type { SubjectClass, PropertyShape, PerspectiveAction } from './types'
import { parseLiteral } from './literals'

function parseLiteralValue(uri: string): any {
  const parsed = parseLiteral(uri)
  return parsed ? parsed.value : uri
}

function parseJsonActions(uri: string): PerspectiveAction[] | undefined {
  const parsed = parseLiteral(uri)
  if (!parsed) return undefined
  const val = parsed.type === 'json' ? parsed.value : JSON.parse(parsed.value)
  return Array.isArray(val) ? val : [val]
}

function lastSegment(uri: string): string {
  const parts = uri.split(/[/:#]/)
  return parts[parts.length - 1] || uri
}

export function parseShapes(links: LinkExpression[]): SubjectClass[] {
  // Find all NodeShapes
  const nodeShapes = new Set<string>()
  const propShapes = new Set<string>()

  for (const l of links) {
    if (l.data.predicate === 'rdf://type' && l.data.target === 'sh://NodeShape') {
      nodeShapes.add(l.data.source)
    }
    if (l.data.predicate === 'rdf://type' && l.data.target === 'sh://PropertyShape') {
      propShapes.add(l.data.source)
    }
  }

  const classes: SubjectClass[] = []

  for (const shapeUri of nodeShapes) {
    let name = lastSegment(shapeUri)
    let namespace = shapeUri
    const properties: PropertyShape[] = []
    let constructor: PerspectiveAction[] | undefined
    let destructor: PerspectiveAction[] | undefined

    // Collect shape-level attributes
    const propShapeUris: string[] = []
    for (const l of links) {
      if (l.data.source !== shapeUri) continue
      switch (l.data.predicate) {
        case 'sh://targetClass':
          namespace = l.data.target!
          name = lastSegment(l.data.target!)
          break
        case 'sh://property':
          propShapeUris.push(l.data.target!)
          break
        case 'ad4m://constructor':
          constructor = parseJsonActions(l.data.target!)
          break
        case 'ad4m://destructor':
          destructor = parseJsonActions(l.data.target!)
          break
      }
    }

    // Parse each property shape
    for (const pUri of propShapeUris) {
      if (!propShapes.has(pUri)) continue
      const prop: PropertyShape = { name: lastSegment(pUri), path: '' }

      for (const l of links) {
        if (l.data.source !== pUri) continue
        switch (l.data.predicate) {
          case 'sh://path':
            prop.path = l.data.target!
            prop.name = lastSegment(l.data.target!)
            break
          case 'sh://datatype':
            prop.datatype = l.data.target!
            break
          case 'sh://maxCount': {
            const v = parseLiteralValue(l.data.target!)
            prop.maxCount = typeof v === 'number' ? v : parseInt(v, 10)
            break
          }
          case 'sh://minCount': {
            const v = parseLiteralValue(l.data.target!)
            prop.minCount = typeof v === 'number' ? v : parseInt(v, 10)
            break
          }
          case 'sh://class':
            prop.classRef = l.data.target!
            break
          case 'ad4m://initial':
            prop.initial = l.data.target!
            break
          case 'ad4m://resolveLanguage':
            prop.resolveLanguage = l.data.target!
            break
          case 'ad4m://writable': {
            const v = parseLiteralValue(l.data.target!)
            prop.writable = v === true || v === 'true'
            break
          }
          case 'ad4m://setter':
            prop.setter = parseJsonActions(l.data.target!)
            break
          case 'ad4m://adder':
            prop.adder = parseJsonActions(l.data.target!)
            break
          case 'ad4m://remover':
            prop.remover = parseJsonActions(l.data.target!)
            break
        }
      }

      properties.push(prop)
    }

    classes.push({ name, namespace, properties, constructor, destructor })
  }

  return classes
}
