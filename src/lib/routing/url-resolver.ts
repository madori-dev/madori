import {
  normalizePublicPath,
  normalizePublicSegment,
  type SiteContext,
  type TrailingSlashPolicy,
} from '@/lib/sites'

export interface EntryUrlInput {
  site: SiteContext
  collection: string
  slug: string
  /** Ancestor slugs for structured collections, from root to parent. */
  parentSlugs?: string[]
  /** Collection route; defaults to Madori's existing `/{slug}` behavior. */
  route?: string
}

export interface TermUrlInput {
  site: SiteContext
  taxonomy: string
  slug: string
  route?: string
}

export interface PaginationUrlInput {
  site: SiteContext
  path: string
  page: number
  parameter?: string
}

export interface UrlResolver {
  path(site: SiteContext, value: string): string
  absolute(site: SiteContext, value: string): string
  entry(input: EntryUrlInput): string
  term(input: TermUrlInput): string
  pagination(input: PaginationUrlInput): string
  alternates(sites: SiteContext[], value: string): Record<string, string>
}

export class UrlResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UrlResolutionError'
  }
}

/** Shared source of public URLs for metadata, sitemaps, previews, and reports. */
export class MadoriUrlResolver implements UrlResolver {
  constructor(private readonly trailingSlash: TrailingSlashPolicy = 'never') {}

  path(site: SiteContext, value: string): string {
    const route = normalizePublicPath(value, site.trailingSlash ?? this.trailingSlash, { allowRoot: true })
    const basePath = site.basePath === '/' ? '' : site.basePath
    if (route === '/') return basePath || '/'
    return normalizePublicPath(`${basePath}${route}`, site.trailingSlash ?? this.trailingSlash, { allowRoot: true })
  }

  absolute(site: SiteContext, value: string): string {
    const publicPath = this.path(site, value)
    return `${site.origin}${publicPath}`
  }

  entry(input: EntryUrlInput): string {
    const collection = validateIdentifier(input.collection, 'Collection handle')
    const slug = normalizeSlug(input.slug, 'Entry slug')
    const parentUri = (input.parentSlugs ?? []).map((parent) => normalizeSlug(parent, 'Parent slug')).join('/')
    const route = applyRouteTemplate(input.route ?? '/{slug}', {
      slug,
      collection,
      parent_uri: parentUri,
    })
    return this.absolute(input.site, route)
  }

  term(input: TermUrlInput): string {
    const taxonomy = validateIdentifier(input.taxonomy, 'Taxonomy handle')
    const slug = normalizeSlug(input.slug, 'Term slug')
    const route = applyRouteTemplate(input.route ?? '/{taxonomy}/{slug}', { taxonomy, slug })
    return this.absolute(input.site, route)
  }

  pagination(input: PaginationUrlInput): string {
    if (!Number.isSafeInteger(input.page) || input.page < 1) throw new UrlResolutionError('Page must be a positive integer.')
    const parameter = input.parameter ?? 'page'
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(parameter)) throw new UrlResolutionError('Pagination parameter is invalid.')
    const url = new URL(this.absolute(input.site, input.path))
    if (input.page > 1) url.searchParams.set(parameter, String(input.page))
    return url.toString()
  }

  alternates(sites: SiteContext[], value: string): Record<string, string> {
    const result: Record<string, string> = {}
    for (const site of sites) {
      if (result[site.locale]) throw new UrlResolutionError(`Duplicate alternate locale: ${site.locale}`)
      result[site.locale] = this.absolute(site, value)
    }
    return result
  }
}

function applyRouteTemplate(template: string, values: Record<string, string>): string {
  if (!template.startsWith('/') || template.includes('?') || template.includes('#') || template.includes('\\')) {
    throw new UrlResolutionError('Route template must be an internal path.')
  }
  const unknown = template.match(/\{([^}]+)\}/g)?.find((token) => !(token.slice(1, -1) in values))
  if (unknown) throw new UrlResolutionError(`Unsupported route placeholder: ${unknown}`)
  const route = template.replace(/\{([^}]+)\}/g, (_match, key: string) => values[key])
  try {
    return normalizePublicPath(route, 'never', { allowRoot: true })
  } catch (error) {
    throw new UrlResolutionError(error instanceof Error ? error.message : 'Route template is invalid.')
  }
}

function validateIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) throw new UrlResolutionError(`${label} is invalid.`)
  return normalizePublicSegment(value)
}

function normalizeSlug(value: string, label: string): string {
  if (!value || value.startsWith('/') || value.endsWith('/')) throw new UrlResolutionError(`${label} is invalid.`)
  try {
    return value.split('/').map((segment) => normalizePublicSegment(segment)).join('/')
  } catch (error) {
    throw new UrlResolutionError(error instanceof Error ? `${label}: ${error.message}` : `${label} is invalid.`)
  }
}
