import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient, type MadoriClientConfig, type TypedMadoriClient, type ListOptions } from '../index.js'

// Default config — users can override
const DEFAULT_CONFIG: MadoriClientConfig = {
  contentPath: 'content',
  resourcesPath: 'resources',
}

/**
 * Get a typed Madori client instance for use in Next.js server components.
 * Accepts an optional config to override the default content/resources paths.
 */
export function madoriClient<TCollections extends Record<string, unknown>>(
  config?: MadoriClientConfig
): TypedMadoriClient<TCollections> {
  return createClient<TCollections>(config ?? DEFAULT_CONFIG)
}

/**
 * Get a typed Madori client for use in route handlers.
 * No React cache wrapping — each call creates a fresh client instance.
 */
export function getMadoriClient<TCollections extends Record<string, unknown>>(
  config?: MadoriClientConfig
): TypedMadoriClient<TCollections> {
  return createClient<TCollections>(config ?? DEFAULT_CONFIG)
}

/**
 * Create a React cache()-wrapped getEntry function for request deduplication.
 * Multiple calls with the same collection+slug within one request resolve to a single read.
 */
export function cachedGetEntry<TCollections extends Record<string, unknown>>(
  client: TypedMadoriClient<TCollections>
) {
  return cache(
    <K extends keyof TCollections & string>(collection: K, slug: string) =>
      client.getEntry(collection, slug)
  )
}

/**
 * Create a React cache()-wrapped listEntries function for request deduplication.
 * Multiple calls with the same collection+options within one request resolve to a single read.
 */
export function cachedListEntries<TCollections extends Record<string, unknown>>(
  client: TypedMadoriClient<TCollections>
) {
  return cache(
    <K extends keyof TCollections & string>(collection: K, options?: ListOptions) =>
      client.listEntries(collection, options)
  )
}

/**
 * Create an unstable_cache-wrapped getEntry with collection-based cache tags.
 * Supports revalidateTag('madori:collection:{handle}') for on-demand revalidation.
 */
export function taggedGetEntry<TCollections extends Record<string, unknown>>(
  client: TypedMadoriClient<TCollections>
) {
  return <K extends keyof TCollections & string>(collection: K, slug: string) => {
    return unstable_cache(
      () => client.getEntry(collection, slug),
      [`madori:${collection}:${slug}`],
      { tags: [`madori:collection:${collection}`] }
    )()
  }
}

/**
 * Create an unstable_cache-wrapped listEntries with collection-based cache tags.
 * Supports revalidateTag('madori:collection:{handle}') for on-demand revalidation.
 */
export function taggedListEntries<TCollections extends Record<string, unknown>>(
  client: TypedMadoriClient<TCollections>
) {
  return <K extends keyof TCollections & string>(collection: K, options?: ListOptions) => {
    const cacheKey = `madori:${collection}:list:${JSON.stringify(options ?? {})}`
    return unstable_cache(
      () => client.listEntries(collection, options),
      [cacheKey],
      { tags: [`madori:collection:${collection}`] }
    )()
  }
}
