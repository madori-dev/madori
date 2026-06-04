import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  CSRF_PLACEHOLDER,
  injectCsrfPlaceholder,
  replaceCsrfPlaceholder,
} from '@/lib/static-cache/csrf'

/**
 * Property 7: CSRF token replacement round-trip
 * Validates: Requirements 8.1, 8.3
 *
 * For any HTML string containing a CSRF token, injecting the placeholder and
 * then replacing it with a new token SHALL produce HTML where no placeholder
 * remains and all original token positions contain the new token.
 */
describe('Property 7: CSRF token replacement round-trip', () => {
  // Arbitrary for a CSRF token: alphanumeric string that doesn't contain the placeholder
  const csrfToken = fc
    .stringMatching(/^[a-zA-Z0-9]{8,40}$/)
    .filter((t) => !t.includes(CSRF_PLACEHOLDER) && t.length > 0)

  // Arbitrary for HTML fragments that don't contain the placeholder or any token
  const htmlFragment = fc
    .stringMatching(/^[a-zA-Z0-9<>\/\s="'\-_.,:;!?()]{0,50}$/)
    .filter((s) => !s.includes(CSRF_PLACEHOLDER))

  // Build an HTML string with a token embedded at multiple positions
  const htmlWithToken = (token: string) =>
    fc
      .array(htmlFragment, { minLength: 2, maxLength: 6 })
      .filter((fragments) => fragments.every((f) => !f.includes(token)))
      .map((fragments) => fragments.join(token))

  /**
   * **Validates: Requirements 8.1, 8.3**
   *
   * After inject → replace round-trip, no placeholder remains in the output.
   */
  it('no placeholder remains after inject then replace', () => {
    fc.assert(
      fc.property(
        csrfToken,
        csrfToken,
        fc.array(htmlFragment, { minLength: 2, maxLength: 6 }),
        (originalToken, freshToken, fragments) => {
          // Ensure fragments don't accidentally contain either token
          fc.pre(fragments.every((f) => !f.includes(originalToken)))
          fc.pre(fragments.every((f) => !f.includes(freshToken)))
          fc.pre(originalToken !== freshToken)

          const html = fragments.join(originalToken)
          const cached = injectCsrfPlaceholder(html, originalToken)
          const served = replaceCsrfPlaceholder(cached, freshToken)

          expect(served).not.toContain(CSRF_PLACEHOLDER)
        }
      ),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 8.1, 8.3**
   *
   * After inject → replace round-trip, all original token positions contain
   * the new token.
   */
  it('all original token positions contain the fresh token', () => {
    fc.assert(
      fc.property(
        csrfToken,
        csrfToken,
        fc.array(htmlFragment, { minLength: 2, maxLength: 6 }),
        (originalToken, freshToken, fragments) => {
          fc.pre(fragments.every((f) => !f.includes(originalToken)))
          fc.pre(fragments.every((f) => !f.includes(freshToken)))
          fc.pre(originalToken !== freshToken)
          fc.pre(!freshToken.includes(CSRF_PLACEHOLDER))

          const html = fragments.join(originalToken)
          const tokenCount = fragments.length - 1 // number of token occurrences

          const cached = injectCsrfPlaceholder(html, originalToken)
          const served = replaceCsrfPlaceholder(cached, freshToken)

          // Count fresh token occurrences in the result
          const freshTokenOccurrences = served.split(freshToken).length - 1
          expect(freshTokenOccurrences).toBe(tokenCount)
        }
      ),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 8.1, 8.3**
   *
   * The original token does not appear in the served HTML after the round-trip.
   */
  it('original token is fully removed after round-trip', () => {
    fc.assert(
      fc.property(
        csrfToken,
        csrfToken,
        fc.array(htmlFragment, { minLength: 2, maxLength: 6 }),
        (originalToken, freshToken, fragments) => {
          fc.pre(fragments.every((f) => !f.includes(originalToken)))
          fc.pre(fragments.every((f) => !f.includes(freshToken)))
          fc.pre(originalToken !== freshToken)
          fc.pre(!freshToken.includes(originalToken))

          const html = fragments.join(originalToken)
          const cached = injectCsrfPlaceholder(html, originalToken)
          const served = replaceCsrfPlaceholder(cached, freshToken)

          expect(served).not.toContain(originalToken)
        }
      ),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 8.1, 8.3**
   *
   * Non-token content is preserved — surrounding HTML structure is unchanged
   * after the round-trip.
   */
  it('non-token HTML content is preserved through the round-trip', () => {
    fc.assert(
      fc.property(
        csrfToken,
        csrfToken,
        fc.array(htmlFragment, { minLength: 2, maxLength: 6 }),
        (originalToken, freshToken, fragments) => {
          fc.pre(fragments.every((f) => !f.includes(originalToken)))
          fc.pre(fragments.every((f) => !f.includes(freshToken)))
          fc.pre(originalToken !== freshToken)
          fc.pre(!freshToken.includes(CSRF_PLACEHOLDER))

          const html = fragments.join(originalToken)
          const cached = injectCsrfPlaceholder(html, originalToken)
          const served = replaceCsrfPlaceholder(cached, freshToken)

          // The result should be equivalent to directly replacing originalToken with freshToken
          const expected = fragments.join(freshToken)
          expect(served).toBe(expected)
        }
      ),
      { numRuns: 500 }
    )
  })
})
