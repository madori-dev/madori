// Properties 1, 2, 3: User profile update round-trip, password change, email validation

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { NextRequest } from 'next/server'
import { createUserHandlers, isValidEmail } from '@/app/(cp)/api/handlers/users'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import type { ComposedAuthService } from '@/lib/auth/composer'
import type { User } from '@/lib/auth/types'

/**
 * Validates: Requirements 1.2, 1.3, 1.4, 1.6
 */

// --- Helpers ---

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

// --- Generators ---

/** Arbitrary valid name: non-empty printable string */
const nameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

/** Arbitrary valid email: local@domain.tld */
const validEmailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 16, unit: 'grapheme-ascii' }).filter((s) => /^[a-z0-9]+$/i.test(s)),
    fc.string({ minLength: 1, maxLength: 8, unit: 'grapheme-ascii' }).filter((s) => /^[a-z0-9]+$/i.test(s)),
    fc.string({ minLength: 2, maxLength: 4, unit: 'grapheme-ascii' }).filter((s) => /^[a-z]+$/i.test(s)),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

/** Arbitrary password: non-empty string */
const passwordArb = fc
  .string({ minLength: 1, maxLength: 32 })
  .filter((s) => s.trim().length > 0)

/** Arbitrary non-email string: missing @, empty local, or no domain dot */
const invalidEmailArb = fc.oneof(
  // No @ sign at all
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('@')),
  // Empty local part (starts with @)
  fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-z0-9.]+$/i.test(s)).map((d) => `@${d}`),
  // Missing domain (ends with @)
  fc.string({ minLength: 1, maxLength: 15 }).filter((s) => /^[a-z0-9]+$/i.test(s)).map((l) => `${l}@`),
  // Domain without a dot
  fc.tuple(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/i.test(s)),
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z0-9]+$/i.test(s) && !s.includes('.')),
  ).map(([local, domain]) => `${local}@${domain}`),
)

// --- Property Tests ---

describe('Property 1: User profile update round-trip', () => {
  /**
   * For any valid non-empty name string and valid email address, updating
   * a user's profile via the API and then reading the user back SHALL return
   * the same name and email values that were submitted.
   *
   * **Validates: Requirements 1.2**
   */
  it('updating name/email and reading back produces identical values', async () => {
    await fc.assert(
      fc.asyncProperty(nameArb, validEmailArb, async (name, email) => {
        // Create in-memory user store
        let storedUser: User = {
          id: 'user-1',
          email: 'original@example.com',
          name: 'Original Name',
          roles: ['admin'],
          passwordHash: 'scrypt:aabb:ccdd',
          createdAt: '2024-01-01T00:00:00.000Z',
        }

        const authService: ComposedAuthService = {
          login: vi.fn(),
          logout: vi.fn(),
          validateSession: vi.fn(),
          getUser: vi.fn(async () => ({ ...storedUser })),
          getUserByEmail: vi.fn(),
          listUsers: vi.fn(),
          createUser: vi.fn(),
          updateUser: vi.fn(async (_id: string, input) => {
            if (input.email !== undefined) storedUser.email = input.email
            if (input.name !== undefined) storedUser.name = input.name
            return { ...storedUser }
          }),
          deleteUser: vi.fn(),
        } as unknown as ComposedAuthService

        const handlers = createUserHandlers(authService)

        // Update user profile
        const updateReq = makeRequest('PUT', 'http://localhost:3000/api/users/user-1', {
          name,
          email,
        })
        const updateRes = await handlers.handleUpdateUser(updateReq, 'user-1')
        expect(updateRes.status).toBe(200)

        // Read back
        const getReq = makeRequest('GET', 'http://localhost:3000/api/users/user-1')
        const getRes = await handlers.handleGetUser(getReq, 'user-1')
        const getData = await getRes.json()

        expect(getData.data.name).toBe(name)
        expect(getData.data.email).toBe(email)
      }),
      { numRuns: 50 },
    )
  })
})

