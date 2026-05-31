import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { _setAuthServiceForTesting, _setComposedAuthForTesting, GET } from '@/app/(cp)/api/[...path]/route'
import type { ComposedAuthService } from '@/lib/auth/composer'
import type { Session } from '@/lib/auth/types'

/**
 * Local AuthService interface matching the one in route.ts
 */
interface AuthService {
  login(email: string, password: string): Promise<{ token: string; expiresAt: string }>
  logout(token: string): Promise<void>
  validateSession(token: string): Promise<unknown>
  createUser(input: unknown): Promise<unknown>
  updateUser(id: string, input: unknown): Promise<unknown>
  deleteUser(id: string): Promise<void>
  hasPermission(...args: unknown[]): Promise<boolean>
}

describe('GET /auth/validate', () => {
  let mockComposedAuth: ComposedAuthService
  let validToken: string
  let validSession: Session

  beforeEach(() => {
    validToken = 'valid-session-token-abc123'
    validSession = {
      id: 'session-1',
      userId: 'user-42',
      token: validToken,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }

    mockComposedAuth = {
      async login() { return validSession },
      async logout() {},
      async validateSession(token: string) {
        if (token === validToken) return validSession
        return null
      },
      async getUser() { return { id: 'user-42', email: 'test@example.com', name: 'Test', roles: ['admin'], passwordHash: '', createdAt: '' } },
      async getUserByEmail() { return null },
      async listUsers() { return [] },
      async createUser() { return { id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' } },
      async updateUser() { return { id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' } },
      async deleteUser() {},
    }

    // Provide a minimal AuthService stub so initializeServices doesn't run
    const stubAuthService: AuthService = {
      async login() { return validSession },
      async logout() {},
      async validateSession() { return null },
      async createUser() { return { id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' } as never },
      async updateUser() { return { id: '', email: '', name: '', roles: [], passwordHash: '', createdAt: '' } as never },
      async deleteUser() {},
      async hasPermission() { return false },
    }

    _setAuthServiceForTesting(stubAuthService)
    _setComposedAuthForTesting(mockComposedAuth)
  })

  afterEach(() => {
    _setAuthServiceForTesting(null)
    _setComposedAuthForTesting(null)
  })

  function makeRequest(headers?: Record<string, string>): NextRequest {
    return new NextRequest(new URL('http://localhost:3000/cp/api/auth/validate'), {
      method: 'GET',
      headers: headers ?? {},
    })
  }

  function params(path: string[]) {
    return { params: Promise.resolve({ path }) }
  }

  it('returns 200 with userId for valid Bearer token', async () => {
    const request = makeRequest({ authorization: `Bearer ${validToken}` })
    const response = await GET(request, params(['auth', 'validate']))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.valid).toBe(true)
    expect(data.userId).toBe('user-42')
  })

  it('returns 401 when no Authorization header is provided', async () => {
    const request = makeRequest()
    const response = await GET(request, params(['auth', 'validate']))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    expect(data.error.message).toBe('No token')
  })

  it('returns 401 for invalid/unknown token', async () => {
    const request = makeRequest({ authorization: 'Bearer invalid-token' })
    const response = await GET(request, params(['auth', 'validate']))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    expect(data.error.message).toBe('Invalid session')
  })

  it('returns 401 when Authorization header is not Bearer format', async () => {
    const request = makeRequest({ authorization: 'Basic dXNlcjpwYXNz' })
    const response = await GET(request, params(['auth', 'validate']))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    expect(data.error.message).toBe('No token')
  })
})
