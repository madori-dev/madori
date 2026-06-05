import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { MadoriConfigSchema } from '@/lib/config/schema'
import rawConfig from '../madori.config'
import { handleStaticCache } from '@/lib/static-cache/middleware'

const appConfig = MadoriConfigSchema.parse(rawConfig)

const PUBLIC_PATHS = ['/cp/login']
const PUBLIC_ASSET_PATTERN = /\.(js|css|ico|png|jpg|svg|woff2?)$/

/**
 * Next.js Proxy — handles static caching and CP route protection.
 *
 * 1. Checks static cache for frontend pages (returns cached HTML on hit)
 * 2. Protects /cp routes via server-side session validation
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ─── Static Cache ─────────────────────────────────────────────────────
  const cacheResponse = await handleStaticCache(
    request,
    appConfig.staticCache,
    appConfig.cp.path
  )
  if (cacheResponse) {
    return cacheResponse
  }

  // ─── CP Auth Guard ────────────────────────────────────────────────────
  // Only apply auth to /cp routes
  if (!pathname.startsWith('/cp')) {
    return NextResponse.next()
  }

  // Skip auth for login page, API routes, and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    PUBLIC_ASSET_PATTERN.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Extract session token from cookie
  const sessionToken = request.cookies.get('madori_session')?.value
  if (!sessionToken) {
    return NextResponse.redirect(new URL('/cp/login', request.url))
  }

  // Validate session server-side via internal API call
  // Uses INTERNAL_URL to avoid HTTPS issues when behind a reverse proxy (Nginx, Cloudflare)
  const internalUrl = process.env.INTERNAL_URL || `http://localhost:${process.env.PORT || '3000'}`
  const validateUrl = `${internalUrl}/api/auth/validate`

  let validateResponse: Response
  try {
    validateResponse = await fetch(validateUrl, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
  } catch (error) {
    // Internal fetch failed (server not ready, network issue) — let the request through
    // rather than blocking all CP access
    console.error('[madori:proxy] Session validation fetch failed:', error)
    return NextResponse.next()
  }

  if (!validateResponse.ok) {
    const response = NextResponse.redirect(new URL('/cp/login', request.url))
    // Clear invalid cookie
    response.cookies.set('madori_session', '', {
      httpOnly: true,
      path: '/',
      expires: new Date(0),
    })
    return response
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
