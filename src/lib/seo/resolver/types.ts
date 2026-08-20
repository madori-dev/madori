import type { SeoItemValues, SeoJsonLd, SeoRobots, SeoSitemap, SeoSocial, SeoSource, SeoValues } from '@/lib/seo'
import type { UrlResolver } from '@/lib/routing'
import type { SiteContext } from '@/lib/sites'

export type SeoSubjectType = 'entry' | 'term' | 'page' | 'archive'
export type SeoLayerName = 'system' | 'site' | 'scope' | 'record'
export type SeoProvenance = SeoLayerName | `${SeoLayerName}:suppressed` | 'generated'

export interface SeoSubject {
  type: SeoSubjectType
  id: string
  title?: string
  path: string
  /** Values available to field and template sources. */
  fields?: Record<string, unknown>
}

/**
 * Transitional shape accepted for content frontmatter. Nested `seo` is
 * preferred; legacy top-level meta fields are only considered at record level.
 */
export interface SeoRecordInput {
  seo?: SeoItemValues | Record<string, unknown> | null
  meta_title?: string | null
  meta_description?: string | null
  og_image?: string | null
  canonical_url?: string | null
  no_index?: boolean | null
  [key: string]: unknown
}

export interface SeoResolutionInput {
  subject: SeoSubject
  site: SiteContext
  urlResolver: UrlResolver
  /** System defaults are safe fallbacks and never persist as authored SEO. */
  system?: SeoValues | Record<string, unknown> | null
  siteDefaults?: SeoValues | Record<string, unknown> | null
  sectionDefaults?: SeoValues | Record<string, unknown> | null
  record?: SeoRecordInput | SeoItemValues | null
  /** All public sites, used for hreflang alternatives. */
  sites?: SiteContext[]
  /** Site-handle or locale keyed localized paths. */
  localizedPaths?: Record<string, string>
  /** Optional publication filter for localized alternate URLs. */
  publishedSites?: readonly string[]
  page?: number
  pageCount?: number
  paginationParameter?: string
  /** External canonicals are denied unless this explicit policy allows them. */
  allowExternalCanonicals?: boolean
  /** Allow-list external canonical origins; takes precedence over broad opt-in. */
  allowedCanonicalOrigins?: string[]
}

export interface ResolvedSeo {
  excluded: boolean
  title?: string
  description?: string
  canonical?: string
  robots: Required<Pick<SeoRobots, 'indexing' | 'following'>> & Omit<SeoRobots, 'indexing' | 'following'>
  social: (ResolvedSeoSocial & SeoSocial) | null
  sitemap: Required<Pick<SeoSitemap, 'enabled'>> & SeoSitemap
  jsonLd: Required<Pick<SeoJsonLd, 'enabled'>> & SeoJsonLd
  alternates: Record<string, string>
  previous?: string
  next?: string
  /** Public output consumers can use this directly for Next metadata adapters. */
  metadata: { title?: string; description?: string; canonical?: string } | null
  provenance: Record<string, SeoProvenance>
  explain: SeoExplainStep[]
}

export interface ResolvedSeoSocial {
  enabled?: boolean
}

export interface SeoExplainStep {
  field: string
  source: SeoProvenance
  value: unknown
}

export interface NormalizedSeoValues extends SeoValues {
  titleTemplate?: SeoSource
  titleSuffix?: SeoSource
  social?: SeoSocial & { enabled?: boolean }
}
