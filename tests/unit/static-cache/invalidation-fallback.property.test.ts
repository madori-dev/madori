// Property 10: Invalidation fallback to entry URL

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'
import { InvalidationEngine } from '@/lib/static-cache/invalidation'
import type { InvalidationRule } from '@/lib/static-cache/invalidation'

/**
 * Validates: Requirements 5.4
 *
 * Property:
 * For any entry save where no custom invalidation rule matches the entry's collection,
 * the invalidation engine SHALL invalidate exactly the entry's own URL.
 */

// --- Generators ---

/** Arbitrary URL path: starts with /, contains path segments */
const urlPathArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/).filter((s) => s.length >= 1 && s.length <= 30),
    { minLength: 1, maxLength: 5 },
  )
  .map((segments) => '/' + segments.join('/'))

/** Arbitrary collection handle */
const collectionHandleArb = fc.stringMatching(/^[a-z][a-z0-9_]*$/).filter((s) => s.length >= 2 && s.length <= 20)

/** Arbitrary HTML string for cache content */
const htmlStringArb = fc
  .string({ minLength: 10, maxLength: 200 })
  .map((body) => `<html><body>${body}</body></html>`)

/**
 * Generate invalidation rules that do NOT match a given collection handle.
 * This ensures the fallback behavior is triggered.
 */
function nonMatchingRulesArb(excludeCollection: string): fc.Arbitrary<InvalidationRule[]> {
  return fc
    .array(
      fc.record({
        trigger: collectionHandleArb.filter((t) => t !== excludeCollection),
        urls: fc.array(urlPathArb, { minLength: 1, maxLength: 3 }),
      }),
      { minLength: 0, maxLength: 5 },
    )
}

// --- Property Tests ---

describe('Property 10: Invalidation fallback to entry URL', () => {
  it('invalidates exactly the entry own URL when no custom rule matches the collection', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionHandleArb,
        urlPathArb,
        htmlStringArb,
        fc.array(urlPathArb, { minLength: 1, maxLength: 5 }),
        async (collection, entryUrl, html, otherUrls) => {
          const driver = new ApplicationCacheDriver()
          const rules = await fc.sample(nonMatchingRulesArb(collection), 1)[0] ?? []

          // Populate cache with the entry's URL and other URLs
          await driver.set(entryUrl, html)
          for (const url of otherUrls) {
            await driver.set(url, html)
          }

          const engine = new InvalidationEngine(driver, rules, false)

          // Trigger entry invalidation for a collection with no matching rule
          await engine.invalidate({
            type: 'entry',
            collection,
            url: entryUrl,
          })

          // The entry's own URL should be invalidated
          expect(await driver.has(entryUrl)).toBe(false)

          // Other URLs should remain cached (unless they happen to equal entryUrl)
          for (const url of otherUrls) {
            if (url !== entryUrl) {
              expect(await driver.has(url)).toBe(true)
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('invalidates only the entry URL and nothing else when rules exist for different collections', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionHandleArb,
        urlPathArb,
        htmlStringArb,
        async (collection, entryUrl, html) => {
          const driver = new ApplicationCacheDriver()

          // Create rules that target other collections, not this one
          const rules: InvalidationRule[] = [
            { trigger: collection + '_other', urls: ['/some/page', '/another/page'] },
            { trigger: 'unrelated_collection', urls: ['/unrelated/*'] },
          ]

          // Cache the entry URL and the URLs from the rules
          await driver.set(entryUrl, html)
          await driver.set('/some/page', html)
          await driver.set('/another/page', html)

          const engine = new InvalidationEngine(driver, rules, false)

          await engine.invalidate({
            type: 'entry',
            collection,
            url: entryUrl,
          })

          // Entry's own URL invalidated
          expect(await driver.has(entryUrl)).toBe(false)

          // URLs in non-matching rules remain untouched
          expect(await driver.has('/some/page')).toBe(true)
          expect(await driver.has('/another/page')).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })
})
