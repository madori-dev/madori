// Property 17: Warm-on-invalidate conditional behavior

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'
import { InvalidationEngine } from '@/lib/static-cache/invalidation'
import type { InvalidationEvent } from '@/lib/static-cache/invalidation'

/**
 * Validates: Requirements 12.2, 12.3
 *
 * Properties:
 * 1. For any invalidation event, when `warmOnInvalidate` is `true` the engine
 *    SHALL enqueue a re-render for each invalidated URL (the reRenderFn is called).
 * 2. When `warmOnInvalidate` is `false`, no re-render SHALL be enqueued
 *    (reRenderFn is never called).
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

/** Arbitrary collection handle */
const collectionHandleArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/)

/** Arbitrary entry invalidation event with a URL */
const entryEventWithUrlArb = fc.tuple(urlPathArb, collectionHandleArb).map(
  ([url, collection]): InvalidationEvent => ({
    type: 'entry',
    collection,
    url,
  }),
)

/** Arbitrary taxonomy invalidation event */
const taxonomyEventArb = fc
  .tuple(urlPathArb, fc.array(urlPathArb, { minLength: 1, maxLength: 5 }))
  .map(
    ([url, relatedUrls]): InvalidationEvent => ({
      type: 'taxonomy',
      url,
      relatedUrls,
    }),
  )

/** Arbitrary form invalidation event */
const formEventArb = fc
  .array(urlPathArb, { minLength: 1, maxLength: 5 })
  .map(
    (relatedUrls): InvalidationEvent => ({
      type: 'form',
      handle: 'contact',
      relatedUrls,
    }),
  )

/** Events that produce non-glob URLs (suitable for re-render verification) */
const nonGlobEventArb = fc.oneof(entryEventWithUrlArb, taxonomyEventArb, formEventArb)

// --- Property Tests ---

describe('Property 17: Warm-on-invalidate conditional behavior', () => {
  it('when warmOnInvalidate is true, reRenderFn is called for each invalidated non-glob URL', async () => {
    await fc.assert(
      fc.asyncProperty(nonGlobEventArb, async (event) => {
        const driver = new ApplicationCacheDriver()
        const reRenderFn = vi.fn().mockResolvedValue(undefined)

        const engine = new InvalidationEngine(driver, [], true, reRenderFn)

        await engine.invalidate(event)

        // Allow microtasks to settle (fire-and-forget Promise.allSettled)
        await new Promise((resolve) => setTimeout(resolve, 0))

        // reRenderFn should have been called for each non-glob invalidated URL
        const expectedUrls = getExpectedNonGlobUrls(event)

        expect(reRenderFn).toHaveBeenCalledTimes(expectedUrls.length)
        for (const url of expectedUrls) {
          expect(reRenderFn).toHaveBeenCalledWith(url)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('when warmOnInvalidate is false, reRenderFn is never called', async () => {
    await fc.assert(
      fc.asyncProperty(nonGlobEventArb, async (event) => {
        const driver = new ApplicationCacheDriver()
        const reRenderFn = vi.fn().mockResolvedValue(undefined)

        const engine = new InvalidationEngine(driver, [], false, reRenderFn)

        await engine.invalidate(event)

        // Allow microtasks to settle
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(reRenderFn).not.toHaveBeenCalled()
      }),
      { numRuns: 200 },
    )
  })

  it('when warmOnInvalidate is true but no reRenderFn is provided, no error is thrown', async () => {
    await fc.assert(
      fc.asyncProperty(nonGlobEventArb, async (event) => {
        const driver = new ApplicationCacheDriver()

        // No reRenderFn passed
        const engine = new InvalidationEngine(driver, [], true)

        // Should not throw
        await expect(engine.invalidate(event)).resolves.toBeUndefined()
      }),
      { numRuns: 100 },
    )
  })

  it('glob URLs from global/navigation events are excluded from re-render', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<InvalidationEvent>(
          { type: 'global', handle: 'site-settings' },
          { type: 'navigation', handle: 'main' },
        ),
        async (event) => {
          const driver = new ApplicationCacheDriver()
          // Seed some entries so deletePattern has something to do
          await driver.set('/page-1', '<html></html>')
          await driver.set('/page-2', '<html></html>')

          const reRenderFn = vi.fn().mockResolvedValue(undefined)
          const engine = new InvalidationEngine(driver, [], true, reRenderFn)

          await engine.invalidate(event)

          // Allow microtasks to settle
          await new Promise((resolve) => setTimeout(resolve, 0))

          // Global/navigation events resolve to '*' (a glob) which is filtered out
          // from re-render calls
          expect(reRenderFn).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 50 },
    )
  })
})

// --- Helper ---

function getExpectedNonGlobUrls(event: InvalidationEvent): string[] {
  // Replicate the resolveUrls logic for non-glob cases
  if (event.type === 'global' || event.type === 'navigation') {
    // These resolve to ['*'] which is a glob — filtered out
    return []
  }

  if (event.type === 'taxonomy') {
    const urls: string[] = []
    if (event.url) urls.push(event.url)
    if (event.relatedUrls) urls.push(...event.relatedUrls)
    return urls.filter((u) => !u.includes('*'))
  }

  if (event.type === 'form' && event.relatedUrls) {
    return event.relatedUrls.filter((u) => !u.includes('*'))
  }

  if (event.url) return [event.url].filter((u) => !u.includes('*'))
  return []
}
