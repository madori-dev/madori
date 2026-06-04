import { describe, it, expect } from 'vitest'
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLUnionType,
  printSchema,
} from 'graphql'
import { SchemaGeneratorImpl } from '@/lib/graphql/schema-generator'
import type { FieldsetProvider } from '@/lib/graphql/schema-generator'
import type { Blueprint, FieldDefinition } from '@/lib/blueprints/types'
import type { CollectionConfig } from '@/lib/config/schema'

function makeBlueprint(handle: string, fields: Array<{ handle: string; type: string; options?: Record<string, unknown> }>): Blueprint {
  return {
    handle,
    tabs: {
      main: {
        display: 'Main',
        fields: fields.map((f) => ({
          handle: f.handle,
          field: { type: f.type as any, options: f.options },
        })),
      },
    },
  }
}

function makeCollection(handle: string, blueprint: string): CollectionConfig {
  return { title: handle.charAt(0).toUpperCase() + handle.slice(1), handle, blueprint }
}

describe('SchemaGeneratorImpl', () => {
  const generator = new SchemaGeneratorImpl()

  describe('generateSchema', () => {
    it('generates a valid GraphQL schema from blueprints and collections', () => {
      const blueprint = makeBlueprint('post', [
        { handle: 'excerpt', type: 'text' },
        { handle: 'featured', type: 'toggle' },
      ])
      const collection = makeCollection('blog', 'post')

      const schema = generator.generateSchema([blueprint], [collection])

      expect(schema).toBeInstanceOf(GraphQLSchema)
      const queryType = schema.getQueryType()
      expect(queryType).toBeDefined()

      const fields = queryType!.getFields()
      expect(fields.blog).toBeDefined()
      expect(fields.blogs).toBeDefined()
    })

    it('creates singular and plural query fields for each collection', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'body', type: 'markdown' }])
      const collection = makeCollection('blog', 'post')

      const schema = generator.generateSchema([blueprint], [collection])
      const fields = schema.getQueryType()!.getFields()

      // Singular query has slug argument
      expect(fields.blog.args).toHaveLength(1)
      expect(fields.blog.args[0].name).toBe('slug')

      // Plural query has filter, limit, offset, sort arguments
      const pluralArgs = fields.blogs.args.map((a) => a.name)
      expect(pluralArgs).toContain('filter')
      expect(pluralArgs).toContain('limit')
      expect(pluralArgs).toContain('offset')
      expect(pluralArgs).toContain('sort')
    })

    it('handles multiple collections', () => {
      const postBlueprint = makeBlueprint('post', [{ handle: 'body', type: 'markdown' }])
      const pageBlueprint = makeBlueprint('page', [{ handle: 'layout', type: 'select' }])

      const collections = [
        makeCollection('blog', 'post'),
        makeCollection('page', 'page'),
      ]

      const schema = generator.generateSchema([postBlueprint, pageBlueprint], collections)
      const fields = schema.getQueryType()!.getFields()

      expect(fields.blog).toBeDefined()
      expect(fields.blogs).toBeDefined()
      expect(fields.page).toBeDefined()
      expect(fields.pages).toBeDefined()
    })

    it('skips collections with no matching blueprint', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'body', type: 'text' }])
      const collections = [
        makeCollection('blog', 'post'),
        makeCollection('orphan', 'nonexistent'),
      ]

      const schema = generator.generateSchema([blueprint], collections)
      const fields = schema.getQueryType()!.getFields()

      expect(fields.blog).toBeDefined()
      expect(fields.orphan).toBeUndefined()
    })

    it('generates a valid schema even with no collections', () => {
      const schema = generator.generateSchema([], [])
      expect(schema).toBeInstanceOf(GraphQLSchema)
    })

    it('pluralizes handles ending in y correctly', () => {
      const blueprint = makeBlueprint('category', [{ handle: 'description', type: 'text' }])
      const collection = makeCollection('category', 'category')

      const schema = generator.generateSchema([blueprint], [collection])
      const fields = schema.getQueryType()!.getFields()

      expect(fields.categories).toBeDefined()
    })
  })

  describe('generateCollectionType', () => {
    it('includes standard entry fields', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'excerpt', type: 'text' }])
      const collection = makeCollection('blog', 'post')

      const type = generator.generateCollectionType(collection, blueprint)

      expect(type).toBeInstanceOf(GraphQLObjectType)
      const fields = type.getFields()

      expect(fields.title).toBeDefined()
      expect(fields.slug).toBeDefined()
      expect(fields.status).toBeDefined()
      expect(fields.author).toBeDefined()
      expect(fields.content).toBeDefined()
      expect(fields.createdAt).toBeDefined()
      expect(fields.updatedAt).toBeDefined()
    })

    it('includes blueprint-defined fields', () => {
      const blueprint = makeBlueprint('post', [
        { handle: 'excerpt', type: 'text' },
        { handle: 'featured', type: 'toggle' },
        { handle: 'views', type: 'number' },
      ])
      const collection = makeCollection('blog', 'post')

      const type = generator.generateCollectionType(collection, blueprint)
      const fields = type.getFields()

      expect(fields.excerpt).toBeDefined()
      expect(fields.featured).toBeDefined()
      expect(fields.views).toBeDefined()
    })

    it('uses PascalCase for type name', () => {
      const blueprint = makeBlueprint('case_study', [{ handle: 'client', type: 'text' }])
      const collection = makeCollection('case-studies', 'case_study')

      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.name).toBe('CaseStudies')
    })

    it('does not duplicate standard fields from blueprint', () => {
      const blueprint = makeBlueprint('post', [
        { handle: 'title', type: 'text' },
        { handle: 'slug', type: 'slug' },
        { handle: 'extra', type: 'text' },
      ])
      const collection = makeCollection('blog', 'post')

      const type = generator.generateCollectionType(collection, blueprint)
      const fields = type.getFields()

      // Should still have title and slug (from standard fields) plus extra
      expect(fields.title).toBeDefined()
      expect(fields.slug).toBeDefined()
      expect(fields.extra).toBeDefined()
    })
  })

  describe('generateFilterInput', () => {
    it('creates an input type with standard filterable fields', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'excerpt', type: 'text' }])

      const input = generator.generateFilterInput(blueprint)

      expect(input).toBeInstanceOf(GraphQLInputObjectType)
      const fields = input.getFields()

      expect(fields.title).toBeDefined()
      expect(fields.slug).toBeDefined()
      expect(fields.status).toBeDefined()
      expect(fields.author).toBeDefined()
    })

    it('includes blueprint fields as String filters', () => {
      const blueprint = makeBlueprint('post', [
        { handle: 'excerpt', type: 'text' },
        { handle: 'featured', type: 'toggle' },
        { handle: 'views', type: 'number' },
      ])

      const input = generator.generateFilterInput(blueprint)
      const fields = input.getFields()

      // All filter fields are String in V0
      expect(fields.excerpt).toBeDefined()
      expect(fields.featured).toBeDefined()
      expect(fields.views).toBeDefined()
    })

    it('names the filter input type correctly', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'body', type: 'text' }])
      const input = generator.generateFilterInput(blueprint)
      expect(input.name).toBe('PostFilterInput')
    })
  })

  describe('field type mapping', () => {
    it('maps text to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'body', type: 'text' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().body.type).toBe(GraphQLString)
    })

    it('maps slug to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'url_slug', type: 'slug' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().url_slug.type).toBe(GraphQLString)
    })

    it('maps markdown to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'body', type: 'markdown' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().body.type).toBe(GraphQLString)
    })

    it('maps tiptap to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'rich_body', type: 'tiptap' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().rich_body.type).toBe(GraphQLString)
    })

    it('maps number to GraphQLFloat by default', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'rating', type: 'number' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().rating.type).toBe(GraphQLFloat)
    })

    it('maps number with integer option to GraphQLInt', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'count', type: 'number', options: { integer: true } }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().count.type).toBe(GraphQLInt)
    })

    it('maps toggle to GraphQLBoolean', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'featured', type: 'toggle' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().featured.type).toBe(GraphQLBoolean)
    })

    it('maps select to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'category', type: 'select' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().category.type).toBe(GraphQLString)
    })

    it('maps multiselect to GraphQLList(GraphQLString)', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'tags', type: 'multiselect' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      const fieldType = type.getFields().tags.type as GraphQLList<any>
      expect(fieldType).toBeInstanceOf(GraphQLList)
      expect(fieldType.ofType).toBe(GraphQLString)
    })

    it('maps date to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'published_at', type: 'date' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().published_at.type).toBe(GraphQLString)
    })

    it('maps asset to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'image', type: 'asset' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().image.type).toBe(GraphQLString)
    })

    it('maps entries to GraphQLList(GraphQLString)', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'related', type: 'entries' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      const fieldType = type.getFields().related.type as GraphQLList<any>
      expect(fieldType).toBeInstanceOf(GraphQLList)
      expect(fieldType.ofType).toBe(GraphQLString)
    })

    it('maps taxonomy to GraphQLList(GraphQLString)', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'categories', type: 'taxonomy' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      const fieldType = type.getFields().categories.type as GraphQLList<any>
      expect(fieldType).toBeInstanceOf(GraphQLList)
      expect(fieldType.ofType).toBe(GraphQLString)
    })

    it('maps replicator to GraphQLString (JSON serialized)', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'blocks', type: 'replicator' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().blocks.type).toBe(GraphQLString)
    })

    it('maps grid to GraphQLString (JSON serialized)', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'table', type: 'grid' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().table.type).toBe(GraphQLString)
    })

    it('maps yaml to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'meta', type: 'yaml' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().meta.type).toBe(GraphQLString)
    })

    it('maps code to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'snippet', type: 'code' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().snippet.type).toBe(GraphQLString)
    })

    it('maps hidden to GraphQLString', () => {
      const blueprint = makeBlueprint('post', [{ handle: 'internal_id', type: 'hidden' }])
      const collection = makeCollection('blog', 'post')
      const type = generator.generateCollectionType(collection, blueprint)
      expect(type.getFields().internal_id.type).toBe(GraphQLString)
    })
  })

  describe('blueprint with sections', () => {
    it('extracts fields from sections within tabs', () => {
      const blueprint: Blueprint = {
        handle: 'post',
        tabs: {
          main: {
            display: 'Main',
            fields: [{ handle: 'title_field', field: { type: 'text' } }],
            sections: {
              meta: {
                display: 'Meta',
                fields: [{ handle: 'meta_desc', field: { type: 'text' } }],
              },
            },
          },
        },
      }
      const collection = makeCollection('blog', 'post')

      const type = generator.generateCollectionType(collection, blueprint)
      const fields = type.getFields()

      expect(fields.title_field).toBeDefined()
      expect(fields.meta_desc).toBeDefined()
    })
  })

  describe('replicator/grid structured type generation', () => {
    const fieldsets: Record<string, FieldDefinition[]> = {
      hero: [
        { handle: 'heading', field: { type: 'text' } },
        { handle: 'subtitle', field: { type: 'text' } },
        { handle: 'image', field: { type: 'asset' } },
      ],
      cta: [
        { handle: 'button_text', field: { type: 'text' } },
        { handle: 'button_url', field: { type: 'text' } },
        { handle: 'featured', field: { type: 'toggle' } },
      ],
      features: [
        { handle: 'title', field: { type: 'text' } },
        { handle: 'count', field: { type: 'number', options: { integer: true } } },
      ],
    }

    const provider: FieldsetProvider = {
      getFieldset(handle: string) {
        return fieldsets[handle]
      },
    }

    const generatorWithProvider = new SchemaGeneratorImpl(provider)

    it('generates a dedicated GraphQLObjectType for a single replicator set', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: ['hero'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      const blocksField = type.getFields().blocks

      // Should be a GraphQLList wrapping the set type
      expect(blocksField.type).toBeInstanceOf(GraphQLList)
      const listType = blocksField.type as GraphQLList<GraphQLObjectType>
      const setType = listType.ofType as GraphQLObjectType

      expect(setType).toBeInstanceOf(GraphQLObjectType)
      expect(setType.name).toBe('PageBlocksHeroSet')

      // Verify the set type has the fieldset fields + _type discriminator
      const setFields = setType.getFields()
      expect(setFields._type).toBeDefined()
      expect(setFields.heading).toBeDefined()
      expect(setFields.subtitle).toBeDefined()
      expect(setFields.image).toBeDefined()
    })

    it('generates a GraphQLUnionType for multiple replicator sets', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: ['hero', 'cta'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      const blocksField = type.getFields().blocks

      // Should be a GraphQLList wrapping a union type
      expect(blocksField.type).toBeInstanceOf(GraphQLList)
      const listType = blocksField.type as GraphQLList<GraphQLUnionType>
      const unionType = listType.ofType as GraphQLUnionType

      expect(unionType).toBeInstanceOf(GraphQLUnionType)
      expect(unionType.name).toBe('PageBlocksUnion')

      const unionMembers = unionType.getTypes()
      expect(unionMembers).toHaveLength(2)
      expect(unionMembers[0].name).toBe('PageBlocksHeroSet')
      expect(unionMembers[1].name).toBe('PageBlocksCtaSet')
    })

    it('maps nested field types correctly within set types', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'items', type: 'replicator', options: { sets: ['features'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      const itemsField = type.getFields().items

      const listType = itemsField.type as GraphQLList<GraphQLObjectType>
      const setType = listType.ofType as GraphQLObjectType
      const setFields = setType.getFields()

      expect(setFields.title.type).toBe(GraphQLString)
      expect(setFields.count.type).toBe(GraphQLInt)
    })

    it('falls back to GraphQLString when no fieldset provider is given', () => {
      const generatorNoProvider = new SchemaGeneratorImpl()
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: ['hero'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorNoProvider.generateCollectionType(collection, blueprint)
      expect(type.getFields().blocks.type).toBe(GraphQLString)
    })

    it('falls back to GraphQLString when replicator has no sets in options', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator' },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      expect(type.getFields().blocks.type).toBe(GraphQLString)
    })

    it('falls back to GraphQLString when sets array is empty', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: [] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      expect(type.getFields().blocks.type).toBe(GraphQLString)
    })

    it('falls back to GraphQLString when set handles are not resolvable', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: ['nonexistent'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      expect(type.getFields().blocks.type).toBe(GraphQLString)
    })

    it('generates structured types for grid fields the same as replicator', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'rows', type: 'grid', options: { sets: ['hero'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      const rowsField = type.getFields().rows

      expect(rowsField.type).toBeInstanceOf(GraphQLList)
      const listType = rowsField.type as GraphQLList<GraphQLObjectType>
      const setType = listType.ofType as GraphQLObjectType

      expect(setType).toBeInstanceOf(GraphQLObjectType)
      expect(setType.name).toBe('PageRowsHeroSet')
    })

    it('includes _type discriminator field in each set type', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: ['hero', 'cta'] } },
      ])
      const collection = makeCollection('page', 'page')

      const type = generatorWithProvider.generateCollectionType(collection, blueprint)
      const blocksField = type.getFields().blocks as any
      const unionType = (blocksField.type as GraphQLList<any>).ofType as GraphQLUnionType
      const members = unionType.getTypes()

      for (const member of members) {
        const fields = member.getFields()
        expect(fields._type).toBeDefined()
        expect(fields._type.type).toBe(GraphQLString)
      }
    })

    it('generates schema correctly with replicator fields and provider', () => {
      const blueprint = makeBlueprint('page', [
        { handle: 'blocks', type: 'replicator', options: { sets: ['hero', 'cta'] } },
        { handle: 'meta_title', type: 'text' },
      ])
      const collection = makeCollection('page', 'page')

      const schema = generatorWithProvider.generateSchema([blueprint], [collection])
      expect(schema).toBeInstanceOf(GraphQLSchema)

      // Verify the schema has proper types
      const queryType = schema.getQueryType()!
      const pageField = queryType.getFields().page
      expect(pageField).toBeDefined()
    })
  })
})
