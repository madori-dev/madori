import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateHandle } from '../../../../packages/madori-cli/src/utils/handle-validator.js'

/**
 * Property-based tests for handle validator.
 * Validates: Requirements 1.6
 */

const RESERVED_NAMES = [
  'admin',
  'system',
  'config',
  'api',
  'auth',
  'login',
  'logout',
  'register',
  'settings',
  'dashboard',
  'null',
  'undefined',
  'true',
  'false',
]

const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const HANDLE_PATTERN = /^[a-z][a-z0-9_-]*$/

describe('validateHandle — property-based tests', () => {
  it('any string that passes validation should match the expected pattern', () => {
    /**
     * Validates: Requirements 1.6
     *
     * For any arbitrary string, if validateHandle returns { valid: true },
     * then the string must start with a letter, contain only lowercase
     * alphanumeric + hyphens/underscores, be ≤64 chars, and not be reserved.
     */
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = validateHandle(input)
        if (result.valid) {
          expect(input.length).toBeGreaterThan(0)
          expect(input.length).toBeLessThanOrEqual(64)
          expect(HANDLE_PATTERN.test(input)).toBe(true)
          expect(RESERVED_NAMES).not.toContain(input)
        }
      }),
      { numRuns: 1000 }
    )
  })

  it('any valid handle fed back to validateHandle should always return valid', () => {
    /**
     * Validates: Requirements 1.6
     *
     * Generate handles that conform to the rules (start with letter,
     * only valid chars, ≤64 chars, not reserved) and verify they always pass.
     */
    const validCharsArb = fc.constantFrom(...VALID_CHARS.split(''))
    const validHandleArb = fc
      .tuple(
        fc.constantFrom(...LETTERS.split('')),
        fc.array(validCharsArb, { minLength: 0, maxLength: 63 })
      )
      .map(([first, rest]) => first + rest.join(''))
      .filter((h) => h.length <= 64 && !RESERVED_NAMES.includes(h))

    fc.assert(
      fc.property(validHandleArb, (handle) => {
        const result = validateHandle(handle)
        expect(result).toEqual({ valid: true })
      }),
      { numRuns: 1000 }
    )
  })

  it('reserved names always fail validation', () => {
    /**
     * Validates: Requirements 1.6
     *
     * For each reserved name, validateHandle must return { valid: false }.
     */
    fc.assert(
      fc.property(fc.constantFrom(...RESERVED_NAMES), (reservedName) => {
        const result = validateHandle(reservedName)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('reserved name')
      })
    )
  })

  it('handles exceeding 64 characters always fail', () => {
    /**
     * Validates: Requirements 1.6
     *
     * Generate strings >64 chars that would otherwise be valid (start with
     * a letter, only valid chars) and verify they always fail.
     */
    const validCharsArb = fc.constantFrom(...VALID_CHARS.split(''))
    const longHandleArb = fc
      .tuple(
        fc.constantFrom(...LETTERS.split('')),
        fc.array(validCharsArb, { minLength: 64, maxLength: 200 })
      )
      .map(([first, rest]) => first + rest.join(''))

    fc.assert(
      fc.property(longHandleArb, (handle) => {
        expect(handle.length).toBeGreaterThan(64)
        const result = validateHandle(handle)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('64 characters')
      }),
      { numRuns: 1000 }
    )
  })
})
