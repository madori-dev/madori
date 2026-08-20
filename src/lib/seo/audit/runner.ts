import type { FileSeoRedirectRepository } from '@/lib/seo/redirects'
import type { SeoRuntime, SeoRuntimeResult } from '@/lib/seo/runtime'
import type { PublishedSeoContentPort } from '@/lib/seo/runtime/types'
import type { SiteContext } from '@/lib/sites'
import { SeoAuditEngine } from './engine'
import type { SeoAuditInput, SeoAuditLink, SeoAuditPage, SeoAuditRedirect, SeoAuditReport, SeoAuditSnapshotStore } from './types'

export interface SeoAuditRunnerOptions {
  content: PublishedSeoContentPort
  runtime: SeoRuntime
  redirects: Pick<FileSeoRedirectRepository, 'list'>
  engine: SeoAuditEngine
  snapshots: SeoAuditSnapshotStore
  sites: readonly SiteContext[]
}

export interface SeoAuditRunResult {
  report: SeoAuditReport
  pages: number
  redirects: number
}

/** Builds an audit only from public content, then persists its immutable result. */
export class SeoAuditRunner {
  constructor(private readonly options: SeoAuditRunnerOptions) {}

  async run(input: { site?: string; now?: Date } = {}): Promise<SeoAuditRunResult> {
    const sites = input.site
      ? this.options.sites.filter(site => site.handle === input.site)
      : this.options.sites
    if (input.site && sites.length === 0) throw new Error(`Unknown SEO site: ${input.site}`)

    const [collections, taxonomies] = await Promise.all([
      this.options.content.listCollections(),
      this.options.content.listTaxonomies(),
    ])
    const pages: SeoAuditPage[] = []
    const provenance: NonNullable<SeoAuditInput['provenance']> = {}
    const redirects: SeoAuditRedirect[] = []

    for (const site of sites) {
      for (const collection of collections) {
        for (const entry of await this.options.content.listPublishedEntries(collection.handle)) {
          const result = await this.options.runtime.resolveEntry({ site, collection: entry.collection, slug: entry.slug })
          if (!result) continue
          const page = pageFromResult({
            result,
            type: 'entry',
            id: `${site.handle}:entry:${entry.collection}:${entry.slug}`,
            site: site.handle,
            fields: entry.data,
          })
          pages.push(page)
          provenance[page.subject.id] = result.resolved.provenance
        }
      }
      for (const taxonomy of taxonomies) {
        for (const term of await this.options.content.listPublishedTerms(taxonomy.handle)) {
          const result = await this.options.runtime.resolveTerm({ site, taxonomy: term.taxonomy, slug: term.slug })
          if (!result) continue
          const page = pageFromResult({
            result,
            type: 'term',
            id: `${site.handle}:term:${term.taxonomy}:${term.slug}`,
            site: site.handle,
            fields: term.data,
          })
          pages.push(page)
          provenance[page.subject.id] = result.resolved.provenance
        }
      }
      for (const snapshot of await this.options.redirects.list(site.handle)) {
        const redirect = snapshot.redirect
        if (!redirect.enabled) continue
        redirects.push({
          subject: { id: `${site.handle}:redirect:${redirect.id}`, type: 'redirect', site: site.handle },
          source: redirect.source,
          destination: redirect.destination,
        })
      }
    }

    const report = this.options.engine.audit({ pages, redirects, provenance, now: input.now })
    await this.options.snapshots.save(report)
    return { report, pages: pages.length, redirects: redirects.length }
  }
}

function pageFromResult(input: {
  result: SeoRuntimeResult
  type: 'entry' | 'term'
  id: string
  site: string
  fields: Record<string, unknown>
}): SeoAuditPage {
  const { result } = input
  return {
    subject: { id: input.id, type: input.type, site: input.site },
    published: true,
    title: result.view.title,
    description: result.view.description,
    canonical: result.view.canonical,
    canonicalStatus: 'valid',
    indexing: result.resolved.robots.indexing,
    sitemapIncluded: !result.resolved.excluded && result.resolved.robots.indexing !== 'noindex' && result.resolved.sitemap.enabled,
    social: result.socialImage ? { image: result.socialImage.url, imageAlt: result.socialImage.alt } : null,
    structuredData: result.jsonLd ?? undefined,
    internalLinks: linksFromFields(input.fields),
    alternates: Object.entries(result.resolved.alternates).map(([locale, url]) => ({ locale, url })),
    dependencies: result.dependencies.records ? [...result.dependencies.records] : undefined,
  }
}

function linksFromFields(fields: Record<string, unknown>): SeoAuditLink[] {
  const links = new Set<string>()
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/(?:href=["']|\]\()([^"'\s)<>]+)/gi)) links.add(match[1])
      return
    }
    if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(fields)
  return [...links].slice(0, 500).map(href => ({ href, source: 'content' }))
}
