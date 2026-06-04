import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PluginRegistry } from '@/lib/auth/registry'
import { YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import { FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { compose } from '@/lib/auth/composer'
import type { ComposedAuthService, AuthConfig } from '@/lib/auth/composer'
import { PermissionChecker } from '@/lib/auth/permissions'
import { _setAuthServiceForTesting, _setComposedAuthForTesting, _setEntryHandlersForTesting, GET, POST, PUT, DELETE } from '@/app/(cp)/api/[...path]/route'
import { createEntryHandlers } from '@/app/(cp)/api/handlers/entries'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentEngine, EntryInput } from '@/lib/content/engine'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'
import type { Entry, ListOptions } from '@/lib/types'
import type { User } from '@/lib/auth/types'
import type { ResourceType, Action } from '@/lib/auth/permissions'

/**
 * Local AuthService interface matching the one in route.ts
 * (needed because route.ts defines it locally rather than exporting).
 */
interface AuthService {
  login(email: string, password: string): Promise<{ token: string; expiresAt: string }>
  logout(token: string): Promise<void>
  validateSession(token: string): Promise<User | null>
  createUser(input: { id: string; email: string; name: string; password: string; roles: string[] }): Promise<User>
  updateUser(id: string, input: { email?: string; name?: string; password?: string; roles?: string[]; lastLogin?: string }): Promise<User>
  deleteUser(id: string): Promise<void>
  hasPermission(user: User, resource: ResourceType, action: Action, scope?: string): Promise<boolean>
}

/**
 * In-memory file system adapter for testing.
 */
class InMemoryFS implements FileSystemAdapter {
  private files = new Map<string, string>()

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`File not found: ${path}`)
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true
    for (const key of this.files.keys()) {
      if (key.startsWith(path + '/')) return true
    }
    return false
  }

  async listFiles(directory: string, pattern?: string): Promise<string[]> {
    const prefix = directory.endsWith('/') ? directory : directory + '/'
    const results: string[] = []
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const relative = key.slice(prefix.length)
        if (!pattern || (pattern === '*.yaml' && relative.endsWith('.yaml') && !relative.includes('/'))) {
          results.push(relative)
        }
      }
    }
    return results.sort()
  }

  async listDirectories(): Promise<string[]> { return [] }
  async mkdir(): Promise<void> {}
  async copyFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
  }
  async moveFile(src: string, dest: string): Promise<void> {
    const content = await this.readFile(src)
    await this.writeFile(dest, content)
    await this.deleteFile(src)
  }
}

function createMockParser(): ContentParser {
  return {
    parseMarkdown(raw: string) {
      return { frontmatter: {}, content: raw }
    },
    serializeMarkdown(_frontmatter, content) {
      return content
    },
    parseYaml<T>(raw: string): T {
      const { parse } = require('yaml')
      return parse(raw) as T
    },
    serializeYaml(data) {
      const { stringify } = require('yaml')
      return stringify(data)
    },
  }
}

