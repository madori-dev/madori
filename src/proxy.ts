import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as path from 'node:path'
import { MadoriConfigSchema } from '@/lib/config/schema'
import rawConfig from '../madori.config'
import { handleStaticCache } from '@/lib/static-cache/middleware'
import { NodeFileSystemAdapter } from '@/lib/fs/adapter'
import { MarkdownYamlParser } from '@/lib/fs/parser'
import { FileSeoRedirectRepository, resolveRedirect } from '@/lib/seo/redirects'

const appConfig = MadoriConfigSchema.parse(rawConfig)

const PUBLIC_PATHS = ['/cp/login']
const PUBLIC_ASSET_PATTERN = /\.(js|css|ico|png|jpg|svg|woff2?)$/
const redirectRepository = new FileSeoRedirectRepository(
  new NodeFileSystemAdapter(),
  new MarkdownYamlParser(),
  // Content may be mounted from a separate repository at runtime; it is not a
  // build-time dependency for Next output tracing.
  path.resolve(/* turbopackIgnore: true */ process.cwd(), appConfig.contentPath),
  undefined,
  { allowedExternalOrigins: appConfig.seo.allowedRedirectOrigins },
)

type ConfiguredSite = (typeof appConfig.sites)[number]

interface PublicSiteSelection {
  contentSite: ConfiguredSite
  matchedSite: ConfiguredSite | null
  basePath: string
  internalPath: string
}

function selectPublicSite(request: NextRequest): PublicSiteSelection {
  const host = request.headers.get('host')?.trim().toLowerCase()
  const candidates = host ? appConfig.sites.filter((site) => {
    const configured = new URL(site.url)
    const defaultPort = configured.protocol === 'https:' ? '443' : '80'
    return configured.host.toLowerCase() === host
      || (!configured.port && host === `${configured.hostname.toLowerCase()}:${defaultPort}`)
  }) : []
  const pathname = request.nextUrl.pathname
  const matchedSite = candidates
    .map((site) => ({ site, basePath: new URL(site.url).pathname.replace(/\/$/, '') }))
    .filter(({ basePath }) => !basePath || pathname === basePath || pathname.startsWith(`${basePath}/`))
    .sort((left, right) => right.basePath.length - left.basePath.length)[0]
    ?? null
  const contentSite = matchedSite?.site
    ?? candidates.find(site => site.default)
    ?? appConfig.sites.find(site => site.default)
    ?? appConfig.sites[0]
  if (!contentSite) throw new Error('At least one public site must be configured.')
  const basePath = matchedSite?.basePath ?? ''
  return {
    contentSite,
    matchedSite: matchedSite?.site ?? null,
    basePath,
    internalPath: basePath ? pathname.slice(basePath.length) || '/' : pathname,
  }
}

function publicSiteResponse(request: NextRequest, selection: PublicSiteSelection): NextResponse {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-madori-site')
  if (selection.matchedSite) requestHeaders.set('x-madori-site', selection.matchedSite.handle)
  if (!selection.basePath) return NextResponse.next({ request: { headers: requestHeaders } })

  const rewritten = request.nextUrl.clone()
  rewritten.pathname = selection.internalPath
  return NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } })
}

async function publicRedirectResponse(request: NextRequest, selection: PublicSiteSelection): Promise<NextResponse | null> {
  if (!appConfig.seo.enabled || !appConfig.seo.redirects || (request.method !== 'GET' && request.method !== 'HEAD')) return null
  try {
    const records = await redirectRepository.list(selection.contentSite.handle)
    const resolved = resolveRedirect(records.map(record => record.redirect), selection.contentSite.handle, selection.internalPath)
    if (!resolved) return null
    if (!resolved.destination.startsWith('/')) return NextResponse.redirect(resolved.destination, resolved.status)

    const configured = new URL(selection.contentSite.url)
    const destination = new URL(resolved.destination, configured.origin)
    const siteBasePath = configured.pathname.replace(/\/$/, '')
    destination.pathname = `${siteBasePath}${destination.pathname}`.replace(/\/{2,}/g, '/')
    return NextResponse.redirect(destination, resolved.status)
  } catch {
    // A malformed or temporarily unavailable redirect store must not take the site down.
    return null
  }
}

/**
 * Next.js Proxy — handles static caching and CP route protection.
 *
 * 1. Checks static cache for frontend pages (returns cached HTML on hit)
 * 2. Protects /cp routes via an optimistic session-cookie check
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── CP Auth Guard ────────────────────────────────────────────────────
  // Only apply auth to /cp routes
  if (pathname.startsWith('/cp') && appConfig.cp.enabled === false) {
    return new NextResponse(null, { status: 404 })
  }
  if (!pathname.startsWith('/cp')) {
    if (pathname.startsWith('/api')) return NextResponse.next()
    const selection = selectPublicSite(request)
    const redirect = await publicRedirectResponse(request, selection)
    if (redirect) return redirect
    const cacheResponse = await handleStaticCache(
      request,
      appConfig.staticCache,
      appConfig.cp.path,
      selection.contentSite.handle,
    )
    return cacheResponse ?? publicSiteResponse(request, selection)
  }

  // Skip auth for login page, API routes, and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    PUBLIC_ASSET_PATTERN.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Keep Proxy checks optimistic. API handlers perform authoritative session
  // validation close to protected data.
  const sessionToken = request.cookies.get('madori_session')?.value
  if (!sessionToken) {
    return NextResponse.redirect(new URL('/cp/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
  ],
}
