import { describe, it, expect, vi } from 'vitest'
import { GraphQLError } from 'graphql'
import { buildResolvers } from '@/lib/graphql/resolvers'
import type { GraphQLContext } from '@/lib/graphql/resolvers'
import type { CollectionConfig } from '@/lib/config/schema'
import type { ContentEngine } from '@/lib/content/engine'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { Entry } from '@/lib/types'
import { NotFoundError } from '@/lib/errors'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    title: 'Test Entry',
    slug: 'test-entry',
    status: 'published',
    author: 'author1',
    content: '# Hello',
    data: { excerpt: 'A test excerpt', featured: true },
    collection: 'blog',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T12:00:00Z',
    ...overrides,
  }
}

function makeContext(engineOverrides: Partial<ContentEngine> = {}): GraphQLContext {
  const contentEngine = {
    getEntry: vi.fn(),
    listEntries: vi.fn(),
    getCollection: vi.fn(),
    listCollections: vi.fn(),
    getTaxonomy: vi.fn(),
    listTaxonomies: vi.fn(),
    getTerm: vi.fn(),
    listTerms: vi.fn(),
    getGlobal: vi.fn(),
    listGlobals: vi.fn(),
    updateGlobal: vi.fn(),
    getNavigation: vi.fn(),
    listNavigations: vi.fn(),
    getAsset: vi.fn(),
    listAssets: vi.fn(),
    uploadAsset: vi.fn(),
    deleteAsset: vi.fn(),
    getForm: vi.fn(),
    listForms: vi.fn(),
    submitForm: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
    ...engineOverrides,
  } as unknown as ContentEngine

  const blueprintRegistry = {} as BlueprintRegistry

  return { contentEngine, blueprintRegistry }
}

function makeCollection(handle: string): CollectionConfig {
  return { title: handle.charAt(0).toUpperCase() + handle.slice(1), handle, blueprint: handle }
}

