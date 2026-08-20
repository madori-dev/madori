/** Versioned, serialisable SEO domain model. Keep this independent of UI/routes. */
export const SEO_DOCUMENT_VERSION = 1 as const

export type SeoSourceKind = 'inherit' | 'literal' | 'field' | 'template' | 'disabled'
export interface SeoSource {
  kind: SeoSourceKind
  value?: string
}

export type SeoIndexing = 'index' | 'noindex'
export type SeoFollowing = 'follow' | 'nofollow'
export interface SeoRobots {
  indexing?: SeoIndexing
  following?: SeoFollowing
  noarchive?: boolean
  noimageindex?: boolean
  nosnippet?: boolean
}

export interface SeoSocial {
  image?: SeoSource
  imageAlt?: SeoSource
  twitterCard?: 'summary' | 'summary_large_image'
  twitterSite?: string
  twitterCreator?: string
}

export interface SeoSitemap {
  enabled?: boolean
  priority?: number
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
}

export interface SeoJsonLd {
  enabled?: boolean
  type?: 'WebPage' | 'Article' | 'Organization' | 'Person' | 'BreadcrumbList' | 'custom'
  /** Object is intentionally data-only; rendering validates and serialises it safely. */
  custom?: Record<string, unknown>
}

export interface SeoValues {
  enabled?: boolean
  title?: SeoSource
  description?: SeoSource
  canonical?: SeoSource
  robots?: SeoRobots
  social?: SeoSocial
  sitemap?: SeoSitemap
  jsonLd?: SeoJsonLd
}

export type SeoSectionKind = 'collection' | 'taxonomy'

export interface SeoDocumentBase {
  version: typeof SEO_DOCUMENT_VERSION
  seo: SeoValues
}

export interface SeoSiteDocument extends SeoDocumentBase {
  kind: 'site'
  site: string
}

export interface SeoSectionDocument extends SeoDocumentBase {
  kind: 'section'
  section: SeoSectionKind
  handle: string
}

/** Stored in entry/term frontmatter, not a standalone repository document. */
export type SeoItemValues = SeoValues

export type SeoDocument = SeoSiteDocument | SeoSectionDocument
export type SeoDocumentKind = SeoDocument['kind']

export interface SeoDocumentSnapshot<T extends SeoDocument = SeoDocument> {
  document: T
  /** SHA-256 of source serialisation: provide on update/delete to prevent lost writes. */
  revision: string
  path: string
}

export interface SeoWriteOptions {
  /** Optional compare-and-swap revision returned by read. */
  expectedRevision?: string
}
