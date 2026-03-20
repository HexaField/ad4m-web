import { describe, it, expect } from 'vitest'
import { Model, Property, Flag, HasMany, getPropertiesMetadata, getRelationsMetadata } from '../../model/decorators'
import { buildSHACLShape } from '../../model/shacl-gen'

describe('buildSHACLShape', () => {
  it('generates shape with properties', () => {
    @Model({ name: 'Article' })
    class Article {
      @Property({ through: 'article://title', resolveLanguage: 'literal' })
      title: string = ''

      @Property({ through: 'article://body', resolveLanguage: 'literal' })
      body: string = ''
    }

    const props = getPropertiesMetadata(Article)
    const rels = getRelationsMetadata(Article)
    const shape = buildSHACLShape('Article', props, rels)

    expect(shape.name).toBe('Article')
    expect(shape.namespace).toBe('article://')
    expect(shape.properties).toHaveLength(2)

    const titleProp = shape.properties.find((p) => p.name === 'title')
    expect(titleProp).toBeDefined()
    expect(titleProp!.path).toBe('article://title')
    expect(titleProp!.datatype).toBe('xsd://string')
    expect(titleProp!.maxCount).toBe(1)
    expect(titleProp!.writable).toBe(true)
  })

  it('generates shape with flag property', () => {
    @Model({ name: 'Message' })
    class Message {
      @Flag({ through: 'ad4m://type', value: 'ad4m://message' })
      type: string = ''

      @Property({ through: 'msg://text' })
      text: string = ''
    }

    const props = getPropertiesMetadata(Message)
    const rels = getRelationsMetadata(Message)
    const shape = buildSHACLShape('Message', props, rels)

    const typeProp = shape.properties.find((p) => p.name === 'type')
    expect(typeProp).toBeDefined()
    expect(typeProp!.initial).toBe('ad4m://message')
    expect(typeProp!.minCount).toBe(1)
    expect(typeProp!.writable).toBe(false)
  })

  it('generates shape with relations', () => {
    @Model({ name: 'Post' })
    class Post {
      @Property({ through: 'post://title' })
      title: string = ''

      @HasMany({ through: 'post://comment' })
      comments: string[] = []
    }

    const props = getPropertiesMetadata(Post)
    const rels = getRelationsMetadata(Post)
    const shape = buildSHACLShape('Post', props, rels)

    expect(shape.properties).toHaveLength(2)
    const commentProp = shape.properties.find((p) => p.name === 'comments')
    expect(commentProp).toBeDefined()
    expect(commentProp!.path).toBe('post://comment')
    expect(commentProp!.adder).toBeDefined()
    expect(commentProp!.adder![0].action).toBe('addLink')
    expect(commentProp!.remover).toBeDefined()
  })

  it('generates constructor and destructor actions', () => {
    @Model({ name: 'Item' })
    class Item {
      @Flag({ through: 'item://type', value: 'item://thing' })
      type: string = ''

      @Property({ through: 'item://name', required: true, initial: 'literal://string:uninitialized' })
      name: string = ''
    }

    const props = getPropertiesMetadata(Item)
    const rels = getRelationsMetadata(Item)
    const shape = buildSHACLShape('Item', props, rels)

    expect(shape.constructor).toBeDefined()
    expect(shape.constructor!.length).toBeGreaterThan(0)
    expect(shape.destructor).toBeDefined()
    expect(shape.destructor!.length).toBeGreaterThan(0)

    const addActions = shape.constructor!.filter((a) => a.action === 'addLink')
    expect(addActions.length).toBe(2) // flag + required property
  })
})
