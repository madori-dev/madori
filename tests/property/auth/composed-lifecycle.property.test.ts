// Property 11: Composed auth service login/validate/logout lifecycle

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { PluginRegistry } from '@/lib/auth/registry'
import { compose } from '@/lib/auth/composer'
import { FileSessionStore } from '@/lib/auth/stores/file'
import type { AuthDriver, AuthDriverFactory } from '@/lib/auth/contracts/auth-driver'
import type { SessionStoreFactory } from '@/lib/auth/contracts/session-store'
import type { UserProvider, UserProviderFactory } from '@/lib/auth/contracts/user-provider'
import type { User, CreateUserInput, UpdateUserInput } from '@/lib/auth/types'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Validates: Requirements 6.1
 *
 * Property: For any valid user and correct credentials, the sequence
 * login → validateSession → logout → validateSession SHALL return
 * a valid Session, then a valid Session, then void, then null — in that order.
 */

// --- In-memory FileSystemAdapter mock ---

function createInMemoryFs(): FileSystemAdapter {
  const files = new Map<string, string>()

  return {
    async readFile(path: string): Promise<string> {
      const content = files.get(path)
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    async writeFile(path: string, content: string): Promise<void> {
      files.set(path, content)
    },
    async deleteFile(path: string): Promise<void> {
      files.delete(path)
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path)
    },
    async listFiles(_directory: string, _pattern?: string): Promise<string[]> {
      return []
    },
    async listDirectories(_directory: string): Promise<string[]> {
      return []
    },
    async mkdir(_path: string): Promise<void> {},
    async copyFile(src: string, dest: string): Promise<void> {
      const content = files.get(src)
      if (content === undefined) throw new Error(`File not found: ${src}`)
      files.set(dest, content)
    },
    async moveFile(src: string, dest: string): Promise<void> {
      const content = files.get(src)
      if (content === undefined) throw new Error(`File not found: ${src}`)
      files.set(dest, content)
      files.delete(src)
    },
  }
}

// --- Mock AuthDriver that always succeeds, returning the given userId ---

function createMockAuthDriverFactory(userId: string): AuthDriverFactory {
  return {
    create(_config: Record<string, unknown>): AuthDriver {
      return {
        async validateCredentials(
          _identifier: string,
          _credentials: Record<string, unknown>,
        ): Promise<string> {
          return userId
        },
      }
    },
  }
}

// --- Mock UserProvider that stores users in memory and supports update ---

function createMockUserProviderFactory(userId: string, email: string): UserProviderFactory {
  return {
    create(_config: Record<string, unknown>): UserProvider {
      const users = new Map<string, User>()
      users.set(userId, {
        id: userId,
        email,
        name: 'Test User',
        roles: ['admin'],
        passwordHash: 'hashed',
        createdAt: new Date().toISOString(),
      })

      return {
        async getById(id: string): Promise<User> {
          const user = users.get(id)
          if (!user) throw new Error(`User not found: ${id}`)
          return user
        },
        async getByEmail(email: string): Promise<User | null> {
          for (const u of users.values()) {
            if (u.email === email) return u
          }
          return null
        },
        async list(): Promise<User[]> {
          return Array.from(users.values())
        },
        async create(input: CreateUserInput): Promise<User> {
          const user: User = {
            id: input.id,
            email: input.email,
            name: input.name,
            roles: input.roles,
            passwordHash: 'hashed',
            createdAt: new Date().toISOString(),
          }
          users.set(input.id, user)
          return user
        },
        async update(id: string, input: UpdateUserInput): Promise<User> {
          const user = users.get(id)
          if (!user) throw new Error(`User not found: ${id}`)
          if (input.email !== undefined) user.email = input.email
          if (input.name !== undefined) user.name = input.name
          if (input.roles !== undefined) user.roles = input.roles
          if (input.lastLogin !== undefined) user.lastLogin = input.lastLogin
          users.set(id, user)
          return user
        },
        async delete(id: string): Promise<void> {
          users.delete(id)
        },
      }
    },
  }
}

// --- Generators ---

/** Arbitrary userId: non-empty alphanumeric strings */
const userIdArb = fc
  .string({ minLength: 1, maxLength: 32 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))

/** Arbitrary email: simple email format */
const emailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]+$/.test(s)),
  )
  .map(([local, domain]) => `${local}@${domain}.com`)

/** Arbitrary password: non-empty string */
const passwordArb = fc.string({ minLength: 4, maxLength: 32 }).filter((s) => s.trim().length > 0)

// --- Property Tests ---

describe('Property 11: Composed auth service login/validate/logout lifecycle', () => {
  it('for valid user+credentials: login returns Session, validateSession returns Session, logout then validateSession returns null', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, emailArb, passwordArb, async (userId, email, password) => {
        // 1. Set up registry with mock adapters using in-memory state
        const registry = new PluginRegistry()
        const inMemoryFs = createInMemoryFs()

        registry.registerDriver('mock-driver', createMockAuthDriverFactory(userId))
        registry.registerStore('mock-store', {
          create(_config: Record<string, unknown>) {
            return new FileSessionStore('/sessions', inMemoryFs)
          },
        } satisfies SessionStoreFactory)
        registry.registerProvider('mock-provider', createMockUserProviderFactory(userId, email))

        // 2. Compose the service
        const service = compose(registry, {
          driver: 'mock-driver',
          store: 'mock-store',
          provider: 'mock-provider',
        })

        // 3. Login → returns a Session with valid token
        const session = await service.login(email, { password })
        expect(session).toBeDefined()
        expect(session.token).toBeTruthy()
        expect(session.userId).toBe(userId)
        expect(session.id).toBeTruthy()
        expect(session.expiresAt).toBeTruthy()

        // 4. validateSession with that token → returns the same Session
        const validated = await service.validateSession(session.token)
        expect(validated).not.toBeNull()
        expect(validated!.token).toBe(session.token)
        expect(validated!.userId).toBe(session.userId)
        expect(validated!.id).toBe(session.id)

        // 5. Logout (destroy) → validateSession with same token returns null
        await service.logout(session.token)
        const afterLogout = await service.validateSession(session.token)
        expect(afterLogout).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
