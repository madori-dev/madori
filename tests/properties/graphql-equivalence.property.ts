// Feature: project-madori, Property 7: GraphQL Content Equivalence

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildResolvers } from '@/lib/graphql/resolvers'
import type { GraphQLContext } from '@/lib/graphql/resolvers'
import type { ContentEngine } from '@/lib/content/engine'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { Entry, ListOptions } from '@/lib/types'
import type { CollectionConfig } from '@/lib/config/schema'

/**
 * Validates: Requirements 12.1, 12.2
 *
 * Property: For any valid blueprint configuration and corresponding content data,
 * querying content through the GraphQL resolvers should return data equivalent to
 * querying the same content directly through the Content Engine. The resolver mapping
 * produces the same data as direct ContentEngine access.
 */

// --- Generators ---

const statusArb: fc.Arbitrary<'published' | 'draft'> = fc.constantFrom('published', 'draft')

const dataFieldValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
)

const dataFieldsArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{1,12}$/),
  dataFieldValueArb,
  { minKeys: 0, maxKeys: 5 },
)

const isoDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 1577836800000, max: 1767225600000 }) // 2020-01-01 to 2025-12-31
  .map((ts) => new Date(ts).toISOString())

const entryArb: fc.Arbitrary<Entry> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  slug: fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/),
  status: statusArb,
  author: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  data: dataFieldsArb,
  collection: fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
  createdAt: isoDateArb,
  updatedAt: isoDateArb,
})

// Ensure handles don't end in 's' or 'y' to avoid pluralization collisions
// (pluralize("blogs") === "blogs" which would overwrite the singular resolver)
const collectionHandleArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9]{1,8}[a-rt-xz]$/)

const collectionConfigArb: fc.Arbitrary<CollectionConfig> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 30 }),
  handle: collectionHandleArb,
  route: fc.option(fc.constant('/blog/{slug}'), { nil: undefined }),
  blueprint: fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
  sortable: fc.option(fc.boolean(), { nil: undefined }),
  dated: fc.option(fc.boolean(), { nil: undefined }),
  defaultStatus: fc.option(statusArb, { nil: undefined }),
})

// --- Helpers ---

/**
 * Manually maps an Entry to the expected resolver output format.
 * This mirrors the `mapEntryToResponse` function in resolvers.ts.
 */
function manualMapEntry(entry: Entry): Record<string, unknown> {
  return {
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    author: entry.author ?? null,
    content: entry.content,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...entry.data,
  }
}

/**
 * Creates a mock ContentEngine that returns the provided entries for a given collection.
 */
function createMockContentEngine(
  collectionHandle: string,
  entries: Entry[],
): ContentEngine {
  return {
    getEntry: async (collection: string, slug: string) => {
      if (collection !== collectionHandle) return null
      return entries.find((e) => e.slug === slug) ?? null
    },
    listEntries: async (collection: string, _options?: ListOptions) => {
      if (collection !== collectionHandle) return []
      return entries
    },
    // Stubs for other methods (not used in collection resolvers)
    getCollection: async () => null,
    listCollections: async () => [],
    createEntry: async () => entries[0],
    updateEntry: async () => entries[0],
    deleteEntry: async () => {},
    getTaxonomy: async () => null,
    listTaxonomies: async () => [],
    getTerm: async () => null,
    listTerms: async () => [],
    getGlobal: async () => null,
    listGlobals: async () => [],
    updateGlobal: async () => ({ handle: '', data: {} }),
    getNavigation: async () => null,
    listNavigations: async () => [],
    getAsset: async () => null,
    listAssets: async () => [],
    uploadAsset: async () => ({
      path: '',
      filename: '',
      extension: '',
      size: 0,
      mimeType: '',
      modifiedAt: '',
    }),
    deleteAsset: async () => {},
    getForm: async () => null,
    listForms: async () => [],
    submitForm: async () => ({ id: '', form: '', submittedAt: '', data: {} }),
  } as ContentEngine
}

function createMockBlueprintRegistry(): BlueprintRegistry {
  return {
    getBlueprint: async () => null,
    listBlueprints: async () => [],
    validateData: () => ({ success: true }),
    generateZodSchema: () => null as unknown as ReturnType<BlueprintRegistry['generateZodSchema']>,
  } as unknown as BlueprintRegistry
}

// --- Property Tests ---

