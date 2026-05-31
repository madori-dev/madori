import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/cp/login']
const PUBLIC_ASSET_PATTERN = /\.(js|css|ico|png|jpg|svg|woff2?)$/

/**
 * Next.js Proxy — protects Control Panel routes.
 *
 * Performs full server-side session validation by calling the internal
 * /cp/api/auth/validate endpoint. Redirects unauthenticated or invalid
 * sessions to /cp/login.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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
  const validateUrl = new URL('/api/auth/validate', request.url)
  const validateResponse = await fetch(validateUrl, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  })

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
  matcher: ['/cp/:path*'],
}
