// Property 14: Middleware skips auth for excluded paths

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/**
 * Validates: Requirements 7.6
 *
 * Property: For any path that matches exclusion patterns (login page, API routes,
 * static assets) WITHOUT any session cookie, the middleware still returns
 * NextResponse.next() (no redirect).
 */

// --- Generators ---

/** Generates the exact login page path */
const loginPathArb = fc.constant('/cp/login')

/** Generates static asset paths with known extensions */
const staticAssetExtArb = fc.constantFrom('js', 'css', 'ico', 'png', 'jpg', 'svg', 'woff', 'woff2')
const staticAssetNameArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-z0-9][a-z0-9_-]*$/.test(s))

const staticAssetPathArb = fc.tuple(staticAssetNameArb, staticAssetExtArb).map(
  ([name, ext]) => `/cp/${name}.${ext}`,
)

/** Combined generator for all excluded paths (login page + static assets) */
const excludedPathArb = fc.oneof(loginPathArb, staticAssetPathArb)

// --- Helpers ---

function makeRequest(pathname: string): NextRequest {
  // No session cookie set — request is unauthenticated
  return new NextRequest(new URL(pathname, 'http://localhost:3000'), {
    method: 'GET',
  })
}

function isPassThrough(response: Response): boolean {
  // NextResponse.next() does not set a Location header and has no redirect status
  const status = response.status
  const location = response.headers.get('location')
  return status === 200 && location === null
}

// --- Property Tests ---

describe('Property 14: Middleware skips auth for excluded paths', () => {
  // Mock global fetch to prevent actual network calls (shouldn't be reached for excluded paths)
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('for any excluded path without session cookie, middleware passes through without redirect', async () => {
    // Mock fetch in case it's somehow called — it should NOT be for excluded paths
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('fetch should not be called for excluded paths')),
    )

    await fc.assert(
      fc.asyncProperty(excludedPathArb, async (pathname) => {
        const request = makeRequest(pathname)
        const response = await proxy(request)
        expect(isPassThrough(response)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})
