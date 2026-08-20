import { generateHumansTxt, generateJsonLd, generateMetadata, generateRobotsTxt, generateSitemapXml, isAbsoluteHttpUrl, type ResolvedSeoOutputView, type SitemapUrl } from '@/lib/seo/outputs'
import { SeoResolver, type ResolvedSeo } from '@/lib/seo/resolver'
import type { SiteContext } from '@/lib/sites'
import { SeoRuntimeCache } from './cache'
import type {
  AuthenticatedSeoPreviewAdapter,
  PublishedSeoEntry,
  PublishedSeoTerm,
  SeoCacheDependencies,
  SeoCacheInvalidation,
  SeoDefaultsPreviewRequest,
  SeoResolutionRequest,
  SeoRuntimeOptions,
  SeoRuntimeResult,
  SeoSiteResolutionRequest,
  SeoSitemapResult,
  SeoTermResolutionRequest,
} from './types'

/** Framework-neutral composition root for all public SEO output. */
export class SeoRuntime {
  readonly cache = new SeoRuntimeCache()
  private readonly resolver = new SeoResolver()
  private readonly sitesByHandle: ReadonlyMap<string, SiteContext>

  constructor(private readonly options: SeoRuntimeOptions) {
    if (!options.sites.length) throw new Error('SeoRuntime requires at least one public site.')
    this.sitesByHandle = new Map(options.sites.map(site => [site.handle, site]))
  }

  async resolveEntry(request: SeoResolutionRequest): Promise<SeoRuntimeResult | null> {
    const site = this.site(request.site)
    const key = `entry:${site.handle}:${request.collection}:${request.slug}:${request.path ?? ''}`
    const dependencies = recordDependencies(site, 'collection', request.collection, request.slug)
    return this.cache.getOrCreate(key, dependencies, async () => {
      const entry = await this.options.content.getPublishedEntry(request.collection, request.slug)
      if (!entry) return null
      const definition = (await this.options.content.listCollections()).find(item => item.handle === entry.collection)
      return this.resolvePublishedEntry(site, { ...entry, route: entry.route ?? definition?.route }, request.path, request.publishedSites)
    })
  }

  async resolveTerm(request: SeoTermResolutionRequest): Promise<SeoRuntimeResult | null> {
    const site = this.site(request.site)
    const key = `term:${site.handle}:${request.taxonomy}:${request.slug}`
    const dependencies = recordDependencies(site, 'taxonomy', request.taxonomy, request.slug)
    return this.cache.getOrCreate(key, dependencies, async () => {
      const term = await this.options.content.getPublishedTerm(request.taxonomy, request.slug)
      if (!term) return null
      const definition = (await this.options.content.listTaxonomies()).find(item => item.handle === term.taxonomy)
      return this.resolvePublishedTerm(site, { ...term, route: term.route ?? definition?.route })
    })
  }

  /** Site-level defaults for home, static pages, and generated documents. */
  async resolveSite(request: SeoSiteResolutionRequest): Promise<SeoRuntimeResult> {
    const site = this.site(request.site)
    const path = request.path ?? '/'
    const key = `site:${site.handle}:${path}:${request.title ?? ''}`
    const dependencies = { sites: [site.handle] }
    return this.cache.getOrCreate(key, dependencies, async () => {
      const defaults = await this.defaults(site)
      return this.render({
        site,
        subject: { type: 'page', id: path, title: request.title, path, fields: request.fields },
        siteDefaults: defaults.site,
        dependencies,
      })
    })
  }

