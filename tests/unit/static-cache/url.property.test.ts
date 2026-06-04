import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizeCacheKey } from '@/lib/static-cache/url'

/**
 * Property 5: URL normalization produces consistent cache keys
 * Validates: Requirements 2.3, 7.2, 7.3
 *
 * For any URL path with trailing slashes or redundant separators, the normalized
 * cache key SHALL be identical to the normalized form of the canonical path.
 * For any two URLs differing only in query parameter order with
 * `queryStrings: "separate"`, the normalized cache key SHALL be identical.
 */
describe('Property 5: URL normalization produces consistent cache keys', () => {
  // Arbitrary for URL path segments (alphanumeric + hyphens, non-empty)
  const pathSegment = fc.stringMatching(/^[a-z0-9][a-z0-9\-]{0,19}$/)

  // Arbitrary for a canonical URL path (e.g., /foo/bar)
  const urlPath = fc
    .array(pathSegment, { minLength: 1, maxLength: 5 })
    .map((segments) => '/' + segments.join('/'))

  // Arbitrary for query parameter key/value pairs (alphanumeric)
  const queryParam = fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/)
  )

  /**
   * **Validates: Requirements 2.3, 7.2, 7.3**
   *
   * Adding trailing slashes to a URL path does not change the normalized cache key.
   */
  it('trailing slashes produce the same cache key as the canonical path', () => {
    fc.assert(
      fc.property(urlPath, fc.integer({ min: 1, max: 5 }), (path, numSlashes) => {
        const trailingSlashes = '/'.repeat(numSlashes)
        const withSlashes = path + trailingSlashes

        const normalizedCanonical = normalizeCacheKey(path, { queryStrings: 'ignore' })
        const normalizedWithSlashes = normalizeCacheKey(withSlashes, { queryStrings: 'ignore' })

        expect(normalizedWithSlashes).toBe(normalizedCanonical)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 2.3, 7.2, 7.3**
   *
   * Normalization is idempotent — normalizing an already-normalized key
   * produces the same result.
   */
  it('normalization is idempotent', () => {
    fc.assert(
      fc.property(
        urlPath,
        fc.constantFrom<'ignore' | 'separate'>('ignore', 'separate'),
        fc.array(queryParam, { minLength: 0, maxLength: 4 }),
        (path, queryStrings, params) => {
          const query = params.length > 0
            ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&')
            : ''
          const input = path + query

          const once = normalizeCacheKey(input, { queryStrings })
          const twice = normalizeCacheKey(once, { queryStrings })

          expect(twice).toBe(once)
        }
      ),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 7.2, 7.3**
   *
   * Two URLs differing only in query parameter order produce the same cache key
   * when `queryStrings: "separate"`.
   */
  it('query parameter order does not affect cache key with queryStrings: "separate"', () => {
    fc.assert(
      fc.property(
        urlPath,
        fc.array(queryParam, { minLength: 2, maxLength: 6 }),
        (path, params) => {
          // Ensure unique keys to avoid ambiguity
          const uniqueParams = params.filter(
            (p, i, arr) => arr.findIndex(([k]) => k === p[0]) === i
          )
          fc.pre(uniqueParams.length >= 2)

          // Build URL with params in original order
          const query1 = uniqueParams.map(([k, v]) => `${k}=${v}`).join('&')
          const url1 = `${path}?${query1}`

          // Build URL with params in reversed order
          const reversed = [...uniqueParams].reverse()
          const query2 = reversed.map(([k, v]) => `${k}=${v}`).join('&')
          const url2 = `${path}?${query2}`

          const key1 = normalizeCacheKey(url1, { queryStrings: 'separate' })
          const key2 = normalizeCacheKey(url2, { queryStrings: 'separate' })

          expect(key1).toBe(key2)
        }
      ),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 7.2**
   *
   * When `queryStrings: "ignore"`, adding any query parameters does not change
   * the cache key.
   */
  it('query params are ignored when queryStrings is "ignore"', () => {
    fc.assert(
      fc.property(
        urlPath,
        fc.array(queryParam, { minLength: 1, maxLength: 6 }),
        (path, params) => {
          const query = params.map(([k, v]) => `${k}=${v}`).join('&')
          const urlWithQuery = `${path}?${query}`

          const keyWithoutQuery = normalizeCacheKey(path, { queryStrings: 'ignore' })
          const keyWithQuery = normalizeCacheKey(urlWithQuery, { queryStrings: 'ignore' })

          expect(keyWithQuery).toBe(keyWithoutQuery)
        }
      ),
      { numRuns: 500 }
    )
  })
})
