// Property 2: Application driver cache round-trip

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { ApplicationCacheDriver } from '@/lib/static-cache/drivers/application'

/**
 * Validates: Requirements 2.1, 2.2, 1.2
 *
 * Properties:
 * 1. For any valid URL path and HTML string, storing the HTML via the application driver
 *    and then retrieving it with the same key SHALL return the identical HTML string.
 * 2. `has` returns true after `set`, false after `delete`.
 * 3. `clear` removes all entries.
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
  .tuple(fc.string({ minLength: 0, maxLength: 500 }), fc.string({ minLength: 0, maxLength: 200 }))
  .map(([body, title]) => `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`)

// --- Property Tests ---

describe('Property 2: Application driver cache round-trip', () => {
  let driver: ApplicationCacheDriver

  beforeEach(() => {
    driver = new ApplicationCacheDriver()
  })

  it('set then get returns the identical HTML string for any valid URL path and HTML', async () => {
    await fc.assert(
      fc.asyncProperty(urlPathArb, htmlStringArb, async (key, html) => {
        const freshDriver = new ApplicationCacheDriver()

        await freshDriver.set(key, html)
        const retrieved = await freshDriver.get(key)

        expect(retrieved).toBe(html)
      }),
      { numRuns: 200 },
    )
  })

  it('has returns true after set, false after delete', async () => {
    await fc.assert(
      fc.asyncProperty(urlPathArb, htmlStringArb, async (key, html) => {
        const freshDriver = new ApplicationCacheDriver()

        // Initially has should be false
        expect(await freshDriver.has(key)).toBe(false)

        // After set, has should be true
        await freshDriver.set(key, html)
        expect(await freshDriver.has(key)).toBe(true)

        // After delete, has should be false
        await freshDriver.delete(key)
        expect(await freshDriver.has(key)).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('clear removes all entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(urlPathArb, htmlStringArb), { minLength: 1, maxLength: 10 }),
        async (entries) => {
          const freshDriver = new ApplicationCacheDriver()

          // Set multiple entries
          for (const [key, html] of entries) {
            await freshDriver.set(key, html)
          }

          // Clear all entries
          const count = await freshDriver.clear()
          expect(count).toBe(new Map(entries).size)

          // All entries should be gone
          for (const [key] of entries) {
            expect(await freshDriver.has(key)).toBe(false)
            expect(await freshDriver.get(key)).toBeNull()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
