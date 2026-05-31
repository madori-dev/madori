import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  validateEmail,
  validatePassword,
} from '../../../packages/madori-cli/src/prompts/user-prompts'

/**
 * Property tests for CLI validation functions.
 * Validates: Requirements 6.2, 6.4
 */

describe('Property 4: Email validation', () => {
  /**
   * **Validates: Requirements 6.2**
   * validateEmail accepts iff matches /^[^\s@]+@[^\s@]+\.[^\s@]+$/
   */

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  it('accepts strings matching /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/', () => {
    // Generate valid emails: local@domain.tld
    const nonSpaceNonAtNonDot = fc.stringMatching(/^[a-z0-9._+%-]+$/, { minLength: 1 })
    const domainPart = fc.stringMatching(/^[a-z0-9-]+$/, { minLength: 1 })
    const tldPart = fc.stringMatching(/^[a-z]{2,6}$/)

    const validEmail = fc
      .tuple(nonSpaceNonAtNonDot, domainPart, tldPart)
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

    fc.assert(
      fc.property(validEmail, (email) => {
        expect(validateEmail(email)).toBe(true)
      })
    )
  })

  it('rejects strings not matching the email regex', () => {
    const invalidEmail = fc
      .string({ minLength: 1 })
      .filter((s) => s.trim().length > 0 && !emailRegex.test(s))

    fc.assert(
      fc.property(invalidEmail, (email) => {
        expect(validateEmail(email)).not.toBe(true)
      })
    )
  })
})

describe('Property 5: Password length validation', () => {
  /**
   * **Validates: Requirements 6.4**
   * validatePassword accepts iff length >= 8
   */

  it('accepts any string with length >= 8', () => {
    const longEnough = fc.string({ minLength: 8 })

    fc.assert(
      fc.property(longEnough, (pwd) => {
        expect(validatePassword(pwd)).toBe(true)
      })
    )
  })

  it('rejects any string with length < 8', () => {
    const tooShort = fc.string({ minLength: 0, maxLength: 7 })

    fc.assert(
      fc.property(tooShort, (pwd) => {
        expect(validatePassword(pwd)).not.toBe(true)
      })
    )
  })
})