describe('buildResolvers', () => {
  describe('singular collection resolver', () => {
    it('returns mapped entry when found', async () => {
      const entry = makeEntry()
      const context = makeContext({ getEntry: vi.fn().mockResolvedValue(entry) })
      const resolvers = buildResolvers([makeCollection('blog')])

      const result = await (resolvers['blog'] as Function)(null, { slug: 'test-entry' }, context)

      expect(context.contentEngine.getEntry).toHaveBeenCalledWith('blog', 'test-entry')
      expect(result).toEqual({
        title: 'Test Entry',
        slug: 'test-entry',
        status: 'published',
        author: 'author1',
        content: '# Hello',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z',
        excerpt: 'A test excerpt',
        featured: true,
      })
    })

    it('returns null when entry not found', async () => {
      const context = makeContext({ getEntry: vi.fn().mockResolvedValue(null) })
      const resolvers = buildResolvers([makeCollection('blog')])

      const result = await (resolvers['blog'] as Function)(null, { slug: 'nonexistent' }, context)

      expect(result).toBeNull()
    })

    it('maps author to null when undefined', async () => {
      const entry = makeEntry({ author: undefined })
      const context = makeContext({ getEntry: vi.fn().mockResolvedValue(entry) })
      const resolvers = buildResolvers([makeCollection('blog')])

      const result = await (resolvers['blog'] as Function)(null, { slug: 'test-entry' }, context)

      expect(result.author).toBeNull()
    })
  })

  describe('list collection resolver', () => {
    it('returns mapped entries', async () => {
      const entries = [makeEntry({ slug: 'a' }), makeEntry({ slug: 'b' })]
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue(entries) })
      const resolvers = buildResolvers([makeCollection('blog')])

      const result = await (resolvers['blogs'] as Function)(null, {}, context)

      expect(result).toHaveLength(2)
      expect(result[0].slug).toBe('a')
      expect(result[1].slug).toBe('b')
    })

    it('passes filter to content engine', async () => {
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([makeCollection('blog')])

      await (resolvers['blogs'] as Function)(null, { filter: { status: 'published' } }, context)

      expect(context.contentEngine.listEntries).toHaveBeenCalledWith('blog', {
        filter: { status: 'published' },
      })
    })

    it('passes limit and offset to content engine', async () => {
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([makeCollection('blog')])

      await (resolvers['blogs'] as Function)(null, { limit: 5, offset: 10 }, context)

      expect(context.contentEngine.listEntries).toHaveBeenCalledWith('blog', {
        limit: 5,
        offset: 10,
      })
    })

    it('parses sort string into field and direction', async () => {
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([makeCollection('blog')])

      await (resolvers['blogs'] as Function)(null, { sort: 'createdAt:desc' }, context)

      expect(context.contentEngine.listEntries).toHaveBeenCalledWith('blog', {
        sort: { field: 'createdAt', direction: 'desc' },
      })
    })

    it('defaults sort direction to asc when not specified', async () => {
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([makeCollection('blog')])

      await (resolvers['blogs'] as Function)(null, { sort: 'title' }, context)

      expect(context.contentEngine.listEntries).toHaveBeenCalledWith('blog', {
        sort: { field: 'title', direction: 'asc' },
      })
    })

    it('defaults sort direction to asc for invalid direction', async () => {
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([makeCollection('blog')])

      await (resolvers['blogs'] as Function)(null, { sort: 'title:invalid' }, context)

      expect(context.contentEngine.listEntries).toHaveBeenCalledWith('blog', {
        sort: { field: 'title', direction: 'asc' },
      })
    })
  })

  describe('pluralization', () => {
    it('pluralizes standard handles with s', () => {
      const resolvers = buildResolvers([makeCollection('blog')])
      expect(resolvers['blogs']).toBeDefined()
    })

    it('pluralizes handles ending in y to ies', () => {
      const resolvers = buildResolvers([makeCollection('category')])
      expect(resolvers['categories']).toBeDefined()
    })

    it('does not double-pluralize handles ending in s', () => {
      const resolvers = buildResolvers([makeCollection('news')])
      expect(resolvers['news']).toBeDefined()
    })
  })

  describe('taxonomy resolvers', () => {
    it('delegates to contentEngine.listTaxonomies', async () => {
      const taxonomies = [{ handle: 'categories', title: 'Categories' }]
      const context = makeContext({ listTaxonomies: vi.fn().mockResolvedValue(taxonomies) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['taxonomies'] as Function)(null, {}, context)

      expect(result).toEqual(taxonomies)
    })

    it('delegates to contentEngine.getTaxonomy', async () => {
      const taxonomy = { handle: 'categories', title: 'Categories' }
      const context = makeContext({ getTaxonomy: vi.fn().mockResolvedValue(taxonomy) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['taxonomy'] as Function)(null, { handle: 'categories' }, context)

      expect(result).toEqual(taxonomy)
    })

    it('delegates to contentEngine.listTerms', async () => {
      const terms = [{ title: 'Updates', slug: 'updates', taxonomy: 'categories', data: {} }]
      const context = makeContext({ listTerms: vi.fn().mockResolvedValue(terms) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['terms'] as Function)(null, { taxonomy: 'categories' }, context)

      expect(result).toEqual(terms)
    })
  })

  describe('global resolvers', () => {
    it('delegates to contentEngine.listGlobals', async () => {
      const globals = [{ handle: 'site', data: { name: 'My Site' } }]
      const context = makeContext({ listGlobals: vi.fn().mockResolvedValue(globals) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['globals'] as Function)(null, {}, context)

      expect(result).toEqual(globals)
    })

    it('delegates to contentEngine.getGlobal', async () => {
      const global = { handle: 'site', data: { name: 'My Site' } }
      const context = makeContext({ getGlobal: vi.fn().mockResolvedValue(global) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['global'] as Function)(null, { handle: 'site' }, context)

      expect(result).toEqual(global)
    })
  })

  describe('navigation resolvers', () => {
    it('delegates to contentEngine.listNavigations', async () => {
      const navs = [{ handle: 'main', items: [] }]
      const context = makeContext({ listNavigations: vi.fn().mockResolvedValue(navs) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['navigations'] as Function)(null, {}, context)

      expect(result).toEqual(navs)
    })

    it('delegates to contentEngine.getNavigation', async () => {
      const nav = { handle: 'main', items: [{ label: 'Home', url: '/' }] }
      const context = makeContext({ getNavigation: vi.fn().mockResolvedValue(nav) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['navigation'] as Function)(null, { handle: 'main' }, context)

      expect(result).toEqual(nav)
    })
  })

  describe('asset resolvers', () => {
    it('delegates to contentEngine.listAssets', async () => {
      const assets = [{ path: '/images/hero.jpg', filename: 'hero.jpg', extension: 'jpg', size: 1024, mimeType: 'image/jpeg', modifiedAt: '2024-01-01' }]
      const context = makeContext({ listAssets: vi.fn().mockResolvedValue(assets) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['assets'] as Function)(null, {}, context)

      expect(result).toEqual(assets)
    })

    it('passes directory argument to listAssets', async () => {
      const context = makeContext({ listAssets: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([])

      await (resolvers['assets'] as Function)(null, { directory: '/images' }, context)

      expect(context.contentEngine.listAssets).toHaveBeenCalledWith('/images')
    })

    it('delegates to contentEngine.getAsset', async () => {
      const asset = { path: '/images/hero.jpg', filename: 'hero.jpg', extension: 'jpg', size: 1024, mimeType: 'image/jpeg', modifiedAt: '2024-01-01' }
      const context = makeContext({ getAsset: vi.fn().mockResolvedValue(asset) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['asset'] as Function)(null, { path: '/images/hero.jpg' }, context)

      expect(result).toEqual(asset)
    })
  })

  describe('error handling', () => {
    it('wraps NotFoundError as GraphQLError with NOT_FOUND code', async () => {
      const context = makeContext({
        getEntry: vi.fn().mockRejectedValue(new NotFoundError('Collection', 'nonexistent')),
      })
      const resolvers = buildResolvers([makeCollection('blog')])

      await expect(
        (resolvers['blog'] as Function)(null, { slug: 'test' }, context)
      ).rejects.toMatchObject({
        extensions: { code: 'NOT_FOUND' },
      })
    })

    it('wraps FS errors as GraphQLError with INTERNAL_ERROR code', async () => {
      const fsError = new Error('ENOENT: no such file or directory')
      const context = makeContext({
        listEntries: vi.fn().mockRejectedValue(fsError),
      })
      const resolvers = buildResolvers([makeCollection('blog')])

      await expect(
        (resolvers['blogs'] as Function)(null, {}, context)
      ).rejects.toMatchObject({
        extensions: { code: 'INTERNAL_ERROR' },
      })
    })

    it('does not expose stack traces in INTERNAL_ERROR responses', async () => {
      const fsError = new Error('Disk failure')
      fsError.stack = 'Error: Disk failure\n    at readFile (/internal/path.ts:42:5)'
      const context = makeContext({
        listEntries: vi.fn().mockRejectedValue(fsError),
      })
      const resolvers = buildResolvers([makeCollection('blog')])

      try {
        await (resolvers['blogs'] as Function)(null, {}, context)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(GraphQLError)
        const gqlError = error as GraphQLError
        expect(gqlError.extensions.code).toBe('INTERNAL_ERROR')
        // The error message is included but no stack property in extensions
        expect(gqlError.extensions).not.toHaveProperty('stack')
        expect(gqlError.extensions).not.toHaveProperty('stacktrace')
      }
    })

    it('returns [] for empty list queries (empty collection)', async () => {
      const context = makeContext({ listEntries: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([makeCollection('blog')])

      const result = await (resolvers['blogs'] as Function)(null, {}, context)

      expect(result).toEqual([])
    })

    it('returns null for singular queries when entry does not exist', async () => {
      const context = makeContext({ getEntry: vi.fn().mockResolvedValue(null) })
      const resolvers = buildResolvers([makeCollection('blog')])

      const result = await (resolvers['blog'] as Function)(null, { slug: 'missing' }, context)

      expect(result).toBeNull()
    })

    it('returns [] for empty taxonomy terms', async () => {
      const context = makeContext({ listTerms: vi.fn().mockResolvedValue([]) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['terms'] as Function)(null, { taxonomy: 'tags' }, context)

      expect(result).toEqual([])
    })

    it('returns [] when taxonomy list returns null', async () => {
      const context = makeContext({ listTerms: vi.fn().mockResolvedValue(null) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['terms'] as Function)(null, { taxonomy: 'tags' }, context)

      expect(result).toEqual([])
    })

    it('returns null when taxonomy resolver returns null', async () => {
      const context = makeContext({ getTaxonomy: vi.fn().mockResolvedValue(null) })
      const resolvers = buildResolvers([])

      const result = await (resolvers['taxonomy'] as Function)(null, { handle: 'nonexistent' }, context)

      expect(result).toBeNull()
    })

    it('logs full error server-side for INTERNAL_ERROR', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fsError = new Error('Permission denied')
      const context = makeContext({
        listEntries: vi.fn().mockRejectedValue(fsError),
      })
      const resolvers = buildResolvers([makeCollection('blog')])

      try {
        await (resolvers['blogs'] as Function)(null, {}, context)
      } catch {
        // expected
      }

      expect(consoleSpy).toHaveBeenCalledWith('[madori:graphql] Resolver error:', fsError)
      consoleSpy.mockRestore()
    })

    it('re-throws GraphQLError instances without wrapping', async () => {
      const gqlError = new GraphQLError('Custom error', { extensions: { code: 'CUSTOM' } })
      const context = makeContext({
        getEntry: vi.fn().mockRejectedValue(gqlError),
      })
      const resolvers = buildResolvers([makeCollection('blog')])

      await expect(
        (resolvers['blog'] as Function)(null, { slug: 'test' }, context)
      ).rejects.toMatchObject({
        extensions: { code: 'CUSTOM' },
      })
    })
  })
})
