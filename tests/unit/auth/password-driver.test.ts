import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PasswordAuthDriver, PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { AuthenticationError } from '@/lib/errors'
import { hashPassword } from '@/lib/auth/password'
import type { UserProvider } from '@/lib/auth/contracts/user-provider'
import type { User } from '@/lib/auth/types'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    roles: ['admin'],
    passwordHash: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function mockUserProvider(getByEmailResult: User | null = null): UserProvider {
  return {
    getById: vi.fn(),
    getByEmail: vi.fn().mockResolvedValue(getByEmailResult),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}

describe('PasswordAuthDriver', () => {
  let provider: UserProvider
  let driver: PasswordAuthDriver

  describe('validateCredentials', () => {
    it('returns user id when credentials are valid', async () => {
      const hash = await hashPassword('correct-password')
      const user = makeUser({ passwordHash: hash })
      provider = mockUserProvider(user)
      driver = new PasswordAuthDriver(provider)

      const result = await driver.validateCredentials('test@example.com', {
        password: 'correct-password',
      })

      expect(result).toBe('user-1')
      expect(provider.getByEmail).toHaveBeenCalledWith('test@example.com')
    })

    it('throws AuthenticationError when password is missing', async () => {
      provider = mockUserProvider()
      driver = new PasswordAuthDriver(provider)

      await expect(
        driver.validateCredentials('test@example.com', {})
      ).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError when password is empty string', async () => {
      provider = mockUserProvider()
      driver = new PasswordAuthDriver(provider)

      await expect(
        driver.validateCredentials('test@example.com', { password: '' })
      ).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError when user is not found', async () => {
      provider = mockUserProvider(null)
      driver = new PasswordAuthDriver(provider)

      await expect(
        driver.validateCredentials('unknown@example.com', { password: 'any' })
      ).rejects.toThrow(AuthenticationError)
    })

    it('throws AuthenticationError when password hash does not match', async () => {
      const hash = await hashPassword('correct-password')
      const user = makeUser({ passwordHash: hash })
      provider = mockUserProvider(user)
      driver = new PasswordAuthDriver(provider)

      await expect(
        driver.validateCredentials('test@example.com', { password: 'wrong-password' })
      ).rejects.toThrow(AuthenticationError)
    })
  })
})

describe('PasswordAuthDriverFactory', () => {
  it('creates a PasswordAuthDriver instance', () => {
    const provider = mockUserProvider()
    const factory = new PasswordAuthDriverFactory(provider)

    const driver = factory.create({})

    expect(driver).toBeInstanceOf(PasswordAuthDriver)
  })
})
