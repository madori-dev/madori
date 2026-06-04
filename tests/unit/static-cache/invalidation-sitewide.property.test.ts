// Property 8: Site-wide invalidation clears all entries

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'
import { InvalidationEngine } from '@/lib/static-cache/invalidation'

/**
 * Validates: Requirements 4.2, 4.3
 *
 * Properties:
 * 1. For any set of cached URLs, when a `global` invalidation event fires,
 *    the cache SHALL contain zero entries afterwards.
 * 2. For any set of cached URLs, when a `navigation` invalidation event fires,
 *    the cache SHALL contain zero entries afterwards.
 */

// --- Generators ---

/** Arbitrary URL path: starts with /, contains path segments */
const urlPathArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/).filter((s) => s.length >= 1 && s.length <= 30),
    { minLength: 0, maxLength: 5 },
  )
  .map((segments) => '/' + segments.join('/'))

/** Arbitrary HTML string */
const htmlStringArb = fc
  .tuple(fc.string({ minLength: 0, maxLength: 200 }), fc.string({ minLength: 0, maxLength: 100 }))
  .map(([body, title]) => `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`)

/** Arbitrary set of cache entries (unique URL paths with HTML) */
const cacheEntriesArb = fc
  .uniqueArray(fc.tuple(urlPathArb, htmlStringArb), {
    minLength: 1,
    maxLength: 10,
    selector: ([key]) => key,
  })

// --- Property Tests ---

describe('Property 8: Site-wide invalidation clears all entries', () => {
  it('global invalidation event clears all cached entries', async () => {
    await fc.assert(
      fc.asyncProperty(cacheEntriesArb, async (entries) => {
        const driver = new ApplicationCacheDriver()
        const engine = new InvalidationEngine(driver, [], false)

        // Populate cache with entries
        for (const [key, html] of entries) {
          await driver.set(key, html)
        }

        // Fire global invalidation event
        await engine.invalidate({ type: 'global', handle: 'site-settings' })

        // All entries should be cleared
        for (const [key] of entries) {
          expect(await driver.has(key)).toBe(false)
          expect(await driver.get(key)).toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })

  it('navigation invalidation event clears all cached entries', async () => {
    await fc.assert(
      fc.asyncProperty(cacheEntriesArb, async (entries) => {
        const driver = new ApplicationCacheDriver()
        const engine = new InvalidationEngine(driver, [], false)

        // Populate cache with entries
        for (const [key, html] of entries) {
          await driver.set(key, html)
        }

        // Fire navigation invalidation event
        await engine.invalidate({ type: 'navigation', handle: 'main' })

        // All entries should be cleared
        for (const [key] of entries) {
          expect(await driver.has(key)).toBe(false)
          expect(await driver.get(key)).toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })
})
