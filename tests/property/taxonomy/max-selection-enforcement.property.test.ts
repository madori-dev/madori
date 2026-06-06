// Property 7: Taxonomy max selection enforcement

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { enforceMaxItems } from '@/components/cp/fields/TaxonomyField'

/**
 * Validates: Requirements 4.3
 *
 * Property: For any taxonomy field configured with a maximum selection limit N
 * (where N > 0), and for any set of terms where the count exceeds N, the saved
 * value SHALL never contain more than N term references.
 * When max_items is 0 or undefined, all terms are returned unchanged.
 */

// --- Generators ---

/** Arbitrary non-empty term string (simulates a taxonomy term reference) */
const termArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/)

/** Arbitrary term array with at least one entry */
const termsArb = fc.array(termArb, { minLength: 1, maxLength: 50 })

/** Arbitrary positive max_items (N > 0) */
const positiveMaxItemsArb = fc.integer({ min: 1, max: 100 })

// --- Property Tests ---

describe('Property 7: Taxonomy max selection enforcement', () => {
  it('enforceMaxItems never returns more than N terms when max_items N > 0', () => {
    fc.assert(
      fc.property(
        positiveMaxItemsArb,
        termsArb,
        (maxItems, terms) => {
          const result = enforceMaxItems(terms, maxItems)
          expect(result.length).toBeLessThanOrEqual(maxItems)
        }
      ),
      { numRuns: 200 },
    )
  })

  it('enforceMaxItems truncates to exactly N when terms exceed N', () => {
    fc.assert(
      fc.property(
        positiveMaxItemsArb,
        termsArb.filter((t) => t.length > 0),
        fc.nat(),
        (maxItems, baseTerms, extra) => {
          // Ensure terms length exceeds maxItems
          const extraCount = (extra % 20) + 1
          const terms = [
            ...baseTerms,
            ...Array.from({ length: Math.max(0, maxItems + extraCount - baseTerms.length) }, (_, i) => `term-${i}`),
          ]

          // Only test when terms actually exceed maxItems
          fc.pre(terms.length > maxItems)

          const result = enforceMaxItems(terms, maxItems)
          expect(result.length).toBe(maxItems)
        }
      ),
      { numRuns: 200 },
    )
  })

  it('enforceMaxItems preserves original order (takes first N terms)', () => {
    fc.assert(
      fc.property(
        positiveMaxItemsArb,
        termsArb,
        (maxItems, terms) => {
          const result = enforceMaxItems(terms, maxItems)

          // Result should be a prefix of the original array
          for (let i = 0; i < result.length; i++) {
            expect(result[i]).toBe(terms[i])
          }
        }
      ),
      { numRuns: 200 },
    )
  })

  it('enforceMaxItems returns all terms unchanged when maxItems is undefined', () => {
    fc.assert(
      fc.property(
        termsArb,
        (terms) => {
          const result = enforceMaxItems(terms, undefined)
          expect(result).toEqual(terms)
        }
      ),
      { numRuns: 200 },
    )
  })

  it('enforceMaxItems returns all terms unchanged when maxItems is 0', () => {
    fc.assert(
      fc.property(
        termsArb,
        (terms) => {
          const result = enforceMaxItems(terms, 0)
          expect(result).toEqual(terms)
        }
      ),
      { numRuns: 200 },
    )
  })

  it('enforceMaxItems returns all terms unchanged when maxItems is negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: -1 }),
        termsArb,
        (maxItems, terms) => {
          const result = enforceMaxItems(terms, maxItems)
          expect(result).toEqual(terms)
        }
      ),
      { numRuns: 100 },
    )
  })
})
