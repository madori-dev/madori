// Property 1: AuthDriver credential validation correctness

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { PasswordAuthDriver } from '@/lib/auth/drivers/password'
import { hashPassword } from '@/lib/auth/password'
import { AuthenticationError } from '@/lib/errors'
import type { UserProvider } from '@/lib/auth/contracts/user-provider'
import type { User } from '@/lib/auth/types'

/**
 * Validates: Requirements 1.2, 1.3
 *
 * Property: For any stored user with a known password, calling validateCredentials
 * with the correct identifier and password SHALL return that user's id; calling it
 * with any incorrect password SHALL throw an AuthenticationError.
 */

// --- Generators ---

/** Arbitrary email-like string */
const emailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 16, unit: 'grapheme-ascii' }).filter((s) => /^[a-z0-9]+$/i.test(s)),
    fc.string({ minLength: 1, maxLength: 8, unit: 'grapheme-ascii' }).filter((s) => /^[a-z0-9]+$/i.test(s)),
  )
  .map(([local, domain]) => `${local}@${domain}.com`)

/** Arbitrary password: non-empty string */
const passwordArb = fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0)

/** Arbitrary user id */
const userIdArb = fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0)

// --- Mock UserProvider ---

function createMockUserProvider(user: User | null): UserProvider {
  return {
    async getById() {
      throw new Error('not implemented')
    },
    async getByEmail(_email: string) {
      return user
    },
    async list() {
      return user ? [user] : []
    },
    async create() {
      throw new Error('not implemented')
    },
    async update() {
      throw new Error('not implemented')
    },
    async delete() {
      throw new Error('not implemented')
    },
  }
}

// --- Property Tests ---

describe('Property 1: AuthDriver credential validation correctness', () => {
  it('correct credentials return user.id', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, emailArb, passwordArb, async (userId, email, password) => {
        // Hash the password as it would be stored
        const passwordHash = await hashPassword(password)

        const user: User = {
          id: userId,
          email,
          name: 'Test User',
          roles: ['admin'],
          passwordHash,
          createdAt: new Date().toISOString(),
        }

        const provider = createMockUserProvider(user)
        const driver = new PasswordAuthDriver(provider)

        // Correct credentials should return user.id
        const result = await driver.validateCredentials(email, { password })
        expect(result).toBe(userId)
      }),
      { numRuns: 20 },
    )
  })

  it('incorrect password throws AuthenticationError', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        emailArb,
        passwordArb,
        passwordArb.filter((s) => s.length > 0),
        async (userId, email, correctPassword, wrongPassword) => {
          // Ensure the wrong password is actually different
          fc.pre(wrongPassword !== correctPassword)

          const passwordHash = await hashPassword(correctPassword)

          const user: User = {
            id: userId,
            email,
            name: 'Test User',
            roles: ['admin'],
            passwordHash,
            createdAt: new Date().toISOString(),
          }

          const provider = createMockUserProvider(user)
          const driver = new PasswordAuthDriver(provider)

          // Incorrect password should throw AuthenticationError
          await expect(
            driver.validateCredentials(email, { password: wrongPassword }),
          ).rejects.toThrow(AuthenticationError)
        },
      ),
      { numRuns: 20 },
    )
  })
})