  /** Sitemap candidates from published records only. No draft-capable port is exposed. */
  async sitemap(siteInput: string | SiteContext): Promise<SeoSitemapResult> {
    const site = this.site(siteInput)
    const key = `sitemap:${site.handle}`
    const [collections, taxonomies] = await Promise.all([this.options.content.listCollections(), this.options.content.listTaxonomies()])
    const dependencies: SeoCacheDependencies = {
      sites: [site.handle],
      sections: [...collections.map(item => `collection:${item.handle}`), ...taxonomies.map(item => `taxonomy:${item.handle}`)],
      records: [...collections.map(item => `collection:${item.handle}:*`), ...taxonomies.map(item => `taxonomy:${item.handle}:*`)],
      // Records can add/remove any asset reference, so sitemap owns wildcard asset dependency.
      assets: ['*'],
    }
    return this.cache.getOrCreate(key, dependencies, async () => {
      const entryGroups = await Promise.all(collections.map(async collection => ({
        collection,
        entries: await this.options.content.listPublishedEntries(collection.handle),
      })))
      const termGroups = await Promise.all(taxonomies.map(async taxonomy => ({
        taxonomy,
        terms: await this.options.content.listPublishedTerms(taxonomy.handle),
      })))
      const urls: SitemapUrl[] = []
      for (const group of entryGroups) {
        for (const entry of group.entries) {
          const result = await this.resolvePublishedEntry(site, { ...entry, route: entry.route ?? group.collection.route })
          const url = sitemapUrl(result, entry.updatedAt)
          if (url) urls.push(url)
        }
      }
      for (const group of termGroups) {
        for (const term of group.terms) {
          const result = await this.resolvePublishedTerm(site, { ...term, route: term.route ?? group.taxonomy.route })
          const url = sitemapUrl(result, term.updatedAt)
          if (url) urls.push(url)
        }
      }
      return { site, urls: urls.sort((left, right) => left.url.localeCompare(right.url)), dependencies }
    })
  }

  async sitemapXml(siteInput: string | SiteContext): Promise<string> {
    const sitemap = await this.sitemap(siteInput)
    return generateSitemapXml({ urls: [...sitemap.urls] })
  }

  /** Safe generated robots document. Callers can add crawler policy at route boundary. */
  async robots(siteInput: string | SiteContext, options: { disallow?: string[]; crawlDelay?: number } = {}) {
    const site = this.site(siteInput)
    const sitemap = this.options.urlResolver.absolute(site, '/sitemap.xml')
    return {
      groups: [{ userAgent: '*', allow: ['/'], ...(options.disallow?.length ? { disallow: options.disallow } : {}), ...(options.crawlDelay === undefined ? {} : { crawlDelay: options.crawlDelay }) }],
      sitemapUrls: [sitemap],
      host: site.baseUrl,
    }
  }

  async robotsTxt(siteInput: string | SiteContext, options: { disallow?: string[]; crawlDelay?: number } = {}): Promise<string> {
    return generateRobotsTxt(await this.robots(siteInput, options))
  }

  async humans(siteInput: string | SiteContext, options: { team?: string[]; thanks?: string[] } = {}) {
    const site = this.site(siteInput)
    return { ...options, site: [site.baseUrl] }
  }

  async humansTxt(siteInput: string | SiteContext, options: { team?: string[]; thanks?: string[] } = {}): Promise<string> {
    return generateHumansTxt(await this.humans(siteInput, options))
  }

  /** Explicit dependency hook for content, SEO-default, and asset mutation listeners. */
  invalidate(change: SeoCacheInvalidation = {}): number { return this.cache.invalidate(change) }

  /** Explain/provenance only reaches adapters that prove an authenticated session. */
  async previewEntry(request: SeoResolutionRequest, adapter: AuthenticatedSeoPreviewAdapter) {
    await this.assertAuthenticated(adapter)
    const result = await this.resolveEntry(request)
    return result ? { ...result, provenance: result.resolved.provenance, explain: result.resolved.explain } : null
  }

  async previewTerm(request: SeoTermResolutionRequest, adapter: AuthenticatedSeoPreviewAdapter) {
    await this.assertAuthenticated(adapter)
    const result = await this.resolveTerm(request)
    return result ? { ...result, provenance: result.resolved.provenance, explain: result.resolved.explain } : null
  }

  async previewDefaults(request: SeoDefaultsPreviewRequest, adapter: AuthenticatedSeoPreviewAdapter) {
    await this.assertAuthenticated(adapter)
    const site = this.site(request.site)
    const section = request.section && request.handle
      ? await this.options.defaults.getSection(request.section, request.handle)
      : null
    return this.render({
      site,
      subject: { type: 'page', id: 'seo-defaults-preview', title: 'Example page', path: '/' },
      sectionDefaults: section?.document.seo,
      dependencies: {
        sites: [site.handle],
        ...(request.section && request.handle ? { sections: [`${request.section}:${request.handle}`] } : {}),
      },
    })
  }

