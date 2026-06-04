// Property 12: Cache lock coalescing prevents redundant renders

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { CacheLock } from '@/lib/static-cache/lock'

/**
 * Validates: Requirements 13.1, 13.2, 13.3, 13.5
 *
 * Properties:
 * 1. For any set of N simultaneous requests to the same uncached URL,
 *    at most one render SHALL execute (only one `acquire` returns `'acquired'`).
 * 2. All N requests SHALL receive the same HTML response (after release).
 * 3. Requests to different URLs SHALL not block each other.
 */

// --- Generators ---

/** Arbitrary URL path: starts with /, contains path segments */
const urlPathArb = fc
  .array(
    fc
      .stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/)
      .filter((s) => s.length >= 1 && s.length <= 20),
    { minLength: 1, maxLength: 4 },
  )
  .map((segments) => '/' + segments.join('/'))

/** Arbitrary HTML string */
const htmlStringArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.string({ minLength: 0, maxLength: 100 }),
  )
  .map(
    ([body, title]) =>
      `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`,
  )

/** Number of concurrent requests (2–20) */
const concurrencyArb = fc.integer({ min: 2, max: 20 })

/** Set of distinct URL paths (2–6) */
const distinctUrlsArb = fc
  .uniqueArray(urlPathArb, { minLength: 2, maxLength: 6 })

// --- Property Tests ---

describe('Property 12: Cache lock coalescing prevents redundant renders', () => {
  it('for N simultaneous requests to the same URL, at most one acquire returns "acquired"', async () => {
    await fc.assert(
      fc.asyncProperty(urlPathArb, concurrencyArb, async (url, n) => {
        const lock = new CacheLock()

        const results = Array.from({ length: n }, () => lock.acquire(url))

        const acquiredCount = results.filter((r) => r === 'acquired').length
        const waitingCount = results.filter((r) => r !== 'acquired').length

        // Exactly one request acquires the lock
        expect(acquiredCount).toBe(1)
        // All other requests receive a promise (they wait)
        expect(waitingCount).toBe(n - 1)

        // Clean up: release so promises resolve
        lock.release(url, null)
      }),
      { numRuns: 200 },
    )
  })

  it('all N waiting requests receive the same HTML response after release', async () => {
    await fc.assert(
      fc.asyncProperty(
        urlPathArb,
        concurrencyArb,
        htmlStringArb,
        async (url, n, html) => {
          const lock = new CacheLock()

          const results = Array.from({ length: n }, () => lock.acquire(url))

          // Collect the waiting promises
          const waitingPromises = results.filter(
            (r): r is Promise<string | null> => r !== 'acquired',
          )

          // Release with the rendered HTML
          lock.release(url, html)

          // All waiters should resolve with the same HTML
          const resolved = await Promise.all(waitingPromises)
          for (const result of resolved) {
            expect(result).toBe(html)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('requests to different URLs do not block each other', async () => {
    await fc.assert(
      fc.asyncProperty(distinctUrlsArb, async (urls) => {
        const lock = new CacheLock()

        // Acquire a lock on each distinct URL
        const results = urls.map((url) => lock.acquire(url))

        // Every distinct URL should independently acquire its lock
        for (const result of results) {
          expect(result).toBe('acquired')
        }

        // Clean up
        for (const url of urls) {
          lock.release(url, null)
        }
      }),
      { numRuns: 200 },
    )
  })
})
