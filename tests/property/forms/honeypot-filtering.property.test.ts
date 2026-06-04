// Property 13: Honeypot Filtering

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { isHoneypotFilled } from '@/lib/content/forms'

/**
 * Validates: Requirements 10.6
 *
 * Property: For any form with honeypot protection enabled, submissions where the
 * honeypot field contains a non-empty value SHALL be discarded (not stored), and
 * submissions where the honeypot field is empty SHALL be stored normally.
 */

// --- Generators ---

/** Arbitrary field handle */
const fieldHandleArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/)

/** Arbitrary field value — non-empty strings that would fill a honeypot */
const nonEmptyValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ minLength: 1 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.01 }),
  fc.boolean(),
  fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
)

/** Arbitrary form data with various field handles and values */
const formDataArb = fc.dictionary(fieldHandleArb, nonEmptyValueArb, {
  minKeys: 1,
  maxKeys: 8,
})

/** Honeypot field name */
const honeypotFieldArb = fc.constant('_honeypot')

// --- Property Tests ---

describe('Property 13: Honeypot Filtering', () => {
  it('submissions with non-empty honeypot field are detected as filled (should be discarded)', () => {
    fc.assert(
      fc.property(
        formDataArb,
        fc.string({ minLength: 1 }),
        (formData, honeypotValue) => {
          const honeypotField = '_honeypot'
          const dataWithHoneypot = { ...formData, [honeypotField]: honeypotValue }

          // isHoneypotFilled should return true — indicating this is a bot submission
          expect(isHoneypotFilled(dataWithHoneypot, honeypotField)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('submissions with empty string honeypot field are not filtered (should be stored)', () => {
    fc.assert(
      fc.property(formDataArb, (formData) => {
        const honeypotField = '_honeypot'
        const dataWithEmptyHoneypot = { ...formData, [honeypotField]: '' }

        // isHoneypotFilled should return false — this is a legitimate submission
        expect(isHoneypotFilled(dataWithEmptyHoneypot, honeypotField)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('submissions with undefined honeypot field are not filtered (should be stored)', () => {
    fc.assert(
      fc.property(formDataArb, (formData) => {
        const honeypotField = '_honeypot'
        // Ensure the honeypot field is not present in the data
        const { [honeypotField]: _removed, ...cleanData } = formData

        // isHoneypotFilled should return false — honeypot field not present
        expect(isHoneypotFilled(cleanData, honeypotField)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('honeypot detection works regardless of other form field contents', () => {
    fc.assert(
      fc.property(
        formDataArb,
        fc.boolean(),
        (formData, shouldFillHoneypot) => {
          const honeypotField = '_honeypot'
          const data = shouldFillHoneypot
            ? { ...formData, [honeypotField]: 'bot-value' }
            : { ...formData, [honeypotField]: '' }

          const result = isHoneypotFilled(data, honeypotField)

          // Result should match whether we filled the honeypot
          expect(result).toBe(shouldFillHoneypot)
        },
      ),
      { numRuns: 100 },
    )
  })
})
