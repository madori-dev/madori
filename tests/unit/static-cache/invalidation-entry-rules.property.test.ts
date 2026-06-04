// Property 9: Entry invalidation with custom rules

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'
import { InvalidationEngine } from '@/lib/static-cache/invalidation'
import type { InvalidationRule } from '@/lib/static-cache/invalidation'

/**
 * Validates: Requirements 4.1, 5.2, 5.3
 *
 * Property:
 * For any collection handle with a matching invalidation rule specifying a set of URLs,
 * when an entry in that collection is saved, exactly the URLs listed in the rule
 * (including glob expansions) SHALL be invalidated from the cache.
 */

// --- Generators ---

/** Arbitrary collection handle (alphanumeric + hyphens) */
const collectionHandleArb = fc
  .stringMatching(/^[a-z][a-z0-9\-]*$/)
  .filter((s) => s.length >= 2 && s.length <= 20)

/** Arbitrary URL path: starts with /, contains path segments */
const urlPathArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/).filter((s) => s.length >= 1 && s.length <= 20),
    { minLength: 1, maxLength: 4 },
  )
  .map((segments) => '/' + segments.join('/'))

/** Arbitrary glob URL pattern (a path prefix with trailing wildcard) */
const globUrlArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/).filter((s) => s.length >= 1 && s.length <= 15),
    { minLength: 1, maxLength: 3 },
  )
  .map((segments) => '/' + segments.join('/') + '/*')

/** Arbitrary rule URL: either explicit path or glob pattern */
const ruleUrlArb = fc.oneof(urlPathArb, globUrlArb)

/** Arbitrary set of rule URLs (1-5 URLs) */
const ruleUrlsArb = fc.array(ruleUrlArb, { minLength: 1, maxLength: 5 })

/** Arbitrary cached URL paths (used to populate the cache) */
const cachedUrlsArb = fc.array(urlPathArb, { minLength: 1, maxLength: 10 })

// --- Property Tests ---

describe('Property 9: Entry invalidation with custom rules', () => {
  it('invalidation of entry with matching rule removes exactly the URLs specified in the rule from the cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionHandleArb,
        ruleUrlsArb,
        cachedUrlsArb,
        async (collection, ruleUrls, cachedUrls) => {
          const driver = new ApplicationCacheDriver()
          const rules: InvalidationRule[] = [{ trigger: collection, urls: ruleUrls }]
          const engine = new InvalidationEngine(driver, rules, false)

          // Populate cache with all cached URLs
          for (const url of cachedUrls) {
            await driver.set(url, `<html>${url}</html>`)
          }

          // Also populate cache with explicit (non-glob) rule URLs so they can be deleted
          const explicitRuleUrls = ruleUrls.filter((u) => !u.includes('*'))
          for (const url of explicitRuleUrls) {
            await driver.set(url, `<html>${url}</html>`)
          }

          // For glob patterns, add URLs that match the glob to the cache
          const globRuleUrls = ruleUrls.filter((u) => u.includes('*'))
          const globMatchingUrls: string[] = []
          for (const glob of globRuleUrls) {
            // Create a URL that matches this glob by replacing the trailing /* with a segment
            const prefix = glob.replace(/\/\*$/, '')
            const matchingUrl = prefix + '/test-entry'
            await driver.set(matchingUrl, `<html>${matchingUrl}</html>`)
            globMatchingUrls.push(matchingUrl)
          }

          // Fire entry invalidation event for the collection
          await engine.invalidate({
            type: 'entry',
            collection,
            url: '/some-entry-url',
          })

          // Explicit rule URLs should be removed from cache
          for (const url of explicitRuleUrls) {
            expect(await driver.has(url)).toBe(false)
          }

          // URLs matching glob patterns should be removed from cache
          for (const url of globMatchingUrls) {
            expect(await driver.has(url)).toBe(false)
          }

          // Cached URLs that don't match any rule URL should remain
          // (unless they happen to match a glob pattern from the rule)
          for (const url of cachedUrls) {
            const matchesExplicit = explicitRuleUrls.includes(url)
            const matchesGlob = globRuleUrls.some((glob) => {
              const regex = new RegExp(
                '^' +
                  glob
                    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\*/g, '.*') +
                  '$',
              )
              return regex.test(url)
            })

            if (!matchesExplicit && !matchesGlob) {
              expect(await driver.has(url)).toBe(true)
            }
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('multiple rules for the same collection trigger combine their URL lists', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionHandleArb,
        ruleUrlsArb,
        ruleUrlsArb,
        async (collection, ruleUrls1, ruleUrls2) => {
          const driver = new ApplicationCacheDriver()
          const rules: InvalidationRule[] = [
            { trigger: collection, urls: ruleUrls1 },
            { trigger: collection, urls: ruleUrls2 },
          ]
          const engine = new InvalidationEngine(driver, rules, false)

          // Combine all explicit URLs from both rules
          const allRuleUrls = [...ruleUrls1, ...ruleUrls2]
          const explicitUrls = allRuleUrls.filter((u) => !u.includes('*'))

          // Populate cache with all explicit URLs
          for (const url of explicitUrls) {
            await driver.set(url, `<html>${url}</html>`)
          }

          // Fire entry invalidation
          await engine.invalidate({
            type: 'entry',
            collection,
            url: '/entry-url',
          })

          // All explicit URLs from both rules should be invalidated
          for (const url of explicitUrls) {
            expect(await driver.has(url)).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rules for non-matching collections do not invalidate their URLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionHandleArb,
        collectionHandleArb,
        ruleUrlsArb,
        async (triggerCollection, eventCollection, ruleUrls) => {
          // Ensure the collections are different
          fc.pre(triggerCollection !== eventCollection)

          const driver = new ApplicationCacheDriver()
          const rules: InvalidationRule[] = [{ trigger: triggerCollection, urls: ruleUrls }]
          const engine = new InvalidationEngine(driver, rules, false)

          // Populate cache with explicit rule URLs
          const explicitUrls = ruleUrls.filter((u) => !u.includes('*'))
          for (const url of explicitUrls) {
            await driver.set(url, `<html>${url}</html>`)
          }

          // Fire entry invalidation for a DIFFERENT collection
          const entryUrl = '/some-other-entry'
          await driver.set(entryUrl, `<html>${entryUrl}</html>`)
          await engine.invalidate({
            type: 'entry',
            collection: eventCollection,
            url: entryUrl,
          })

          // Rule URLs should still be in cache (rule didn't match)
          for (const url of explicitUrls) {
            expect(await driver.has(url)).toBe(true)
          }

          // The entry's own URL should be invalidated (fallback behavior)
          expect(await driver.has(entryUrl)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
