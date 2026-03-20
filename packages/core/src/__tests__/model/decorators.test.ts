import { describe, it, expect } from 'vitest'
import {
  Model,
  Property,
  Optional,
  ReadOnly,
  Flag,
  HasMany,
  HasOne,
  BelongsToOne,
  BelongsToMany,
  getPropertiesMetadata,
  getRelationsMetadata,
  getModelMetadata
} from '../../model/decorators'

describe('Model decorator', () => {
  it('sets className on class and prototype', () => {
    @Model({ name: 'TestModel' })
    class TestModel {
      id = ''
    }

    expect((TestModel as unknown as { className: string }).className).toBe('TestModel')
    expect((new TestModel() as unknown as { className: string }).className).toBe('TestModel')
  })
})

describe('Property decorators', () => {
  it('@Property registers metadata with predicate', () => {
    class MyModel {
      @Property({ through: 'test://name', resolveLanguage: 'literal' })
      name: string = ''
    }

    const meta = getPropertiesMetadata(MyModel)
    expect(meta.name).toBeDefined()
    expect(meta.name.through).toBe('test://name')
    expect(meta.name.resolveLanguage).toBe('literal')
    expect(meta.name.writable).toBe(true)
  })

  it('@Optional marks property as not required', () => {
    class MyModel {
      @Optional({ through: 'test://desc' })
      description: string = ''
    }

    const meta = getPropertiesMetadata(MyModel)
    expect(meta.description).toBeDefined()
    expect(meta.description.required).toBe(false)
  })

  it('@ReadOnly marks property as readOnly', () => {
    class MyModel {
      @ReadOnly({ through: 'test://created' })
      createdAt: string = ''
    }

    const meta = getPropertiesMetadata(MyModel)
    expect(meta.createdAt).toBeDefined()
    expect(meta.createdAt.readOnly).toBe(true)
    expect(meta.createdAt.writable).toBe(false)
  })

  it('@Flag sets flag, required, initial, and readOnly', () => {
    class MyModel {
      @Flag({ through: 'ad4m://type', value: 'ad4m://message' })
      type: string = ''
    }

    const meta = getPropertiesMetadata(MyModel)
    expect(meta.type).toBeDefined()
    expect(meta.type.flag).toBe(true)
    expect(meta.type.required).toBe(true)
    expect(meta.type.initial).toBe('ad4m://message')
    expect(meta.type.readOnly).toBe(true)
    expect(meta.type.writable).toBe(false)
  })

  it('@Property with required: true auto-sets initial', () => {
    class MyModel {
      @Property({ through: 'test://status', required: true, initial: 'literal://string:uninitialized' })
      status: string = ''
    }

    const meta = getPropertiesMetadata(MyModel)
    expect(meta.status.required).toBe(true)
    expect(meta.status.initial).toBe('literal://string:uninitialized')
  })
})

describe('Relation decorators', () => {
  it('@HasMany registers relation metadata', () => {
    class MyModel {
      @HasMany({ through: 'post://comment' })
      comments: string[] = []
    }

    const meta = getRelationsMetadata(MyModel)
    expect(meta.comments).toBeDefined()
    expect(meta.comments.kind).toBe('hasMany')
    expect(meta.comments.predicate).toBe('post://comment')
  })

  it('@HasOne registers with maxCount 1', () => {
    class MyModel {
      @HasOne({ through: 'post://author' })
      author: string = ''
    }

    const meta = getRelationsMetadata(MyModel)
    expect(meta.author).toBeDefined()
    expect(meta.author.kind).toBe('hasOne')
    expect(meta.author.maxCount).toBe(1)
  })

  it('@BelongsToOne registers reverse relation', () => {
    class MyModel {
      @BelongsToOne({ through: 'post://author' })
      post: string = ''
    }

    const meta = getRelationsMetadata(MyModel)
    expect(meta.post).toBeDefined()
    expect(meta.post.kind).toBe('belongsToOne')
    expect(meta.post.maxCount).toBe(1)
  })

  it('@BelongsToMany registers reverse collection', () => {
    class MyModel {
      @BelongsToMany({ through: 'post://tag' })
      posts: string[] = []
    }

    const meta = getRelationsMetadata(MyModel)
    expect(meta.posts).toBeDefined()
    expect(meta.posts.kind).toBe('belongsToMany')
  })

  it('@HasMany with target thunk shorthand', () => {
    class Comment {
      id = ''
    }
    class Post {
      @HasMany(() => Comment as unknown as import('../../model/decorators').Ad4mModelLike, {
        through: 'post://comment'
      })
      comments: string[] = []
    }

    const meta = getRelationsMetadata(Post)
    expect(meta.comments.target).toBeDefined()
    expect(meta.comments.target!()).toBe(Comment)
  })
})

describe('Prototype chain metadata', () => {
  it('getPropertiesMetadata walks prototype chain', () => {
    class Base {
      @Property({ through: 'base://name' })
      name: string = ''
    }

    class Child extends Base {
      @Property({ through: 'child://age' })
      age: string = ''
    }

    const meta = getPropertiesMetadata(Child)
    expect(meta.name).toBeDefined()
    expect(meta.name.through).toBe('base://name')
    expect(meta.age).toBeDefined()
    expect(meta.age.through).toBe('child://age')
  })

  it('getRelationsMetadata walks prototype chain', () => {
    class Base {
      @HasMany({ through: 'base://items' })
      items: string[] = []
    }

    class Child extends Base {
      @HasMany({ through: 'child://tags' })
      tags: string[] = []
    }

    const meta = getRelationsMetadata(Child)
    expect(meta.items).toBeDefined()
    expect(meta.tags).toBeDefined()
  })
})

describe('getModelMetadata', () => {
  it('returns combined properties + relations + className', () => {
    @Model({ name: 'FullModel' })
    class FullModel {
      @Property({ through: 'fm://title' })
      title: string = ''

      @HasMany({ through: 'fm://items' })
      items: string[] = []
    }

    const metadata = getModelMetadata(FullModel as unknown as Function & { className?: string })
    expect(metadata.className).toBe('FullModel')
    expect(metadata.properties.title).toBeDefined()
    expect(metadata.relations.items).toBeDefined()
  })
})
