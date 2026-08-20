import type { ContentEngine } from '@/lib/content/engine'
import type { SeoValues } from '@/lib/seo/domain'
import type { ResolvedSeo } from '@/lib/seo/resolver'
import type { JsonLdGraph, SeoMetadataDescriptor, SitemapUrl } from '@/lib/seo/outputs'
import type { UrlResolver } from '@/lib/routing'
import type { SiteContext } from '@/lib/sites'

/** Minimal public content representation. Runtime never accepts drafts here. */
export interface PublishedSeoEntry {
  collection: string
  slug: string
  title: string
  data: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
  author?: string
  route?: string
  parentSlugs?: string[]
  localizedPaths?: Record<string, string>
}

/** Terms without a status are considered published by the content model. */
export interface PublishedSeoTerm {
  taxonomy: string
  slug: string
  title: string
  description?: string
  data: Record<string, unknown>
  updatedAt?: string
  route?: string
  localizedPaths?: Record<string, string>
}

export interface SeoCollectionDefinition { handle: string; title?: string; route?: string }
export interface SeoTaxonomyDefinition { handle: string; title?: string; route?: string }

/**
 * Public-only port. Implementations must apply publication filtering before
 * returning a record; this keeps sitemap/robots callers unable to read drafts.
 */
export interface PublishedSeoContentPort {
  getPublishedEntry(collection: string, slug: string): Promise<PublishedSeoEntry | null>
  listPublishedEntries(collection: string): Promise<readonly PublishedSeoEntry[]>
  getPublishedTerm(taxonomy: string, slug: string): Promise<PublishedSeoTerm | null>
  listPublishedTerms(taxonomy: string): Promise<readonly PublishedSeoTerm[]>
  listCollections(): Promise<readonly SeoCollectionDefinition[]>
  listTaxonomies(): Promise<readonly SeoTaxonomyDefinition[]>
}

export interface SeoDefaultsPort {
  getSite(site: string): Promise<{ document: { seo: SeoValues } } | null>
  getSection(section: 'collection' | 'taxonomy', handle: string): Promise<{ document: { seo: SeoValues } } | null>
}

export interface SeoAssetPort {
  /** Resolve authored asset reference to absolute public URL, or return null. */
  publicUrl(reference: string, site: SiteContext): Promise<string | null> | string | null
}

export interface SeoRuntimeOptions {
  content: PublishedSeoContentPort
  defaults: SeoDefaultsPort
  sites: readonly SiteContext[]
  urlResolver: UrlResolver
  systemDefaults?: SeoValues
  siteName?: (site: SiteContext) => string | undefined
  assets?: SeoAssetPort
  /** Runtime feature switches, normally sourced from config.seo. */
  features?: {
    enabled?: boolean
    metadata?: boolean
    structuredData?: boolean
    socialImages?: boolean
    allowExternalCanonicals?: boolean
  }
}

export interface SeoResolutionRequest {
  site: string | SiteContext
  collection: string
  slug: string
  /** Public route override for special records such as the home entry. */
  path?: string
  /** Handles with published translations; omitted means localizedPaths is trusted. */
  publishedSites?: readonly string[]
}

export interface SeoTermResolutionRequest {
  site: string | SiteContext
  taxonomy: string
  slug: string
}

export interface SeoSiteResolutionRequest {
  site: string | SiteContext
  path?: string
  title?: string
  fields?: Record<string, unknown>
}

export interface SeoDefaultsPreviewRequest {
  site: string | SiteContext
  section?: 'collection' | 'taxonomy'
  handle?: string
}

export interface SeoRuntimeResult {
  resolved: ResolvedSeo
  metadata: SeoMetadataDescriptor | null
  jsonLd: JsonLdGraph | null
  view: { canonical: string; title: string; description?: string }
  /** Absolute, resolved social image suitable for sitemap image extensions. */
  socialImage?: { url: string; alt?: string }
  dependencies: SeoCacheDependencies
}

export interface SeoSitemapResult {
  site: SiteContext
  urls: readonly SitemapUrl[]
  dependencies: SeoCacheDependencies
}

export interface SeoCacheDependencies {
  sites?: readonly string[]
  sections?: readonly string[]
  records?: readonly string[]
  assets?: readonly string[]
}

export type SeoCacheInvalidation = SeoCacheDependencies

/** Required capability for explain/provenance output. Do not pass a UI boolean. */
export interface AuthenticatedSeoPreviewAdapter {
  isAuthenticated(): boolean | Promise<boolean>
}

export interface SeoPreviewResult extends SeoRuntimeResult {
  provenance: ResolvedSeo['provenance']
  explain: ResolvedSeo['explain']
}

/** Adapter for current ContentEngine; its public term convention excludes data.status=draft. */
export function createContentEngineSeoPort(engine: ContentEngine): PublishedSeoContentPort {
  return {
    async getPublishedEntry(collection, slug) {
      const entry = await engine.getEntry(collection, slug)
      return entry?.status === 'published' ? entryToPublic(entry) : null
    },
    async listPublishedEntries(collection) {
      const entries = await engine.listEntries(collection, { status: 'published' })
      return entries.filter(entry => entry.status === 'published').map(entryToPublic)
    },
    async getPublishedTerm(taxonomy, slug) {
      const term = await engine.getTerm(taxonomy, slug)
      return term && term.data.status !== 'draft' ? termToPublic(term) : null
    },
    async listPublishedTerms(taxonomy) {
      const terms = await engine.listTerms(taxonomy)
      return terms.filter(term => term.data.status !== 'draft').map(termToPublic)
    },
    async listCollections() {
      return (await engine.listCollections()).map(item => ({ handle: item.handle, title: item.title, route: item.route }))
    },
    async listTaxonomies() {
      return (await engine.listTaxonomies()).map(item => ({ handle: item.handle, title: item.title, route: item.route }))
    },
  }
}

function entryToPublic(entry: Awaited<ReturnType<ContentEngine['getEntry']>> & object): PublishedSeoEntry {
  const value = entry as import('@/lib/types').Entry
  return { collection: value.collection, slug: value.slug, title: value.title, data: value.data, createdAt: value.createdAt, updatedAt: value.updatedAt, author: value.author }
}

function termToPublic(term: NonNullable<Awaited<ReturnType<ContentEngine['getTerm']>>>): PublishedSeoTerm {
  return { taxonomy: term.taxonomy, slug: term.slug, title: term.title, description: term.description, data: term.data }
}
