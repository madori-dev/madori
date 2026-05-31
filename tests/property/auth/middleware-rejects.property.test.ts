// Property 12: Middleware rejects unauthenticated requests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/**
 * Validates: Requirements 7.3, 7.4
 *
 * Property: For any protected /cp request without a valid session cookie,
 * middleware redirects to /cp/login. Additionally, when an invalid/expired
 * session cookie is present (mock fetch returns 401), middleware redirects
 * AND clears the cookie.
 */

// --- Generators ---

/** Generate a path segment (non-empty, alphanumeric + hyphens) */
const pathSegmentArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))

/**
 * Generate a protected CP path that is NOT a public path.
 * Public paths: /cp/login, /cp/api/*, and static asset extensions.
 * We generate paths like /cp/dashboard, /cp/entries/blog, /cp/settings/general etc.
 */
const protectedCpPathArb = fc
  .tuple(
    pathSegmentArb,
    fc.array(pathSegmentArb, { minLength: 0, maxLength: 3 }),
  )
  .map(([first, rest]) => `/cp/${[first, ...rest].join('/')}`)
  .filter((path) => {
    // Exclude public paths
    if (path === '/cp/login' || path.startsWith('/cp/login/')) return false
    if (path.startsWith('/cp/api/')) return false
    // Exclude static asset patterns
    if (/\.(js|css|ico|png|jpg|svg|woff2?)$/.test(path)) return false
    return true
  })

/**
 * Generate an arbitrary invalid/expired session token.
 * Must be a valid cookie value (alphanumeric + some safe chars) so that
 * NextRequest can parse it from the cookie header.
 */
const COOKIE_SAFE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'
const invalidTokenArb = fc
  .array(fc.constantFrom(...COOKIE_SAFE_CHARS.split('')), { minLength: 1, maxLength: 64 })
  .map((chars) => chars.join(''))

// --- Property Tests ---

describe('Property 12: Middleware rejects unauthenticated requests', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('for any protected CP path without session cookie, middleware redirects to /cp/login', async () => {
    // Mock fetch — should not be called when there's no cookie
    globalThis.fetch = vi.fn()

    await fc.assert(
      fc.asyncProperty(protectedCpPathArb, async (path) => {
        const url = `http://localhost:3000${path}`
        const request = new NextRequest(new URL(url), { method: 'GET' })

        const response = await proxy(request)

        // Should redirect (307) to /cp/login
        expect(response.status).toBe(307)
        const location = response.headers.get('location')
        expect(location).toContain('/cp/login')
      }),
      { numRuns: 100 },
    )
  })

  it('for any protected CP path with invalid/expired session cookie, middleware redirects and clears cookie', async () => {
    // Mock fetch to return 401 (invalid session)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await fc.assert(
      fc.asyncProperty(
        protectedCpPathArb,
        invalidTokenArb,
        async (path, token) => {
          const url = `http://localhost:3000${path}`
          const request = new NextRequest(new URL(url), {
            method: 'GET',
            headers: {
              cookie: `madori_session=${token}`,
            },
          })

          const response = await proxy(request)

          // Should redirect (307) to /cp/login
          expect(response.status).toBe(307)
          const location = response.headers.get('location')
          expect(location).toContain('/cp/login')

          // Should clear the madori_session cookie (set to empty with past expiry)
          const setCookie = response.headers.get('set-cookie')
          expect(setCookie).toBeTruthy()
          expect(setCookie).toContain('madori_session=')
        },
      ),
      { numRuns: 100 },
    )
  })
})
