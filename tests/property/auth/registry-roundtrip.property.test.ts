// Property 8: Plugin registry register/resolve round-trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { PluginRegistry } from '@/lib/auth/registry'
import type { AuthDriverFactory } from '@/lib/auth/contracts/auth-driver'
import type { SessionStoreFactory } from '@/lib/auth/contracts/session-store'
import type { UserProviderFactory } from '@/lib/auth/contracts/user-provider'

/**
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5
 *
 * Property: For any contract type and unique name, registering a factory and
 * then resolving by the same name returns the exact same factory instance
 * (reference equality).
 */

// --- Stub Factories ---

function createStubDriverFactory(): AuthDriverFactory {
  return {
    create: () => ({
      validateCredentials: async () => '',
    }),
  }
}

function createStubStoreFactory(): SessionStoreFactory {
  return {
    create: () => ({
      createSession: async () => ({ id: '', userId: '', token: '', expiresAt: '' }),
      validateSession: async () => null,
      destroySession: async () => {},
      cleanExpired: async () => 0,
    }),
  }
}

function createStubProviderFactory(): UserProviderFactory {
  return {
    create: () => ({
      getById: async () => ({ id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
      getByEmail: async () => null,
      list: async () => [],
      create: async () => ({ id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
      update: async () => ({ id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
      delete: async () => {},
    }),
  }
}

// --- Generators ---

/** Arbitrary unique name: non-empty strings that work as registry keys */
const nameArb = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0)

/** Arbitrary contract type */
const contractTypeArb = fc.constantFrom('driver' as const, 'store' as const, 'provider' as const)

// --- Property Tests ---

describe('Property 8: Plugin registry register/resolve round-trip', () => {
  it('for any contract type and unique name, registering then resolving returns same factory instance', async () => {
    await fc.assert(
      fc.asyncProperty(contractTypeArb, nameArb, async (contractType, name) => {
        const registry = new PluginRegistry()

        let factory: AuthDriverFactory | SessionStoreFactory | UserProviderFactory

        switch (contractType) {
          case 'driver': {
            factory = createStubDriverFactory()
            registry.registerDriver(name, factory)
            const resolved = registry.resolveDriver(name)
            expect(resolved).toBe(factory)
            break
          }
          case 'store': {
            factory = createStubStoreFactory()
            registry.registerStore(name, factory)
            const resolved = registry.resolveStore(name)
            expect(resolved).toBe(factory)
            break
          }
          case 'provider': {
            factory = createStubProviderFactory()
            registry.registerProvider(name, factory)
            const resolved = registry.resolveProvider(name)
            expect(resolved).toBe(factory)
            break
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