describe('Property 2: Password change succeeds iff current password is correct', () => {
  /**
   * For any user with a known password hash, a password change request SHALL
   * succeed if and only if the provided current password matches the existing hash.
   * If the current password does not match, the request SHALL be rejected and
   * the existing hash SHALL remain unchanged.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it('correct current password allows password change', async () => {
    await fc.assert(
      fc.asyncProperty(passwordArb, passwordArb, async (correctPassword, newPassword) => {
        const originalHash = await hashPassword(correctPassword)
        let currentHash = originalHash

        const storedUser: User = {
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          roles: ['admin'],
          passwordHash: originalHash,
          createdAt: '2024-01-01T00:00:00.000Z',
        }

        const authService: ComposedAuthService = {
          login: vi.fn(),
          logout: vi.fn(),
          validateSession: vi.fn(),
          getUser: vi.fn(async () => ({ ...storedUser, passwordHash: currentHash })),
          getUserByEmail: vi.fn(),
          listUsers: vi.fn(),
          createUser: vi.fn(),
          updateUser: vi.fn(async (_id: string, input) => {
            if (input.password !== undefined) {
              currentHash = await hashPassword(input.password)
            }
            return { ...storedUser, passwordHash: currentHash }
          }),
          deleteUser: vi.fn(),
        } as unknown as ComposedAuthService

        const handlers = createUserHandlers(authService)

        // With correct current password: should succeed
        const req = makeRequest('POST', 'http://localhost:3000/api/users/user-1/password', {
          currentPassword: correctPassword,
          newPassword,
        })
        const res = await handlers.handleChangePassword(req, 'user-1')
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)

        // The new password should now authenticate
        const newPasswordVerifies = await verifyPassword(newPassword, currentHash)
        expect(newPasswordVerifies).toBe(true)
      }),
      { numRuns: 20 },
    )
  })

  it('incorrect current password rejects change and hash remains unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        passwordArb,
        passwordArb.filter((s) => s.length > 0),
        passwordArb,
        async (correctPassword, wrongPassword, newPassword) => {
          fc.pre(wrongPassword !== correctPassword)

          const originalHash = await hashPassword(correctPassword)
          let currentHash = originalHash

          const storedUser: User = {
            id: 'user-1',
            email: 'user@example.com',
            name: 'Test User',
            roles: ['admin'],
            passwordHash: originalHash,
            createdAt: '2024-01-01T00:00:00.000Z',
          }

          const authService: ComposedAuthService = {
            login: vi.fn(),
            logout: vi.fn(),
            validateSession: vi.fn(),
            getUser: vi.fn(async () => ({ ...storedUser, passwordHash: currentHash })),
            getUserByEmail: vi.fn(),
            listUsers: vi.fn(),
            createUser: vi.fn(),
            updateUser: vi.fn(async (_id: string, input) => {
              if (input.password !== undefined) {
                currentHash = await hashPassword(input.password)
              }
              return { ...storedUser, passwordHash: currentHash }
            }),
            deleteUser: vi.fn(),
          } as unknown as ComposedAuthService

          const handlers = createUserHandlers(authService)

          // With wrong current password: should reject
          const req = makeRequest('POST', 'http://localhost:3000/api/users/user-1/password', {
            currentPassword: wrongPassword,
            newPassword,
          })
          const res = await handlers.handleChangePassword(req, 'user-1')

          expect(res.status).toBe(401)

          // Hash should remain unchanged
          expect(currentHash).toBe(originalHash)
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe('Property 3: Email validation rejects non-email strings', () => {
  /**
   * For any string that does not conform to a valid email format (missing @,
   * missing domain, empty local part), the user settings update API SHALL reject
   * the request with a validation error. For any string that is a valid email,
   * the API SHALL accept it.
   *
   * **Validates: Requirements 1.6**
   */
  it('non-email strings are rejected by the update handler', async () => {
    await fc.assert(
      fc.asyncProperty(invalidEmailArb, async (badEmail) => {
        const storedUser: User = {
          id: 'user-1',
          email: 'original@example.com',
          name: 'Test User',
          roles: ['admin'],
          passwordHash: 'scrypt:aabb:ccdd',
          createdAt: '2024-01-01T00:00:00.000Z',
        }

        const authService: ComposedAuthService = {
          login: vi.fn(),
          logout: vi.fn(),
          validateSession: vi.fn(),
          getUser: vi.fn(async () => ({ ...storedUser })),
          getUserByEmail: vi.fn(),
          listUsers: vi.fn(),
          createUser: vi.fn(),
          updateUser: vi.fn(async () => storedUser),
          deleteUser: vi.fn(),
        } as unknown as ComposedAuthService

        const handlers = createUserHandlers(authService)

        const req = makeRequest('PUT', 'http://localhost:3000/api/users/user-1', {
          email: badEmail,
        })
        const res = await handlers.handleUpdateUser(req, 'user-1')

        expect(res.status).toBe(422)
        const json = await res.json()
        expect(json.error.code).toBe('VALIDATION_ERROR')
      }),
      { numRuns: 100 },
    )
  })

  it('valid email strings are accepted by the update handler', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, async (goodEmail) => {
        const storedUser: User = {
          id: 'user-1',
          email: 'original@example.com',
          name: 'Test User',
          roles: ['admin'],
          passwordHash: 'scrypt:aabb:ccdd',
          createdAt: '2024-01-01T00:00:00.000Z',
        }

        const authService: ComposedAuthService = {
          login: vi.fn(),
          logout: vi.fn(),
          validateSession: vi.fn(),
          getUser: vi.fn(async () => ({ ...storedUser })),
          getUserByEmail: vi.fn(),
          listUsers: vi.fn(),
          createUser: vi.fn(),
          updateUser: vi.fn(async (_id: string, input) => {
            if (input.email !== undefined) storedUser.email = input.email
            return { ...storedUser }
          }),
          deleteUser: vi.fn(),
        } as unknown as ComposedAuthService

        const handlers = createUserHandlers(authService)

        const req = makeRequest('PUT', 'http://localhost:3000/api/users/user-1', {
          email: goodEmail,
        })
        const res = await handlers.handleUpdateUser(req, 'user-1')

        expect(res.status).toBe(200)
      }),
      { numRuns: 50 },
    )
  })

  it('isValidEmail correctly classifies emails', () => {
    fc.assert(
      fc.property(validEmailArb, (email) => {
        expect(isValidEmail(email)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('isValidEmail correctly rejects non-emails', () => {
    fc.assert(
      fc.property(invalidEmailArb, (badEmail) => {
        expect(isValidEmail(badEmail)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})
