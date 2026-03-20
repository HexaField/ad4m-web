import { describe, it, expect } from 'vitest'
import { Model, Property, HasMany, getPropertiesMetadata, getRelationsMetadata } from '../../model/decorators'
import { groupBindingsByBase, hydrateInstance, instancesFromSPARQLResult } from '../../model/hydration'
import type { SPARQLBinding } from '../../model/hydration'

// ─── Test Model ─────────────────────────────────────────────────────────────

@Model({ name: 'Note' })
class Note {
  id: string = ''

  @Property({ through: 'note://title', required: true, initial: 'literal://string:' })
  title: string = ''

  @Property({ through: 'note://content', resolveLanguage: 'literal' })
  content: string = ''

  @Property({ through: 'note://count', resolveLanguage: 'literal' })
  count: number = 0

  @HasMany({ through: 'note://has_tag' })
  tags: string[] = []
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('groupBindingsByBase', () => {
  it('groups bindings by base URI', () => {
    const bindings: SPARQLBinding[] = [
      { base: 'a', pred: 'p1', target: 't1' },
      { base: 'b', pred: 'p2', target: 't2' },
      { base: 'a', pred: 'p3', target: 't3' }
    ]

    const groups = groupBindingsByBase(bindings)
    expect(groups.size).toBe(2)
    expect(groups.get('a')!.length).toBe(2)
    expect(groups.get('b')!.length).toBe(1)
  })
})

describe('hydrateInstance', () => {
  it('populates scalar properties from literal:// targets', () => {
    const properties = getPropertiesMetadata(Note)
    const relations = getRelationsMetadata(Note)
    const bindings: SPARQLBinding[] = [
      { base: 'note://1', pred: 'note://title', target: 'literal://string:My Note' },
      { base: 'note://1', pred: 'note://content', target: 'literal://string:Hello world' },
      { base: 'note://1', pred: 'note://count', target: 'literal://number:42' }
    ]

    const instance = hydrateInstance(Note, 'note://1', bindings, properties, relations)
    expect(instance.id).toBe('note://1')
    expect(instance.title).toBe('My Note')
    expect(instance.content).toBe('Hello world')
    expect(instance.count).toBe(42)
  })

  it('populates collection relations', () => {
    const properties = getPropertiesMetadata(Note)
    const relations = getRelationsMetadata(Note)
    const bindings: SPARQLBinding[] = [
      { base: 'note://1', pred: 'note://title', target: 'literal://string:Tagged' },
      { base: 'note://1', pred: 'note://has_tag', target: 'tag://a' },
      { base: 'note://1', pred: 'note://has_tag', target: 'tag://b' }
    ]

    const instance = hydrateInstance(Note, 'note://1', bindings, properties, relations)
    expect(instance.tags).toEqual(['tag://a', 'tag://b'])
  })

  it('handles literal:// parsing for different types', () => {
    const properties = getPropertiesMetadata(Note)
    const relations = getRelationsMetadata(Note)
    const bindings: SPARQLBinding[] = [
      { base: 'note://1', pred: 'note://title', target: 'literal://string:Test' },
      { base: 'note://1', pred: 'note://count', target: 'literal://number:99' }
    ]

    const instance = hydrateInstance(Note, 'note://1', bindings, properties, relations)
    expect(instance.title).toBe('Test')
    expect(typeof instance.count).toBe('number')
    expect(instance.count).toBe(99)
  })
})

describe('instancesFromSPARQLResult', () => {
  it('full pipeline: group, hydrate, return instances', () => {
    const bindings: SPARQLBinding[] = [
      { base: 'note://1', pred: 'note://title', target: 'literal://string:First' },
      { base: 'note://1', pred: 'note://content', target: 'literal://string:Content 1' },
      { base: 'note://2', pred: 'note://title', target: 'literal://string:Second' },
      { base: 'note://2', pred: 'note://content', target: 'literal://string:Content 2' }
    ]

    const instances = instancesFromSPARQLResult(Note, {}, bindings)
    expect(instances.length).toBe(2)
    expect(instances[0].title).toBe('First')
    expect(instances[1].title).toBe('Second')
  })
})
