import { describe, it, expect, beforeEach } from 'vitest'
import { PluginRegistry } from '@/lib/auth/registry'
import { ConflictError, NotFoundError } from '@/lib/errors'
import type { AuthDriverFactory } from '@/lib/auth/contracts/auth-driver'
import type { SessionStoreFactory } from '@/lib/auth/contracts/session-store'
import type { UserProviderFactory } from '@/lib/auth/contracts/user-provider'

// Minimal factory stubs
const mockDriverFactory: AuthDriverFactory = {
  create: () => ({ validateCredentials: async () => 'user-id' }),
}

const mockStoreFactory: SessionStoreFactory = {
  create: () => ({
    createSession: async () => ({ id: '1', userId: '1', token: 'tok', expiresAt: '' }),
    validateSession: async () => null,
    destroySession: async () => {},
    cleanExpired: async () => 0,
  }),
}

const mockProviderFactory: UserProviderFactory = {
  create: () => ({
    getById: async () => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
    getByEmail: async () => null,
    list: async () => [],
    create: async (input) => ({ id: input.id, email: input.email, name: input.name, roles: input.roles, passwordHash: '', createdAt: '' }),
    update: async (_id, _input) => ({ id: '1', email: '', name: '', roles: [], passwordHash: '', createdAt: '' }),
    delete: async () => {},
  }),
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  describe('registerDriver / resolveDriver', () => {
    it('registers and resolves a driver factory', () => {
      registry.registerDriver('password', mockDriverFactory)
      const resolved = registry.resolveDriver('password')
      expect(resolved).toBe(mockDriverFactory)
    })

    it('throws ConflictError on duplicate driver registration', () => {
      registry.registerDriver('password', mockDriverFactory)
      expect(() => registry.registerDriver('password', mockDriverFactory)).toThrow(ConflictError)
      expect(() => registry.registerDriver('password', mockDriverFactory)).toThrow(
        'AuthDriver "password" is already registered',
      )
    })

    it('throws NotFoundError when resolving unregistered driver', () => {
      expect(() => registry.resolveDriver('oauth')).toThrow(NotFoundError)
      expect(() => registry.resolveDriver('oauth')).toThrow('AuthDriver "oauth" not found')
    })
  })

  describe('registerStore / resolveStore', () => {
    it('registers and resolves a store factory', () => {
      registry.registerStore('file', mockStoreFactory)
      const resolved = registry.resolveStore('file')
      expect(resolved).toBe(mockStoreFactory)
    })

    it('throws ConflictError on duplicate store registration', () => {
      registry.registerStore('file', mockStoreFactory)
      expect(() => registry.registerStore('file', mockStoreFactory)).toThrow(ConflictError)
      expect(() => registry.registerStore('file', mockStoreFactory)).toThrow(
        'SessionStore "file" is already registered',
      )
    })

    it('throws NotFoundError when resolving unregistered store', () => {
      expect(() => registry.resolveStore('redis')).toThrow(NotFoundError)
      expect(() => registry.resolveStore('redis')).toThrow('SessionStore "redis" not found')
    })
  })

  describe('registerProvider / resolveProvider', () => {
    it('registers and resolves a provider factory', () => {
      registry.registerProvider('yaml', mockProviderFactory)
      const resolved = registry.resolveProvider('yaml')
      expect(resolved).toBe(mockProviderFactory)
    })

    it('throws ConflictError on duplicate provider registration', () => {
      registry.registerProvider('yaml', mockProviderFactory)
      expect(() => registry.registerProvider('yaml', mockProviderFactory)).toThrow(ConflictError)
      expect(() => registry.registerProvider('yaml', mockProviderFactory)).toThrow(
        'UserProvider "yaml" is already registered',
      )
    })

    it('throws NotFoundError when resolving unregistered provider', () => {
      expect(() => registry.resolveProvider('database')).toThrow(NotFoundError)
      expect(() => registry.resolveProvider('database')).toThrow('UserProvider "database" not found')
    })
  })

  describe('has', () => {
    it('returns false for unregistered adapters', () => {
      expect(registry.has('driver', 'password')).toBe(false)
      expect(registry.has('store', 'file')).toBe(false)
      expect(registry.has('provider', 'yaml')).toBe(false)
    })

    it('returns true after registration', () => {
      registry.registerDriver('password', mockDriverFactory)
      registry.registerStore('file', mockStoreFactory)
      registry.registerProvider('yaml', mockProviderFactory)

      expect(registry.has('driver', 'password')).toBe(true)
      expect(registry.has('store', 'file')).toBe(true)
      expect(registry.has('provider', 'yaml')).toBe(true)
    })

    it('returns false for wrong type even if name exists in another map', () => {
      registry.registerDriver('password', mockDriverFactory)
      expect(registry.has('store', 'password')).toBe(false)
      expect(registry.has('provider', 'password')).toBe(false)
    })
  })
})
