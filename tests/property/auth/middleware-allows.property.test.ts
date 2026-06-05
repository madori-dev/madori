// Property 13: Middleware allows authenticated requests

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/**
 * Validates: Requirements 7.5
 *
 * Property: For any protected /cp request with a session cookie, Proxy performs
 * an optimistic check without making a network request. API handlers remain
 * responsible for authoritative session validation.
 */

// --- Generators ---

/** Generate a path segment (non-empty, alphanumeric + hyphens) */
const pathSegmentArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))

/**
 * Generate a protected CP path that is NOT a public path.
 * Public paths: /cp/login, /cp/api/*, and static asset extensions.
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

/** Generate a valid session token (hex chars, like crypto.randomBytes output) */
const validTokenArb = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 8, maxLength: 64 })
  .map((bytes) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(''))

// --- Property Tests ---

describe('Property 13: Middleware allows authenticated requests', () => {
  it('for any protected CP path with a session cookie, middleware allows passage without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await fc.assert(
      fc.asyncProperty(
        protectedCpPathArb,
        validTokenArb,
        async (path, token) => {
          const url = `http://localhost:3000${path}`
          const request = new NextRequest(new URL(url), {
            method: 'GET',
            headers: {
              cookie: `madori_session=${token}`,
            },
          })

          const response = await proxy(request)

          // Should NOT redirect — status 200 and no Location header
          expect(response.status).toBe(200)
          expect(response.headers.get('location')).toBeNull()
        },
      ),
      { numRuns: 100 },
    )

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
