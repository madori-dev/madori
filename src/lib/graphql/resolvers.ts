import type { ContentEngine } from '@/lib/content/engine'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { CollectionConfig } from '@/lib/config/schema'
import type { Entry, ListOptions } from '@/lib/types'

/**
 * Context object passed to all GraphQL resolvers.
 */
export interface GraphQLContext {
  contentEngine: ContentEngine
  blueprintRegistry: BlueprintRegistry
}

/**
 * Parses a sort string in the format "field:direction" into a ListOptions sort object.
 * e.g. "title:asc" → { field: "title", direction: "asc" }
 * e.g. "createdAt:desc" → { field: "createdAt", direction: "desc" }
 * Falls back to ascending if direction is missing or invalid.
 */
function parseSort(sort: string | undefined | null): ListOptions['sort'] {
  if (!sort) return undefined

  const [field, dir] = sort.split(':')
  if (!field) return undefined

  const direction = dir === 'desc' ? 'desc' : 'asc'
  return { field, direction }
}

/**
 * Maps an Entry object to the GraphQL response format.
 * Standard fields come from the Entry directly; blueprint-defined fields come from entry.data.
 */
function mapEntryToResponse(entry: Entry): Record<string, unknown> {
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
 * Builds GraphQL resolver functions for all configured collections,
 * plus stubs for taxonomies, globals, navigation, and assets.
 */
export function buildResolvers(collections: CollectionConfig[]) {
  const resolvers: Record<string, unknown> = {}

  // Collection resolvers
  for (const collection of collections) {
    const handle = collection.handle

    // Singular resolver: e.g. blog(slug: "hello-world")
    resolvers[handle] = async (
      _parent: unknown,
      args: { slug: string },
      context: GraphQLContext
    ): Promise<Record<string, unknown> | null> => {
      const entry = await context.contentEngine.getEntry(handle, args.slug)
      if (!entry) return null
      return mapEntryToResponse(entry)
    }

    // List resolver: e.g. blogs(filter: {...}, limit: 10, offset: 0, sort: "title:asc")
    const pluralHandle = pluralize(handle)
    resolvers[pluralHandle] = async (
      _parent: unknown,
      args: { filter?: Record<string, unknown>; limit?: number; offset?: number; sort?: string },
      context: GraphQLContext
    ): Promise<Record<string, unknown>[]> => {
      const options: ListOptions = {}

      if (args.filter) {
        options.filter = args.filter
      }
      if (args.limit != null) {
        options.limit = args.limit
      }
      if (args.offset != null) {
        options.offset = args.offset
      }
      if (args.sort) {
        options.sort = parseSort(args.sort)
      }

      const entries = await context.contentEngine.listEntries(handle, options)
      return entries.map(mapEntryToResponse)
    }
  }

  // ─── Taxonomy resolvers (stubs) ─────────────────────────────────────────

  resolvers['taxonomies'] = async (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext
  ) => {
    return context.contentEngine.listTaxonomies()
  }

  resolvers['taxonomy'] = async (
    _parent: unknown,
    args: { handle: string },
    context: GraphQLContext
  ) => {
    return context.contentEngine.getTaxonomy(args.handle)
  }

  resolvers['terms'] = async (
    _parent: unknown,
    args: { taxonomy: string },
    context: GraphQLContext
  ) => {
    return context.contentEngine.listTerms(args.taxonomy)
  }

  // ─── Global resolvers (stubs) ───────────────────────────────────────────

  resolvers['globals'] = async (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext
  ) => {
    return context.contentEngine.listGlobals()
  }

  resolvers['global'] = async (
    _parent: unknown,
    args: { handle: string },
    context: GraphQLContext
  ) => {
    return context.contentEngine.getGlobal(args.handle)
  }

  // ─── Navigation resolvers (stubs) ──────────────────────────────────────

  resolvers['navigations'] = async (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext
  ) => {
    return context.contentEngine.listNavigations()
  }

  resolvers['navigation'] = async (
    _parent: unknown,
    args: { handle: string },
    context: GraphQLContext
  ) => {
    return context.contentEngine.getNavigation(args.handle)
  }

  // ─── Asset resolvers (stubs) ───────────────────────────────────────────

  resolvers['assets'] = async (
    _parent: unknown,
    args: { directory?: string },
    context: GraphQLContext
  ) => {
    return context.contentEngine.listAssets(args.directory)
  }

  resolvers['asset'] = async (
    _parent: unknown,
    args: { path: string },
    context: GraphQLContext
  ) => {
    return context.contentEngine.getAsset(args.path)
  }

  return resolvers
}

/**
 * Pluralizes a handle for list query names.
 * Simple pluralization: append 's' if not already ending in 's'.
 */
function pluralize(handle: string): string {
  if (handle.endsWith('s')) return handle
  if (handle.endsWith('y') && !handle.endsWith('ey')) {
    return handle.slice(0, -1) + 'ies'
  }
  return handle + 's'
}
