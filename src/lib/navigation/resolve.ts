import type { ContentEngine } from '@/lib/content/engine'
import type { Collection, NavigationItem } from '@/lib/types'
import type { SiteContext } from '@/lib/sites'
import type { UrlResolver } from '@/lib/routing/url-resolver'

interface NavigationResolutionOptions {
  collections: Collection[]
  content: Pick<ContentEngine, 'getEntry'>
  urlResolver: UrlResolver
  site: SiteContext
}

/** Resolve stored `collection/slug` references using same public URL rules as SEO. */
export async function resolveNavigationItems(items: NavigationItem[], options: NavigationResolutionOptions): Promise<NavigationItem[]> {
  return Promise.all(items.map(async (item) => {
    const children = Array.isArray(item.children) ? await resolveNavigationItems(item.children, options) : undefined
    const url = typeof item.url === 'string' ? item.url : await resolveEntryReference(typeof item.entry === 'string' ? item.entry : undefined, options)
    return { ...item, ...(url ? { url } : {}), ...(children ? { children } : {}) }
  }))
}

async function resolveEntryReference(entry: string | undefined, { collections, content, urlResolver, site }: NavigationResolutionOptions): Promise<string | undefined> {
  if (!entry) return undefined
  const separator = entry.indexOf('/')
  if (separator < 1 || separator === entry.length - 1) return undefined
  const collection = entry.slice(0, separator)
  const reference = entry.slice(separator + 1)
  const definition = collections.find((candidate) => candidate.handle === collection)
  if (!definition) return undefined
  const parts = reference.split('/').filter(Boolean)
  const usesParentUri = definition.route?.includes('{parent_uri}')
  const slug = usesParentUri ? parts.at(-1) : reference
  if (!slug) return undefined
  const resolvedEntry = await content.getEntry(collection, slug)
  if (!resolvedEntry) return undefined
  try {
    const url = urlResolver.entry({
      site,
      collection,
      slug: resolvedEntry.slug,
      parentSlugs: usesParentUri ? parts.slice(0, -1) : undefined,
      route: definition.route,
    })
    return new URL(url).pathname
  } catch {
    return undefined
  }
}
