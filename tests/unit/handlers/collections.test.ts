import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createCollectionHandlers } from '@/app/(cp)/api/handlers/collections'
import { _setAuthServiceForTesting, GET, PUT } from '@/app/(cp)/api/[...path]/route'
import type { ConfigWriter } from '@/lib/config/writer'
import type { MadoriContentEngine } from '@/lib/content/engine'
import type { CollectionConfig } from '@/lib/config/schema'
import type { User } from '@/lib/auth/types'
import type { ResourceType, Action } from '@/lib/auth/permissions'

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest('http://localhost/api/collections/blog', init)
}

describe('createCollectionHandlers', () => {
  let configWriter: ConfigWriter
  let contentEngine: MadoriContentEngine
  let handlers: ReturnType<typeof createCollectionHandlers>

  const validConfig: CollectionConfig = {
    title: 'Blog',
    handle: 'blog',
    blueprint: 'blog',
    route: '/blog/{slug}',
  }

  beforeEach(() => {
    configWriter = {
      readCollectionConfig: vi.fn(),
      writeCollectionConfig: vi.fn(),
    }
    contentEngine = {} as MadoriContentEngine
    handlers = createCollectionHandlers(contentEngine, configWriter)
  })

  describe('handleGetCollection', () => {
    it('returns 404 when collection not found', async () => {
      vi.mocked(configWriter.readCollectionConfig).mockResolvedValue(null)

      const req = makeRequest('GET')
      const res = await handlers.handleGetCollection(req, 'nonexistent')
      const json = await res.json()

      expect(res.status).toBe(404)
      expect(json.error.code).toBe('NOT_FOUND')
      expect(json.error.message).toContain('nonexistent')
    })

    it('returns config data when collection exists', async () => {
      vi.mocked(configWriter.readCollectionConfig).mockResolvedValue(validConfig)

      const req = makeRequest('GET')
      const res = await handlers.handleGetCollection(req, 'blog')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toEqual(validConfig)
    })
  })

  describe('handleUpdateCollection', () => {
    it('returns 422 with field errors for invalid body', async () => {
      const req = makeRequest('PUT', { title: 123 })
      const res = await handlers.handleUpdateCollection(req, 'blog')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error.code).toBe('VALIDATION_ERROR')
      expect(json.error.details).toBeDefined()
    })

    it('returns 422 when required fields are missing', async () => {
      const req = makeRequest('PUT', { title: 'Blog' })
      const res = await handlers.handleUpdateCollection(req, 'blog')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error.code).toBe('VALIDATION_ERROR')
      expect(json.error.details).toHaveProperty('handle')
    })

    it('returns 200 with validated config on success', async () => {
      vi.mocked(configWriter.writeCollectionConfig).mockResolvedValue(undefined)

      const req = makeRequest('PUT', validConfig)
      const res = await handlers.handleUpdateCollection(req, 'blog')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.data).toEqual(validConfig)
      expect(configWriter.writeCollectionConfig).toHaveBeenCalledWith('blog', validConfig)
    })

    it('returns 500 when config writer throws', async () => {
      vi.mocked(configWriter.writeCollectionConfig).mockRejectedValue(
        new Error('Cannot write to config file')
      )

      const req = makeRequest('PUT', validConfig)
      const res = await handlers.handleUpdateCollection(req, 'blog')
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.error.code).toBe('INTERNAL_ERROR')
      expect(json.error.message).toContain('Cannot write to config file')
    })

    it('validates sortDirection only accepts asc or desc', async () => {
      const req = makeRequest('PUT', { ...validConfig, sortDirection: 'invalid' })
      const res = await handlers.handleUpdateCollection(req, 'blog')
      const json = await res.json()

      expect(res.status).toBe(422)
      expect(json.error.details).toHaveProperty('sortDirection')
    })
  })
})

