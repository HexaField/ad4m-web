import type { LinkExpression } from '../../linkstore/types'

function link(source: string, predicate: string, target: string): LinkExpression {
  return {
    author: 'did:test',
    timestamp: '2026-01-01T00:00:00.000Z',
    data: { source, predicate, target },
    proof: { key: '', signature: '' }
  }
}

/**
 * Build SHACL links for a Message class with:
 * - body (string, required, scalar, writable)
 * - author (string, required, scalar)
 * - timestamp (string, required, scalar)
 * - reactions (string, collection)
 */
export function buildMessageShapeLinks(): LinkExpression[] {
  const shape = 'shape://Message'
  const bodyProp = 'prop://body'
  const authorProp = 'prop://author'
  const timestampProp = 'prop://timestamp'
  const reactionsProp = 'prop://reactions'

  const constructorActions = JSON.stringify([
    { action: 'addLink', source: 'this', predicate: 'rdf://type', target: 'ad4m://Message' }
  ])
  const destructorActions = JSON.stringify([
    { action: 'removeLink', source: 'this', predicate: 'rdf://type', target: '*' },
    { action: 'removeLink', source: 'this', predicate: 'ad4m://body', target: '*' },
    { action: 'removeLink', source: 'this', predicate: 'ad4m://author', target: '*' },
    { action: 'removeLink', source: 'this', predicate: 'ad4m://timestamp', target: '*' },
    { action: 'removeLink', source: 'this', predicate: 'ad4m://reactions', target: '*' }
  ])

  const setterActions = JSON.stringify([
    { action: 'setSingleTarget', source: 'this', predicate: 'ad4m://body', target: 'value' }
  ])
  const adderActions = JSON.stringify([
    { action: 'addLink', source: 'this', predicate: 'ad4m://reactions', target: 'value' }
  ])
  const removerActions = JSON.stringify([
    { action: 'removeLink', source: 'this', predicate: 'ad4m://reactions', target: 'value' }
  ])

  return [
    // NodeShape
    link(shape, 'rdf://type', 'sh://NodeShape'),
    link(shape, 'sh://targetClass', 'ad4m://Message'),
    link(shape, 'sh://property', bodyProp),
    link(shape, 'sh://property', authorProp),
    link(shape, 'sh://property', timestampProp),
    link(shape, 'sh://property', reactionsProp),
    link(shape, 'ad4m://constructor', `literal://string:${constructorActions}`),
    link(shape, 'ad4m://destructor', `literal://string:${destructorActions}`),

    // body property
    link(bodyProp, 'rdf://type', 'sh://PropertyShape'),
    link(bodyProp, 'sh://path', 'ad4m://body'),
    link(bodyProp, 'sh://datatype', 'xsd://string'),
    link(bodyProp, 'sh://maxCount', 'literal://number:1'),
    link(bodyProp, 'sh://minCount', 'literal://number:1'),
    link(bodyProp, 'ad4m://writable', 'literal://boolean:true'),
    link(bodyProp, 'ad4m://setter', `literal://string:${setterActions}`),

    // author property
    link(authorProp, 'rdf://type', 'sh://PropertyShape'),
    link(authorProp, 'sh://path', 'ad4m://author'),
    link(authorProp, 'sh://datatype', 'xsd://string'),
    link(authorProp, 'sh://maxCount', 'literal://number:1'),
    link(authorProp, 'sh://minCount', 'literal://number:1'),

    // timestamp property
    link(timestampProp, 'rdf://type', 'sh://PropertyShape'),
    link(timestampProp, 'sh://path', 'ad4m://timestamp'),
    link(timestampProp, 'sh://datatype', 'xsd://string'),
    link(timestampProp, 'sh://maxCount', 'literal://number:1'),
    link(timestampProp, 'sh://minCount', 'literal://number:1'),
    link(timestampProp, 'ad4m://initial', 'literal://string:auto'),

    // reactions collection
    link(reactionsProp, 'rdf://type', 'sh://PropertyShape'),
    link(reactionsProp, 'sh://path', 'ad4m://reactions'),
    link(reactionsProp, 'sh://datatype', 'xsd://string'),
    link(reactionsProp, 'ad4m://adder', `literal://string:${adderActions}`),
    link(reactionsProp, 'ad4m://remover', `literal://string:${removerActions}`)
  ]
}
