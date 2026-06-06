import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PluginRegistry } from '@/lib/auth/registry'
import { YamlUserProviderFactory } from '@/lib/auth/providers/yaml'
import { FileSessionStoreFactory } from '@/lib/auth/stores/file'
import { PasswordAuthDriverFactory } from '@/lib/auth/drivers/password'
import { compose } from '@/lib/auth/composer'
import type { AuthConfig } from '@/lib/auth/composer'
import { PermissionChecker } from '@/lib/auth/permissions'
import { _setAuthServiceForTesting, _setComposedAuthForTesting, GET, POST } from '@/app/(cp)/api/[...path]/route'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { User } from '@/lib/auth/types'
import type { ResourceType, Action } from '@/lib/auth/permissions'

interface AuthService {
  login(email: string, password: string): Promise<{ token: string; expiresAt: string }>
  logout(token: string): Promise<void>
  validateSession(token: string): Promise<User | null>
  createUser(input: { id: string; email: string; name: string; password: string; roles: string[] }): Promise<User>
  updateUser(id: string, input: { email?: string; name?: string; password?: string; roles?: string[]; lastLogin?: string }): Promise<User>
  deleteUser(id: string): Promise<void>
  hasPermission(user: User, resource: ResourceType, action: Action, scope?: string): Promise<boolean>
}

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

describe('GET /api/users/me', () => {
  let userFs: InMemoryFS
  let roleFs: InMemoryFS
  let parser: ContentParser

  beforeEach(async () => {
    userFs = new InMemoryFS()
    roleFs = new InMemoryFS()
    parser = createMockParser()

    await roleFs.writeFile('/resources/roles/admin.yaml', `handle: admin
display: Administrator
permissions:
  - resource: users
    actions: [view, create, edit, delete]
`)

    const registry = new PluginRegistry()
    registry.registerProvider('yaml', new YamlUserProviderFactory(userFs, parser))
    registry.registerStore('file', new FileSessionStoreFactory(userFs))

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
last_login: "2024-06-01T12:00:00.000Z"
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

  it('returns 401 when no token is provided', async () => {
    const request = makeRequest('GET', 'http://localhost:3000/cp/api/users/me')
    const response = await GET(request, params(['users', 'me']))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('AUTHENTICATION_ERROR')
  })

  it('returns 401 for invalid token', async () => {
    const request = makeRequest('GET', 'http://localhost:3000/cp/api/users/me', undefined, {
      authorization: 'Bearer invalid-token',
    })
    const response = await GET(request, params(['users', 'me']))
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('AUTHENTICATION_ERROR')
  })

  it('returns current user profile for authenticated request', async () => {
    await createTestUser()

    // Login first
    const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
      email: 'test@example.com',
      password: 'test-password',
    })
    const loginResponse = await POST(loginRequest, params(['auth', 'login']))
    const { token } = await loginResponse.json()

    // GET /users/me
    const request = makeRequest('GET', 'http://localhost:3000/cp/api/users/me', undefined, {
      authorization: `Bearer ${token}`,
    })
    const response = await GET(request, params(['users', 'me']))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.id).toBe('testuser')
    expect(data.data.email).toBe('test@example.com')
    expect(data.data.name).toBe('Test User')
    expect(data.data.roles).toEqual(['admin'])
    expect(data.data.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('includes theme field in response (defaults to light)', async () => {
    await createTestUser()

    const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
      email: 'test@example.com',
      password: 'test-password',
    })
    const loginResponse = await POST(loginRequest, params(['auth', 'login']))
    const { token } = await loginResponse.json()

    const request = makeRequest('GET', 'http://localhost:3000/cp/api/users/me', undefined, {
      authorization: `Bearer ${token}`,
    })
    const response = await GET(request, params(['users', 'me']))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.theme).toBe('light')
  })

  it('does not include passwordHash in response', async () => {
    await createTestUser()

    const loginRequest = makeRequest('POST', 'http://localhost:3000/cp/api/auth/login', {
      email: 'test@example.com',
      password: 'test-password',
    })
    const loginResponse = await POST(loginRequest, params(['auth', 'login']))
    const { token } = await loginResponse.json()

    const request = makeRequest('GET', 'http://localhost:3000/cp/api/users/me', undefined, {
      authorization: `Bearer ${token}`,
    })
    const response = await GET(request, params(['users', 'me']))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.passwordHash).toBeUndefined()
    expect(data.data.password_hash).toBeUndefined()
  })
})
