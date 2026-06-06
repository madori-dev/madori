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
      newPassword: 'new-pass',
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
      newPassword: 'new-pass',
    })
    const res = await handlers.handleChangePassword(req, 'unknown-id')
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })
})