  private async resolvePublishedEntry(site: SiteContext, entry: PublishedSeoEntry, pathOverride?: string, publishedSites?: readonly string[]): Promise<SeoRuntimeResult> {
    const section = await this.options.defaults.getSection('collection', entry.collection)
    const path = pathOverride ?? pathFromAbsolute(site, this.options.urlResolver.entry({ site, collection: entry.collection, slug: entry.slug, parentSlugs: entry.parentSlugs, route: entry.route }))
    return this.render({
      site,
      subject: { type: 'entry', id: `${entry.collection}:${entry.slug}`, title: entry.title, path, fields: { ...entry.data, title: entry.title } },
      sectionDefaults: section?.document.seo,
      record: entry.data,
      localizedPaths: entry.localizedPaths,
      publishedSites: publishedSites ?? (entry.localizedPaths ? Object.keys(entry.localizedPaths) : undefined),
      article: { author: entry.author, publishedAt: entry.createdAt, modifiedAt: entry.updatedAt, section: entry.collection },
      dependencies: recordDependencies(site, 'collection', entry.collection, entry.slug, socialAsset(entry.data)),
    })
  }

  private async resolvePublishedTerm(site: SiteContext, term: PublishedSeoTerm): Promise<SeoRuntimeResult> {
    const section = await this.options.defaults.getSection('taxonomy', term.taxonomy)
    const path = pathFromAbsolute(site, this.options.urlResolver.term({ site, taxonomy: term.taxonomy, slug: term.slug, route: term.route }))
    return this.render({
      site,
      subject: { type: 'term', id: `${term.taxonomy}:${term.slug}`, title: term.title, path, fields: { ...term.data, title: term.title, description: term.description } },
      sectionDefaults: section?.document.seo,
      record: term.data,
      localizedPaths: term.localizedPaths,
      dependencies: recordDependencies(site, 'taxonomy', term.taxonomy, term.slug, socialAsset(term.data)),
    })
  }

  private async render(input: {
    site: SiteContext
    subject: { type: 'entry' | 'term' | 'page'; id: string; title?: string; path: string; fields?: Record<string, unknown> }
    siteDefaults?: import('@/lib/seo/domain').SeoValues
    sectionDefaults?: import('@/lib/seo/domain').SeoValues
    record?: Record<string, unknown>
    localizedPaths?: Record<string, string>
    publishedSites?: readonly string[]
    article?: ResolvedSeoOutputView['article']
    dependencies: SeoCacheDependencies
  }): Promise<SeoRuntimeResult> {
    const features = this.options.features ?? {}
    const seoEnabled = features.enabled !== false
    const metadataEnabled = features.metadata !== false
    const structuredDataEnabled = features.structuredData !== false
    const loadedSiteDefaults = input.siteDefaults ?? (await this.defaults(input.site)).site
    const siteDefaults = features.enabled === false
      ? { ...(loadedSiteDefaults ?? {}), enabled: false }
      : loadedSiteDefaults
    const resolved = this.resolver.resolve({
      subject: input.subject,
      site: input.site,
      sites: [...this.options.sites],
      urlResolver: this.options.urlResolver,
      system: this.options.systemDefaults,
      siteDefaults,
      sectionDefaults: input.sectionDefaults,
      record: input.record,
      localizedPaths: input.localizedPaths,
      publishedSites: input.publishedSites,
      allowExternalCanonicals: features.allowExternalCanonicals,
    })
    const effectiveResolved = features.socialImages === false
      ? { ...resolved, social: resolved.social ? { ...resolved.social, image: undefined, imageAlt: undefined } : null }
      : resolved
    const view = await this.view(input.site, effectiveResolved, input.article)
    return {
      resolved: effectiveResolved,
      metadata: !seoEnabled || !metadataEnabled || effectiveResolved.excluded || !effectiveResolved.metadata ? null : generateMetadata(view),
      jsonLd: !seoEnabled || !structuredDataEnabled || effectiveResolved.excluded || effectiveResolved.jsonLd.enabled === false ? null : generateJsonLd(view),
      view: { canonical: view.canonical, title: view.title, ...(view.description ? { description: view.description } : {}) },
      ...(view.social?.image && isAbsoluteHttpUrl(view.social.image) ? { socialImage: { url: view.social.image, ...(view.social.imageAlt ? { alt: view.social.imageAlt } : {}) } } : {}),
      dependencies: input.dependencies,
    }
  }

  private async defaults(site: SiteContext): Promise<{ site?: import('@/lib/seo/domain').SeoValues }> {
    const document = await this.options.defaults.getSite(site.handle)
    return { site: document?.document.seo }
  }

