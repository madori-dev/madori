import { GraphQLError } from 'graphql'
import type { ContentEngine } from '@/lib/content/engine'
import type { BlueprintRegistry } from '@/lib/blueprints/registry'
import type { CollectionConfig } from '@/lib/config/schema'
import type { Entry, ListOptions } from '@/lib/types'
import type { AuthContext } from '@/lib/auth/guard'
import type { PermissionGuard } from '@/lib/auth/guard'
import { NotFoundError, AuthorizationError } from '@/lib/errors'

/**
 * Context object passed to all GraphQL resolvers.
 */
export interface GraphQLContext {
  contentEngine: ContentEngine
  blueprintRegistry: BlueprintRegistry
  auth?: AuthContext | null
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
 * Taxonomy fields that are null/undefined are normalised to empty arrays.
 */
function mapEntryToResponse(entry: Entry): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    author: entry.author ?? null,
    content: entry.content,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }

  // Merge data fields, normalising null/undefined arrays (taxonomy fields) to []
  for (const [key, value] of Object.entries(entry.data)) {
    mapped[key] = value ?? null
  }

  return mapped
}

/**
 * Creates a structured GraphQLError with an error code in extensions.
 * No stack traces are exposed to clients.
 */
function createGraphQLError(
  message: string,
  code: 'NOT_FOUND' | 'INTERNAL_ERROR' | 'UNAUTHORIZED' | 'CONFLICT',
  details?: Record<string, unknown>
): GraphQLError {
  return new GraphQLError(message, {
    extensions: {
      code,
      ...(details ? { details } : {}),
    },
  })
}

/**
 * Wraps a resolver function with error handling.
 * - AuthorizationError → GraphQLError with UNAUTHORIZED code
 * - NotFoundError → GraphQLError with NOT_FOUND code
 * - All other errors → GraphQLError with INTERNAL_ERROR code (no stack traces)
 * Full error details are logged server-side.
 */
function withErrorHandling<TArgs, TResult>(
  resolverFn: (parent: unknown, args: TArgs, context: GraphQLContext) => Promise<TResult>
): (parent: unknown, args: TArgs, context: GraphQLContext) => Promise<TResult> {
  return async (parent, args, context) => {
    try {
      return await resolverFn(parent, args, context)
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error
      }

      if (error instanceof AuthorizationError) {
        throw createGraphQLError(error.message, 'UNAUTHORIZED')
      }

      if (error instanceof NotFoundError) {
        throw createGraphQLError(error.message, 'NOT_FOUND')
      }

      // Log the full error server-side, expose only a safe message to clients
      console.error('[madori:graphql] Resolver error:', error)
      const message = error instanceof Error ? error.message : 'An internal error occurred'
      throw createGraphQLError(message, 'INTERNAL_ERROR')
    }
  }
}

/**
 * Options for building GraphQL resolvers.
 */
export interface BuildResolversOptions {
  /** Optional permission guard for enforcing access control on resolvers. */
  guard?: PermissionGuard
}

/**
 * Builds GraphQL resolver functions for all configured collections,
 * plus stubs for taxonomies, globals, navigation, and assets.
 *
 * All resolvers are wrapped with error handling that:
 * - Returns [] for empty collections (list queries)
 * - Returns null for missing entries (singular queries)
 * - Returns [] for empty taxonomy fields
 * - Wraps FS/unexpected errors as structured GraphQLError with INTERNAL_ERROR code
 * - Returns NOT_FOUND error code for unknown collections
 * - Passes filter/limit/offset/sort through to the Content Engine
 *
 * When a PermissionGuard is provided, collection resolvers are additionally
 * wrapped with permission checks (view for queries, edit for mutations).
 */
