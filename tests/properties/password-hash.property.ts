// Feature: project-madori, Property 5: Password Hash Verification

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

/**
 * Validates: Requirements 10.1
 *
 * Property: For any randomly generated password string, hashing it and then
 * verifying the original password against the hash should always succeed,
 * and verifying any different password against the same hash should always fail.
 */

// --- Generators ---

/**
 * Generate non-empty password strings (min length 1, max length 50).
 */
const passwordArb = fc.string({ minLength: 1, maxLength: 50 })

// --- Property Tests ---

describe('Property 5: Password Hash Verification', () => {
  it('verifying the correct password against its hash always succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArb, async (password) => {
        const hash = await hashPassword(password)
        const result = await verifyPassword(password, hash)
        expect(result).toBe(true)
      }),
      { numRuns: 20 },
    )
  })

  it('verifying a different password against a hash always fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordArb,
        passwordArb,
        async (p1, p2) => {
          fc.pre(p1 !== p2)
          const hash = await hashPassword(p1)
          const result = await verifyPassword(p2, hash)
          expect(result).toBe(false)
        },
      ),
      { numRuns: 20 },
    )
  })
})
