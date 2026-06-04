// Property 11: Taxonomy invalidation scope

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'
import { InvalidationEngine } from '@/lib/static-cache/invalidation'
import type { InvalidationEvent } from '@/lib/static-cache/invalidation'

/**
 * Validates: Requirements 4.4
 *
 * Property:
 * For any taxonomy term with a URL and a set of entries tagged with that term,
 * when the term is saved, the invalidation engine SHALL invalidate the term's URL
 * and all tagged entry URLs, and no other URLs.
 */

// --- Generators ---

/** Arbitrary URL path: starts with /, contains path segments */
const urlPathArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/).filter((s) => s.length >= 1 && s.length <= 30),
    { minLength: 1, maxLength: 4 },
  )
  .map((segments) => '/' + segments.join('/'))

/** Generate a set of unique URL paths (no duplicates) */
const uniqueUrlSetArb = (minLength: number, maxLength: number) =>
  fc.uniqueArray(urlPathArb, { minLength, maxLength, comparator: (a, b) => a === b })

// --- Property Tests ---

describe('Property 11: Taxonomy invalidation scope', () => {
  it('invalidates exactly the term URL and all tagged entry URLs, and no other URLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        urlPathArb, // taxonomy term URL
        uniqueUrlSetArb(1, 5), // related entry URLs (tagged with this term)
        uniqueUrlSetArb(1, 5), // unrelated URLs in cache (should survive)
        async (termUrl, relatedUrls, unrelatedUrls) => {
          // Ensure no overlap between term URL, related URLs, and unrelated URLs
          const allTaxonomyUrls = new Set([termUrl, ...relatedUrls])
          const filteredUnrelated = unrelatedUrls.filter((u) => !allTaxonomyUrls.has(u))

          // Need at least one unrelated URL to verify scope
          if (filteredUnrelated.length === 0) return

          // Set up cache with all URLs
          const driver = new ApplicationCacheDriver()
          const allUrls = [termUrl, ...relatedUrls, ...filteredUnrelated]
          for (const url of allUrls) {
            await driver.set(url, `<html>${url}</html>`)
          }

          // Create engine with no custom rules, warmOnInvalidate disabled
          const engine = new InvalidationEngine(driver, [], false)

          // Fire taxonomy event
          const event: InvalidationEvent = {
            type: 'taxonomy',
            url: termUrl,
            relatedUrls,
          }
          await engine.invalidate(event)

          // Verify: term URL and related URLs are invalidated
          expect(await driver.has(termUrl)).toBe(false)
          for (const url of relatedUrls) {
            expect(await driver.has(url)).toBe(false)
          }

          // Verify: unrelated URLs are still cached
          for (const url of filteredUnrelated) {
            expect(await driver.has(url)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('invalidates only the term URL when no related URLs are provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        urlPathArb, // taxonomy term URL
        uniqueUrlSetArb(1, 5), // unrelated URLs in cache
        async (termUrl, unrelatedUrls) => {
          const filteredUnrelated = unrelatedUrls.filter((u) => u !== termUrl)
          if (filteredUnrelated.length === 0) return

          // Set up cache
          const driver = new ApplicationCacheDriver()
          for (const url of [termUrl, ...filteredUnrelated]) {
            await driver.set(url, `<html>${url}</html>`)
          }

          const engine = new InvalidationEngine(driver, [], false)

          // Fire taxonomy event with no relatedUrls
          const event: InvalidationEvent = {
            type: 'taxonomy',
            url: termUrl,
          }
          await engine.invalidate(event)

          // Term URL invalidated
          expect(await driver.has(termUrl)).toBe(false)

          // Unrelated URLs survive
          for (const url of filteredUnrelated) {
            expect(await driver.has(url)).toBe(true)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
