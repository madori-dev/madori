import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { matchGlob } from '@/lib/static-cache/glob'

/**
 * Property 14: Glob pattern matching correctness
 * Validates: Requirements 5.3, 6.2
 *
 * For any glob pattern and URL string, `matchGlob(pattern, url)` SHALL return
 * `true` if and only if the URL matches the pattern where `*` matches any
 * sequence of characters.
 */
describe('Property 14: Glob pattern matching correctness', () => {
  /**
   * **Validates: Requirements 5.3, 6.2**
   *
   * A pattern with no `*` should only match itself (exact match).
   */
  it('exact match: a pattern without wildcards only matches the exact string', () => {
    // Generate strings that don't contain `*` to serve as both pattern and value
    const noWildcard = fc.string().filter((s) => !s.includes('*'))

    fc.assert(
      fc.property(noWildcard, noWildcard, (pattern, value) => {
        const result = matchGlob(pattern, value)
        if (pattern === value) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 5.3, 6.2**
   *
   * The universal pattern `*` should match any string.
   */
  it('universal match: pattern `*` matches any string', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        expect(matchGlob('*', value)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 5.3, 6.2**
   *
   * A glob pattern ending with `*` should match any string that starts with
   * the prefix (the portion before the `*`).
   */
  it('prefix match: a pattern ending with `*` matches any string starting with the prefix', () => {
    // Generate a prefix without wildcards and an arbitrary suffix
    const noWildcard = fc.string().filter((s) => !s.includes('*') && s.length > 0)

    fc.assert(
      fc.property(noWildcard, fc.string(), (prefix, suffix) => {
        const pattern = `${prefix}*`
        const matchingValue = `${prefix}${suffix}`

        // The pattern prefix + * should always match prefix + anything
        expect(matchGlob(pattern, matchingValue)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 5.3, 6.2**
   *
   * A glob pattern ending with `*` should NOT match a string that does not
   * start with the prefix.
   */
  it('prefix mismatch: a pattern ending with `*` does not match strings without the prefix', () => {
    const noWildcard = fc.string().filter((s) => !s.includes('*') && s.length > 0)

    fc.assert(
      fc.property(noWildcard, noWildcard, (prefix, value) => {
        // Only test when value does NOT start with the prefix
        fc.pre(!value.startsWith(prefix))

        const pattern = `${prefix}*`
        expect(matchGlob(pattern, value)).toBe(false)
      }),
      { numRuns: 500 }
    )
  })
})
