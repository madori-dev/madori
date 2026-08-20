import { cache } from 'react'
import { headers } from 'next/headers'
import { getMadori } from '@/lib/madori'
import type { SeoRuntimeResult } from '@/lib/seo/runtime'
import { matchPublicContentRoutes } from '@/lib/routing'
import type { Entry, Term } from '@/lib/types'

const observedRecently = new Map<string, number>()
const OBSERVATION_WINDOW_MS = 60_000
const MAX_RECENT_OBSERVATIONS = 1_000

/** Request-local memoization keeps page metadata and JSON-LD on one resolution. */
export const resolvePublishedEntrySeo = cache(async (
  site: string,
  collection: string,
  slug: string,
  path?: string,
): Promise<SeoRuntimeResult | null> => {
  const { seoRuntime } = await getMadori()
  return seoRuntime.resolveEntry({ site, collection, slug, path })
})

export const resolvePublishedTermSeo = cache(async (
  site: string,
  taxonomy: string,
  slug: string,
): Promise<SeoRuntimeResult | null> => {
  const { seoRuntime } = await getMadori()
  return seoRuntime.resolveTerm({ site, taxonomy, slug })
})

/** SEO for public non-record routes such as the configured home page. */
export const resolvePublicPageSeo = cache(async (
  site: string,
  path: string,
  title?: string,
): Promise<SeoRuntimeResult> => {
  const { seoRuntime } = await getMadori()
  return seoRuntime.resolveSite({ site, path, title })
})

/** Content adapter for public pages. Drafts never cross this boundary. */
export const getPublishedEntry = cache(async (collection: string, slug: string) => {
  const { contentEngine } = await getMadori()
  const entry = await contentEngine.getEntry(collection, slug)
  return entry?.status === 'published' ? entry : null
})

/** Taxonomy terms are public unless explicitly marked draft. */
export const getPublishedTerm = cache(async (taxonomy: string, slug: string) => {
  const { contentEngine } = await getMadori()
  const term = await contentEngine.getTerm(taxonomy, slug)
  return term && term.data.status !== 'draft' ? term : null
})

export type PublishedContentRoute =
  | { kind: 'collection'; path: string; collection: string; slug: string; entry: Entry }
  | { kind: 'taxonomy'; path: string; taxonomy: string; slug: string; term: Term }

/** Resolve generated collection and taxonomy URLs back to published records. */
export const resolvePublishedContentRoute = cache(async (publicPath: string): Promise<PublishedContentRoute | null> => {
  const { contentEngine } = await getMadori()
  const [collections, taxonomies] = await Promise.all([
    contentEngine.listCollections(),
    contentEngine.listTaxonomies(),
  ])
  const candidates = matchPublicContentRoutes(publicPath, collections, taxonomies)

  for (const candidate of candidates) {
    if (candidate.kind === 'collection') {
      const entry = await getPublishedEntry(candidate.handle, candidate.slug)
      if (entry) return { kind: 'collection', path: publicPath, collection: candidate.handle, slug: candidate.slug, entry }
    } else {
      const term = await getPublishedTerm(candidate.handle, candidate.slug)
      if (term) return { kind: 'taxonomy', path: publicPath, taxonomy: candidate.handle, slug: candidate.slug, term }
    }
  }
  return null
})

/** Record a privacy-safe, bounded public 404 observation when enabled. */
export async function recordPublicNotFound(site: string, publicPath: string): Promise<void> {
  if (!publicPath.startsWith('/') || /(?:^|\/)\.(?:[^/]+)|\.(?:css|js|map|ico|png|jpe?g|gif|svg|webp|woff2?)$/i.test(publicPath)) return
  const now = Date.now()
  const key = `${site}:${publicPath}`
  const prior = observedRecently.get(key)
  if (prior && now - prior < OBSERVATION_WINDOW_MS) return
  if (observedRecently.size >= MAX_RECENT_OBSERVATIONS) {
    for (const [candidate, seenAt] of observedRecently) {
      if (now - seenAt >= OBSERVATION_WINDOW_MS) observedRecently.delete(candidate)
    }
    if (observedRecently.size >= MAX_RECENT_OBSERVATIONS) return
  }
  observedRecently.set(key, now)

  try {
    const [{ config, seoNotFound }, requestHeaders] = await Promise.all([getMadori(), headers()])
    if (!config.seo.enabled || !config.seo.errorTracking) return
    await seoNotFound.observe({ site, path: publicPath, referrer: requestHeaders.get('referer') })
  } catch {
    // Telemetry is best-effort and must never turn a 404 into a server error.
  }
}
