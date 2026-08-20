/**
 * Fully-resolved, serialisable SEO input. Keep this separate from storage and
 * resolution so every public output renders identical final values.
 */
export interface ResolvedSeoOutputView {
  canonical: string
  title: string
  description?: string
  siteName?: string
  locale?: string
  /** Use `article` for entry-like pages; all other values produce WebPage. */
  pageType?: 'website' | 'article' | 'profile'
  robots?: string[]
  social?: {
    enabled?: boolean
    image?: string
    imageAlt?: string
    twitterCard?: 'summary' | 'summary_large_image'
    twitterSite?: string
    twitterCreator?: string
  }
  alternates?: Record<string, string>
  pagination?: { previous?: string; next?: string }
  article?: {
    author?: string
    publishedAt?: string
    modifiedAt?: string
    section?: string
    tags?: string[]
  }
  organization?: {
    type?: 'Organization' | 'Person'
    name: string
    url?: string
    logo?: string
    sameAs?: string[]
  }
  breadcrumbs?: Array<{ name: string; url: string }>
  jsonLd?: {
    type?: 'WebPage' | 'Article' | 'Organization' | 'Person' | 'BreadcrumbList' | 'custom'
    custom?: Record<string, unknown>
  }
}

/** Deliberately structural: compatible with Next Metadata without importing Next. */
export interface SeoMetadataDescriptor {
  title: string
  description?: string
  alternates: {
    canonical: string
    languages?: Record<string, string>
    previous?: string
    next?: string
  }
  robots?: string
  openGraph: {
    type: 'website' | 'article' | 'profile'
    url: string
    title: string
    description?: string
    siteName?: string
    locale?: string
    images?: Array<{ url: string; alt?: string }>
    publishedTime?: string
    modifiedTime?: string
    authors?: string[]
    section?: string
    tags?: string[]
  }
  twitter?: {
    card: 'summary' | 'summary_large_image'
    title: string
    description?: string
    images?: string[]
    site?: string
    creator?: string
  }
}

export type JsonLdNode = Record<string, unknown> & { '@context'?: 'https://schema.org'; '@type': string; '@id'?: string }

export interface JsonLdGraph {
  '@context': 'https://schema.org'
  '@graph': JsonLdNode[]
}

export interface SitemapUrl {
  url: string
  lastModified?: string | Date
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  alternates?: Record<string, string>
  images?: Array<{ url: string; title?: string; caption?: string }>
}

export interface SitemapDocument {
  /** Sitemap index is emitted when present and non-empty; otherwise an URL set. */
  sitemaps?: Array<{ url: string; lastModified?: string | Date }>
  urls?: SitemapUrl[]
}

export interface RobotsDocument {
  groups?: Array<{ userAgent: string | string[]; allow?: string[]; disallow?: string[]; crawlDelay?: number }>
  sitemapUrls?: string[]
  host?: string
}

export interface HumansDocument {
  team?: string[]
  thanks?: string[]
  site?: string[]
}
