import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createUserHandlers } from '@/app/(cp)/api/handlers/users'
import { hashPassword } from '@/lib/auth/password'
import type { ComposedAuthService } from '@/lib/auth/composer'
import type { User } from '@/lib/auth/types'

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest('http://localhost/api/users/user1/password', init)
}

describe('handleChangePassword', () => {
  let authService: ComposedAuthService
  let handlers: ReturnType<typeof createUserHandlers>
  let testUser: User

  beforeEach(async () => {
    const hash = await hashPassword('correct-password')
    testUser = {
      id: 'user1',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['admin'],
      passwordHash: hash,
      createdAt: '2024-01-01T00:00:00.000Z',
    }

    authService = {
      login: vi.fn(),
      logout: vi.fn(),
      validateSession: vi.fn(),
      getUser: vi.fn().mockResolvedValue(testUser),
      getUserByEmail: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn().mockResolvedValue(testUser),
      deleteUser: vi.fn(),
    } as unknown as ComposedAuthService

    handlers = createUserHandlers(authService)
  })

  it('returns 422 when currentPassword is missing', async () => {
    const req = makeRequest('POST', { newPassword: 'new-pass' })
    const res = await handlers.handleChangePassword(req, 'user1')
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 422 when newPassword is missing', async () => {
    const req = makeRequest('POST', { currentPassword: 'old-pass' })
    const res = await handlers.handleChangePassword(req, 'user1')
    const json = await res.json()

    expect(res.status).toBe(422)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 when current password is incorrect', async () => {
    const req = makeRequest('POST', {
      currentPassword: 'wrong-password',
      newPassword: 'new-secure-password',
    })
    const res = await handlers.handleChangePassword(req, 'user1')
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Current password is incorrect')
  })

  it('returns success when current password is correct', async () => {
    const req = makeRequest('POST', {
      currentPassword: 'correct-password',
      newPassword: 'new-secure-password',
    })
    const res = await handlers.handleChangePassword(req, 'user1')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(authService.updateUser).toHaveBeenCalledWith('user1', {
      password: 'new-secure-password',
    })
  })

  it('returns 404 when user does not exist', async () => {
    const { NotFoundError } = await import('@/lib/errors')
    vi.mocked(authService.getUser).mockRejectedValue(new NotFoundError('User', 'unknown-id'))

    const req = makeRequest('POST', {
      currentPassword: 'any',
      newPassword: 'new-secure-password',
    })
    const res = await handlers.handleChangePassword(req, 'unknown-id')
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })
})

describe('handleCreateUser input validation', () => {
  const baseUser = {
    id: 'new-user', email: 'new@example.com', name: 'New User', password: 'safe-password', roles: ['editor'],
  }

  function setup(roleExists: (role: string) => Promise<boolean> = async () => true) {
    const auth = {
      login: vi.fn(), logout: vi.fn(), validateSession: vi.fn(), getUser: vi.fn(), getUserByEmail: vi.fn(), listUsers: vi.fn(),
      createUser: vi.fn().mockImplementation(async (input) => ({ ...input, passwordHash: 'hash', createdAt: '2026-01-01T00:00:00.000Z' })),
      updateUser: vi.fn(), deleteUser: vi.fn(),
    } as unknown as ComposedAuthService
    return { auth, handlers: createUserHandlers(auth, roleExists) }
  }

  it('rejects malformed emails, non-array roles, and unknown roles before create', async () => {
    const { auth, handlers } = setup(async (role) => role === 'editor')
    for (const body of [
      { ...baseUser, email: 'not-an-email' },
      { ...baseUser, email: 'new@invalid@example.com' },
      { ...baseUser, roles: 'admin' },
      { ...baseUser, roles: ['does-not-exist'] },
    ]) {
      const response = await handlers.handleCreateUser(makeRequest('POST', body))
      expect(response.status).toBe(422)
    }
    expect(auth.createUser).not.toHaveBeenCalled()
  })

  it('allows only existing unique role handles', async () => {
    const { auth, handlers } = setup(async (role) => role === 'editor')
    const response = await handlers.handleCreateUser(makeRequest('POST', baseUser))
    expect(response.status).toBe(201)
    expect(auth.createUser).toHaveBeenCalledWith(baseUser)
  })

  it('rejects passwords outside shared policy before create', async () => {
    const { auth, handlers } = setup()
    const response = await handlers.handleCreateUser(makeRequest('POST', { ...baseUser, password: 'short' }))
    expect(response.status).toBe(422)
    expect(auth.createUser).not.toHaveBeenCalled()
  })
})

describe('handleUpdateOwnUser', () => {
  let authService: ComposedAuthService
  let handlers: ReturnType<typeof createUserHandlers>

  beforeEach(() => {
    const testUser: User = {
      id: 'user1',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['editor'],
      passwordHash: 'hash',
      createdAt: '2024-01-01T00:00:00.000Z',
      theme: 'light',
    }

    authService = {
      login: vi.fn(),
      logout: vi.fn(),
      validateSession: vi.fn(),
      getUser: vi.fn(),
      getUserByEmail: vi.fn(),
      listUsers: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn().mockImplementation(async (_id, input) => ({ ...testUser, ...input })),
      deleteUser: vi.fn(),
    } as unknown as ComposedAuthService
    handlers = createUserHandlers(authService)
  })

  it('updates only profile fields and theme', async () => {
    const req = makeRequest('PUT', {
      name: 'Updated User',
      email: 'updated@example.com',
      theme: 'dark',
    })

    const response = await handlers.handleUpdateOwnUser(req, 'user1')

    expect(response.status).toBe(200)
    expect(authService.updateUser).toHaveBeenCalledWith('user1', {
      name: 'Updated User',
      email: 'updated@example.com',
      theme: 'dark',
    })
  })

  it('rejects role and password changes', async () => {
    const req = makeRequest('PUT', { roles: ['admin'] })

    const response = await handlers.handleUpdateOwnUser(req, 'user1')

    expect(response.status).toBe(403)
    expect(authService.updateUser).not.toHaveBeenCalled()
  })
})
