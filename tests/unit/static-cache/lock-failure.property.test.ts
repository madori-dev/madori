// Property 13: Cache lock failure releases waiters

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { CacheLock } from '@/lib/static-cache/lock'

/**
 * Validates: Requirements 13.4
 *
 * Properties:
 * 1. For any URL where the lock-holding render fails with an error, all waiting
 *    requests SHALL be released and permitted to attempt their own render
 *    (the promise rejects).
 * 2. After failure, the lock is cleared so a new `acquire` returns `'acquired'`.
 */

// --- Generators ---

/** Arbitrary URL path: starts with /, contains path segments */
const urlPathArb = fc
  .array(
    fc
      .stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/)
      .filter((s) => s.length >= 1 && s.length <= 30),
    { minLength: 0, maxLength: 5 },
  )
  .map((segments) => '/' + segments.join('/'))

/** Arbitrary error message */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 100 })

/** Arbitrary number of waiters (1..10) */
const waiterCountArb = fc.integer({ min: 1, max: 10 })

// --- Property Tests ---

describe('Property 13: Cache lock failure releases waiters', () => {
  it('all waiting requests are rejected when the lock-holding render fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        urlPathArb,
        waiterCountArb,
        errorMessageArb,
        async (url, waiterCount, errorMsg) => {
          const lock = new CacheLock()

          // First request acquires the lock
          const firstResult = lock.acquire(url)
          expect(firstResult).toBe('acquired')

          // Subsequent requests wait on the lock
          const waiters: Promise<string | null>[] = []
          for (let i = 0; i < waiterCount; i++) {
            const result = lock.acquire(url)
            expect(result).not.toBe('acquired')
            waiters.push(result as Promise<string | null>)
          }

          // The lock holder fails
          const error = new Error(errorMsg)
          lock.fail(url, error)

          // All waiters should be rejected with the error
          for (const waiter of waiters) {
            await expect(waiter).rejects.toThrow(errorMsg)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('after failure the lock is cleared and a new acquire returns "acquired"', async () => {
    await fc.assert(
      fc.asyncProperty(
        urlPathArb,
        waiterCountArb,
        errorMessageArb,
        async (url, waiterCount, errorMsg) => {
          const lock = new CacheLock()

          // First request acquires
          lock.acquire(url)

          // Add waiters
          const waiters: Promise<string | null>[] = []
          for (let i = 0; i < waiterCount; i++) {
            const result = lock.acquire(url)
            waiters.push(result as Promise<string | null>)
          }

          // Fail the lock
          lock.fail(url, new Error(errorMsg))

          // Consume all rejections to avoid unhandled promise warnings
          await Promise.allSettled(waiters)

          // After failure, the lock should be cleared — new acquire returns 'acquired'
          const newResult = lock.acquire(url)
          expect(newResult).toBe('acquired')
        },
      ),
      { numRuns: 200 },
    )
  })
})
