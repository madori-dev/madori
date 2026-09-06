import { describe, expect, it, vi } from 'vitest'
import { graphql } from 'graphql'
import { parse } from 'graphql'
import { GraphQLSDKGenerator } from '../../../packages/madori-cli/src/generators/graphql-sdk-generator'
import { SchemaGeneratorImpl } from '@/lib/graphql/schema-generator'
import { buildResolvers } from '@/lib/graphql/resolvers'
import type { Blueprint } from '@/lib/blueprints/types'

const blueprint: Blueprint = {
  handle: 'page',
  tabs: { main: { fields: [
    { handle: 'featured-image', field: { type: 'text' } },
    { handle: 'blocks', field: { type: 'blocks', options: { sets: ['hero', 'copy'] } } },
  ] } },
}

const collection = { handle: 'pages', title: 'Pages', blueprint: 'page', route: '/{slug}' } as const

describe('GraphQL cross-boundary regressions', () => {
  it('executes ending-s handles, sanitized fields, and multi-set unions', async () => {
    const engine = {
      getEntry: vi.fn().mockResolvedValue({ title: 'Home', slug: 'home', status: 'published', content: '', data: {
        'featured-image': 'hero.jpg', blocks: [{ _type: 'hero', heading: 'Welcome' }],
      }, createdAt: '', updatedAt: '' }),
      listEntries: vi.fn(),
    }
    const resolvers = buildResolvers([collection], { })
    const schema = new SchemaGeneratorImpl({ getFieldset: (handle) => handle === 'hero' ? [{ handle: 'heading', field: { type: 'text' } }] : [{ handle: 'body', field: { type: 'text' } }] }).generateSchema([blueprint], [collection], resolvers)
    const result = await graphql({ schema, source: '{ pages(slug: "home") { featured_image blocks { ... on PagesBlocksHeroSet { _type heading } } } }', contextValue: { contentEngine: engine, blueprintRegistry: { getBlueprint: vi.fn().mockResolvedValue(blueprint) } } })
    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ pages: { featured_image: 'hero.jpg', blocks: [{ _type: 'hero', heading: 'Welcome' }] } })
  })

  it('generates an operation that parses and executes against the schema', async () => {
    const blueprint = { handle: 'case-studies', tabs: { main: { fields: [
      { handle: 'headline', field: { type: 'text' as const } },
      { handle: 'blocks', field: { type: 'blocks' as const, options: { sets: ['hero'] } } },
    ] } } }
    const generated = await new GraphQLSDKGenerator(new Map([['hero', [{ handle: 'heading', field: { type: 'text' as const } }]]])).generate([blueprint])
    const source = generated.find((file) => file.filename === 'graphql/case-studies-operations.ts')?.content.match(/parse\(`([\s\S]*?)`\)/)?.[1]
    expect(source).toBeTruthy()
    const resolvers = buildResolvers([{ handle: 'case-studies', title: 'Case Studies', blueprint: 'case-studies', route: '/{slug}' }], {})
    const schema = new SchemaGeneratorImpl({ getFieldset: (handle) => handle === 'hero' ? [{ handle: 'heading', field: { type: 'text' } }] : undefined }).generateSchema([blueprint], [{ handle: 'case-studies', title: 'Case Studies', blueprint: 'case-studies', route: '/{slug}' }], resolvers)
    const entry = { title: 'Study', slug: 'hello', status: 'published', content: '', data: { headline: 'Headline', blocks: [{ _type: 'hero', heading: 'Welcome' }] }, createdAt: '', updatedAt: '' }
    const engine = { getEntry: vi.fn().mockResolvedValue(entry), listEntries: vi.fn().mockResolvedValue([entry]) }
    const result = await graphql({ schema, source: parse(source!).loc?.source.body ?? source!, variableValues: { slug: 'hello' }, contextValue: { contentEngine: engine, blueprintRegistry: { getBlueprint: vi.fn() } } })
    expect(result.errors).toBeUndefined()
    expect(result.data?.caseStudies?.blocks).toEqual([{ _type: 'hero', heading: 'Welcome' }])
    const sources = [...(generated.find((file) => file.filename === 'graphql/case-studies-operations.ts')?.content.matchAll(/parse\(`([\s\S]*?)`\)/g) ?? [])].map((match) => match[1])
    const listResult = await graphql({ schema, source: parse(sources[1]).loc?.source.body ?? sources[1], variableValues: { limit: 10 }, contextValue: { contentEngine: engine, blueprintRegistry: { getBlueprint: vi.fn() } } })
    expect(listResult.errors).toBeUndefined()
    expect(listResult.data?.caseStudiesList?.[0]?.blocks).toEqual([{ _type: 'hero', heading: 'Welcome' }])
  })
})