describe('Property 7: GraphQL Content Equivalence', () => {
  it('singular resolver output contains all standard fields and matches manual mapping', async () => {
    await fc.assert(
      fc.asyncProperty(entryArb, collectionConfigArb, async (entry, collectionConfig) => {
        // Use the collection config's handle for the entry
        const adjustedEntry = { ...entry, collection: collectionConfig.handle }

        const mockEngine = createMockContentEngine(collectionConfig.handle, [adjustedEntry])
        const mockRegistry = createMockBlueprintRegistry()

        const context: GraphQLContext = {
          contentEngine: mockEngine,
          blueprintRegistry: mockRegistry,
        }

        const resolvers = buildResolvers([collectionConfig])
        const singularResolver = resolvers[collectionConfig.handle] as (
          parent: unknown,
          args: { slug: string },
          ctx: GraphQLContext,
        ) => Promise<Record<string, unknown> | null>

        const result = await singularResolver(null, { slug: adjustedEntry.slug }, context)

        // Verify result is not null
        expect(result).not.toBeNull()

        // Verify all standard fields are present
        expect(result).toHaveProperty('title')
        expect(result).toHaveProperty('slug')
        expect(result).toHaveProperty('status')
        expect(result).toHaveProperty('author')
        expect(result).toHaveProperty('content')
        expect(result).toHaveProperty('createdAt')
        expect(result).toHaveProperty('updatedAt')

        // Verify equivalence with manual mapping
        const expected = manualMapEntry(adjustedEntry)
        expect(result).toEqual(expected)
      }),
      { numRuns: 100 },
    )
  })

  it('resolver output includes all data fields from the entry', async () => {
    // Generate entries that always have at least one data field
    const entryWithDataArb = entryArb.filter((e) => Object.keys(e.data).length > 0)

    await fc.assert(
      fc.asyncProperty(entryWithDataArb, collectionConfigArb, async (entry, collectionConfig) => {
        const adjustedEntry = { ...entry, collection: collectionConfig.handle }

        const mockEngine = createMockContentEngine(collectionConfig.handle, [adjustedEntry])
        const mockRegistry = createMockBlueprintRegistry()

        const context: GraphQLContext = {
          contentEngine: mockEngine,
          blueprintRegistry: mockRegistry,
        }

        const resolvers = buildResolvers([collectionConfig])
        const singularResolver = resolvers[collectionConfig.handle] as (
          parent: unknown,
          args: { slug: string },
          ctx: GraphQLContext,
        ) => Promise<Record<string, unknown> | null>

        const result = await singularResolver(null, { slug: adjustedEntry.slug }, context)

        expect(result).not.toBeNull()

        // Verify every data field appears in the resolver output
        for (const [key, value] of Object.entries(adjustedEntry.data)) {
          expect(result).toHaveProperty(key)
          expect(result![key]).toEqual(value)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('list resolver output matches mapping each entry individually', async () => {
    const entriesArb = fc.array(entryArb, { minLength: 1, maxLength: 10 }).map((entries) => {
      // Ensure unique slugs
      const seen = new Set<string>()
      return entries.filter((e) => {
        if (seen.has(e.slug)) return false
        seen.add(e.slug)
        return true
      })
    }).filter((entries) => entries.length > 0)

    await fc.assert(
      fc.asyncProperty(entriesArb, collectionConfigArb, async (entries, collectionConfig) => {
        // Adjust all entries to belong to the same collection
        const adjustedEntries = entries.map((e) => ({
          ...e,
          collection: collectionConfig.handle,
        }))

        const mockEngine = createMockContentEngine(collectionConfig.handle, adjustedEntries)
        const mockRegistry = createMockBlueprintRegistry()

        const context: GraphQLContext = {
          contentEngine: mockEngine,
          blueprintRegistry: mockRegistry,
        }

        const resolvers = buildResolvers([collectionConfig])

        // Determine the plural handle (mirrors the pluralize logic in resolvers.ts)
        const handle = collectionConfig.handle
        let pluralHandle: string
        if (handle.endsWith('s')) {
          pluralHandle = handle
        } else if (handle.endsWith('y') && !handle.endsWith('ey')) {
          pluralHandle = handle.slice(0, -1) + 'ies'
        } else {
          pluralHandle = handle + 's'
        }

        const listResolver = resolvers[pluralHandle] as (
          parent: unknown,
          args: { filter?: Record<string, unknown>; limit?: number; offset?: number; sort?: string },
          ctx: GraphQLContext,
        ) => Promise<Record<string, unknown>[]>

        const results = await listResolver(null, {}, context)

        // Verify the list result matches mapping each entry individually
        const expected = adjustedEntries.map(manualMapEntry)
        expect(results).toEqual(expected)

        // Also verify each item in the list matches the singular resolver output
        const singularResolver = resolvers[collectionConfig.handle] as (
          parent: unknown,
          args: { slug: string },
          ctx: GraphQLContext,
        ) => Promise<Record<string, unknown> | null>

        for (let i = 0; i < adjustedEntries.length; i++) {
          const singularResult = await singularResolver(
            null,
            { slug: adjustedEntries[i].slug },
            context,
          )
          expect(singularResult).toEqual(results[i])
        }
      }),
      { numRuns: 100 },
    )
  })
})