  private async view(site: SiteContext, resolved: ResolvedSeo, article?: ResolvedSeoOutputView['article']): Promise<ResolvedSeoOutputView> {
    const rawImage = typeof resolved.social?.image === 'string' ? resolved.social.image : undefined
    const image = rawImage && this.options.assets ? await this.options.assets.publicUrl(rawImage, site) : rawImage
    return {
      canonical: resolved.canonical ?? this.options.urlResolver.absolute(site, '/'),
      title: resolved.title ?? this.options.siteName?.(site) ?? site.handle,
      ...(resolved.description ? { description: resolved.description } : {}),
      ...(this.options.siteName?.(site) ? { siteName: this.options.siteName(site) } : {}),
      locale: site.locale.replace('-', '_'),
      pageType: article ? 'article' : 'website',
      robots: robotsTokens(resolved),
      social: resolved.social ? {
        enabled: resolved.social.enabled,
        ...(image ? { image } : {}),
        ...(typeof resolved.social.imageAlt === 'string' ? { imageAlt: resolved.social.imageAlt } : {}),
        twitterCard: resolved.social.twitterCard,
        twitterSite: resolved.social.twitterSite,
        twitterCreator: resolved.social.twitterCreator,
      } : undefined,
      alternates: resolved.alternates,
      pagination: { previous: resolved.previous, next: resolved.next },
      article,
      jsonLd: { type: resolved.jsonLd.type, custom: resolved.jsonLd.custom },
    }
  }

  private site(site: string | SiteContext): SiteContext {
    if (typeof site !== 'string') return site
    const resolved = this.sitesByHandle.get(site)
    if (!resolved) throw new Error(`Unknown SEO site: ${site}`)
    return resolved
  }

  private async assertAuthenticated(adapter: AuthenticatedSeoPreviewAdapter): Promise<void> {
    if (!await adapter.isAuthenticated()) throw new Error('SEO preview requires an authenticated adapter.')
  }
}

function recordDependencies(site: SiteContext, kind: 'collection' | 'taxonomy', handle: string, slug: string, asset?: string): SeoCacheDependencies {
  return { sites: [site.handle], sections: [`${kind}:${handle}`], records: [`${kind}:${handle}:${slug}`], ...(asset ? { assets: [asset] } : {}) }
}

function pathFromAbsolute(site: SiteContext, absolute: string): string {
  const pathname = new URL(absolute).pathname
  if (site.basePath && pathname.startsWith(`${site.basePath}/`)) return pathname.slice(site.basePath.length)
  return pathname === site.basePath ? '/' : pathname
}

function robotsTokens(resolved: ResolvedSeo): string[] {
  const tokens: string[] = [resolved.robots.indexing, resolved.robots.following]
  if (resolved.robots.noarchive) tokens.push('noarchive')
  if (resolved.robots.noimageindex) tokens.push('noimageindex')
  if (resolved.robots.nosnippet) tokens.push('nosnippet')
  return tokens
}

function socialAsset(record: Record<string, unknown>): string | undefined {
  const seo = record.seo
  if (!seo || typeof seo !== 'object') return typeof record.og_image === 'string' ? record.og_image : undefined
  const social = (seo as { social?: unknown }).social
  if (!social || typeof social !== 'object') return undefined
  const image = (social as { image?: unknown }).image
  if (typeof image === 'string') return image
  return image && typeof image === 'object' && (image as { kind?: unknown }).kind === 'literal'
    ? (image as { value?: string }).value
    : undefined
}

function sitemapUrl(result: SeoRuntimeResult, lastModified?: string): SitemapUrl | null {
  if (result.resolved.excluded || result.resolved.robots.indexing === 'noindex' || result.resolved.sitemap.enabled === false) return null
  return {
    url: result.view.canonical,
    ...(lastModified ? { lastModified } : {}),
    ...(result.resolved.sitemap.priority === undefined ? {} : { priority: result.resolved.sitemap.priority }),
    ...(result.resolved.sitemap.changeFrequency ? { changeFrequency: result.resolved.sitemap.changeFrequency } : {}),
    alternates: result.resolved.alternates,
    ...(result.socialImage
      ? { images: [{ url: result.socialImage.url, ...(result.socialImage.alt ? { title: result.socialImage.alt } : {}) }] }
      : {}),
  }
}
