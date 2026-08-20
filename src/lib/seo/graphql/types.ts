import type { SeoAuditReport } from '@/lib/seo/audit'
import type { SeoDocumentSnapshot, SeoSectionDocument, SeoSiteDocument, SeoValues } from '@/lib/seo/domain'
import type { SeoRedirectSnapshot } from '@/lib/seo/redirects'
import type { ResolvedSeo } from '@/lib/seo/resolver'

/** Boundary consumed by GraphQL. Implementations must never return storage paths. */
export interface SeoGraphQLPort {
  getSite(site: string): Promise<SeoDocumentSnapshot<SeoSiteDocument> | null>
  getSection(section: 'collection' | 'taxonomy', handle: string): Promise<SeoDocumentSnapshot<SeoSectionDocument> | null>
  /** Must resolve published content only. Draft preview uses preview instead. */
  resolve(input: SeoResolvedQuery): Promise<ResolvedSeo | null>
  resolveTerm?(input: SeoResolvedTermQuery): Promise<ResolvedSeo | null>
  preview?(input: SeoResolvedQuery): Promise<ResolvedSeo | null>
  previewTerm?(input: SeoResolvedTermQuery): Promise<ResolvedSeo | null>
  getReport?(id?: string, site?: string): Promise<SeoAuditReport | null>
  listRedirects?(site?: string): Promise<readonly SeoRedirectSnapshot[]>
  getRedirect?(id: string): Promise<SeoRedirectSnapshot | null>
  saveSite?(document: SeoSiteDocument, expectedRevision?: string): Promise<SeoDocumentSnapshot<SeoSiteDocument>>
  saveSection?(document: SeoSectionDocument, expectedRevision?: string): Promise<SeoDocumentSnapshot<SeoSectionDocument>>
  saveRedirect?(redirect: SeoRedirectSnapshot['redirect'], expectedRevision?: string): Promise<SeoRedirectSnapshot>
  deleteRedirect?(id: string, expectedRevision?: string): Promise<boolean>
}

export interface SeoResolvedQuery {
  site: string
  collection: string
  slug: string
}

export interface SeoResolvedTermQuery {
  site: string
  taxonomy: string
  slug: string
}

/** Deliberately narrow GraphQL-facing representation. No source paths or raw errors. */
export interface SeoGraphQLResolved {
  excluded: boolean
  title: string | null
  description: string | null
  canonical: string | null
  indexing: string
  following: string
  noarchive: boolean | null
  noimageindex: boolean | null
  nosnippet: boolean | null
  sitemapEnabled: boolean
  sitemapPriority: number | null
  sitemapChangeFrequency: string | null
  jsonLdEnabled: boolean
  jsonLdType: string | null
  socialImage: string | null
  socialImageAlt: string | null
  twitterCard: string | null
  twitterSite: string | null
  twitterCreator: string | null
  alternates: SeoGraphQLAlternate[]
  previous: string | null
  next: string | null
}

export interface SeoGraphQLAlternate { locale: string; url: string }
export interface SeoGraphQLDocumentMeta { revision: string }
export interface SeoGraphQLSiteDocument { data: SeoSiteDocument; meta: SeoGraphQLDocumentMeta }
export interface SeoGraphQLSectionDocument { data: SeoSectionDocument; meta: SeoGraphQLDocumentMeta }
export interface SeoGraphQLRedirect { data: SeoRedirectSnapshot['redirect']; meta: SeoGraphQLDocumentMeta }
export interface SeoGraphQLMutationResult<T> { data: T; meta: SeoGraphQLDocumentMeta }

export function toSeoGraphQLResolved(resolved: ResolvedSeo): SeoGraphQLResolved {
  return {
    excluded: resolved.excluded,
    title: resolved.title ?? null,
    description: resolved.description ?? null,
    canonical: resolved.canonical ?? null,
    indexing: resolved.robots.indexing,
    following: resolved.robots.following,
    noarchive: resolved.robots.noarchive ?? null,
    noimageindex: resolved.robots.noimageindex ?? null,
    nosnippet: resolved.robots.nosnippet ?? null,
    sitemapEnabled: resolved.sitemap.enabled,
    sitemapPriority: resolved.sitemap.priority ?? null,
    sitemapChangeFrequency: resolved.sitemap.changeFrequency ?? null,
    jsonLdEnabled: resolved.jsonLd.enabled,
    jsonLdType: resolved.jsonLd.type ?? null,
    socialImage: typeof resolved.social?.image === 'string' ? resolved.social.image : resolved.social?.image?.value ?? null,
    socialImageAlt: typeof resolved.social?.imageAlt === 'string' ? resolved.social.imageAlt : resolved.social?.imageAlt?.value ?? null,
    twitterCard: resolved.social?.twitterCard ?? null,
    twitterSite: resolved.social?.twitterSite ?? null,
    twitterCreator: resolved.social?.twitterCreator ?? null,
    alternates: Object.entries(resolved.alternates).map(([locale, url]) => ({ locale, url })),
    previous: resolved.previous ?? null,
    next: resolved.next ?? null,
  }
}

export function documentValues(value: SeoValues): SeoValues { return value }