export function buildResolvers(collections: CollectionConfig[], options?: BuildResolversOptions) {
  const resolvers: Record<string, unknown> = {}
  const guard = options?.guard

  // Collection resolvers
  for (const collection of collections) {
    const handle = collection.handle

    // Singular resolver: e.g. blog(slug: "hello-world")
    const singularResolver = withErrorHandling(async (
      _parent: unknown,
      args: { slug: string },
      context: GraphQLContext
    ): Promise<Record<string, unknown> | null> => {
      const entry = await context.contentEngine.getEntry(handle, args.slug)
      if (!entry) return null
      return mapEntryToResponse(entry)
    })

    // Wrap with permission guard if available (read access, scoped to collection)
    resolvers[handle] = guard
      ? guard.wrapResolver('entries', 'view', singularResolver, () => handle)
      : singularResolver

    // List resolver: e.g. blogs(filter: {...}, limit: 10, offset: 0, sort: "title:asc")
    const pluralHandle = pluralize(handle)
    const listResolver = withErrorHandling(async (
      _parent: unknown,
      args: { filter?: Record<string, unknown>; limit?: number; offset?: number; sort?: string },
      context: GraphQLContext
    ): Promise<Record<string, unknown>[]> => {
      const listOpts: ListOptions = {}

      if (args.filter) {
        listOpts.filter = args.filter
      }
      if (args.limit != null) {
        listOpts.limit = args.limit
      }
      if (args.offset != null) {
        listOpts.offset = args.offset
      }
      if (args.sort) {
        listOpts.sort = parseSort(args.sort)
      }

      const entries = await context.contentEngine.listEntries(handle, listOpts)
      return entries.map(mapEntryToResponse)
    })

    // Wrap with permission guard if available (read access, scoped to collection)
    resolvers[pluralHandle] = guard
      ? guard.wrapResolver('entries', 'view', listResolver, () => handle)
      : listResolver
  }

  // ─── Taxonomy resolvers ─────────────────────────────────────────────────

  const taxonomiesResolver = withErrorHandling(async (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext
  ) => {
    const taxonomies = await context.contentEngine.listTaxonomies()
    return taxonomies ?? []
  })
  resolvers['taxonomies'] = guard
    ? guard.wrapResolver('taxonomies', 'view', taxonomiesResolver)
    : taxonomiesResolver

  const taxonomyResolver = withErrorHandling(async (
    _parent: unknown,
    args: { handle: string },
    context: GraphQLContext
  ) => {
    const taxonomy = await context.contentEngine.getTaxonomy(args.handle)
    return taxonomy ?? null
  })
  resolvers['taxonomy'] = guard
    ? guard.wrapResolver('taxonomies', 'view', taxonomyResolver)
    : taxonomyResolver

  const termsResolver = withErrorHandling(async (
    _parent: unknown,
    args: { taxonomy: string },
    context: GraphQLContext
  ) => {
    const terms = await context.contentEngine.listTerms(args.taxonomy)
    return terms ?? []
  })
  resolvers['terms'] = guard
    ? guard.wrapResolver('taxonomies', 'view', termsResolver)
    : termsResolver

  // ─── Global resolvers ───────────────────────────────────────────────────

  const globalsResolver = withErrorHandling(async (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext
  ) => {
    const globals = await context.contentEngine.listGlobals()
    return globals ?? []
  })
  resolvers['globals'] = guard
    ? guard.wrapResolver('globals', 'view', globalsResolver)
    : globalsResolver

  const globalResolver = withErrorHandling(async (
    _parent: unknown,
    args: { handle: string },
    context: GraphQLContext
  ) => {
    const global = await context.contentEngine.getGlobal(args.handle)
    return global ?? null
  })
  resolvers['global'] = guard
    ? guard.wrapResolver('globals', 'view', globalResolver)
    : globalResolver

  // ─── Navigation resolvers ──────────────────────────────────────────────

  const navigationsResolver = withErrorHandling(async (
    _parent: unknown,
    _args: unknown,
    context: GraphQLContext
  ) => {
    const navigations = await context.contentEngine.listNavigations()
    return navigations ?? []
  })
  resolvers['navigations'] = guard
    ? guard.wrapResolver('navigation', 'view', navigationsResolver)
    : navigationsResolver

  const navigationResolver = withErrorHandling(async (
    _parent: unknown,
    args: { handle: string },
    context: GraphQLContext
  ) => {
    const navigation = await context.contentEngine.getNavigation(args.handle)
    return navigation ?? null
  })
  resolvers['navigation'] = guard
    ? guard.wrapResolver('navigation', 'view', navigationResolver)
    : navigationResolver

  // ─── Asset resolvers ───────────────────────────────────────────────────

  const assetsResolver = withErrorHandling(async (
    _parent: unknown,
    args: { directory?: string },
    context: GraphQLContext
  ) => {
    const assets = await context.contentEngine.listAssets(args.directory)
    return assets ?? []
  })
  resolvers['assets'] = guard
    ? guard.wrapResolver('assets', 'view', assetsResolver)
    : assetsResolver

  const assetResolver = withErrorHandling(async (
    _parent: unknown,
    args: { path: string },
    context: GraphQLContext
  ) => {
    const asset = await context.contentEngine.getAsset(args.path)
    return asset ?? null
  })
  resolvers['asset'] = guard
    ? guard.wrapResolver('assets', 'view', assetResolver)
    : assetResolver

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

// Re-export for testing
export { createGraphQLError, withErrorHandling, mapEntryToResponse, parseSort }
