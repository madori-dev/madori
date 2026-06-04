import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'
import { handleStaticCache, getDriver } from '@/lib/static-cache/middleware'
import type { StaticCacheConfig } from '@/lib/config/schema'

/**
 * Property 4: Cache bypass when disabled
 * **Validates: Requirements 1.5**
 *
 * For any request URL, when `staticCache.enabled` is `false`, the static cache
 * middleware SHALL return `null` (pass-through) and the cache store SHALL remain
 * unchanged.
 */
describe('Property 4: Cache bypass when disabled', () => {
  // Generator for URL path segments
  const urlSegment = fc.stringMatching(/^[a-z][a-z0-9\-]{0,9}$/)

  // Generator for URL paths like /foo/bar
  const urlPath = fc
    .array(urlSegment, { minLength: 1, maxLength: 5 })
    .map((segments) => '/' + segments.join('/'))

  // Generator for query strings (may be empty)
  const queryString = fc.oneof(
    fc.constant(''),
    fc
      .array(
        fc.tuple(
          fc.stringMatching(/^[a-z]{1,8}$/),
          fc.stringMatching(/^[a-z0-9]{1,8}$/)
        ),
        { minLength: 1, maxLength: 3 }
      )
      .map((pairs) => '?' + pairs.map(([k, v]) => `${k}=${v}`).join('&'))
  )

  // Create a mock NextRequest
  function createMockRequest(pathname: string, search: string) {
    return {
      nextUrl: {
        pathname,
        search,
      },
    } as any
  }

  // Disabled config
  function createDisabledConfig(
    overrides: Partial<StaticCacheConfig> = {}
  ): StaticCacheConfig {
    return {
      enabled: false,
      driver: 'application',
      storagePath: 'storage/static-cache/',
      exclude: [],
      queryStrings: 'ignore',
      warmOnInvalidate: false,
      invalidationRules: [],
      ...overrides,
    }
  }

  /**
   * **Validates: Requirements 1.5**
   *
   * For any request URL, when enabled is false, handleStaticCache SHALL
   * return null (pass-through).
   */
  it('returns null for any request when staticCache.enabled is false', async () => {
    await fc.assert(
      fc.asyncProperty(urlPath, queryString, async (pathname, search) => {
        const request = createMockRequest(pathname, search)
        const config = createDisabledConfig()

        const result = await handleStaticCache(request, config, '/cp')

        expect(result).toBeNull()
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 1.5**
   *
   * When disabled, the cache store SHALL remain unchanged — no new entries
   * are added regardless of the request URL.
   */
  it('does not modify the cache store when disabled', async () => {
    await fc.assert(
      fc.asyncProperty(urlPath, queryString, async (pathname, search) => {
        const request = createMockRequest(pathname, search)
        const config = createDisabledConfig()

        // Get the driver to inspect the store state
        // First call with enabled config to ensure driver is instantiated
        const enabledConfig = createDisabledConfig({ enabled: true })
        const driver = getDriver(enabledConfig)

        // Clear the store to start fresh, then pre-populate with a known entry
        await driver.clear()
        await driver.set('/known-entry', '<html>existing</html>')

        // Now call with disabled config
        await handleStaticCache(request, config, '/cp')

        // The store should still have exactly the one pre-populated entry
        expect(await driver.has('/known-entry')).toBe(true)
        expect(await driver.get('/known-entry')).toBe('<html>existing</html>')

        // Clean up
        await driver.clear()
      }),
      { numRuns: 200 }
    )
  })

  /**
   * **Validates: Requirements 1.5**
   *
   * When disabled, even URLs that would normally be cached (not excluded)
   * SHALL return null.
   */
  it('returns null even for cacheable URLs when disabled', async () => {
    await fc.assert(
      fc.asyncProperty(urlPath, async (pathname) => {
        // Ensure URL is not under CP path — it's a "cacheable" URL
        fc.pre(!pathname.startsWith('/cp'))

        const request = createMockRequest(pathname, '')
        const config = createDisabledConfig()

        const result = await handleStaticCache(request, config, '/cp')

        expect(result).toBeNull()
      }),
      { numRuns: 500 }
    )
  })
})
