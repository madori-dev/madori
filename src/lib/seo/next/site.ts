import { headers } from 'next/headers'
import { cache } from 'react'
import { getMadori } from '@/lib/madori'
import type { SiteContext } from '@/lib/sites'

/**
 * Select a configured public site from a Host header.
 *
 * Host is used only as a lookup key: generated URLs always come from the
 * matched configured origin. Forwarded headers are intentionally ignored.
 */
export function resolveConfiguredSite(
  sites: readonly SiteContext[],
  host: string | null | undefined,
  pathname?: string,
): SiteContext {
  const fallback = sites.find((site) => site.isDefault) ?? sites[0]
  if (!fallback) throw new Error('At least one public site must be configured.')

  const normalizedHost = normalizeHost(host)
  if (!normalizedHost) return fallback

  const matched = sites.filter((site) => matchesHost(site, normalizedHost))
  if (!matched.length) return fallback
  if (!pathname) return matched.find((site) => site.isDefault) ?? matched[0]

  // Same-origin sites use their configured public subdirectory as a safe,
  // deterministic tie-breaker. Longest prefix wins (`/fr-ca` before `/fr`).
  return matched
    .filter((site) => matchesBasePath(site, pathname))
    .sort((left, right) => right.basePath.length - left.basePath.length)[0]
    ?? matched.find((site) => site.isDefault)
    ?? matched[0]
}

/** Resolve request site from direct Host header; never trust forwarded headers. */
export const getRequestSite = cache(async (): Promise<SiteContext> => {
  const [requestHeaders, { sites }] = await Promise.all([headers(), getMadori()])
  const selected = resolveInternalSite(sites, requestHeaders)
  if (selected) return selected
  return resolveConfiguredSite(sites, requestHeaders.get('host'))
})

/** Route-handler counterpart, kept free of Next request objects for easy testing. */
export async function getRequestSiteFromHeaders(requestHeaders: Headers): Promise<SiteContext> {
  const { sites } = await getMadori()
  const selected = resolveInternalSite(sites, requestHeaders)
  if (selected) return selected
  return resolveConfiguredSite(sites, requestHeaders.get('host'))
}

/** Route handlers have an actual URL, so they can select same-host subdirectory sites. */
export async function getRequestSiteFromRequest(request: Request): Promise<SiteContext> {
  const { sites } = await getMadori()
  const selected = resolveInternalSite(sites, request.headers)
  if (selected) return selected
  return resolveConfiguredSite(sites, request.headers.get('host'), new URL(request.url).pathname)
}

function resolveInternalSite(sites: readonly SiteContext[], requestHeaders: Headers): SiteContext | null {
  const handle = requestHeaders.get('x-madori-site')
  if (!handle) return null
  const site = sites.find(candidate => candidate.handle === handle)
  if (!site) return null
  const host = normalizeHost(requestHeaders.get('host'))
  return host && matchesHost(site, host) ? site : null
}

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null
  const host = value.trim().toLowerCase()
  if (!host || /[\s\\/@?#\u0000-\u001F\u007F]/u.test(host)) return null

  try {
    const parsed = new URL(`http://${host}`)
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) return null
    return parsed.host
  } catch {
    return null
  }
}

function matchesHost(site: SiteContext, host: string): boolean {
  const configured = new URL(site.origin)
  if (configured.host.toLowerCase() === host) return true

  // HTTP Host may explicitly include a default port whereas URL.origin omits it.
  const defaultPort = configured.protocol === 'https:' ? '443' : '80'
  return host === `${configured.hostname.toLowerCase()}:${defaultPort}`
}

function matchesBasePath(site: SiteContext, pathname: string): boolean {
  if (!pathname.startsWith('/')) return false
  return !site.basePath || pathname === site.basePath || pathname.startsWith(`${site.basePath}/`)
}
