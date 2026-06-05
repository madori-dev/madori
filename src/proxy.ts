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
 * 2. Protects /cp routes via an optimistic session-cookie check
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
