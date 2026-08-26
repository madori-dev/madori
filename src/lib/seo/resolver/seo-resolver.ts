import type { SeoSource, SeoValues } from '@/lib/seo'
import type { SiteContext } from '@/lib/sites'
import type {
  NormalizedSeoValues,
  ResolvedSeo,
  SeoExplainStep,
  SeoLayerName,
  SeoProvenance,
  SeoRecordInput,
  SeoResolutionInput,
} from './types'

const LAYERS: SeoLayerName[] = ['system', 'site', 'scope', 'record']
const EMPTY_ROBOTS = { indexing: 'index' as const, following: 'follow' as const }

/** Pure, site-aware SEO cascade. No repositories, config, framework, or I/O. */
export class SeoResolver {
  resolve(input: SeoResolutionInput): ResolvedSeo {
    const layers = this.layers(input)
    const explain: SeoExplainStep[] = []
    const provenance: Record<string, SeoProvenance> = {}
    const excludedAt = this.exclusion(layers)

    if (excludedAt) {
      provenance.exclusion = excludedAt
      explain.push({ field: 'exclusion', source: excludedAt, value: false })
      return {
        excluded: true,
        robots: { ...EMPTY_ROBOTS, indexing: 'noindex' },
        social: null,
        sitemap: { enabled: false },
        jsonLd: { enabled: false },
        alternates: {},
        metadata: null,
        provenance,
        explain,
      }
    }

    const fields = { title: input.subject.title ?? '', ...input.subject.fields }
    const baseTitle = this.resolveTitle(layers, fields, provenance, explain)
    const description = this.resolveSource('description', layers, fields, provenance, explain)
    const currentPath = input.subject.path
    const rawCanonical = this.resolveSource('canonical', layers, fields, provenance, explain)
    const canonical = canonicalUrl(rawCanonical, input.site, input.urlResolver, currentPath, input.page, input.paginationParameter, input.allowExternalCanonicals, input.allowedCanonicalOrigins)
    if (!rawCanonical) this.record('canonical', 'generated', canonical, provenance, explain)

    const robots = { ...EMPTY_ROBOTS, ...this.resolveObject('robots', layers, provenance, explain) }
    const social = this.resolveSocial(layers, fields, provenance, explain)
    const sitemap = { enabled: true, ...this.resolveObject('sitemap', layers, provenance, explain) }
    const jsonLd = { enabled: true, ...this.resolveObject('jsonLd', layers, provenance, explain) }
    const pagination = this.resolvePagination(input)
    const title = baseTitle && input.page && input.page > 1 ? `${baseTitle} | Page ${input.page}` : baseTitle
    if (title !== baseTitle && title) this.record('titlePagination', 'generated', title, provenance, explain)
    const alternates = this.resolveAlternates(input)

    return {
      excluded: false,
      title,
      description,
      canonical,
      robots,
      social,
      sitemap,
      jsonLd,
      alternates,
      ...pagination,
      metadata: { title, description, canonical },
      provenance,
      explain,
    }
  }

  private layers(input: SeoResolutionInput): Record<SeoLayerName, NormalizedSeoValues> {
    return {
      system: normalizeLayer(input.system),
      site: normalizeLayer(input.siteDefaults),
      scope: normalizeLayer(input.sectionDefaults),
      record: normalizeRecord(input.record),
    }
  }

  private exclusion(layers: Record<SeoLayerName, NormalizedSeoValues>): SeoLayerName | undefined {
    return LAYERS.find(layer => layers[layer].enabled === false)
  }

  private resolveTitle(layers: Record<SeoLayerName, NormalizedSeoValues>, fields: Record<string, unknown>, provenance: Record<string, SeoProvenance>, explain: SeoExplainStep[]): string | undefined {
    const title = this.resolveSource('title', layers, fields, provenance, explain)
    const template = this.resolveSource('titleTemplate', layers, fields, provenance, explain)
    const suffix = this.resolveSource('titleSuffix', layers, fields, provenance, explain)
    if (!title) return undefined
    const templated = template ? interpolate(template, { ...fields, title }) : title
    return suffix ? `${templated} | ${suffix}` : templated
  }

  private resolveSource(field: keyof NormalizedSeoValues, layers: Record<SeoLayerName, NormalizedSeoValues>, fields: Record<string, unknown>, provenance: Record<string, SeoProvenance>, explain: SeoExplainStep[]): string | undefined {
    for (const layer of [...LAYERS].reverse()) {
      const source = layers[layer][field] as SeoSource | undefined
      if (!source || source.kind === 'inherit') continue
      if (source.kind === 'disabled') {
        this.record(String(field), `${layer}:suppressed`, null, provenance, explain)
        return undefined
      }
      const value = sourceValue(source, fields)
      if (value === undefined) continue
      this.record(String(field), layer, value, provenance, explain)
      return value
    }
    return undefined
  }

