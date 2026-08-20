export type TrailingSlashPolicy = 'always' | 'never' | 'preserve'

export interface SiteDefinition {
  /** Stable identifier used by SEO configuration and alternate URLs. */
  handle: string
  /** Public HTTP(S) origin, optionally with a subdirectory such as `/fr`. */
  url: string
  /** BCP 47 language tag used for document and alternate-language metadata. */
  locale: string
  /** Marks site as fallback when no explicit site is supplied. */
  default?: boolean
}

export interface SiteContext {
  handle: string
  locale: string
  origin: string
  /** Normalized public path prefix. Root is represented by an empty string. */
  basePath: string
  baseUrl: string
  trailingSlash: TrailingSlashPolicy
  isDefault: boolean
}

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
const HANDLE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export class SiteContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SiteContextError'
  }
}

/** Build a validated public-site identity without reading application config. */
export function createSiteContext(
  definition: SiteDefinition,
  options: { trailingSlash?: TrailingSlashPolicy } = {}
): SiteContext {
  if (!HANDLE.test(definition.handle)) {
    throw new SiteContextError('Site handle must contain only letters, numbers, hyphens, and underscores.')
  }
  if (!LOCALE.test(definition.locale)) {
    throw new SiteContextError('Site locale must be a valid BCP 47 language tag.')
  }
  if (CONTROL_CHARACTER.test(definition.url)) {
    throw new SiteContextError('Site URL contains control characters.')
  }

  let parsed: URL
  try {
    parsed = new URL(definition.url)
  } catch {
    throw new SiteContextError('Site URL must be an absolute HTTP(S) URL.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SiteContextError('Site URL must use HTTP or HTTPS.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new SiteContextError('Site URL cannot contain credentials, a query string, or a fragment.')
  }

  const trailingSlash = options.trailingSlash ?? 'never'
  const basePath = normalizePublicPath(parsed.pathname, trailingSlash, { allowRoot: true })
  const origin = parsed.origin
  const publicBasePath = basePath === '/' ? '' : basePath

  return {
    handle: definition.handle,
    locale: definition.locale,
    origin,
    basePath: publicBasePath,
    baseUrl: `${origin}${publicBasePath || ''}`,
    trailingSlash,
    isDefault: definition.default ?? false,
  }
}

/** Validate a site list and select exactly one default site. */
export function createSiteContexts(
  definitions: SiteDefinition[],
  options: { trailingSlash?: TrailingSlashPolicy } = {}
): SiteContext[] {
  if (definitions.length === 0) throw new SiteContextError('At least one site is required.')

  const handles = new Set<string>()
  const contexts = definitions.map((definition) => {
    if (handles.has(definition.handle)) throw new SiteContextError(`Duplicate site handle: ${definition.handle}`)
    handles.add(definition.handle)
    return createSiteContext(definition, options)
  })

  const defaults = contexts.filter((site) => site.isDefault)
  if (defaults.length > 1) throw new SiteContextError('Only one site can be marked as default.')
  if (defaults.length === 0) contexts[0] = { ...contexts[0], isDefault: true }
  return contexts
}

/**
 * Normalize an internal public path. It intentionally rejects query strings,
 * fragments, encoded separators, traversal, backslashes, and control chars.
 */
export function normalizePublicPath(
  value: string,
  trailingSlash: TrailingSlashPolicy = 'never',
  options: { allowRoot?: boolean } = {}
): string {
  if (typeof value !== 'string' || value.length === 0) throw new SiteContextError('Path must be a non-empty string.')
  if (CONTROL_CHARACTER.test(value) || value.includes('\\') || value.includes('?') || value.includes('#')) {
    throw new SiteContextError('Path contains unsupported characters.')
  }
  if (!value.startsWith('/')) throw new SiteContextError('Path must start with a slash.')

  const segments = value.split('/').filter(Boolean).map((rawSegment) => normalizeSegment(rawSegment))
  if (segments.length === 0) {
    if (!options.allowRoot) throw new SiteContextError('Path must contain at least one segment.')
    return '/'
  }

  const path = `/${segments.join('/')}`
  if (trailingSlash === 'always') return `${path}/`
  if (trailingSlash === 'preserve' && value.endsWith('/')) return `${path}/`
  return path
}

export function normalizePublicSegment(value: string): string {
  return normalizeSegment(value)
}

function normalizeSegment(rawSegment: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(rawSegment)
  } catch {
    throw new SiteContextError('Path contains invalid percent encoding.')
  }
  if (!decoded || decoded === '.' || decoded === '..' || CONTROL_CHARACTER.test(decoded) || decoded.includes('/') || decoded.includes('\\')) {
    throw new SiteContextError('Path contains an unsafe segment.')
  }
  return encodeURIComponent(decoded)
}
