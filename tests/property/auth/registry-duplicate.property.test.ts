// Property 9: Plugin registry duplicate name rejection

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { PluginRegistry } from '@/lib/auth/registry'
import { ConflictError } from '@/lib/errors'
import type { AuthDriverFactory } from '@/lib/auth/contracts/auth-driver'
import type { SessionStoreFactory } from '@/lib/auth/contracts/session-store'
import type { UserProviderFactory } from '@/lib/auth/contracts/user-provider'

/**
 * Validates: Requirements 5.4
 *
 * Property: For any already-registered type+name, re-registering with the same
 * name throws a ConflictError.
 */

// --- Stub factories ---

function createStubDriverFactory(): AuthDriverFactory {
  return {
    create: () => ({
      validateCredentials: async () => 'user-id',
    }),
  }
}

function createStubStoreFactory(): SessionStoreFactory {
  return {
    create: () => ({
      createSession: async () => ({ id: '1', userId: '1', token: 'tok', expiresAt: new Date().toISOString() }),
      validateSession: async () => null,
      destroySession: async () => {},
      cleanExpired: async () => 0,
    }),
  }
}

function createStubProviderFactory(): UserProviderFactory {
  return {
    create: () => ({
      getById: async () => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
      getByEmail: async () => null,
      list: async () => [],
      create: async () => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
      update: async () => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
      delete: async () => {},
    }),
  }
}

// --- Generators ---

/** Non-empty adapter name */
const adapterNameArb = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0)

/** Contract type */
const contractTypeArb = fc.constantFrom('driver', 'store', 'provider') as fc.Arbitrary<'driver' | 'store' | 'provider'>

// --- Property Tests ---

describe('Property 9: Plugin registry duplicate name rejection', () => {
  it('re-registering same name for driver throws ConflictError', async () => {
    fc.assert(
      fc.property(adapterNameArb, (name) => {
        const registry = new PluginRegistry()
        registry.registerDriver(name, createStubDriverFactory())

        expect(() => registry.registerDriver(name, createStubDriverFactory())).toThrowError(ConflictError)
      }),
      { numRuns: 100 },
    )
  })

  it('re-registering same name for store throws ConflictError', async () => {
    fc.assert(
      fc.property(adapterNameArb, (name) => {
        const registry = new PluginRegistry()
        registry.registerStore(name, createStubStoreFactory())

        expect(() => registry.registerStore(name, createStubStoreFactory())).toThrowError(ConflictError)
      }),
      { numRuns: 100 },
    )
  })

  it('re-registering same name for provider throws ConflictError', async () => {
    fc.assert(
      fc.property(adapterNameArb, (name) => {
        const registry = new PluginRegistry()
        registry.registerProvider(name, createStubProviderFactory())

        expect(() => registry.registerProvider(name, createStubProviderFactory())).toThrowError(ConflictError)
      }),
      { numRuns: 100 },
    )
  })

  it('for any contract type and name, duplicate registration throws ConflictError', async () => {
    fc.assert(
      fc.property(contractTypeArb, adapterNameArb, (type, name) => {
        const registry = new PluginRegistry()

        // First registration succeeds
        switch (type) {
          case 'driver':
            registry.registerDriver(name, createStubDriverFactory())
            expect(() => registry.registerDriver(name, createStubDriverFactory())).toThrowError(ConflictError)
            break
          case 'store':
            registry.registerStore(name, createStubStoreFactory())
            expect(() => registry.registerStore(name, createStubStoreFactory())).toThrowError(ConflictError)
            break
          case 'provider':
            registry.registerProvider(name, createStubProviderFactory())
            expect(() => registry.registerProvider(name, createStubProviderFactory())).toThrowError(ConflictError)
            break
        }
      }),
      { numRuns: 100 },
    )
  })
})
