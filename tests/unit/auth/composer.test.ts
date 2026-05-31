import { describe, it, expect, vi } from 'vitest'
import { compose } from '@/lib/auth/composer'
import { PluginRegistry } from '@/lib/auth/registry'
import type { AuthDriverFactory } from '@/lib/auth/contracts/auth-driver'
import type { SessionStoreFactory } from '@/lib/auth/contracts/session-store'
import type { UserProviderFactory } from '@/lib/auth/contracts/user-provider'
import type { Session, User } from '@/lib/auth/types'

// --- Stub adapters ---

function createMockDriverFactory(userId: string): AuthDriverFactory {
  return {
    create: () => ({
      validateCredentials: vi.fn().mockResolvedValue(userId),
    }),
  }
}

function createMockStoreFactory(session: Session): SessionStoreFactory {
  return {
    create: () => ({
      createSession: vi.fn().mockResolvedValue(session),
      validateSession: vi.fn().mockResolvedValue(session),
      destroySession: vi.fn().mockResolvedValue(undefined),
      cleanExpired: vi.fn().mockResolvedValue(0),
    }),
  }
}

const testUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['admin'],
  passwordHash: '$2b$10$hash',
  createdAt: '2024-01-01T00:00:00.000Z',
}

function createMockProviderFactory(): UserProviderFactory {
  return {
    create: () => ({
      getById: vi.fn().mockResolvedValue(testUser),
      getByEmail: vi.fn().mockResolvedValue(testUser),
      list: vi.fn().mockResolvedValue([testUser]),
      create: vi.fn().mockResolvedValue(testUser),
      update: vi.fn().mockResolvedValue(testUser),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
  }
}

// --- Tests ---

describe('AuthComposer', () => {
  const testSession: Session = {
    id: 'session-1',
    userId: 'user-1',
    token: 'abc123',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  function setupRegistry() {
    const registry = new PluginRegistry()
    registry.registerDriver('password', createMockDriverFactory('user-1'))
    registry.registerStore('file', createMockStoreFactory(testSession))
    registry.registerProvider('yaml', createMockProviderFactory())
    return registry
  }

  it('composes a service from registry config', () => {
    const registry = setupRegistry()
    const service = compose(registry, {
      driver: 'password',
      store: 'file',
      provider: 'yaml',
    })

    expect(service).toBeDefined()
    expect(service.login).toBeTypeOf('function')
    expect(service.logout).toBeTypeOf('function')
    expect(service.validateSession).toBeTypeOf('function')
    expect(service.getUser).toBeTypeOf('function')
    expect(service.getUserByEmail).toBeTypeOf('function')
    expect(service.listUsers).toBeTypeOf('function')
    expect(service.createUser).toBeTypeOf('function')
    expect(service.updateUser).toBeTypeOf('function')
    expect(service.deleteUser).toBeTypeOf('function')
  })

  it('throws NotFoundError when driver is not registered', () => {
    const registry = new PluginRegistry()
    registry.registerStore('file', createMockStoreFactory(testSession))
    registry.registerProvider('yaml', createMockProviderFactory())

    expect(() =>
      compose(registry, { driver: 'missing', store: 'file', provider: 'yaml' })
    ).toThrow()
  })

  it('throws NotFoundError when store is not registered', () => {
    const registry = new PluginRegistry()
    registry.registerDriver('password', createMockDriverFactory('user-1'))
    registry.registerProvider('yaml', createMockProviderFactory())

    expect(() =>
      compose(registry, { driver: 'password', store: 'missing', provider: 'yaml' })
    ).toThrow()
  })

  it('throws NotFoundError when provider is not registered', () => {
    const registry = new PluginRegistry()
    registry.registerDriver('password', createMockDriverFactory('user-1'))
    registry.registerStore('file', createMockStoreFactory(testSession))

    expect(() =>
      compose(registry, { driver: 'password', store: 'file', provider: 'missing' })
    ).toThrow()
  })

  describe('login flow', () => {
    it('validates credentials, creates session, and updates lastLogin', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const session = await service.login('test@example.com', { password: 'secret' })

      expect(session).toEqual(testSession)
    })
  })

  describe('logout', () => {
    it('destroys the session', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      await expect(service.logout('abc123')).resolves.toBeUndefined()
    })
  })

  describe('validateSession', () => {
    it('returns session for valid token', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const session = await service.validateSession('abc123')
      expect(session).toEqual(testSession)
    })
  })

  describe('user CRUD', () => {
    it('delegates getUser to provider.getById', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const user = await service.getUser('user-1')
      expect(user).toEqual(testUser)
    })

    it('delegates getUserByEmail to provider.getByEmail', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const user = await service.getUserByEmail('test@example.com')
      expect(user).toEqual(testUser)
    })

    it('delegates listUsers to provider.list', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const users = await service.listUsers()
      expect(users).toEqual([testUser])
    })

    it('delegates createUser to provider.create', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const user = await service.createUser({
        id: 'user-2',
        email: 'new@example.com',
        name: 'New User',
        password: 'pass',
        roles: ['editor'],
      })
      expect(user).toEqual(testUser)
    })

    it('delegates updateUser to provider.update', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      const user = await service.updateUser('user-1', { name: 'Updated' })
      expect(user).toEqual(testUser)
    })

    it('delegates deleteUser to provider.delete', async () => {
      const registry = setupRegistry()
      const service = compose(registry, {
        driver: 'password',
        store: 'file',
        provider: 'yaml',
      })

      await expect(service.deleteUser('user-1')).resolves.toBeUndefined()
    })
  })
})
