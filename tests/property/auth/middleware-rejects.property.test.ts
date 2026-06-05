// Property 12: Middleware rejects unauthenticated requests

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

/**
 * Validates: Requirements 7.3, 7.4
 *
 * Property: For any protected /cp request without a session cookie,
 * middleware redirects to /cp/login without making a network request.
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

// --- Property Tests ---

describe('Property 12: Middleware rejects unauthenticated requests', () => {
  it('for any protected CP path without session cookie, middleware redirects to /cp/login', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

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

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
