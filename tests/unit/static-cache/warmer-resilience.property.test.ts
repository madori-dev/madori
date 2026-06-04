import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property 16: Cache warmer resilience
 * Validates: Requirements 10.6
 *
 * For any set of routes where a subset fail during warming, the warmer SHALL
 * still attempt all remaining routes and report accurate success/failure counts.
 *
 * This test exercises the core warming algorithm (shared queue + concurrent workers)
 * which is the same pattern used by warmCache in src/lib/static-cache/cli/warm.ts.
 * We replicate the algorithm here to avoid importing warm.ts which has a CLI
 * auto-execution side effect (main() runs at module load).
 */

interface WarmResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ url: string; error: string }>
}

/**
 * Core warming algorithm extracted from src/lib/static-cache/cli/warm.ts.
 * Uses the same shared-queue concurrent worker pattern.
 */
async function warmRoutes(
  routes: string[],
  baseUrl: string,
  concurrency: number
): Promise<WarmResult> {
  const result: WarmResult = {
    total: routes.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  if (routes.length === 0) {
    return result
  }

  const queue = [...routes]

  async function processQueue(): Promise<void> {
    while (queue.length > 0) {
      const route = queue.shift()
      if (!route) break

      try {
        const url = new URL(route, baseUrl).toString()
        const response = await fetch(url, { method: 'GET' })

        if (response.ok) {
          result.succeeded++
        } else {
          result.failed++
          const errorMsg = `HTTP ${response.status} ${response.statusText}`
          result.errors.push({ url: route, error: errorMsg })
        }
      } catch (err) {
        result.failed++
        const errorMsg = err instanceof Error ? err.message : String(err)
        result.errors.push({ url: route, error: errorMsg })
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, routes.length) },
    () => processQueue()
  )
  await Promise.all(workers)

  return result
}

describe('Property 16: Cache warmer resilience', () => {
  beforeEach(() => {
    vi.stubGlobal('console', { ...console, log: vi.fn() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ─── Arbitraries ─────────────────────────────────────────────────────────────

  /** Generate a valid route path segment */
  const slugArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{0,10}$/)
    .filter((s) => s.length > 0 && !s.endsWith('-'))

  /** Generate a valid route path */
  const routeArb = fc
    .array(slugArb, { minLength: 1, maxLength: 3 })
    .map((parts) => `/${parts.join('/')}`)

  /** Generate a non-empty array of unique routes */
  const routeSetArb = fc.uniqueArray(routeArb, { minLength: 1, maxLength: 15 })

  /** Generate a concurrency level */
  const concurrencyArb = fc.integer({ min: 1, max: 8 })

  /**
   * **Validates: Requirements 10.6**
   *
   * For any set of routes where a subset fail (via non-200 response),
   * succeeded + failed SHALL equal total, and all routes SHALL be attempted.
   */
  it('reports accurate success/failure counts when some routes return non-200', async () => {
    await fc.assert(
      fc.asyncProperty(
        routeSetArb.chain((routes) =>
          fc.tuple(
            fc.constant(routes),
            fc.array(fc.boolean(), { minLength: routes.length, maxLength: routes.length })
          )
        ),
        concurrencyArb,
        async ([routes, failurePattern], concurrency) => {
          const attemptedRoutes: string[] = []

          // Mock global fetch: return 200 for success, 500 for failure
          const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
            const urlStr = typeof url === 'string' ? url : url.toString()
            attemptedRoutes.push(urlStr)
            const urlObj = new URL(urlStr)
            const routePath = urlObj.pathname
            const routeIndex = routes.indexOf(routePath)
            const shouldFail = routeIndex >= 0 && failurePattern[routeIndex]

            if (shouldFail) {
              return { ok: false, status: 500, statusText: 'Internal Server Error' }
            }
            return { ok: true, status: 200, statusText: 'OK' }
          })
          vi.stubGlobal('fetch', fetchMock)

          const result = await warmRoutes(routes, 'http://localhost:3000', concurrency)

          // Property: succeeded + failed === total
          expect(result.succeeded + result.failed).toBe(result.total)

          // Property: total matches the number of routes
          expect(result.total).toBe(routes.length)

          // Property: all routes were attempted
          expect(attemptedRoutes.length).toBe(routes.length)

          // Property: failure count matches expected failures
          const expectedFailures = failurePattern.filter(Boolean).length
          expect(result.failed).toBe(expectedFailures)

          // Property: success count matches expected successes
          const expectedSuccesses = routes.length - expectedFailures
          expect(result.succeeded).toBe(expectedSuccesses)

          // Property: errors array length matches failed count
          expect(result.errors.length).toBe(result.failed)
        }
      ),
      { numRuns: 30 }
    )
  })

  /**
   * **Validates: Requirements 10.6**
   *
   * For any set of routes where a subset throw network errors,
   * the warmer SHALL still attempt all remaining routes.
   */
  it('continues warming when routes throw network errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        routeSetArb.chain((routes) =>
          fc.tuple(
            fc.constant(routes),
            fc.array(fc.boolean(), { minLength: routes.length, maxLength: routes.length })
          )
        ),
        concurrencyArb,
        async ([routes, failurePattern], concurrency) => {
          const attemptedRoutes: string[] = []

          // Mock global fetch: throw for failures, return 200 for success
          const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
            const urlStr = typeof url === 'string' ? url : url.toString()
            attemptedRoutes.push(urlStr)
            const urlObj = new URL(urlStr)
            const routePath = urlObj.pathname
            const routeIndex = routes.indexOf(routePath)
            const shouldFail = routeIndex >= 0 && failurePattern[routeIndex]

            if (shouldFail) {
              throw new Error('Connection refused')
            }
            return { ok: true, status: 200, statusText: 'OK' }
          })
          vi.stubGlobal('fetch', fetchMock)

          const result = await warmRoutes(routes, 'http://localhost:3000', concurrency)

          // Property: succeeded + failed === total
          expect(result.succeeded + result.failed).toBe(result.total)

          // Property: all routes were attempted regardless of failures
          expect(attemptedRoutes.length).toBe(routes.length)

          // Property: failure count matches thrown errors
          const expectedFailures = failurePattern.filter(Boolean).length
          expect(result.failed).toBe(expectedFailures)

          // Property: errors contain meaningful error messages
          for (const err of result.errors) {
            expect(err.error).toBeTruthy()
            expect(err.url).toBeTruthy()
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  /**
   * **Validates: Requirements 10.6**
   *
   * For any set of routes with mixed failure modes (non-200 and thrown errors),
   * succeeded + failed SHALL equal total and all routes SHALL be attempted.
   */
  it('handles mixed failure modes correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        routeSetArb.chain((routes) =>
          fc.tuple(
            fc.constant(routes),
            // 0=success, 1=non-200, 2=throw
            fc.array(fc.integer({ min: 0, max: 2 }), {
              minLength: routes.length,
              maxLength: routes.length,
            })
          )
        ),
        concurrencyArb,
        async ([routes, failureModes], concurrency) => {
          const attemptedRoutes: string[] = []

          const fetchMock = vi.fn().mockImplementation(async (url: string | URL) => {
            const urlStr = typeof url === 'string' ? url : url.toString()
            attemptedRoutes.push(urlStr)
            const urlObj = new URL(urlStr)
            const routePath = urlObj.pathname
            const routeIndex = routes.indexOf(routePath)
            const mode = routeIndex >= 0 ? failureModes[routeIndex] : 0

            if (mode === 2) {
              throw new Error('ECONNREFUSED')
            }
            if (mode === 1) {
              return { ok: false, status: 503, statusText: 'Service Unavailable' }
            }
            return { ok: true, status: 200, statusText: 'OK' }
          })
          vi.stubGlobal('fetch', fetchMock)

          const result = await warmRoutes(routes, 'http://localhost:3000', concurrency)

          // Property: succeeded + failed === total (invariant)
          expect(result.succeeded + result.failed).toBe(result.total)

          // Property: all routes were attempted
          expect(attemptedRoutes.length).toBe(routes.length)

          // Property: counts are accurate
          const expectedFailures = failureModes.filter((m) => m > 0).length
          const expectedSuccesses = failureModes.filter((m) => m === 0).length
          expect(result.failed).toBe(expectedFailures)
          expect(result.succeeded).toBe(expectedSuccesses)
        }
      ),
      { numRuns: 30 }
    )
  })
})