  private resolveObject(field: 'robots' | 'sitemap' | 'jsonLd', layers: Record<SeoLayerName, NormalizedSeoValues>, provenance: Record<string, SeoProvenance>, explain: SeoExplainStep[]): Record<string, unknown> {
    const value: Record<string, unknown> = {}
    for (const layer of LAYERS) {
      const candidate = layers[layer][field]
      if (!candidate) continue
      const defined = withoutUndefined(candidate)
      if (Object.keys(defined).length === 0) continue
      Object.assign(value, defined)
      this.record(field, layer, defined, provenance, explain)
    }
    return value
  }

  private resolveSocial(layers: Record<SeoLayerName, NormalizedSeoValues>, fields: Record<string, unknown>, provenance: Record<string, SeoProvenance>, explain: SeoExplainStep[]): ResolvedSeo['social'] {
    let social: Record<string, unknown> = {}
    for (const layer of LAYERS) {
      const candidate = layers[layer].social
      if (!candidate) continue
      if (candidate.enabled === false) {
        this.record('social', `${layer}:suppressed`, null, provenance, explain)
        return null
      }
      social = { ...social, ...candidate }
      this.record('social', layer, candidate, provenance, explain)
    }
    if (Object.keys(social).length === 0) return null
    const image = sourceValue(social.image as SeoSource | undefined, fields)
    const imageAlt = sourceValue(social.imageAlt as SeoSource | undefined, fields)
    if (image === undefined) delete social.image
    else social.image = image
    if (imageAlt === undefined) delete social.imageAlt
    else social.imageAlt = imageAlt
    return social as ResolvedSeo['social']
  }

  private resolveAlternates(input: SeoResolutionInput): Record<string, string> {
    const configuredSites = input.sites?.length ? input.sites : [input.site]
    const published = input.publishedSites ? new Set(input.publishedSites) : null
    const sites = input.localizedPaths
      ? configuredSites.filter(site => (!published || published.has(site.handle)) && (site.handle === input.site.handle || input.localizedPaths?.[site.handle] !== undefined || input.localizedPaths?.[site.locale] !== undefined))
      : [input.site]
    const alternates: Record<string, string> = {}
    for (const site of sites) {
      const localPath = input.localizedPaths?.[site.handle] ?? input.localizedPaths?.[site.locale] ?? input.subject.path
      alternates[site.locale] = canonicalUrl(undefined, site, input.urlResolver, localPath, input.page, input.paginationParameter)
    }
    const defaultSite = sites.find(site => site.isDefault)
    if (defaultSite) {
      const defaultPath = input.localizedPaths?.[defaultSite.handle] ?? input.localizedPaths?.[defaultSite.locale] ?? input.subject.path
      alternates['x-default'] = canonicalUrl(undefined, defaultSite, input.urlResolver, defaultPath, input.page, input.paginationParameter)
    }
    return alternates
  }

  private resolvePagination(input: SeoResolutionInput): Pick<ResolvedSeo, 'previous' | 'next'> {
    if (!input.page || input.page < 2) {
      if (!input.pageCount || input.pageCount < 2) return {}
      return { next: input.urlResolver.pagination({ site: input.site, path: input.subject.path, page: 2, parameter: input.paginationParameter }) }
    }
    const result: Pick<ResolvedSeo, 'previous' | 'next'> = {
      previous: input.urlResolver.pagination({ site: input.site, path: input.subject.path, page: input.page - 1, parameter: input.paginationParameter }),
    }
    if (!input.pageCount || input.page < input.pageCount) {
      result.next = input.urlResolver.pagination({ site: input.site, path: input.subject.path, page: input.page + 1, parameter: input.paginationParameter })
    }
    return result
  }

  private record(field: string, source: SeoProvenance, value: unknown, provenance: Record<string, SeoProvenance>, explain: SeoExplainStep[]): void {
    provenance[field] = source
    explain.push({ field, source, value })
  }
}