describe('CP API Route Handler', () => {
  let userFs: InMemoryFS
  let roleFs: InMemoryFS
  let parser: ContentParser

  beforeEach(async () => {
    userFs = new InMemoryFS()
    roleFs = new InMemoryFS()
    parser = createMockParser()

    // Seed admin role
    await roleFs.writeFile('/resources/roles/admin.yaml', `handle: admin
display: Administrator
permissions:
  - resource: collections
    actions: [view, create, edit, delete, publish]
  - resource: entries
    actions: [view, create, edit, delete, publish]
  - resource: users
    actions: [view, create, edit, delete]
`)

    // Set up auth using the new adapter system
    const registry = new PluginRegistry()
    registry.registerProvider('yaml', new YamlUserProviderFactory(userFs, parser))
    registry.registerStore('file', new FileSessionStoreFactory(userFs))

    // Resolve user provider first (needed by PasswordAuthDriver)
    const providerFactory = registry.resolveProvider('yaml')
    const userProvider = providerFactory.create({ usersPath: '/users' })

    registry.registerDriver('password', new PasswordAuthDriverFactory(userProvider))

    const authConfig: AuthConfig = {
      driver: 'password',
      store: 'file',
      provider: 'yaml',
      storeConfig: { sessionsDir: '/.sessions' },
      providerConfig: { usersPath: '/users' },
    }

    const composedAuth = compose(registry, authConfig)
    _setComposedAuthForTesting(composedAuth)

    // Create an AuthService adapter for the route handler
    const permissionChecker = new PermissionChecker(roleFs, parser, '/resources')
    const authService: AuthService = {
      async login(email: string, password: string) {
        return composedAuth.login(email, { password })
      },
      async logout(token: string) {
        return composedAuth.logout(token)
      },
      async validateSession(token: string): Promise<User | null> {
        const session = await composedAuth.validateSession(token)
        if (!session) return null
        try {
          const user = await composedAuth.getUser(session.userId)
          return user as User
        } catch {
          return null
        }
      },
      async createUser(input) {
        return composedAuth.createUser(input) as Promise<User>
      },
      async updateUser(id, input) {
        return composedAuth.updateUser(id, input) as Promise<User>
      },
      async deleteUser(id) {
        return composedAuth.deleteUser(id)
      },
      async hasPermission(user: User, resource: ResourceType, action: Action, scope?: string) {
        return permissionChecker.hasPermission(user.roles, resource, action, scope)
      },
    }

    _setAuthServiceForTesting(authService)
  })

  afterEach(() => {
    _setAuthServiceForTesting(null)
    _setComposedAuthForTesting(null)
  })

  async function createTestUser() {
    const { hashPassword } = await import('@/lib/auth/password')
    const passwordHash = await hashPassword('test-password')
    const userYaml = `id: testuser
email: test@example.com
name: Test User
roles:
  - admin
password_hash: "${passwordHash}"
created_at: "2024-01-01T00:00:00.000Z"
`
    await userFs.writeFile('/users/testuser.yaml', userYaml)
  }

  function makeRequest(method: string, url: string, body?: unknown, headers?: Record<string, string>): NextRequest {
    const init: { method: string; headers: Record<string, string>; body?: string } = {
      method,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    }
    if (body) {
      init.body = JSON.stringify(body)
    }
    return new NextRequest(new URL(url, 'http://localhost:3000'), init)
  }

  function params(path: string[]) {
    return { params: Promise.resolve({ path }) }
  }

  describe('POST /auth/login', () => {
    it('returns a session token for valid credentials', async () => {
      await createTestUser()

      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'test-password',
      })

      const response = await POST(request, params(['auth', 'login']))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.token).toBeDefined()
      expect(data.token).toHaveLength(64)
      expect(data.expiresAt).toBeDefined()
    })

    it('sets madori_session cookie on successful login', async () => {
      await createTestUser()

      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'test-password',
      })

      const response = await POST(request, params(['auth', 'login']))

      const setCookie = response.headers.get('set-cookie')
      expect(setCookie).toContain('madori_session=')
      expect(setCookie).toContain('HttpOnly')
    })

    it('returns 401 for invalid credentials', async () => {
      await createTestUser()

      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'wrong-password',
      })

      const response = await POST(request, params(['auth', 'login']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 401 for non-existent user', async () => {
      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'nobody@example.com',
        password: 'any-password',
      })

      const response = await POST(request, params(['auth', 'login']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 422 when email or password is missing', async () => {
      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
      })

      const response = await POST(request, params(['auth', 'login']))
      const data = await response.json()

      expect(response.status).toBe(422)
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /auth/logout', () => {
    it('returns 401 when no token is provided', async () => {
      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/logout')

      const response = await POST(request, params(['auth', 'logout']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('returns 401 for invalid token', async () => {
      const request = makeRequest('POST', 'http://localhost:3000/cp/api/auth/logout', undefined, {
        authorization: 'Bearer invalid-token-here',
      })

      const response = await POST(request, params(['auth', 'logout']))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('successfully logs out with valid token', async () => {
      await createTestUser()

      // Login first
      const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'test-password',
      })
      const loginResponse = await POST(loginRequest, params(['auth', 'login']))
      const { token } = await loginResponse.json()

      // Logout
      const logoutRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/logout', undefined, {
        authorization: `Bearer ${token}`,
      })
      const logoutResponse = await POST(logoutRequest, params(['auth', 'logout']))
      const data = await logoutResponse.json()

      expect(logoutResponse.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('invalidates the session after logout', async () => {
      await createTestUser()

      // Login
      const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'test-password',
      })
      const loginResponse = await POST(loginRequest, params(['auth', 'login']))
      const { token } = await loginResponse.json()

      // Logout
      const logoutRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/logout', undefined, {
        authorization: `Bearer ${token}`,
      })
      await POST(logoutRequest, params(['auth', 'logout']))

      // Try to use the token again
      const retryRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/logout', undefined, {
        authorization: `Bearer ${token}`,
      })
      const retryResponse = await POST(retryRequest, params(['auth', 'logout']))

      expect(retryResponse.status).toBe(401)
    })

    it('clears the madori_session cookie on logout', async () => {
      await createTestUser()

      // Login
      const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'test-password',
      })
      const loginResponse = await POST(loginRequest, params(['auth', 'login']))
      const { token } = await loginResponse.json()

      // Logout
      const logoutRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/logout', undefined, {
        authorization: `Bearer ${token}`,
      })
      const logoutResponse = await POST(logoutRequest, params(['auth', 'logout']))

      const setCookie = logoutResponse.headers.get('set-cookie')
      expect(setCookie).toContain('madori_session=')
      // Cookie should be expired (cleared)
      expect(setCookie).toContain('Expires=')
    })
  })

  describe('Unrecognized routes', () => {
    it('returns 404 for unknown paths', async () => {
      const request = makeRequest('GET', 'http://localhost:3000/cp/api/unknown/path')

      const response = await GET(request, params(['unknown', 'path']))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 for GET on auth/login', async () => {
      const request = makeRequest('GET', 'http://localhost:3000/cp/api/auth/login')

      const response = await GET(request, params(['auth', 'login']))

      expect(response.status).toBe(404)
    })

    it('returns 404 for PUT on unknown route', async () => {
      const request = makeRequest('PUT', 'http://localhost:3000/cp/api/something')

      const response = await PUT(request, params(['something']))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 for DELETE on unknown route', async () => {
      const request = makeRequest('DELETE', 'http://localhost:3000/cp/api/something')

      const response = await DELETE(request, params(['something']))
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('NOT_FOUND')
    })
  })

  describe('Entry CRUD routes', () => {
    let token: string
    let mockContentEngine: MockContentEngine

    class MockContentEngine {
      entries: Map<string, Entry> = new Map()

      async getEntry(collection: string, slug: string): Promise<Entry | null> {
        return this.entries.get(`${collection}/${slug}`) ?? null
      }

      async listEntries(collection: string, _options?: ListOptions): Promise<Entry[]> {
        if (collection === 'nonexistent') {
          throw new NotFoundError('Collection', collection)
        }
        const results: Entry[] = []
        for (const [key, entry] of this.entries) {
          if (key.startsWith(`${collection}/`)) {
            results.push(entry)
          }
        }
        return results
      }

      async createEntry(collection: string, data: EntryInput): Promise<Entry> {
        if (collection === 'nonexistent') {
          throw new NotFoundError('Collection', collection)
        }
        const key = `${collection}/${data.slug}`
        if (this.entries.has(key)) {
          throw new ConflictError(`Entry with slug "${data.slug}" already exists in collection "${collection}"`)
        }
        const entry: Entry = {
          title: data.title,
          slug: data.slug,
          status: data.status ?? 'draft',
          author: data.author,
          content: data.content ?? '',
          data: data.data ?? {},
          collection,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        this.entries.set(key, entry)
        return entry
      }

      async updateEntry(collection: string, slug: string, data: Partial<EntryInput>, _contentHash?: string): Promise<Entry> {
        const key = `${collection}/${slug}`
        const existing = this.entries.get(key)
        if (!existing) {
          throw new NotFoundError('Entry', `${collection}/${slug}`)
        }
        const updated: Entry = {
          ...existing,
          title: data.title ?? existing.title,
          slug: data.slug ?? existing.slug,
          status: data.status ?? existing.status,
          author: data.author ?? existing.author,
          content: data.content ?? existing.content,
          data: data.data ? { ...existing.data, ...data.data } : existing.data,
          updatedAt: new Date().toISOString(),
        }
        // If slug changed, remove old key and add new
        if (data.slug && data.slug !== slug) {
          this.entries.delete(key)
          this.entries.set(`${collection}/${data.slug}`, updated)
        } else {
          this.entries.set(key, updated)
        }
        return updated
      }

      async deleteEntry(collection: string, slug: string): Promise<void> {
        const key = `${collection}/${slug}`
        if (!this.entries.has(key)) {
          throw new NotFoundError('Entry', `${collection}/${slug}`)
        }
        this.entries.delete(key)
      }

      // Stubs for other ContentEngine methods (not used in entry routes)
      async getCollection() { return null }
      async listCollections() { return [] }
      async getTaxonomy() { return null }
      async listTaxonomies() { return [] }
      async getTerm() { return null }
      async listTerms() { return [] }
      async getGlobal() { return null }
      async listGlobals() { return [] }
      async updateGlobal() { return { handle: '', data: {} } }
      async getNavigation() { return null }
      async listNavigations() { return [] }
      async getAsset() { return null }
      async listAssets() { return [] }
      async uploadAsset() { return { path: '', filename: '', extension: '', size: 0, mimeType: '', modifiedAt: '' } }
      async deleteAsset() {}
      async getForm() { return null }
      async listForms() { return [] }
      async submitForm() { return { id: '', form: '', submittedAt: '', data: {} } }
    }

    beforeEach(async () => {
      await createTestUser()

      mockContentEngine = new MockContentEngine()
      const handlers = createEntryHandlers(mockContentEngine as unknown as ContentEngine)
      _setEntryHandlersForTesting(handlers)

      // Login to get a token
      const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
        email: 'test@example.com',
        password: 'test-password',
      })
      const loginResponse = await POST(loginRequest, params(['auth', 'login']))
      const loginData = await loginResponse.json()
      token = loginData.token
    })

    afterEach(() => {
      _setEntryHandlersForTesting(null)
    })

    describe('GET /entries/:collection', () => {
      it('returns 401 without authentication', async () => {
        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog')
        const response = await GET(request, params(['entries', 'blog']))
        expect(response.status).toBe(401)
      })

      it('returns empty list for collection with no entries', async () => {
        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await GET(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.data).toEqual([])
      })

      it('returns entries for a collection', async () => {
        mockContentEngine.entries.set('blog/hello-world', {
          title: 'Hello World',
          slug: 'hello-world',
          status: 'published',
          content: '# Hello',
          data: {},
          collection: 'blog',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })

        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await GET(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.data).toHaveLength(1)
        expect(data.data[0].title).toBe('Hello World')
      })

      it('returns 404 for nonexistent collection', async () => {
        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/nonexistent', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await GET(request, params(['entries', 'nonexistent']))
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error.code).toBe('NOT_FOUND')
      })
    })

    describe('GET /entries/:collection/:slug', () => {
      it('returns 401 without authentication', async () => {
        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog/hello-world')
        const response = await GET(request, params(['entries', 'blog', 'hello-world']))
        expect(response.status).toBe(401)
      })

      it('returns a single entry', async () => {
        mockContentEngine.entries.set('blog/hello-world', {
          title: 'Hello World',
          slug: 'hello-world',
          status: 'published',
          content: '# Hello',
          data: {},
          collection: 'blog',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })

        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog/hello-world', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await GET(request, params(['entries', 'blog', 'hello-world']))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.data.title).toBe('Hello World')
        expect(data.data.slug).toBe('hello-world')
      })

      it('returns 404 for nonexistent entry', async () => {
        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog/nonexistent', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await GET(request, params(['entries', 'blog', 'nonexistent']))
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error.code).toBe('NOT_FOUND')
      })
    })

    describe('POST /entries/:collection', () => {
      it('returns 401 without authentication', async () => {
        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/blog', {
          title: 'New Post',
          slug: 'new-post',
        })
        const response = await POST(request, params(['entries', 'blog']))
        expect(response.status).toBe(401)
      })

      it('creates a new entry', async () => {
        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/blog', {
          title: 'New Post',
          slug: 'new-post',
          status: 'published',
          content: '# New Post Content',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await POST(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(data.data.title).toBe('New Post')
        expect(data.data.slug).toBe('new-post')
        expect(data.data.status).toBe('published')
      })

      it('returns 422 when title is missing', async () => {
        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/blog', {
          slug: 'new-post',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await POST(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(422)
        expect(data.error.code).toBe('VALIDATION_ERROR')
        expect(data.error.details.fieldErrors.title).toBeDefined()
      })

      it('returns 422 when slug is missing', async () => {
        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/blog', {
          title: 'New Post',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await POST(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(422)
        expect(data.error.code).toBe('VALIDATION_ERROR')
        expect(data.error.details.fieldErrors.slug).toBeDefined()
      })

      it('returns 409 for duplicate slug', async () => {
        mockContentEngine.entries.set('blog/existing-post', {
          title: 'Existing',
          slug: 'existing-post',
          status: 'published',
          content: '',
          data: {},
          collection: 'blog',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })

        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/blog', {
          title: 'Another Post',
          slug: 'existing-post',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await POST(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(409)
        expect(data.error.code).toBe('CONFLICT')
      })

      it('returns 404 for nonexistent collection', async () => {
        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/nonexistent', {
          title: 'New Post',
          slug: 'new-post',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await POST(request, params(['entries', 'nonexistent']))
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error.code).toBe('NOT_FOUND')
      })
    })

    describe('PUT /entries/:collection/:slug', () => {
      beforeEach(() => {
        mockContentEngine.entries.set('blog/hello-world', {
          title: 'Hello World',
          slug: 'hello-world',
          status: 'draft',
          content: '# Hello',
          data: {},
          collection: 'blog',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      })

      it('returns 401 without authentication', async () => {
        const request = makeRequest('PUT', 'http://localhost:3000/cp/api/entries/blog/hello-world', {
          title: 'Updated Title',
        })
        const response = await PUT(request, params(['entries', 'blog', 'hello-world']))
        expect(response.status).toBe(401)
      })

      it('updates an existing entry', async () => {
        const request = makeRequest('PUT', 'http://localhost:3000/cp/api/entries/blog/hello-world', {
          title: 'Updated Title',
          status: 'published',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await PUT(request, params(['entries', 'blog', 'hello-world']))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.data.title).toBe('Updated Title')
        expect(data.data.status).toBe('published')
      })

      it('returns 404 for nonexistent entry', async () => {
        const request = makeRequest('PUT', 'http://localhost:3000/cp/api/entries/blog/nonexistent', {
          title: 'Updated',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await PUT(request, params(['entries', 'blog', 'nonexistent']))
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error.code).toBe('NOT_FOUND')
      })
    })

    describe('DELETE /entries/:collection/:slug', () => {
      beforeEach(() => {
        mockContentEngine.entries.set('blog/hello-world', {
          title: 'Hello World',
          slug: 'hello-world',
          status: 'published',
          content: '# Hello',
          data: {},
          collection: 'blog',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
      })

      it('returns 401 without authentication', async () => {
        const request = makeRequest('DELETE', 'http://localhost:3000/cp/api/entries/blog/hello-world')
        const response = await DELETE(request, params(['entries', 'blog', 'hello-world']))
        expect(response.status).toBe(401)
      })

      it('deletes an existing entry', async () => {
        const request = makeRequest('DELETE', 'http://localhost:3000/cp/api/entries/blog/hello-world', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await DELETE(request, params(['entries', 'blog', 'hello-world']))
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.success).toBe(true)
        expect(mockContentEngine.entries.has('blog/hello-world')).toBe(false)
      })

      it('returns 404 for nonexistent entry', async () => {
        const request = makeRequest('DELETE', 'http://localhost:3000/cp/api/entries/blog/nonexistent', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await DELETE(request, params(['entries', 'blog', 'nonexistent']))
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error.code).toBe('NOT_FOUND')
      })
    })

    describe('Method not allowed', () => {
      it('returns 405 for PUT on entries/:collection', async () => {
        const request = makeRequest('PUT', 'http://localhost:3000/cp/api/entries/blog', {
          title: 'test',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await PUT(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(405)
        expect(data.error.code).toBe('METHOD_NOT_ALLOWED')
      })

      it('returns 405 for POST on entries/:collection/:slug', async () => {
        const request = makeRequest('POST', 'http://localhost:3000/cp/api/entries/blog/hello-world', {
          title: 'test',
        }, {
          authorization: `Bearer ${token}`,
        })
        const response = await POST(request, params(['entries', 'blog', 'hello-world']))
        const data = await response.json()

        expect(response.status).toBe(405)
        expect(data.error.code).toBe('METHOD_NOT_ALLOWED')
      })
    })

    describe('Permission enforcement', () => {
      it('returns 403 when user lacks entries view permission', async () => {
        // Replace role with one that has no entries permissions
        await roleFs.writeFile('/resources/roles/admin.yaml', `handle: admin
display: Administrator
permissions:
  - resource: collections
    actions: [view, create, edit, delete, publish]
`)

        const request = makeRequest('GET', 'http://localhost:3000/cp/api/entries/blog', undefined, {
          authorization: `Bearer ${token}`,
        })
        const response = await GET(request, params(['entries', 'blog']))
        const data = await response.json()

        expect(response.status).toBe(403)
        expect(data.error.code).toBe('AUTHORIZATION_ERROR')
      })
    })
  })
})
