import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  assertPasswordPolicy,
  validatePasswordPolicy,
} from '@/lib/auth/password-policy'

describe('password policy', () => {
  it('accepts passwords at both length boundaries', () => {
    expect(validatePasswordPolicy('x'.repeat(PASSWORD_MIN_LENGTH))).toEqual({ valid: true })
    expect(validatePasswordPolicy('x'.repeat(PASSWORD_MAX_LENGTH))).toEqual({ valid: true })
  })

  it('rejects short, oversized, and non-string values', () => {
    expect(validatePasswordPolicy('x'.repeat(PASSWORD_MIN_LENGTH - 1))).toMatchObject({ valid: false })
    expect(validatePasswordPolicy('x'.repeat(PASSWORD_MAX_LENGTH + 1))).toMatchObject({ valid: false })
    expect(validatePasswordPolicy(null)).toEqual({ valid: false, message: 'Password must be a string' })
  })

  it('uses browser-compatible string length semantics', () => {
    expect(validatePasswordPolicy('🔐'.repeat(PASSWORD_MIN_LENGTH / 2))).toEqual({ valid: true })
  })

  it('throws the shared message at enforcement seams', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  })
})