function normalizeLayer(input: SeoValues | Record<string, unknown> | null | undefined): NormalizedSeoValues {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Record<string, unknown>
  const source = (value: unknown): SeoSource | undefined => {
    if (value === null || value === undefined || value === '') return undefined
    if (typeof value === 'string') return { kind: 'literal', value }
    if (isSource(value)) return value
    return undefined
  }
  const robots = Array.isArray(raw.robots) ? robotsFromTokens(raw.robots) : objectOrUndefined(raw.robots)
  const socialInput = objectOrUndefined(raw.social)
  const social = socialInput ? {
    ...socialInput,
    image: source(socialInput.image),
    imageAlt: source(socialInput.imageAlt),
  } : undefined
  return {
    enabled: raw.enabled === false ? false : undefined,
    title: source(raw.title),
    description: source(raw.description),
    canonical: source(raw.canonical ?? raw.canonical_url),
    titleTemplate: source(raw.titleTemplate),
    titleSuffix: source(raw.titleSuffix),
    robots: robots as NormalizedSeoValues['robots'],
    social: social as NormalizedSeoValues['social'],
    sitemap: objectOrUndefined(raw.sitemap) as NormalizedSeoValues['sitemap'],
    jsonLd: objectOrUndefined(raw.jsonLd) as NormalizedSeoValues['jsonLd'],
  }
}

function normalizeRecord(input: SeoRecordInput | SeoValues | null | undefined): NormalizedSeoValues {
  if (!input || typeof input !== 'object') return {}
  const record = input as SeoRecordInput
  const nested = normalizeLayer(record.seo ?? record)
  const legacy = normalizeLayer({
    title: record.meta_title,
    description: record.meta_description,
    social: record.og_image === undefined ? undefined : { image: record.og_image },
    canonical: record.canonical_url,
    robots: record.no_index === true ? ['noindex'] : undefined,
  })
  return mergeLayer(legacy, nested)
}

function mergeLayer(base: NormalizedSeoValues, override: NormalizedSeoValues): NormalizedSeoValues {
  return {
    ...base,
    ...withoutUndefined(override),
    robots: { ...base.robots, ...override.robots },
    social: base.social || override.social ? { ...base.social, ...override.social } : undefined,
    sitemap: base.sitemap || override.sitemap ? { ...base.sitemap, ...override.sitemap } : undefined,
    jsonLd: base.jsonLd || override.jsonLd ? { ...base.jsonLd, ...override.jsonLd } : undefined,
  }
}

function sourceValue(source: SeoSource | undefined, fields: Record<string, unknown>): string | undefined {
  if (!source || source.kind === 'inherit' || source.kind === 'disabled') return undefined
  if (source.kind === 'literal') return source.value
  if (!source.value) return undefined
  if (source.kind === 'field') return text(fields[source.value])
  return interpolate(source.value, fields)
}

function interpolate(template: string, fields: Record<string, unknown>): string {
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (_token, field: string) => text(fields[field]) ?? '')
    .replace(/\s{2,}/g, ' ').trim()
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isSource(value: unknown): value is SeoSource {
  if (!value || typeof value !== 'object') return false
  const source = value as { kind?: unknown; value?: unknown }
  if (source.kind === 'inherit' || source.kind === 'disabled') return source.value === undefined
  return (source.kind === 'literal' || source.kind === 'field' || source.kind === 'template')
    && typeof source.value === 'string'
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function robotsFromTokens(tokens: unknown[]): Record<string, unknown> {
  return {
    indexing: tokens.includes('noindex') ? 'noindex' : tokens.includes('index') ? 'index' : undefined,
    following: tokens.includes('nofollow') ? 'nofollow' : tokens.includes('follow') ? 'follow' : undefined,
  }
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
}

function canonicalUrl(rawCanonical: string | undefined, site: SiteContext, urlResolver: SeoResolutionInput['urlResolver'], path: string, page?: number, parameter?: string, allowExternal = false, allowedOrigins: string[] = []): string {
  if (rawCanonical) {
    try {
      const url = new URL(rawCanonical)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) {
        const allowed = url.origin === site.origin || allowedOrigins.includes(url.origin) || allowExternal
        if (allowed) return sanitiseCanonical(url)
        return page && page > 1
          ? urlResolver.pagination({ site, path, page, parameter })
          : urlResolver.absolute(site, path)
      }
    } catch {
      return urlResolver.absolute(site, rawCanonical)
    }
  }
  return page && page > 1
    ? urlResolver.pagination({ site, path, page, parameter })
    : urlResolver.absolute(site, path)
}

function sanitiseCanonical(url: URL): string {
  url.hash = ''
  url.pathname = url.pathname.replace(/\/{2,}/g, '/')
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|gclid|dclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}