describe('Collection config route auth/permission', () => {
  const testUser: User = {
    id: 'user1',
    email: 'test@example.com',
    name: 'Test User',
    roles: ['admin'],
    createdAt: '2024-01-01T00:00:00.000Z',
  }

  const editorUser: User = {
    id: 'user2',
    email: 'editor@example.com',
    name: 'Editor User',
    roles: ['editor'],
    createdAt: '2024-01-01T00:00:00.000Z',
  }

  interface AuthService {
    login(email: string, password: string): Promise<{ token: string; expiresAt: string }>
    logout(token: string): Promise<void>
    validateSession(token: string): Promise<User | null>
    createUser(input: { id: string; email: string; name: string; password: string; roles: string[] }): Promise<User>
    updateUser(id: string, input: { email?: string; name?: string; password?: string; roles?: string[]; lastLogin?: string }): Promise<User>
    deleteUser(id: string): Promise<void>
    hasPermission(user: User, resource: ResourceType, action: Action, scope?: string): Promise<boolean>
  }

  function createMockAuthService(opts: {
    sessionUser?: User | null
    permissions?: Record<string, boolean>
  } = {}): AuthService {
    return {
      async login() { return { token: 'tok', expiresAt: '2099-01-01T00:00:00Z' } },
      async logout() {},
      async validateSession(token: string) {
        if (token === 'valid-token') return opts.sessionUser ?? null
        return null
      },
      async createUser() { return testUser },
      async updateUser() { return testUser },
      async deleteUser() {},
      async hasPermission(_user: User, resource: ResourceType, action: Action) {
        const key = `${resource}:${action}`
        if (opts.permissions) return opts.permissions[key] ?? false
        return true
      },
    }
  }

  function makeRouteRequest(method: string, url: string, body?: unknown, headers?: Record<string, string>): NextRequest {
    const init: { method: string; headers: Record<string, string>; body?: string } = {
      method,
      headers: { 'content-type': 'application/json', ...headers },
    }
    if (body) init.body = JSON.stringify(body)
    return new NextRequest(new URL(url, 'http://localhost:3000'), init)
  }

  function params(path: string[]) {
    return { params: Promise.resolve({ path }) }
  }

  afterEach(() => {
    _setAuthServiceForTesting(null)
  })

  describe('GET /api/collections/{handle}', () => {
    it('returns 401 without authentication token', async () => {
      _setAuthServiceForTesting(createMockAuthService({ sessionUser: null }))

      const request = makeRouteRequest('GET', 'http://localhost:3000/cp/api/collections/blog')
      const response = await GET(request, params(['collections', 'blog']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 401 with invalid token', async () => {
      _setAuthServiceForTesting(createMockAuthService({ sessionUser: null }))

      const request = makeRouteRequest('GET', 'http://localhost:3000/cp/api/collections/blog', undefined, {
        authorization: 'Bearer invalid-token',
      })
      const response = await GET(request, params(['collections', 'blog']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 403 without collections:view permission', async () => {
      _setAuthServiceForTesting(createMockAuthService({
        sessionUser: editorUser,
        permissions: { 'collections:view': false },
      }))

      const request = makeRouteRequest('GET', 'http://localhost:3000/cp/api/collections/blog', undefined, {
        authorization: 'Bearer valid-token',
      })
      const response = await GET(request, params(['collections', 'blog']))
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error.code).toBe('AUTHORIZATION_ERROR')
    })
  })

  describe('PUT /api/collections/{handle}', () => {
    it('returns 401 without authentication token', async () => {
      _setAuthServiceForTesting(createMockAuthService({ sessionUser: null }))

      const request = makeRouteRequest('PUT', 'http://localhost:3000/cp/api/collections/blog', {
        title: 'Blog', handle: 'blog', blueprint: 'blog',
      })
      const response = await PUT(request, params(['collections', 'blog']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 401 with invalid token', async () => {
      _setAuthServiceForTesting(createMockAuthService({ sessionUser: null }))

      const request = makeRouteRequest('PUT', 'http://localhost:3000/cp/api/collections/blog', {
        title: 'Blog', handle: 'blog', blueprint: 'blog',
      }, {
        authorization: 'Bearer invalid-token',
      })
      const response = await PUT(request, params(['collections', 'blog']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 403 without collections:edit permission', async () => {
      _setAuthServiceForTesting(createMockAuthService({
        sessionUser: editorUser,
        permissions: { 'collections:edit': false },
      }))

      const request = makeRouteRequest('PUT', 'http://localhost:3000/cp/api/collections/blog', {
        title: 'Blog', handle: 'blog', blueprint: 'blog',
      }, {
        authorization: 'Bearer valid-token',
      })
      const response = await PUT(request, params(['collections', 'blog']))
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error.code).toBe('AUTHORIZATION_ERROR')
    })
  })
})
